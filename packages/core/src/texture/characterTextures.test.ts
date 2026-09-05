import { describe, expect, it } from 'vitest';

import { emptyCharacterCatalog } from '../format/emptyCatalog.js';
import type { CharacterCatalog } from '../format/manifest.js';
import {
  bodyMaskState,
  isPlainItemTexture,
  planBodyTexture,
  planItemTexture,
} from './characterTextures.js';
import { bloodPartsFor, maskLeavesFor } from './maskParts.js';
import { planTextureKeys } from './plan.js';

function manifest(): CharacterCatalog {
  return {
    ...emptyCharacterCatalog(),
    bodies: {
      male: { model: 'skinned/malebody', skins: ['body/malebody01'], bodyHair: false },
      female: { model: 'skinned/femalebody', skins: ['body/femalebody01'], bodyHair: false },
    },
    bodyAttachments: {},
    models: {},
    textures: {},
    animations: {},
    idle: { default: { clip: 'Bob_Idle', speed: 1 }, byWeaponType: {} },
    clothingItems: {},
    wearables: {},
    heldItems: {},
    bodyLocations: {},
    attachedLocations: {},
    hair: { male: {}, female: {} },
    beards: {},
    bloodMasks: {
      Head: 'bloodtextures/bloodmaskhead',
      Torso_Upper: 'bloodtextures/bloodmaskchest',
      UpperLeg_L: 'bloodtextures/bloodmaskulegl',
    },
    decals: { Spiffo1: { texture: 'shirtdecals/spiffo7', x: 102, y: 118, width: 52, height: 52 } },
    decalGroups: { TShirtSpiffo: ['Spiffo1'] },
  };
}

describe('mask parts', () => {
  it('expands group indices into leaf regions', () => {
    expect([...maskLeavesFor([1, 4, 99])]).toEqual(['Chest', 'Waist', 'LeftHand']);
    expect([...maskLeavesFor([2, 14])]).toEqual(['Belt', 'Crotch']);
  });

  it('maps blood location names to body parts', () => {
    expect([...bloodPartsFor(['Trousers'])]).toEqual([
      'Groin',
      'UpperLeg_L',
      'UpperLeg_R',
      'LowerLeg_L',
      'LowerLeg_R',
    ]);
    expect([...bloodPartsFor(['Jacket', 'Nope'])]).toContain('Neck');
  });
});

describe('bodyMaskState', () => {
  it('unions the masks of all layers and takes the innermost underlay folder', () => {
    const state = bodyMaskState([
      {
        masks: [7, 9],
        masksFolder: undefined,
        underlayMasksFolder: 'clothes/robe/masks',
        holes: [],
      },
      { masks: [1], masksFolder: undefined, underlayMasksFolder: undefined, holes: [] },
      { masks: [0], masksFolder: 'clothes/hat/masks', underlayMasksFolder: undefined, holes: [] },
    ]);
    expect([...state.hidden]).toEqual(['LeftLeg', 'RightLeg', 'Chest', 'Waist']);
    expect(state.folder).toBe('clothes/robe/masks');
  });
});

describe('planBodyTexture', () => {
  it('draws the skin, dirt then blood per part, masks, and hole restores', () => {
    const plan = planBodyTexture(manifest(), {
      skinTexture: 'body/malebody01',
      blood: { Head: 0.5, Torso_Upper: 1 },
      dirt: { Torso_Upper: 0.25 },
      layers: [
        {
          masks: [1],
          masksFolder: undefined,
          underlayMasksFolder: undefined,
          holes: ['Torso_Upper'],
        },
      ],
    });
    const summary = plan.passes.map(
      (p) =>
        `${p.shader}${p.resolve ? '!' : ''}:${'key' in p.diffuse ? p.diffuse.key : 'result'}:${p.mask && 'key' in p.mask ? p.mask.key : ''}`,
    );
    expect(summary.slice(0, 4)).toEqual([
      'blit:body/malebody01:',
      'dirtMask:bloodtextures/grimeoverlay:bloodtextures/bloodmaskchest',
      'overlayMask:bloodtextures/bloodoverlay:bloodtextures/bloodmaskchest',
      'overlayMask:bloodtextures/bloodoverlay:bloodtextures/bloodmaskhead',
    ]);
    expect(summary[4]).toBe('bodyMask!:result:body/masks/head');
    expect(summary.filter((s) => s.startsWith('bodyMask')).length).toBe(12);
    expect(summary.at(-1)).toBe('removeHole:result:holetextures/bloodmaskchest');
    expect(plan.passes[2]).toMatchObject({ intensity: 1, bloodDark: 0.5 });
    expect(planTextureKeys(plan)).toContain('body/masks/dress');
    expect(planTextureKeys(plan)).not.toContain('body/masks/chest');
  });

  it('draws mesh-less layers through the visible masks after the skin', () => {
    const plan = planBodyTexture(manifest(), {
      skinTexture: 'body/malebody01',
      blood: undefined,
      dirt: undefined,
      layers: [
        {
          masks: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
          masksFolder: undefined,
          underlayMasksFolder: undefined,
          holes: [],
        },
      ],
      overlays: ['bodydmg/malebody01_bandages_head'],
    });
    const summary = plan.passes.map(
      (p) =>
        `${p.shader}:${'key' in p.diffuse ? p.diffuse.key : 'result'}:${p.mask && 'key' in p.mask ? p.mask.key : ''}`,
    );
    expect(summary).toEqual([
      'blit:body/malebody01:',
      'bodyMask:result:body/masks/head',
      'bodyMask:bodydmg/malebody01_bandages_head:body/masks/head',
    ]);
  });

  it('blits mesh-less layers directly when nothing is hidden', () => {
    const plan = planBodyTexture(manifest(), {
      skinTexture: 'body/malebody01',
      blood: undefined,
      dirt: undefined,
      layers: [],
      overlays: ['body/stubble/m_hair_stubble'],
    });
    expect(plan.passes.map((p) => p.shader)).toEqual(['blit', 'blit']);
  });

  it('skips masking when nothing is hidden', () => {
    const plan = planBodyTexture(manifest(), {
      skinTexture: 'body/malebody01',
      blood: undefined,
      dirt: undefined,
      layers: [
        { masks: [0], masksFolder: 'clothes/hat/masks', underlayMasksFolder: undefined, holes: [] },
      ],
    });
    expect(plan.passes).toHaveLength(1);
  });
});

