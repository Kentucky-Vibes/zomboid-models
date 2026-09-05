import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnimalCatalog, ManifestIndex } from 'zomboid-models/format';

import { runBuild } from '../src/build/build.js';
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

describe('runBuild with the animals subject', () => {
  let root: string;
  let game: string;
  let outDir: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'zm-animals-'));
    game = join(root, 'game');
    outDir = join(root, 'out');
    file(
      join(game, 'media', 'scripts', 'generated', 'models_animals.txt'),
      `module Base {
        model CowBody { mesh = Skinned/CowBody, shader = animalEffect, static = false, animationsMesh = CowAndBull, }
        model Cow_Skeleton { mesh = Skinned/Cow_Skeleton, shader = animalEffect, static = false, }
      }`,
    );
    for (const name of ['cowbody', 'cow_skeleton']) {
      file(join(game, 'media', 'models_x', 'skinned', `${name}.x`), SKINNED_QUAD);
    }
    file(join(game, 'media', 'anims_x', 'cow', 'cow_idle01.x'), SIMPLE_ANIMATION);
    file(join(game, 'media', 'anims_x', 'cow', 'cow_dead.x'), SIMPLE_ANIMATION);
    file(
      join(game, 'media', 'animsets', 'cow', 'idle', 'idle1.xml'),
      '<animNode><m_Name>idle1</m_Name><m_AnimName>Cow_Idle01</m_AnimName><m_BlendTime>0.70</m_BlendTime></animNode>',
    );
    file(
      join(game, 'media', 'animsets', 'cow', 'idle', 'idle2.xml'),
      '<animNode><m_Name>idle2</m_Name><m_AnimName>Cow_Idle02</m_AnimName><m_Looped>false</m_Looped><m_Conditions><m_Name>idleAction</m_Name><m_Type>STRING</m_Type><m_Value>idle1</m_Value></m_Conditions></animNode>',
    );
    file(
      join(game, 'media', 'animsets', 'cow', 'deadbody', 'deadbody.xml'),
      '<animNode><m_Name>deadbody</m_Name><m_AnimName>Cow_Dead</m_AnimName></animNode>',
    );
    for (const texture of ['body/cow_black', 'body/bull_black', 'body/bull_skeleton']) {
      file(join(game, 'media', 'textures', `${texture}.png`), PNG);
    }
    const definitions = join(game, 'media', 'lua', 'shared', 'Definitions', 'animal');
    file(
      join(definitions, 'CowDefinitions.lua'),
      [
        'AnimalDefinitions = AnimalDefinitions or {};',
        'AnimalDefinitions.stages = AnimalDefinitions.stages or {};',
        'AnimalDefinitions.stages["cow"] = { stages = { cow = { ageToGrow = 360 } } };',
        'AnimalDefinitions.breeds = AnimalDefinitions.breeds or {};',
        'AnimalDefinitions.breeds["cow"] = { breeds = {} };',
        'AnimalDefinitions.breeds["cow"].breeds["angus"] = { name = "angus", texture = "Cow_Black", textureMale = "Bull_Black", rottenTexture = "CowBlack_Rotting" };',
        'AnimalDefinitions.animals = AnimalDefinitions.animals or {};',
        'AnimalDefinitions.animals["cow"] = {};',
        'AnimalDefinitions.animals["cow"].bodyModel = "CowBody";',
        'AnimalDefinitions.animals["cow"].bodyModelSkel = "Cow_Skeleton";',
        'AnimalDefinitions.animals["cow"].textureSkeleton = "Bull_Skeleton";',
        'AnimalDefinitions.animals["cow"].textureSkinned = "Cow_Skinned";',
        'AnimalDefinitions.animals["cow"].animset = "cow";',
        'AnimalDefinitions.animals["cow"].minSize = 0.9;',
        'AnimalDefinitions.animals["cow"].maxSize = 1.1;',
        'AnimalDefinitions.animals["cow"].female = true;',
        'AnimalDefinitions.animals["cow"].group = "cow";',
        'AnimalDefinitions.animals["cow"].breeds = AnimalDefinitions.breeds["cow"].breeds;',
        'AnimalDefinitions.animals["cow"].stages = AnimalDefinitions.stages["cow"].stages;',
      ].join('\n'),
    );
    file(
      join(definitions, 'AnimalAvatarDefinition.lua'),
      'AnimalAvatarDefinition = {};\nAnimalAvatarDefinition["cow"] = { zoom = 0, xoffset = 0.1, yoffset = 0, avatarWidth = 200, avatarDir = IsoDirections.SE };\n',
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes an animal catalog with models, textures, clips, and breeds', () => {
    const report = runBuild(
      {
        gameDir: game,
        gameVersion: '42.20.3',
        modDirs: [],
        mods: undefined,
        serverIni: undefined,
        outDir,
        animations: [],
        subjects: ['animals'],
        baseDir: root,
      },
      { info: () => undefined, warn: () => undefined },
    );
    expect(report.animals).toBe(1);
    expect(report.models).toBe(2);
    expect(report.textures).toBe(3);
    expect(report.animations).toBe(2);

    const index = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) as ManifestIndex;
    expect(index.catalogs.characters).toBeUndefined();
    expect(index.catalogs.animals).toMatch(/^catalog-animals-[0-9a-f]{10}\.json$/);
    const catalog = JSON.parse(
      readFileSync(join(outDir, index.catalogs.animals ?? ''), 'utf8'),
    ) as AnimalCatalog;
    expect(Object.keys(catalog.models).sort()).toEqual(['skinned/cow_skeleton', 'skinned/cowbody']);
    expect(existsSync(join(outDir, catalog.models['skinned/cowbody']?.file ?? ''))).toBe(true);
    expect(Object.keys(catalog.textures).sort()).toEqual([
      'body/bull_black',
      'body/bull_skeleton',
      'body/cow_black',
    ]);
    expect(Object.keys(catalog.animations).sort()).toEqual(['Cow_Dead', 'Cow_Idle01']);
    expect(catalog.animals['cow']).toEqual({
      group: 'cow',
      female: true,
      baby: false,
      models: { body: 'skinned/cowbody', skeleton: 'skinned/cow_skeleton' },
      textures: { skeleton: 'body/bull_skeleton' },
      animSet: 'cow',
      stances: {
        standing: { clip: 'Cow_Idle01', speed: 1 },
        corpse: { clip: 'Cow_Dead', speed: 1 },
      },
      minSize: 0.9,
      maxSize: 1.1,
      breeds: {
        angus: {
          textures: ['body/cow_black'],
          texturesMale: ['body/bull_black'],
          texturesBaby: [],
        },
      },
      breedOrder: ['angus'],
      avatar: { zoom: 0, xoffset: 0.1, yoffset: 0, width: 200, direction: 'SE' },
    });
  });
});
