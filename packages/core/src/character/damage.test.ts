import { describe, expect, it } from 'vitest';

import { MANIFEST_FORMAT, MANIFEST_VERSION, type CharacterCatalog } from '../format/manifest.js';
import { damageItemNames, damageWornItems } from './damage.js';

describe('damageItemNames', () => {
  it('names wounds by region and kind with the sex suffix, and bandages by state', () => {
    expect(
      damageItemNames('Torso_Upper', { bitten: true, cut: true, bandage: 'dirty' }, 'female'),
    ).toEqual([
      'Base.Wound_Chest_Bite_Female',
      'Base.Wound_Chest_Laceration_Female',
      'Base.Bandage_Chest_Blood',
    ]);
    expect(damageItemNames('Hand_L', { scratched: true, bandage: 'clean' }, 'male')).toEqual([
      'Base.Wound_LHand_Scratch_Male',
      'Base.Bandage_LeftHand',
    ]);
    expect(damageItemNames('Head', { deepWound: true }, 'male')).toEqual([
      'Base.Wound_Neck_Laceration_Male',
    ]);
  });

  it('gives legs and feet bandages only, and the back nothing', () => {
    expect(damageItemNames('LowerLeg_R', { bitten: true, bandage: 'clean' }, 'male')).toEqual([
      'Base.Bandage_RightLowerLeg',
    ]);
    expect(damageItemNames('Back', { bitten: true, bandage: 'clean' }, 'male')).toEqual([]);
  });
});

describe('damageWornItems', () => {
  it('keeps the items the manifest knows and reports the rest', () => {
    const manifest = {
      format: MANIFEST_FORMAT,
      version: MANIFEST_VERSION,
      wearables: {
        'Base.Bandage_Chest': {
          clothingItem: 'bandage_chest',
          bodyLocation: 'base:bandage',
          bloodLocation: [],
        },
      },
    } as unknown as CharacterCatalog;
    const warnings: string[] = [];
    const items = damageWornItems(
      manifest,
      'male',
      { Torso_Upper: { bandage: 'clean', bitten: true }, Foot_L: { bandage: 'clean' } },
      warnings,
    );
    expect(items).toEqual([{ item: 'Base.Bandage_Chest' }]);
    expect(warnings).toEqual([
      'damage item "Base.Wound_Chest_Bite_Male" for Torso_Upper is not in the manifest',
      'damage item "Base.Bandage_LeftFoot" for Foot_L is not in the manifest',
    ]);
  });
});