describe('planItemTexture', () => {
  it('detects plain textures', () => {
    expect(
      isPlainItemTexture({
        baseTexture: 't',
        tint: { r: 1, g: 1, b: 1 },
        hue: 0,
        description: { item: 'x' },
      }),
    ).toBe(true);
    expect(
      isPlainItemTexture({
        baseTexture: 't',
        tint: undefined,
        hue: 0.2,
        description: { item: 'x' },
      }),
    ).toBe(false);
    expect(
      isPlainItemTexture({
        baseTexture: 't',
        tint: undefined,
        hue: undefined,
        description: { item: 'x', holes: { Head: true } },
      }),
    ).toBe(false);
  });

  it('tints, adds blood, dirt, patches, and holes in the game order', () => {
    const plan = planItemTexture(manifest(), {
      baseTexture: 'clothes/jacket',
      tint: { r: 0.5, g: 0.5, b: 1 },
      hue: 0.3,
      description: {
        item: 'x',
        blood: { Torso_Upper: 0.75 },
        dirt: { Torso_Upper: 0.5 },
        patches: { Torso_Upper: 'denim', Head: 'basic' },
        holes: { UpperLeg_L: true, Head: false },
      },
    });
    const summary = plan.passes.map(
      (p) => `${p.shader}${p.resolve ? '!' : ''}:${'key' in p.diffuse ? p.diffuse.key : 'result'}`,
    );
    expect(summary).toEqual([
      'hueChange:clothes/jacket',
      'overlayMask:bloodtextures/bloodoverlay',
      'dirtMask:bloodtextures/grimeoverlay',
      'blit:patches/patches_chest_denim',
      'addHole!:result',
    ]);
    expect(plan.passes[0]).toMatchObject({ tint: [0.5, 0.5, 1] });
    expect(plan.passes[0]?.hue).toBeUndefined();
    expect(plan.passes[4]).toMatchObject({
      cutoffMin: 0.2,
      cutoffMax: 0.55,
      mask: { key: 'holetextures/bloodmaskulegl' },
    });
  });

  it('draws a known decal into its rectangle and ignores unknown ones', () => {
    const plan = planItemTexture(manifest(), {
      baseTexture: 't',
      tint: undefined,
      hue: undefined,
      description: { item: 'x', decal: 'Spiffo1' },
    });
    expect(plan.passes[1]).toEqual({
      shader: 'blit',
      diffuse: { key: 'shirtdecals/spiffo7' },
      rect: { x: 102, y: 118, width: 52, height: 52 },
    });
    const unknown = planItemTexture(manifest(), {
      baseTexture: 't',
      tint: undefined,
      hue: undefined,
      description: { item: 'x', decal: 'Nope' },
    });
    expect(unknown.passes).toHaveLength(1);
  });

  it('uses the hue shift when there is no tint', () => {
    const plan = planItemTexture(manifest(), {
      baseTexture: 't',
      tint: undefined,
      hue: -0.4,
      description: { item: 'x' },
    });
    expect(plan.passes[0]).toEqual({ shader: 'hueChange', diffuse: { key: 't' }, hue: -0.4 });
  });
});
