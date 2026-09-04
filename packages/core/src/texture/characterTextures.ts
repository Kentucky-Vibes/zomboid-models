import type { Manifest } from '../format/manifest.js';
import {
  BODY_PARTS,
  type BodyPart,
  type PartAmounts,
  type PatchType,
  type RgbColor,
  type WornItemDescription,
} from '../format/types.js';
import { MASK_LEAVES, maskLeavesFor, PATCH_REGIONS, type MaskPart } from './maskParts.js';
import {
  BLOOD_DARK,
  HOLE_CUTOFF_MAX,
  HOLE_CUTOFF_MIN,
  REMOVE_HOLE_PADDING,
  type CompositePass,
  type CompositePlan,
} from './plan.js';

export const DEFAULT_MASK_FOLDER = 'body/masks';
export const BLOOD_OVERLAY_KEY = 'bloodtextures/bloodoverlay';
export const GRIME_OVERLAY_KEY = 'bloodtextures/grimeoverlay';
const HAT_MASK_FOLDER = 'clothes/hat/masks';
const PATCH_FABRIC: Record<PatchType, string> = {
  basic: 'sheet',
  denim: 'denim',
  leather: 'leather',
};

/** A worn item with a mesh, as far as the body texture is concerned. */
export interface BodyLayerInput {
  /** Mask part indices from the clothing item (`m_Masks`). */
  masks: readonly number[];
  masksFolder: string | undefined;
  underlayMasksFolder: string | undefined;
  /** Body parts where the item has a hole; the skin shows through there. */
  holes: readonly BodyPart[];
}

export interface BodyTextureInput {
  skinTexture: string;
  blood: PartAmounts | undefined;
  dirt: PartAmounts | undefined;
  /** Visible worn items with meshes, innermost first. */
  layers: readonly BodyLayerInput[];
}

/** Which body regions the worn items hide and which mask folder applies to the body. */
export function bodyMaskState(layers: readonly BodyLayerInput[]): {
  hidden: Set<MaskPart>;
  folder: string;
} {
  const hidden = new Set<MaskPart>();
  let folder = DEFAULT_MASK_FOLDER;
  for (const layer of layers) {
    const own = layer.masksFolder;
    if (own === 'none' || own?.includes(HAT_MASK_FOLDER)) continue;
    for (const leaf of maskLeavesFor(layer.masks)) hidden.add(leaf);
  }
  // The game walks the layers from the outermost inwards; the last underlay folder set wins.
  for (const layer of [...layers].reverse()) {
    if (layer.underlayMasksFolder && layer.underlayMasksFolder !== DEFAULT_MASK_FOLDER) {
      folder = layer.underlayMasksFolder;
    }
  }
  return { hidden, folder };
}

