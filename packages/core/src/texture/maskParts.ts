import type { BodyPart } from '../format/types.js';

/**
 * The body regions of the game's `CharacterMask.Part`, indexed as `m_Masks` uses them. `Torso`
 * and `Pelvis` are groups that expand to the leaf regions named after them.
 */
export const MASK_PARTS = [
  'Head',
  'Torso',
  'Pelvis',
  'LeftArm',
  'LeftHand',
  'RightArm',
  'RightHand',
  'LeftLeg',
  'LeftFoot',
  'RightLeg',
  'RightFoot',
  'Dress',
  'Chest',
  'Waist',
  'Belt',
  'Crotch',
] as const;

export type MaskPart = (typeof MASK_PARTS)[number];

const GROUPS: Partial<Record<MaskPart, MaskPart[]>> = {
  Torso: ['Chest', 'Waist'],
  Pelvis: ['Belt', 'Crotch'],
};

/** The regions that have their own mask file (every part that is not a group). */
export const MASK_LEAVES: readonly MaskPart[] = MASK_PARTS.filter((part) => !(part in GROUPS));

/** Expands mask indices from a clothing item into the leaf regions they hide. */
export function maskLeavesFor(indices: readonly number[]): Set<MaskPart> {
  const hidden = new Set<MaskPart>();
  for (const index of indices) {
    const part = MASK_PARTS[index];
    if (part === undefined) continue;
    for (const leaf of GROUPS[part] ?? [part]) hidden.add(leaf);
  }
  return hidden;
}

/** Region names of the patch textures (`patches/patches_<region>_<fabric>`), where they exist. */
export const PATCH_REGIONS: Partial<Record<BodyPart, string>> = {
  Hand_L: 'left_hand',
  Hand_R: 'right_hand',
  ForeArm_L: 'left_lower_arm',
  ForeArm_R: 'right_lower_arm',
  UpperArm_L: 'left_upper_arm',
  UpperArm_R: 'right_upper_arm',
  Torso_Upper: 'chest',
  Torso_Lower: 'abdomen',
  Groin: 'groin',
  UpperLeg_L: 'left_upper_leg',
  UpperLeg_R: 'right_upper_leg',
  LowerLeg_L: 'left_lower_leg',
  LowerLeg_R: 'right_lower_leg',
  Back: 'back',
};

/** Body parts covered by each blood location name from the item scripts (`BloodLocation`). */
export const BLOOD_LOCATIONS: Readonly<Record<string, readonly BodyPart[]>> = (() => {
  const shirtNoSleeves: BodyPart[] = ['Torso_Upper', 'Torso_Lower', 'Back'];
  const shirt: BodyPart[] = [...shirtNoSleeves, 'UpperArm_L', 'UpperArm_R'];
  const shirtLongSleeves: BodyPart[] = [...shirt, 'ForeArm_L', 'ForeArm_R'];
  const shortsShort: BodyPart[] = ['Groin', 'UpperLeg_L', 'UpperLeg_R'];
  return {
    apron: ['Torso_Upper', 'Torso_Lower', 'UpperLeg_L', 'UpperLeg_R'],
    shirtnosleeves: shirtNoSleeves,
    jumpernosleeves: shirtNoSleeves,
    shirt,
    shirtlongsleeves: shirtLongSleeves,
    jumper: shirtLongSleeves,
    jacket: [...shirtLongSleeves, 'Neck'],
    longjacket: [...shirtLongSleeves, 'Neck', 'Groin', 'UpperLeg_L', 'UpperLeg_R'],
    shortsshort: shortsShort,
    trousers: [...shortsShort, 'LowerLeg_L', 'LowerLeg_R'],
    shoes: ['Foot_L', 'Foot_R'],
    fullhelmet: ['Head'],
    bag: ['Back'],
    hands: ['Hand_L', 'Hand_R'],
    head: ['Head'],
    neck: ['Neck'],
    groin: ['Groin'],
    upperbody: ['Torso_Upper'],
    lowerbody: ['Torso_Lower'],
    lowerlegs: ['LowerLeg_L', 'LowerLeg_R'],
    upperlegs: ['UpperLeg_L', 'UpperLeg_R'],
    lowerarms: ['ForeArm_L', 'ForeArm_R'],
    upperarms: ['UpperArm_L', 'UpperArm_R'],
    hand_l: ['Hand_L'],
    hand_r: ['Hand_R'],
    forearm_l: ['ForeArm_L'],
    forearm_r: ['ForeArm_R'],
    upperarm_l: ['UpperArm_L'],
    upperarm_r: ['UpperArm_R'],
    upperleg_l: ['UpperLeg_L'],
    upperleg_r: ['UpperLeg_R'],
    lowerleg_l: ['LowerLeg_L'],
    lowerleg_r: ['LowerLeg_R'],
    foot_l: ['Foot_L'],
    foot_r: ['Foot_R'],
  };
})();

/** Body parts a worn item can carry blood on, from its script's blood location names. */
export function bloodPartsFor(bloodLocations: readonly string[]): Set<BodyPart> {
  const parts = new Set<BodyPart>();
  for (const name of bloodLocations) {
    for (const part of BLOOD_LOCATIONS[name.toLowerCase()] ?? []) parts.add(part);
  }
  return parts;
}
