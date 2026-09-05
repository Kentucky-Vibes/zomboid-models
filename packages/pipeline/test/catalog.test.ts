import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  loadCatalog,
  mergeItemBlock,
  normalizeModelPath,
  resolveModel,
} from '../src/game/catalog.js';
import { buildActiveFileMap } from '../src/game/fileMap.js';
import { discoverMods, resolveLoadOrder } from '../src/game/mods.js';
import { entryValue, entryValues, parseScript } from '../src/game/scripts.js';

const GAME_VERSION = { major: 42, minor: 20, suffix: '.3' };

function file(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('mergeItemBlock', () => {
  it('replaces the keys the later block sets and keeps the others', () => {
    const [first] = parseScript('module Base { item A { X = 1, Y = 2, List = a, List = b, } }');
    const [second] = parseScript('module Base { item A { Y = 3, List = c, } }');
    const merged = mergeItemBlock(
      first?.blocks[0] as NonNullable<typeof first>,
      second?.blocks[0] as NonNullable<typeof second>,
    );
    expect(entryValue(merged, 'X')).toBe('1');
    expect(entryValue(merged, 'Y')).toBe('3');
    expect(entryValues(merged, 'List')).toEqual(['c']);
  });
});

describe('normalizeModelPath', () => {
  it('lowercases and strips prefixes and extensions', () => {
    expect(normalizeModelPath('Skinned/MaleBody')).toBe('skinned/malebody');
    expect(normalizeModelPath('x:weapons\\2handed\\FireAxe.x')).toBe('weapons/2handed/fireaxe');
    expect(normalizeModelPath('media/models_X/Static/Clothes/M_Hat.X')).toBe(
      'static/clothes/m_hat',
    );
  });
});

describe('loadCatalog', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'zm-catalog-'));
    const game = join(root, 'game');
    file(
      join(game, 'media', 'scripts', 'items', 'clothing.txt'),
      `module Base {
        item Trousers_Denim { BodyLocation = base:pants, ClothingItem = Trousers_Denim, BloodLocation = Trousers, FabricType = Denim, }
        item Hat_Cap { BodyLocation = base:hat, ClothingItem = Hat_BaseballCap, }
        item Axe { SwingAnim = Bat, TwoHandWeapon = true, WeaponSprite = FireAxe, }
      }`,
    );
    file(
      join(game, 'media', 'scripts', 'models.txt'),
      `module Base {
        model FireAxe { mesh = weapons/2handed/FireAxe, attachment world { offset = 0.1 0.2 0.3, rotate = 180 -21 180, } attachment Bip01_Prop2 { offset = 0 0 0, } }
        model MaleBody { mesh = Skinned/MaleBody, static = false, animationsMesh = Human, attachment rifle_back { offset = 0 0 0, rotate = 0 0 0, bone = Bip01_Spine, } }
      }`,
    );
    file(
      join(game, 'media', 'scripts', 'template_first.txt'),
      'module Base { item Axe { DisplayName = Template Axe, SwingAnim = Stab, } }',
    );
    file(
      join(game, 'media', 'clothing', 'clothingItems', 'Trousers_Denim.xml'),
      '<clothingItem><m_MaleModel>skinned\\clothes\\bob_trousers</m_MaleModel><m_Masks>7</m_Masks><textureChoices>clothes\\trousers_mesh\\trousersmesh_denim</textureChoices></clothingItem>',
    );
    file(
      join(game, 'media', 'hairStyles', 'hairStyles.xml'),
      '<hairStyles><male><name>CrewCut</name><model>skinned/hair/bob_hair_crewcut</model></male></hairStyles>',
    );
    file(join(game, 'media', 'hairStyles', 'beardStyles.xml'), '<beardStyles></beardStyles>');
    file(
      join(game, 'media', 'lua', 'shared', 'NPCs', 'BodyLocations.lua'),
      'local group = BodyLocations.getGroup("Human")\ngroup:getOrCreateLocation(ItemBodyLocation.PANTS)\ngroup:getOrCreateLocation(ItemBodyLocation.HAT)\n',
    );
    file(
      join(game, 'media', 'lua', 'shared', 'NPCs', 'AttachedLocations.lua'),
      'local group = AttachedLocations.getGroup("Human")\ngroup:getOrCreateLocation("Rifle On Back"):setAttachmentName("rifle_back")\n',
    );
    file(
      join(game, 'media', 'AnimSets', 'player', 'idle', 'Idle.xml'),
      '<animNode><m_Name>Idle</m_Name><m_AnimName>Bob_Idle</m_AnimName></animNode>',
    );
    file(
      join(game, 'media', 'AnimSets', 'player', 'idle', 'Idle2Handed.xml'),
      '<animNode><m_Name>Idle2Handed</m_Name><m_AnimName>Bob_IdleBat</m_AnimName><m_Conditions><m_Name>Weapon</m_Name><m_Type>STRING</m_Type><m_Value>2handed</m_Value></m_Conditions></animNode>',
    );
    // A mod that changes the trousers' blood location, redefines the axe model, and adds an item.
    const mod = join(root, 'mods', 'Patch', '42');
    file(join(mod, 'mod.info'), 'id=Patch\n');
    file(
      join(mod, 'media', 'scripts', 'patch.txt'),
      `module Base {
        item Trousers_Denim { BloodLocation = ShortsShort, }
        model FireAxe { mesh = weapons/2handed/FireAxe_Mod, attachment world { rotate = 0 0 0, } }
        item Cape { BodyLocation = base:hat, ClothingItem = Cape, }
      }`,
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('merges scripts across game and mods and reads the data files', () => {
    const mods = discoverMods([join(root, 'mods')], GAME_VERSION);
    const order = resolveLoadOrder(mods, ['Patch']).mods;
    const files = buildActiveFileMap(join(root, 'game'), order);
    const catalog = loadCatalog(
      files,
      order.map((m) => m.id),
    );

    const trousers = catalog.items.get('Base.Trousers_Denim');
    expect(trousers?.source).toBe('Patch');
    expect(
      entryValue(trousers?.block as NonNullable<typeof trousers>['block'], 'BloodLocation'),
    ).toBe('ShortsShort');
    expect(entryValue(trousers?.block as NonNullable<typeof trousers>['block'], 'FabricType')).toBe(
      'Denim',
    );

    const axe = catalog.items.get('Base.Axe');
    expect(entryValue(axe?.block as NonNullable<typeof axe>['block'], 'SwingAnim')).toBe('Bat');
    expect(entryValue(axe?.block as NonNullable<typeof axe>['block'], 'DisplayName')).toBe(
      'Template Axe',
    );

    const fireAxe = catalog.models.get('Base.FireAxe');
    expect(fireAxe?.mesh).toBe('weapons/2handed/fireaxe_mod');
    expect(fireAxe?.attachments['world']).toEqual({
      bone: undefined,
      offset: [0.1, 0.2, 0.3],
      rotate: [0, 0, 0],
      scale: 1,
    });
    expect(fireAxe?.attachments['Bip01_Prop2']?.offset).toEqual([0, 0, 0]);
    expect(resolveModel(catalog.models, 'FireAxe', 'Base')?.fullName).toBe('Base.FireAxe');
    expect(resolveModel(catalog.models, 'Base.MaleBody', 'Other')?.static).toBe(false);
    expect(resolveModel(catalog.models, 'Nope', 'Base')).toBeUndefined();

    expect(catalog.clothingItems.get('trousers_denim')?.maleModel).toBe(
      'skinned/clothes/bob_trousers',
    );
    expect(catalog.hair.male[0]?.name).toBe('CrewCut');
    expect(catalog.bodyLocations.order).toEqual(['base:pants', 'base:hat']);
    expect(catalog.attachedLocations).toEqual({ 'Rifle On Back': 'rifle_back' });
    expect(catalog.idle).toEqual({
      default: { clip: 'Bob_Idle', speed: 1 },
      byWeaponType: { '2handed': { clip: 'Bob_IdleBat', speed: 1 } },
    });
    expect(catalog.warnings).toEqual(
      expect.arrayContaining([
        'clothing item "Hat_BaseballCap" has no XML file',
        'clothing item "Cape" has no XML file',
        'clothing.xml not found; outfits by name will not be available',
      ]),
    );
  });
});
