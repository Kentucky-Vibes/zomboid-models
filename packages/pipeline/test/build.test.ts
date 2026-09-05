import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CharacterCatalog, ManifestIndex } from 'zomboid-models/format';

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
    expect(config.subjects).toEqual(['characters', 'vehicles', 'animals', 'items']);
  });

  it('rejects missing or malformed fields', () => {
    expect(() => resolveConfig({ outDir: 'x' }, '/base')).toThrow(ConfigError);
    expect(() => resolveConfig({ gameDir: 'g', outDir: 'x', mods: 'Alpha' }, '/base')).toThrow(
      '"mods" must be an array of strings',
    );
    expect(() => resolveConfig({ gameDir: 'g', outDir: 'x', subjects: ['cars'] }, '/base')).toThrow(
      '"subjects" contains "cars"',
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
        item Trousers { BodyLocation = base:pants, ClothingItem = Quad, BloodLocation = Trousers, FabricType = Denim, DisplayName = Quad Trousers, CanHaveHoles = false, }
        item Axe { WeaponSprite = Quad, SwingAnim = Bat, TwoHandWeapon = true, ConditionMax = 12, }
        item Ghost { WeaponSprite = Missing, }
        model Quad { mesh = Skinned/Quad, texture = clothes/cloth, }
        model MaleBody { mesh = Skinned/MaleBody, static = false, attachment Bip01_Prop2 { offset = 0 0 0, rotate = 180 -86 180, } }
      }`,
    );
    file(
      join(game, 'media', 'clothing', 'clothingItems', 'Quad.xml'),
      '<clothingItem><m_GUID>quad-guid</m_GUID><m_MaleModel>skinned\\quad</m_MaleModel><m_Masks>7</m_Masks><textureChoices>clothes\\cloth</textureChoices></clothingItem>',
    );
    file(
      join(game, 'media', 'clothing', 'clothing.xml'),
      `<outfitManager>
        <m_MaleOutfits>
          <m_Name>Tester</m_Name><m_Top>false</m_Top><m_Pants>false</m_Pants>
          <m_items><itemGUID>quad-guid</itemGUID></m_items>
          <m_items><probability>0.5</probability><itemGUID>missing-guid</itemGUID><subItems><itemGUID>quad-guid</itemGUID></subItems></m_items>
        </m_MaleOutfits>
      </outfitManager>`,
    );
    for (const name of ['malebody', 'femalebody', 'quad', 'male_skeleton', 'female_skeleton']) {
      file(join(game, 'media', 'models_x', 'skinned', `${name}.x`), SKINNED_QUAD);
    }
    file(join(game, 'media', 'anims_x', 'bob', 'bob_idle.x'), SIMPLE_ANIMATION);
    file(join(game, 'media', 'anims_x', 'bob', 'bob_deadbody_onback.x'), SIMPLE_ANIMATION);
    file(join(game, 'media', 'anims_x', 'zombie', 'zombie_idle.x'), SIMPLE_ANIMATION);
    file(
      join(game, 'media', 'animsets', 'player', 'idle', 'Idle.xml'),
      '<animNode><m_Name>Idle</m_Name><m_AnimName>Bob_Idle</m_AnimName></animNode>',
    );
    file(
      join(game, 'media', 'animsets', 'player', 'deadbody', 'deadbody_default.xml'),
      '<animNode><m_Name>deadbody_default</m_Name><m_AnimName>Bob_Deadbody_OnBack</m_AnimName><m_SpeedScale>0.80</m_SpeedScale></animNode>',
    );
    file(
      join(game, 'media', 'animsets', 'zombie', 'idle', 'defaultIdle.xml'),
      '<animNode><m_Name>defaultIdle</m_Name><m_AnimName>Zombie_Idle</m_AnimName><m_SpeedScale>0.23</m_SpeedScale><m_SpeedScaleRandomMultiplierMin>0.20</m_SpeedScaleRandomMultiplierMin><m_SpeedScaleRandomMultiplierMax>1.25</m_SpeedScaleRandomMultiplierMax><m_randomAdvanceFraction>0.50</m_randomAdvanceFraction></animNode>',
    );
    for (const texture of [
      'body/malebody01',
      'body/malebody01a',
      'body/femalebody01',
      'body/m_zedbody01_level1',
      'body/skeleton',
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
      '<hairStyles><male><name>Quad</name><model>skinned/quad</model></male><male><name>Hidden</name><noChoose>true</noChoose></male></hairStyles>',
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
    file(
      join(game, 'media', 'lua', 'shared', 'NPCs', 'MainCreationMethods.lua'),
      'BaseGameCharacterDetails = {}\nBaseGameCharacterDetails.DoHairColor = function()\n\tSurvivorDesc.addHairColor(ColorInfo.new(212/255,171/255,69/255, 1)) -- blonde\nend\n',
    );
    const definitions = join(game, 'media', 'lua', 'shared', 'Definitions');
    file(
      join(definitions, 'DefaultClothing.lua'),
      'DefaultClothing = {}\nDefaultClothing.Pants = { hue = { "Quad" }, texture = { "Quad" }, tint = { "Quad" } }\nDefaultClothing.TShirt = { texture = {}, tint = {} }\nDefaultClothing.TShirtDecal = { texture = {}, tint = {} }\nDefaultClothing.Vest = { texture = {}, tint = {} }\n',
    );
    file(
      join(definitions, 'HairOutfitDefinitions.lua'),
      'HairOutfitDefinitions = HairOutfitDefinitions or {};\nHairOutfitDefinitions.haircutDefinition = {};\nlocal cat = {};\ncat.name = "Quad";\ncat.minWorldAge = 30;\ncat.onlyFor = "Tester,Punk";\ntable.insert(HairOutfitDefinitions.haircutDefinition, cat);\nHairOutfitDefinitions.haircutOutfitDefinition = {};\nlocal o = {};\no.outfit = "Tester";\no.haircut = "Quad:50;random:50";\no.haircutColor = "1,0,0:100";\ntable.insert(HairOutfitDefinitions.haircutOutfitDefinition, o);\n',
    );
    file(
      join(definitions, 'UnderwearDefinition.lua'),
      'UnderwearDefinition = UnderwearDefinition or {};\nUnderwearDefinition.baseChance = 70;\nUnderwearDefinition.Plain = { chanceToSpawn = 5, gender = "male", top = { {name="Bra_Quad", chance=50} }, bottom = "Trousers" }\n',
    );
    file(
      join(definitions, 'AttachedWeaponDefinitions.lua'),
      'AttachedWeaponDefinitions = AttachedWeaponDefinitions or {};\nAttachedWeaponDefinitions.axeBack = { chance = 5, weaponLocation = {"Rifle On Back"}, bloodLocations = {"Back"}, addHoles = true, daySurvived = 0, weapons = {"Base.Axe"} }\nAttachedWeaponDefinitions.attachedWeaponCustomOutfit = { Tester = { chance = 100, maxitem = 1, weapons = { { id = "custom", chance = 10, weaponLocation = {"Rifle On Back"}, weapons = {"Base.Axe"} } } } }\n',
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function readCatalog(dir: string): CharacterCatalog {
    const index = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as ManifestIndex;
    expect(index.format).toBe('zomboid-models/manifest');
    expect(index.version).toBe(2);
    expect(index.catalogs.characters).toMatch(/^catalog-characters-[0-9a-f]{10}\.json$/);
    return JSON.parse(
      readFileSync(join(dir, index.catalogs.characters ?? ''), 'utf8'),
    ) as CharacterCatalog;
  }

  it('writes converted assets, a catalog, and the manifest index', () => {
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
        subjects: ['characters'],
        baseDir: root,
      },
      { info: (m) => messages.push(m), warn: (m) => messages.push(`warn ${m}`) },
    );

    expect(report.models).toBe(5);
    expect(report.textures).toBe(10);
    expect(report.animations).toBe(3);
    expect(report.wearables).toBe(1);
    expect(report.heldItems).toBe(1);
    expect(report.outfits).toBe(1);
    expect(report.gameVersion).toBe('42.20.3');
    expect(report.warnings).toContain('Base.Ghost: model "Missing" is not defined');
    expect(report.warnings.filter((w) => w.includes('not found'))).toEqual([]);

    const catalog = readCatalog(outDir);
    expect(catalog.bodies.male).toEqual({
      model: 'skinned/malebody',
      skins: ['body/malebody01'],
      bodyHair: true,
    });
    expect(catalog.bodies.female.skins).toEqual(['body/femalebody01']);
    expect(catalog.skeletons?.male).toEqual({
      model: 'skinned/male_skeleton',
      skins: ['body/skeleton'],
      bodyHair: false,
    });
    expect(catalog.zombieSkins?.male).toEqual([['body/m_zedbody01_level1'], [], []]);
    expect(Object.keys(catalog.models).sort()).toEqual([
      'skinned/female_skeleton',
      'skinned/femalebody',
      'skinned/male_skeleton',
      'skinned/malebody',
      'skinned/quad',
    ]);
    expect(catalog.models['skinned/quad']).toMatchObject({ skinned: true, meshes: ['Quad'] });
    expect(existsSync(join(outDir, catalog.models['skinned/quad']?.file ?? ''))).toBe(true);
    expect(catalog.textures['clothes/cloth']).toMatch(
      /^textures\/clothes-cloth-[0-9a-f]{10}\.png$/,
    );
    expect(catalog.animations['Bob_Idle']?.duration).toBeCloseTo(0.5);
    expect(catalog.animations['Zombie_Idle']).toBeDefined();
    expect(catalog.idle).toEqual({ default: { clip: 'Bob_Idle', speed: 1 }, byWeaponType: {} });
    expect(catalog.stances.zombie.standing).toEqual({
      clip: 'Zombie_Idle',
      speed: 0.23,
      speedRandom: [0.2, 1.25],
      randomStart: 0.5,
    });
    expect(catalog.stances.player.corpse).toEqual({ clip: 'Bob_Deadbody_OnBack', speed: 0.8 });
    expect(catalog.wearables['Base.Trousers']).toEqual({
      clothingItem: 'quad',
      bodyLocation: 'base:pants',
      bloodLocation: ['Trousers'],
      fabric: 'denim',
      displayName: 'Quad Trousers',
      canHaveHoles: false,
    });
    expect(catalog.clothingItemToItem).toEqual({ quad: 'Base.Trousers' });
    expect(catalog.clothingItems['quad']).toMatchObject({
      model: { male: 'skinned/quad' },
      masks: [7],
      textures: ['clothes/cloth'],
      guid: 'quad-guid',
    });
    expect(catalog.heldItems['Base.Axe']).toMatchObject({
      model: 'skinned/quad',
      texture: 'clothes/cloth',
      weaponType: '2handed',
      scale: 1,
      conditionMax: 12,
    });
    expect(catalog.bodyAttachments['Bip01_Prop2']).toEqual({
      offset: [0, 0, 0],
      rotate: [-180, 86, 180],
      scale: 1,
    });
    expect(catalog.bodyLocations).toEqual({
      'base:pants': { order: 0, exclusive: ['base:skirt'], hides: [], multiItem: false },
      'base:skirt': { order: 1, exclusive: ['base:pants'], hides: [], multiItem: false },
    });
    expect(catalog.attachedLocations).toEqual({ 'Rifle On Back': 'rifle_back' });
    expect(catalog.hair.male['Quad']).toEqual({
      model: 'skinned/quad',
      texture: 'f_hair_white',
      alternates: {},
    });
    expect(catalog.hair.male['Hidden']?.noChoose).toBe(true);
    expect(catalog.hairOrder.male).toEqual(['Quad', 'Hidden']);
    expect(catalog.beardOrder).toEqual(['']);
    expect(catalog.bloodMasks).toEqual({ Torso_Upper: 'bloodtextures/bloodmaskchest' });

    expect(catalog.outfits.male['Tester']).toEqual({
      name: 'Tester',
      top: false,
      pants: false,
      allowPantsHue: true,
      allowPantsTint: false,
      allowTopTint: true,
      allowTshirtDecal: true,
      items: [
        { clothingItem: 'quad', probability: 1, subItems: [] },
        { probability: 0.5, subItems: [{ clothingItem: 'quad', probability: 1, subItems: [] }] },
      ],
    });
    expect(catalog.hairDefinitions).toEqual({
      restricted: [{ style: 'Quad', minWorldAge: 30, onlyFor: ['Tester', 'Punk'] }],
      byOutfit: [
        {
          outfit: 'Tester',
          haircut: [
            { value: 'Quad', chance: 50 },
            { value: 'random', chance: 50 },
          ],
          haircutColor: [{ value: '1,0,0', chance: 100 }],
        },
      ],
      colors: [{ r: 212 / 255, g: 171 / 255, b: 69 / 255 }],
    });
    expect(catalog.defaultClothing.pants).toEqual({
      hue: ['Quad'],
      texture: ['Quad'],
      tint: ['Quad'],
    });
    expect(catalog.underwear).toEqual({
      baseChance: 70,
      definitions: [
        {
          female: false,
          chanceToSpawn: 5,
          bottom: 'Trousers',
          top: [{ value: 'Bra_Quad', chance: 50 }],
        },
      ],
    });
    expect(catalog.attachedWeapons.definitions).toEqual([
      {
        id: 'axeBack',
        chance: 5,
        outfit: [],
        weaponLocation: ['Rifle On Back'],
        bloodLocations: ['Back'],
        addHoles: true,
        daySurvived: 0,
        weapons: ['Base.Axe'],
      },
    ]);
    expect(catalog.attachedWeapons.byOutfit).toEqual([
      {
        outfit: 'Tester',
        chance: 100,
        maxItems: 1,
        weapons: [
          {
            id: 'custom',
            chance: 10,
            outfit: [],
            weaponLocation: ['Rifle On Back'],
            bloodLocations: [],
            addHoles: false,
            daySurvived: 0,
            weapons: ['Base.Axe'],
          },
        ],
      },
    ]);
    expect(catalog.zombieDamageItems).toEqual([]);
    expect(catalog.bandageItems).toEqual({});
    expect(messages.some((m) => m.includes('5 models converted'))).toBe(true);
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
    expect(out.some((l) => l.startsWith('built 5 models'))).toBe(true);
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
