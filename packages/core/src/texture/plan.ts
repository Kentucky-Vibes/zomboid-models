/**
 * A composite plan lists the drawing passes that produce one character texture, in the order
 * and with the blend modes of the game's own texture combiner. Plans are plain data so they
 * can be built and tested without a GPU.
 */

export type PassShader =
  'blit' | 'bodyMask' | 'overlayMask' | 'dirtMask' | 'addHole' | 'removeHole' | 'hueChange';

/** A texture from the manifest, by key, or the result of the passes so far. */
export type TextureRef = { key: string } | { result: true };

export interface PassRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompositePass {
  shader: PassShader;
  /**
   * Snapshots everything drawn so far as `result` and clears the target before this pass.
   * Passes that read `{ result: true }` see the latest snapshot.
   */
  resolve?: boolean;
  diffuse: TextureRef;
  mask?: TextureRef;
  intensity?: number;
  bloodDark?: number;
  cutoffMin?: number;
  cutoffMax?: number;
  maskPaddingRadius?: number;
  hue?: number;
  tint?: [number, number, number];
  /** Draws only this rectangle, in the game's 256-unit texture space measured from the top-left. */
  rect?: PassRect;
}

export interface CompositePlan {
  passes: CompositePass[];
}

/** Every manifest texture key a plan reads. */
export function planTextureKeys(plan: CompositePlan): string[] {
  const keys = new Set<string>();
  for (const pass of plan.passes) {
    for (const ref of [pass.diffuse, pass.mask]) {
      if (ref && 'key' in ref) keys.add(ref.key);
    }
  }
  return [...keys];
}

export const BLOOD_DARK = 0.5;
export const HOLE_CUTOFF_MIN = 0.2;
export const HOLE_CUTOFF_MAX = 0.55;
export const REMOVE_HOLE_PADDING = 1 / 64;
