import type { CharacterCatalog } from '../format/manifest.js';
import {
  BODY_PARTS,
  type BodyPart,
  type BodyPartDamageDescription,
  type Sex,
  type WornItemDescription,
} from '../format/types.js';

/**
 * The hidden clothing items the game equips for each body part's state: a bandage item (with a
 * dirty variant) and wound overlays named by region and wound kind. Regions follow the game's
 * `BodyPartType` table; legs and feet have bandages but no wound textures.
 */
const REGIONS: Partial<Record<BodyPart, { bandage: string; wound?: string }>> = {
  Hand_L: { bandage: 'LeftHand', wound: 'LHand' },
  Hand_R: { bandage: 'RightHand', wound: 'RHand' },
  ForeArm_L: { bandage: 'LeftLowerArm', wound: 'LForearm' },
  ForeArm_R: { bandage: 'RightLowerArm', wound: 'RForearm' },
  UpperArm_L: { bandage: 'LeftUpperArm', wound: 'LUArm' },
  UpperArm_R: { bandage: 'RightUpperArm', wound: 'RUArm' },
  Torso_Upper: { bandage: 'Chest', wound: 'Chest' },
  Torso_Lower: { bandage: 'Abdomen', wound: 'Abdomen' },
  Head: { bandage: 'Head', wound: 'Neck' },
  Neck: { bandage: 'Neck', wound: 'Neck' },
  Groin: { bandage: 'Groin', wound: 'Groin' },
  UpperLeg_L: { bandage: 'LeftUpperLeg' },
  UpperLeg_R: { bandage: 'RightUpperLeg' },
  LowerLeg_L: { bandage: 'LeftLowerLeg' },
  LowerLeg_R: { bandage: 'RightLowerLeg' },
  Foot_L: { bandage: 'LeftFoot' },
  Foot_R: { bandage: 'RightFoot' },
};

const SEX_SUFFIX: Record<Sex, string> = { male: 'Male', female: 'Female' };

/** Item names for one body part's damage, most severe wound first, in the game's naming. */
export function damageItemNames(
  part: BodyPart,
  damage: BodyPartDamageDescription,
  sex: Sex,
): string[] {
  const region = REGIONS[part];
  if (!region) return [];
  const names: string[] = [];
  if (region.wound) {
    const kinds: string[] = [];
    if (damage.bitten) kinds.push('Bite');
    if (damage.scratched) kinds.push('Scratch');
    if (damage.cut || damage.deepWound) kinds.push('Laceration');
    for (const kind of kinds) names.push(`Base.Wound_${region.wound}_${kind}_${SEX_SUFFIX[sex]}`);
  }
  if (damage.bandage) {
    names.push(`Base.Bandage_${region.bandage}${damage.bandage === 'dirty' ? '_Blood' : ''}`);
  }
  return names;
}

/**
 * Turns the damage of a description into the worn items the game would show, skipping names
 * the manifest does not know (reported as warnings).
 */
export function damageWornItems(
  manifest: CharacterCatalog,
  sex: Sex,
  damage: Partial<Record<BodyPart, BodyPartDamageDescription>> | undefined,
  warnings: string[],
): WornItemDescription[] {
  if (!damage) return [];
  const items: WornItemDescription[] = [];
  for (const part of BODY_PARTS) {
    const state = damage[part];
    if (!state) continue;
    for (const name of damageItemNames(part, state, sex)) {
      if (manifest.wearables[name]) items.push({ item: name });
      else warnings.push(`damage item "${name}" for ${part} is not in the manifest`);
    }
  }
  return items;
}
