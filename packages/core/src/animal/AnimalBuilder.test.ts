import { describe, expect, it } from 'vitest';

import { validateAnimalDescription, type AnimalDescription } from '../format/animal.js';
import type { AnimalCatalog } from '../format/manifest.js';
import { autoAnimalClip, resolveAnimalLook } from './AnimalBuilder.js';

function catalog(): AnimalCatalog {
  return {
    models: {},
    textures: {
      'body/cow_black': 'textures/cow_black.png',
      'body/cow_bw_01': 'textures/cow_bw_01.png',
      'body/cow_bw_02': 'textures/cow_bw_02.png',
      'body/bull_black': 'textures/bull_black.png',
      'body/bull_skeleton': 'textures/bull_skeleton.png',
      'body/cow_skinned': 'textures/cow_skinned.png',
      'body/cowblack_rotting': 'textures/cowblack_rotting.png',
      'body/calf_tex': 'textures/calf.png',
    },
    animations: {},
    animals: {
      cow: {
        group: 'cow',
        female: true,
        baby: false,
        models: {
          body: 'skinned/cowbody',
          skeleton: 'skinned/cow_skeleton',
          skeletonHeadless: 'skinned/cow_skeleton_nohead',
          headless: 'skinned/cow_headless',
        },
        textures: { skeleton: 'body/bull_skeleton', skinned: 'body/cow_skinned' },
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
            rottenTexture: 'body/cowblack_rotting',
          },
          holstein: {
            textures: ['body/cow_bw_01', 'body/cow_bw_02'],
            texturesMale: [],
            texturesBaby: [],
          },
        },
        breedOrder: ['angus', 'holstein'],
      },
      bull: {
        group: 'cow',
        female: false,
        baby: false,
        models: { body: 'skinned/bull_body' },
        textures: {},
        animSet: 'cow',
        stances: { standing: { clip: 'Cow_Idle01', speed: 1 } },
        minSize: 1,
        maxSize: 1.2,
        breeds: {
          angus: {
            textures: ['body/cow_black'],
            texturesMale: ['body/bull_black'],
            texturesBaby: [],
          },
        },
        breedOrder: ['angus'],
      },
      cowcalf: {
        group: 'cow',
        female: false,
        baby: true,
        models: { body: 'skinned/calf' },
        textures: {},
        animSet: 'cowcalf',
        stances: {},
        minSize: 0.5,
        maxSize: 0.8,
        breeds: {
          angus: {
            textures: ['body/cow_black'],
            texturesMale: ['body/bull_black'],
            texturesBaby: ['body/calf_tex'],
          },
        },
        breedOrder: ['angus'],
      },
    },
  };
}

function animal(overrides: Partial<AnimalDescription> = {}): AnimalDescription {
  return { format: 'zomboid-models/animal', version: 1, type: 'cow', ...overrides };
}

