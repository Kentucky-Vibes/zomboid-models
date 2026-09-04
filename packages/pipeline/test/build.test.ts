import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Manifest } from 'zomboid-models/format';

import { runBuild } from '../src/build/build.js';
import { runCli } from '../src/cli/run.js';
import { ConfigError, resolveConfig } from '../src/config.js';
import { SIMPLE_ANIMATION, SKINNED_QUAD } from './fixtures/x.js';

/** A 1x1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function file(path: string, content: string | Buffer): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('resolveConfig', () => {
  it('resolves relative paths and applies defaults', () => {
    const config = resolveConfig({ gameDir: 'game', outDir: 'out', modDirs: ['mods'] }, '/base');
    expect(config.gameDir.replace(/\\/g, '/')).toMatch(/\/base\/game$/);
    expect(config.outDir.replace(/\\/g, '/')).toMatch(/\/base\/out$/);
    expect(config.modDirs.map((d) => d.replace(/\\/g, '/'))).toEqual([
      expect.stringMatching(/\/base\/mods$/),
    ]);
    expect(config.mods).toBeUndefined();
    expect(config.animations).toEqual([]);
  });

  it('rejects missing or malformed fields', () => {
    expect(() => resolveConfig({ outDir: 'x' }, '/base')).toThrow(ConfigError);
    expect(() => resolveConfig({ gameDir: 'g', outDir: 'x', mods: 'Alpha' }, '/base')).toThrow(
      '"mods" must be an array of strings',
    );
    expect(() => resolveConfig([], '/base')).toThrow('must be a JSON object');
  });
});

describe('runBuild on a synthetic game folder', () => {
  let root: string;
  let game: string;
  let outDir: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'zm-build-'));
    game = join(root, 'game');
    outDir = join(root, 'out');
    file(
      join(game, 'media', 'scripts', 'items.txt'),
      `module Base {
        item Trousers { BodyLocation = base:pants, ClothingItem = Quad, BloodLocation = Trousers, FabricType = Denim, DisplayName = Quad Trousers, }
        item Axe { WeaponSprite = Quad, SwingAnim = Bat, TwoHandWeapon = true, }
        item Ghost { WeaponSprite = Missing, }
        model Quad { mesh = Skinned/Quad, texture = clothes/cloth, }
        model MaleBody { mesh = Skinned/MaleBody, static = false, attachment Bip01_Prop2 { offset = 0 0 0, rotate = 180 -86 180, } }
      }`,
    );
    file(
      join(game, 'media', 'clothing', 'clothingItems', 'Quad.xml'),
      '<clothingItem><m_MaleModel>skinned\\quad</m_MaleModel><m_Masks>7</m_Masks><textureChoices>clothes\\cloth</textureChoices></clothingItem>',
    );
    for (const name of ['malebody', 'femalebody', 'quad']) {
      file(join(game, 'media', 'models_x', 'skinned', `${name}.x`), SKINNED_QUAD);
    }
    file(join(game, 'media', 'anims_x', 'bob', 'bob_idle.x'), SIMPLE_ANIMATION);
    file(
      join(game, 'media', 'animsets', 'player', 'idle', 'Idle.xml'),
      '<animNode><m_Name>Idle</m_Name><m_AnimName>Bob_Idle</m_AnimName></animNode>',
    );
    for (const texture of [
      'body/malebody01',
      'body/malebody01a',
      'body/femalebody01',
      'clothes/cloth',
      'bloodtextures/bloodmaskchest',
      'bloodtextures/bloodoverlay',
      'body/masks/chest',
      'f_hair_white',
    ]) {
      file(join(game, 'media', 'textures', `${texture}.png`), PNG);
    }
    file(
      join(game, 'media', 'hairStyles', 'hairStyles.xml'),
      '<hairStyles><male><name>Quad</name><model>skinned/quad</model></male></hairStyles>',
    );
    file(join(game, 'media', 'hairStyles', 'beardStyles.xml'), '<beardStyles/>');
    file(
      join(game, 'media', 'lua', 'shared', 'NPCs', 'BodyLocations.lua'),
      'local group = BodyLocations.getGroup("Human")\ngroup:getOrCreateLocation(ItemBodyLocation.PANTS)\ngroup:getOrCreateLocation(ItemBodyLocation.SKIRT)\ngroup:setExclusive(ItemBodyLocation.SKIRT, ItemBodyLocation.PANTS)\n',
    );
    file(
      join(game, 'media', 'lua', 'shared', 'NPCs', 'AttachedLocations.lua'),
      'local group = AttachedLocations.getGroup("Human")\ngroup:getOrCreateLocation("Rifle On Back"):setAttachmentName("rifle_back")\n',
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes converted assets and a manifest', () => {
    const messages: string[] = [];
    const report = runBuild(
      {
        gameDir: game,
        gameVersion: '42.20.3',
        modDirs: [],
        mods: undefined,
        serverIni: undefined,
        outDir,
        animations: [],
        baseDir: root,
      },
      { info: (m) => messages.push(m), warn: (m) => messages.push(`warn ${m}`) },
    );

    expect(report.models).toBe(3);
    expect(report.textures).toBe(8);
    expect(report.animations).toBe(1);
    expect(report.wearables).toBe(1);
    expect(report.heldItems).toBe(1);
    expect(report.warnings).toEqual(['Base.Ghost: model "Missing" is not defined']);

    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) as Manifest;
    expect(manifest.format).toBe('zomboid-models/manifest');
    expect(manifest.gameVersion).toBe('42.20.3');
    expect(manifest.bodies.male).toEqual({
      model: 'skinned/malebody',
      skins: ['body/malebody01'],
      bodyHair: true,
    });
    expect(manifest.bodies.female.skins).toEqual(['body/femalebody01']);
    expect(Object.keys(manifest.models).sort()).toEqual([
      'skinned/femalebody',
      'skinned/malebody',
      'skinned/quad',
    ]);
    expect(manifest.models['skinned/quad']).toMatchObject({ skinned: true, meshes: ['Quad'] });
    expect(existsSync(join(outDir, manifest.models['skinned/quad']?.file ?? ''))).toBe(true);
    expect(manifest.textures['clothes/cloth']).toMatch(
      /^textures\/clothes-cloth-[0-9a-f]{10}\.png$/,
    );
    expect(manifest.animations['Bob_Idle']?.duration).toBeCloseTo(0.5);
    expect(manifest.idle).toEqual({ default: 'Bob_Idle', byWeaponType: {} });
    expect(manifest.wearables['Base.Trousers']).toEqual({
      clothingItem: 'quad',
      bodyLocation: 'base:pants',
      bloodLocation: ['Trousers'],
      fabric: 'denim',
      displayName: 'Quad Trousers',
    });
    expect(manifest.clothingItems['quad']).toMatchObject({
      model: { male: 'skinned/quad' },
      masks: [7],
      textures: ['clothes/cloth'],
    });
    expect(manifest.heldItems['Base.Axe']).toMatchObject({
      model: 'skinned/quad',
      texture: 'clothes/cloth',
      weaponType: '2handed',
      scale: 1,
    });
    expect(manifest.bodyAttachments['Bip01_Prop2']).toEqual({
      bone: undefined,
      offset: [0, 0, 0],
      rotate: [180, -86, 180],
      scale: 1,
    });
    expect(manifest.bodyLocations).toEqual({
      'base:pants': { order: 0, exclusive: ['base:skirt'], hides: [], multiItem: false },
      'base:skirt': { order: 1, exclusive: ['base:pants'], hides: [], multiItem: false },
    });
    expect(manifest.attachedLocations).toEqual({ 'Rifle On Back': 'rifle_back' });
    expect(manifest.hair.male['Quad']).toEqual({
      model: 'skinned/quad',
      texture: 'f_hair_white',
      alternates: {},
    });
    expect(manifest.bloodMasks).toEqual({ Torso_Upper: 'bloodtextures/bloodmaskchest' });
    expect(messages.some((m) => m.includes('3 models converted'))).toBe(true);
  });

  it('runs through the CLI with a configuration file', () => {
    const configPath = join(root, 'zomboid-models.config.json');
    writeFileSync(
      configPath,
      JSON.stringify({ gameDir: 'game', gameVersion: '42.20.3', outDir: 'out-cli' }),
    );
    const out: string[] = [];
    const err: string[] = [];
    const bogusConfig = join(root, 'bogus.config.json');
    writeFileSync(
      bogusConfig,
      JSON.stringify({ gameDir: 'nowhere', gameVersion: '42.20.3', outDir: 'out-cli' }),
    );
    expect(
      runCli(['doctor', '--config', bogusConfig], {
        out: (l) => out.push(l),
        err: (l) => err.push(l),
      }),
    ).toBe(1);
    expect(err.some((l) => l.includes('has no "media" folder'))).toBe(true);
    out.length = 0;
    err.length = 0;
    expect(
      runCli(['doctor', '--config', configPath], {
        out: (l) => out.push(l),
        err: (l) => err.push(l),
      }),
    ).toBe(0);
    expect(out.at(-1)).toBe('everything looks fine');
    out.length = 0;
    expect(
      runCli(['build', '-c', configPath], { out: (l) => out.push(l), err: (l) => err.push(l) }),
    ).toBe(0);
    expect(out.some((l) => l.startsWith('built 3 models'))).toBe(true);
    expect(existsSync(join(root, 'out-cli', 'manifest.json'))).toBe(true);
    expect(
      runCli(['build', '-c', join(root, 'nope.json')], {
        out: () => undefined,
        err: (l) => err.push(l),
      }),
    ).toBe(1);
    expect(err.at(-1)).toContain('cannot read configuration file');
  });
});
