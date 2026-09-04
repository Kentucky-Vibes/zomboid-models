import { decompose, normalizeQuat, type Quat } from '../math/matrix.js';
import type { XAnimationKey, XFile } from './types.js';

export const DEFAULT_TICKS_PER_SECOND = 4800;

export interface BoneTrack {
  bone: string;
  rotation: { times: Float32Array; values: Float32Array } | null;
  translation: { times: Float32Array; values: Float32Array } | null;
  scale: { times: Float32Array; values: Float32Array } | null;
}

export interface AnimationClipData {
  name: string;
  /** Length in seconds. */
  duration: number;
  tracks: BoneTrack[];
}

type Channel = { times: number[]; values: number[] };

/**
 * Rotation keys in .x files hold the inverse of the rotation that the frame matrices describe,
 * stored as w, x, y, z. This returns the matching glTF quaternion (x, y, z, w).
 */
export function convertRotationKey(values: readonly number[]): Quat {
  const [w, x, y, z] = values as [number, number, number, number];
  return normalizeQuat([-x, -y, -z, w]);
}

function appendKey(channel: Channel, time: number, values: readonly number[]): void {
  channel.times.push(time);
  channel.values.push(...values);
}

function toTrackChannel(
  channel: Channel,
  ticksPerSecond: number,
): { times: Float32Array; values: Float32Array } | null {
  if (channel.times.length === 0) return null;
  return {
    times: new Float32Array(channel.times.map((t) => t / ticksPerSecond)),
    values: new Float32Array(channel.values),
  };
}

function readKeys(
  keys: readonly XAnimationKey[],
  rotation: Channel,
  translation: Channel,
  scale: Channel,
): void {
  for (const key of keys) {
    for (const frame of key.keys) {
      switch (key.keyType) {
        case 0:
          appendKey(rotation, frame.time, convertRotationKey(frame.values));
          break;
        case 1:
          appendKey(scale, frame.time, frame.values.slice(0, 3));
          break;
        case 2:
          appendKey(translation, frame.time, frame.values.slice(0, 3));
          break;
        case 4: {
          const trs = decompose(frame.values);
          appendKey(rotation, frame.time, trs.rotation);
          appendKey(translation, frame.time, trs.translation);
          appendKey(scale, frame.time, trs.scale);
          break;
        }
      }
    }
  }
}

/** Extracts every animation set of a file as clips with per-bone tracks in seconds. */
export function buildAnimationClips(file: XFile): AnimationClipData[] {
  const ticksPerSecond = file.ticksPerSecond ?? DEFAULT_TICKS_PER_SECOND;
  return file.animationSets.map((set, setIndex) => {
    let duration = 0;
    const tracks: BoneTrack[] = [];
    for (const animation of set.animations) {
      if (animation.target === undefined) continue;
      const rotation: Channel = { times: [], values: [] };
      const translation: Channel = { times: [], values: [] };
      const scale: Channel = { times: [], values: [] };
      readKeys(animation.keys, rotation, translation, scale);
      for (const channel of [rotation, translation, scale]) {
        for (const time of channel.times) duration = Math.max(duration, time / ticksPerSecond);
      }
      tracks.push({
        bone: animation.target,
        rotation: toTrackChannel(rotation, ticksPerSecond),
        translation: toTrackChannel(translation, ticksPerSecond),
        scale: toTrackChannel(scale, ticksPerSecond),
      });
    }
    return { name: set.name ?? `animation_${setIndex}`, duration, tracks };
  });
}