describe('resolveAnimalLook', () => {
  it('uses the first breed, the female texture, and the grown size by default', () => {
    const look = resolveAnimalLook(catalog(), animal());
    expect(look).toMatchObject({
      model: 'skinned/cowbody',
      texture: 'body/cow_black',
      scale: 1.1,
      warnings: [],
    });
  });

  it('picks the male and baby textures by type and a listed texture by index or seed', () => {
    expect(resolveAnimalLook(catalog(), animal({ type: 'bull' })).texture).toBe('body/bull_black');
    expect(resolveAnimalLook(catalog(), animal({ type: 'cowcalf' })).texture).toBe('body/calf_tex');
    expect(resolveAnimalLook(catalog(), animal({ breed: 'holstein', texture: 1 })).texture).toBe(
      'body/cow_bw_02',
    );
    const seeded = new Set<string | undefined>();
    for (let seed = 0; seed < 20; seed++) {
      seeded.add(resolveAnimalLook(catalog(), animal({ breed: 'holstein', seed })).texture);
    }
    expect(seeded).toEqual(new Set(['body/cow_bw_01', 'body/cow_bw_02']));
    expect(resolveAnimalLook(catalog(), animal({ texture: 'Cow_BW_02' })).texture).toBe(
      'body/cow_bw_02',
    );
  });

  it('switches models and textures by variant', () => {
    const c = catalog();
    expect(resolveAnimalLook(c, animal({ variant: 'skeleton' }))).toMatchObject({
      model: 'skinned/cow_skeleton',
      texture: 'body/bull_skeleton',
    });
    expect(resolveAnimalLook(c, animal({ variant: 'skeletonHeadless' })).model).toBe(
      'skinned/cow_skeleton_nohead',
    );
    expect(resolveAnimalLook(c, animal({ variant: 'headless' }))).toMatchObject({
      model: 'skinned/cow_headless',
      texture: 'body/cow_black',
    });
    expect(resolveAnimalLook(c, animal({ variant: 'skinned' })).texture).toBe('body/cow_skinned');
    expect(resolveAnimalLook(c, animal({ variant: 'rotten' })).texture).toBe(
      'body/cowblack_rotting',
    );
    const noRotten = resolveAnimalLook(c, animal({ variant: 'rotten', breed: 'holstein' }));
    expect(noRotten.texture).toBe('body/cow_bw_01');
    expect(noRotten.warnings[0]).toContain('no rotten texture');
    expect(resolveAnimalLook(c, animal({ variant: 'fleece' })).model).toBe('skinned/cowbody');
  });

  it('reports unknown types, breeds, and textures', () => {
    expect(resolveAnimalLook(catalog(), animal({ type: 'dragon' })).warnings[0]).toContain(
      'not in the catalog',
    );
    const look = resolveAnimalLook(catalog(), animal({ breed: 'jersey' }));
    expect(look.warnings[0]).toContain('breed "jersey"');
    expect(look.texture).toBeUndefined();
    expect(resolveAnimalLook(catalog(), animal({ texture: 'Nope' })).warnings).toEqual([
      'texture "body/nope" is not in the catalog',
    ]);
  });

  it('applies the size from the description', () => {
    expect(resolveAnimalLook(catalog(), animal({ size: 0.95 })).scale).toBe(0.95);
  });
});

describe('autoAnimalClip', () => {
  it('returns the stance clip and falls back to standing', () => {
    expect(autoAnimalClip(catalog(), animal())).toEqual({ clip: 'Cow_Idle01', speed: 1 });
    expect(autoAnimalClip(catalog(), animal({ stance: 'corpse' }))).toEqual({
      clip: 'Cow_Dead',
      speed: 1,
    });
    expect(autoAnimalClip(catalog(), animal({ stance: 'sitting' }))).toEqual({
      clip: 'Cow_Idle01',
      speed: 1,
    });
    expect(autoAnimalClip(catalog(), animal({ type: 'dragon' }))).toBeUndefined();
  });
});

describe('validateAnimalDescription', () => {
  it('accepts a full document and rejects wrong fields', () => {
    const ok = validateAnimalDescription({
      format: 'zomboid-models/animal',
      version: 1,
      type: 'cow',
      breed: 'angus',
      texture: 0,
      variant: 'rotten',
      size: 1,
      tint: { r: 1, g: 0.5, b: 0.5 },
      hue: -0.2,
      stance: 'sitting',
      seed: 3,
      meta: { source: 'test' },
    });
    expect(ok.ok).toBe(true);
    const bad = validateAnimalDescription({
      format: 'zomboid-models/animal',
      version: 1,
      type: '',
      variant: 'zombie',
      size: 0,
      hue: 2,
      stance: 'flying',
      tint: { r: 2, g: 0, b: 0 },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors).toEqual([
        'type: must be a non-empty string',
        'variant: must be one of normal, rotten, skinned, skeleton, skeletonBloody, headless, skeletonHeadless, fleece, sheared',
        'size: must be a positive number',
        'tint.r: must be a number between 0 and 1',
        'hue: must be a number between -1 and 1',
        'stance: must be one of standing, sitting, corpse',
      ]);
    }
  });
});
