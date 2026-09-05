import { describe, expect, it } from 'vitest';

import { emptyCharacterCatalog } from '../format/emptyCatalog.js';
import type { CharacterCatalog } from '../format/manifest.js';
import { generateOutfit, randomBodyBlood, rollRotStage } from './generate.js';
import { OutfitRng } from './rng.js';

/** A small world: trousers and a shirt with random tint, a hat, and a rifle for the back. */
function catalog(): CharacterCatalog {
  const base = emptyCharacterCatalog();
  const clothing = (
    textures: string[],
    extra: Partial<CharacterCatalog['clothingItems'][string]> = {},
  ): CharacterCatalog['clothingItems'][string] => ({
    static: false,
    textures,
    baseTextures: [],
    masks: [],
    allowRandomTint: false,
    allowRandomHue: false,
    model: { male: 'm', female: 'f' },
    ...extra,
  });
  return {
    ...base,
    bodies: {
      male: { model: 'skinned/malebody', skins: ['s1', 's2', 's3'], bodyHair: false },
      female: { model: 'skinned/femalebody', skins: ['s1', 's2'], bodyHair: false },
    },
    zombieSkins: { male: [['z1', 'z2'], ['z3'], ['z4']], female: [['z1'], ['z2'], ['z3']] },
    skeletons: {
      male: { model: 'skinned/male_skeleton', skins: ['k1', 'k2', 'k3'], bodyHair: false },
      female: { model: 'skinned/female_skeleton', skins: ['k1', 'k2', 'k3'], bodyHair: false },
    },
    clothingItems: {
      trousers_default: clothing(['t1', 't2'], { allowRandomHue: true }),
      shirt: clothing(['sh1'], { allowRandomTint: true, masks: [1] }),
      hat: clothing(['h1'], { static: true, spawnWith: ['scarf'] }),
      scarf: clothing(['sc1']),
      underpants: clothing(['u1']),
      bra: clothing(['b1'], { allowRandomTint: true }),
      bandage_head: clothing(['bd1']),
    },
    wearables: {
      'Base.Trousers_Default': {
        clothingItem: 'trousers_default',
        bodyLocation: 'base:pants',
        bloodLocation: ['Trousers'],
      },
      'Base.Shirt': { clothingItem: 'shirt', bodyLocation: 'base:shirt', bloodLocation: ['Shirt'] },
      'Base.Hat': { clothingItem: 'hat', bodyLocation: 'base:hat', bloodLocation: ['Head'] },
      'Base.Scarf': { clothingItem: 'scarf', bodyLocation: 'base:scarf', bloodLocation: ['Neck'] },
      'Base.Underpants': {
        clothingItem: 'underpants',
        bodyLocation: 'base:underwearbottom',
        bloodLocation: [],
      },
      'Base.Bra': { clothingItem: 'bra', bodyLocation: 'base:underweartop', bloodLocation: [] },
      'Base.Bandage_Head_Blood': {
        clothingItem: 'bandage_head',
        bodyLocation: 'base:bandage',
        bloodLocation: [],
      },
    },
    clothingItemToItem: {
      trousers_default: 'Base.Trousers_Default',
      shirt: 'Base.Shirt',
      hat: 'Base.Hat',
      scarf: 'Base.Scarf',
      underpants: 'Base.Underpants',
      bra: 'Base.Bra',
      bandage_head: 'Base.Bandage_Head_Blood',
    },
    heldItems: {
      'Base.Rifle': {
        model: 'rifle',
        weaponType: 'firearm',
        scale: 1,
        attachments: {},
        conditionMax: 10,
      },
    },
    bodyLocations: {
      'base:underwearbottom': { order: 0, exclusive: [], hides: [], multiItem: false },
      'base:underweartop': { order: 1, exclusive: [], hides: [], multiItem: false },
      'base:pants': { order: 2, exclusive: [], hides: [], multiItem: false },
      'base:shirt': { order: 3, exclusive: [], hides: [], multiItem: false },
      'base:scarf': { order: 4, exclusive: [], hides: [], multiItem: false },
      'base:hat': { order: 5, exclusive: [], hides: [], multiItem: false },
      'base:bandage': { order: 6, exclusive: [], hides: [], multiItem: true },
    },
    hair: {
      male: {
        Short: { texture: 'x', alternates: {} },
        Long: { texture: 'x', alternates: {} },
        Secret: { texture: 'x', alternates: {}, noChoose: true },
      },
      female: { Bob: { texture: 'x', alternates: {} } },
    },
    hairOrder: { male: ['Short', 'Long', 'Secret'], female: ['Bob'] },
    beards: { '': { texture: 'x' }, Full: { texture: 'x' } },
    beardOrder: ['', 'Full'],
    outfits: {
      male: {
        Worker: {
          name: 'Worker',
          top: true,
          pants: true,
          allowPantsHue: true,
          allowPantsTint: false,
          allowTopTint: true,
          allowTshirtDecal: true,
          items: [
            { clothingItem: 'shirt', probability: 1, subItems: [] },
            {
              clothingItem: 'hat',
              probability: 0.5,
              subItems: [{ clothingItem: 'scarf', probability: 1, subItems: [] }],
            },
          ],
        },
        Bare: {
          name: 'Bare',
          top: false,
          pants: false,
          allowPantsHue: true,
          allowPantsTint: false,
          allowTopTint: true,
          allowTshirtDecal: true,
          items: [{ probability: 1, subItems: [] }],
        },
      },
      female: {},
    },
    hairDefinitions: {
      restricted: [{ style: 'Long', minWorldAge: 30, onlyFor: ['Worker'] }],
      byOutfit: [{ outfit: 'Worker', beard: [{ value: 'null', chance: 100 }] }],
      colors: [
        { r: 0.1, g: 0.1, b: 0.1 },
        { r: 0.9, g: 0.8, b: 0.2 },
      ],
    },
    defaultClothing: {
      pants: { hue: ['Trousers_Default'], texture: ['Trousers_Default'], tint: [] },
      tShirt: { texture: ['Shirt'], tint: ['Shirt'] },
      tShirtDecal: { texture: ['Shirt'], tint: ['Shirt'] },
      vest: { texture: ['Shirt'], tint: ['Shirt'] },
    },
    underwear: {
      baseChance: 100,
      definitions: [
        {
          female: false,
          chanceToSpawn: 10,
          bottom: 'Underpants',
          top: [{ value: 'Bra', chance: 100 }],
        },
      ],
    },
    attachedWeapons: {
      definitions: [
        {
          id: 'rifle',
          chance: 100,
          outfit: [],
          weaponLocation: ['Rifle On Back'],
          bloodLocations: ['Back'],
          addHoles: true,
          daySurvived: 0,
          weapons: ['Base.Rifle'],
        },
      ],
      byOutfit: [],
    },
    bandageItems: { Head: 'Base.Bandage_Head' },
  };
}