function holeMaskKey(manifest: Manifest, part: BodyPart): string | undefined {
  const blood = manifest.bloodMasks[part];
  return blood === undefined ? undefined : blood.replace(/^bloodtextures\//, 'holetextures/');
}

function bloodPass(mask: string, amount: number): CompositePass {
  return {
    shader: 'overlayMask',
    diffuse: { key: BLOOD_OVERLAY_KEY },
    mask: { key: mask },
    intensity: amount,
    bloodDark: BLOOD_DARK,
  };
}

function dirtPass(mask: string, amount: number): CompositePass {
  return {
    shader: 'dirtMask',
    diffuse: { key: GRIME_OVERLAY_KEY },
    mask: { key: mask },
    intensity: amount,
  };
}

/**
 * Plans the body texture the way the game composes it: skin, then dirt and blood per part,
 * then the result drawn through the body masks so that skin under clothing disappears, then
 * the skin restored inside the holes of the garments.
 */
export function planBodyTexture(manifest: Manifest, input: BodyTextureInput): CompositePlan {
  const passes: CompositePass[] = [{ shader: 'blit', diffuse: { key: input.skinTexture } }];
  for (const part of BODY_PARTS) {
    const mask = manifest.bloodMasks[part];
    if (mask === undefined) continue;
    const dirt = input.dirt?.[part] ?? 0;
    const blood = input.blood?.[part] ?? 0;
    if (dirt > 0) passes.push(dirtPass(mask, dirt));
    if (blood > 0) passes.push(bloodPass(mask, blood));
  }

  const { hidden, folder } = bodyMaskState(input.layers);
  if (hidden.size === 0) {
    return { passes };
  }
  MASK_LEAVES.filter((leaf) => !hidden.has(leaf)).forEach((leaf, index) => {
    passes.push({
      shader: 'bodyMask',
      resolve: index === 0,
      diffuse: { result: true },
      mask: { key: `${folder}/${leaf.toLowerCase()}` },
    });
  });
  const holes = new Set<BodyPart>();
  for (const layer of input.layers) for (const part of layer.holes) holes.add(part);
  for (const part of BODY_PARTS) {
    const mask = holes.has(part) ? holeMaskKey(manifest, part) : undefined;
    if (mask === undefined) continue;
    passes.push({
      shader: 'removeHole',
      diffuse: { result: true },
      mask: { key: mask },
      cutoffMin: 0,
      cutoffMax: 0.00001,
      maskPaddingRadius: REMOVE_HOLE_PADDING,
    });
  }
  return { passes };
}

export interface ItemTextureInput {
  baseTexture: string;
  tint: RgbColor | undefined;
  hue: number | undefined;
  description: WornItemDescription;
}

function isTinted(tint: RgbColor | undefined): tint is RgbColor {
  return tint !== undefined && (tint.r !== 1 || tint.g !== 1 || tint.b !== 1);
}

function isHued(hue: number | undefined): hue is number {
  return hue !== undefined && Math.abs(hue) > 1e-4;
}

function hasAmounts(amounts: PartAmounts | undefined): boolean {
  return amounts !== undefined && Object.values(amounts).some((v) => (v ?? 0) > 0);
}

/** True when the item can use its base texture as it is, without compositing. */
export function isPlainItemTexture(input: ItemTextureInput): boolean {
  const d = input.description;
  return (
    !isTinted(input.tint) &&
    !isHued(input.hue) &&
    d.decal === undefined &&
    !hasAmounts(d.blood) &&
    !hasAmounts(d.dirt) &&
    !Object.values(d.holes ?? {}).some(Boolean) &&
    Object.keys(d.patches ?? {}).length === 0
  );
}

/**
 * Plans a worn item's texture: the base texture with tint or hue, then blood, dirt, and a patch
 * per part, then holes punched through it, one resolve per hole like the game.
 */
export function planItemTexture(manifest: Manifest, input: ItemTextureInput): CompositePlan {
  const d = input.description;
  const base: CompositePass = { shader: 'blit', diffuse: { key: input.baseTexture } };
  if (isTinted(input.tint)) {
    base.shader = 'hueChange';
    base.tint = [input.tint.r, input.tint.g, input.tint.b];
  } else if (isHued(input.hue)) {
    base.shader = 'hueChange';
    base.hue = input.hue;
  }
  const passes: CompositePass[] = [base];
  for (const part of BODY_PARTS) {
    const mask = manifest.bloodMasks[part];
    if (mask !== undefined) {
      const blood = d.blood?.[part] ?? 0;
      const dirt = d.dirt?.[part] ?? 0;
      if (blood > 0) passes.push(bloodPass(mask, blood));
      if (dirt > 0) passes.push(dirtPass(mask, dirt));
    }
    const patch = d.patches?.[part];
    const region = PATCH_REGIONS[part];
    if (patch !== undefined && region !== undefined) {
      passes.push({
        shader: 'blit',
        diffuse: { key: `patches/patches_${region}_${PATCH_FABRIC[patch]}` },
      });
    }
  }
  for (const part of BODY_PARTS) {
    const mask = d.holes?.[part] ? holeMaskKey(manifest, part) : undefined;
    if (mask === undefined) continue;
    passes.push({
      shader: 'addHole',
      resolve: true,
      diffuse: { result: true },
      mask: { key: mask },
      cutoffMin: HOLE_CUTOFF_MIN,
      cutoffMax: HOLE_CUTOFF_MAX,
    });
  }
  return { passes };
}