describe('generateOutfit', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = generateOutfit({ catalog: catalog(), sex: 'male', name: 'Worker', seed: 7 });
    const b = generateOutfit({ catalog: catalog(), sex: 'male', name: 'Worker', seed: 7 });
    expect(a).toEqual(b);
    const results = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const generated = generateOutfit({ catalog: catalog(), sex: 'male', name: 'Worker', seed });
      results.add(
        JSON.stringify(generated.worn) + generated.hair + JSON.stringify(generated.hairColor),
      );
    }
    expect(results.size).toBeGreaterThan(5);
  });

  it('adds the default pants and the outfit items in body location order', () => {
    const generated = generateOutfit({ catalog: catalog(), sex: 'male', name: 'Worker', seed: 3 });
    const items = generated.worn.map((worn) => worn.item);
    expect(items[0]).toBe('Base.Trousers_Default');
    expect(items).toContain('Base.Shirt');
    expect(items.indexOf('Base.Shirt')).toBeGreaterThan(items.indexOf('Base.Trousers_Default'));
    expect(generated.warnings).toEqual([]);
    const shirt = generated.worn.find((worn) => worn.item === 'Base.Shirt');
    expect(shirt?.clothingItem).toBe('shirt');
    expect(shirt?.textureChoice).toBe(0);
  });

  it('puts on the hat about half the time and always its scarf with it', () => {
    let hats = 0;
    for (let seed = 0; seed < 200; seed++) {
      const generated = generateOutfit({ catalog: catalog(), sex: 'male', name: 'Worker', seed });
      const items = generated.worn.map((worn) => worn.item);
      const hat = items.includes('Base.Hat');
      const scarf = items.includes('Base.Scarf');
      if (hat) hats++;
      // The hat competes with its sub item: hat alone, scarf alone, or neither.
      expect(hat && scarf && generated.worn.filter((w) => w.item === 'Base.Scarf').length > 1).toBe(
        false,
      );
    }
    expect(hats).toBeGreaterThan(30);
    expect(hats).toBeLessThan(170);
  });

  it('picks hair from the styles the outfit allows and applies the beard rule', () => {
    for (let seed = 0; seed < 50; seed++) {
      const young = generateOutfit({ catalog: catalog(), sex: 'male', name: 'Worker', seed });
      expect(['Short', undefined]).toContain(young.hair);
      expect(young.beard).toBeUndefined();
      const old = generateOutfit({
        catalog: catalog(),
        sex: 'male',
        name: 'Worker',
        seed,
        worldAge: 60,
      });
      expect(['Short', 'Long', undefined]).toContain(old.hair);
      expect(young.hairColor).toBeDefined();
    }
  });

  it('skips items whose GUID resolved to nothing and reports unknown outfits', () => {
    const bare = generateOutfit({ catalog: catalog(), sex: 'male', name: 'Bare', seed: 1 });
    expect(bare.worn).toEqual([]);
    const missing = generateOutfit({ catalog: catalog(), sex: 'female', name: 'Worker', seed: 1 });
    expect(missing.worn).toEqual([]);
    expect(missing.warnings[0]).toContain('not defined for female');
  });

  it('gives zombies underwear, a rot stage, a skin, an attached weapon, and wear', () => {
    const generated = generateOutfit({
      catalog: catalog(),
      sex: 'male',
      name: 'Worker',
      seed: 11,
      zombie: true,
      worldAge: 40,
      chanceOfAttachedWeapon: 100,
    });
    const items = generated.worn.map((worn) => worn.item);
    expect(items).toContain('Base.Underpants');
    expect(items).toContain('Base.Bra');
    expect([1, 2, 3]).toContain(generated.rot);
    expect(generated.skin).toBeGreaterThanOrEqual(0);
    expect(generated.attached).toEqual([{ location: 'Rifle On Back', item: 'Base.Rifle' }]);
    expect(generated.attachedBlood).toBeGreaterThan(0);
    const back = generated.worn.find((worn) => worn.item === 'Base.Shirt');
    expect(back?.holes?.Back ?? back?.blood?.Back).toBeTruthy();
    expect(generated.bodyBlood).toBeDefined();
  });

  it('gives skeletons no underwear, no rot roll, and a skeleton skin index', () => {
    const generated = generateOutfit({
      catalog: catalog(),
      sex: 'male',
      name: 'Worker',
      seed: 5,
      zombie: true,
      skeleton: true,
    });
    const items = generated.worn.map((worn) => worn.item);
    expect(items).not.toContain('Base.Underpants');
    expect(generated.rot).toBeUndefined();
    expect(generated.skin).toBeLessThan(3);
    expect(generated.bodyVisuals).toEqual([]);
  });
});

describe('rollRotStage', () => {
  it('always gives stage 1 in a young world and stages 2 and 3 in an old one', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(rollRotStage(new OutfitRng(seed), 0)).toBe(1);
    }
    const stages = new Set<number>();
    for (let seed = 0; seed < 200; seed++) stages.add(rollRotStage(new OutfitRng(seed), 365));
    expect(stages).toEqual(new Set([2, 3]));
  });
});

describe('randomBodyBlood', () => {
  it('fills every part with a value in [0, 1) and repeats for a seed', () => {
    const blood = randomBodyBlood(42);
    expect(Object.keys(blood)).toHaveLength(18);
    for (const value of Object.values(blood)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(randomBodyBlood(42)).toEqual(blood);
  });
});
