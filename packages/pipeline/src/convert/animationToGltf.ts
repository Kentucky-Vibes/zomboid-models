import { GltfBuilder, type GltfAnimationChannel, type GltfAnimationSampler } from '../gltf/glb.js';
import { buildAnimationClips, type AnimationClipData } from '../x/anim.js';
import { collectSkeleton } from '../x/skeleton.js';
import type { XFile } from '../x/types.js';
import { addSkeletonNodes } from './meshToGltf.js';

export interface AnimationConversionOptions {
  generator?: string;
  /** Renames the clips; by default the animation set names from the file are kept. */
  clipName?: (setName: string, index: number) => string;
}

export interface AnimationConversionResult {
  glb: Uint8Array;
  clips: { name: string; duration: number; tracks: number }[];
  warnings: string[];
}

interface ClipChannels {
  samplers: GltfAnimationSampler[];
  channels: GltfAnimationChannel[];
  tracks: number;
}

function buildClipChannels(
  builder: GltfBuilder,
  clip: AnimationClipData,
  name: string,
  nodeOf: (bone: string) => number | undefined,
  warnings: string[],
): ClipChannels {
  const samplers: GltfAnimationSampler[] = [];
  const channels: GltfAnimationChannel[] = [];
  let tracks = 0;
  for (const track of clip.tracks) {
    const node = nodeOf(track.bone);
    if (node === undefined) {
      warnings.push(`${name}: bone "${track.bone}" is not in the skeleton; track dropped`);
      continue;
    }
    tracks++;
    const paths = [
      ['translation', track.translation, 'VEC3'],
      ['rotation', track.rotation, 'VEC4'],
      ['scale', track.scale, 'VEC3'],
    ] as const;
    for (const [path, channel, type] of paths) {
      if (!channel) continue;
      const input = builder.addAccessor(channel.times, 'SCALAR', { minMax: true });
      const output = builder.addAccessor(channel.values, type);
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node, path } });
    }
  }
  return { samplers, channels, tracks };
}

/**
 * Converts the animation sets of a .x file to one GLB that carries the skeleton as nodes and
 * one glTF animation per set.
 */
export function convertAnimationFile(
  file: XFile,
  options: AnimationConversionOptions = {},
): AnimationConversionResult {
  const builder = new GltfBuilder(options.generator);
  const skeleton = collectSkeleton(file.frames);
  const nodeIds = addSkeletonNodes(builder, skeleton);
  const nodeOf = (bone: string): number | undefined => {
    const index = skeleton.index.get(bone);
    return index === undefined ? undefined : nodeIds[index];
  };
  const warnings: string[] = [];
  const clips = buildAnimationClips(file).map((clip, index) => {
    const name = options.clipName?.(clip.name, index) ?? clip.name;
    const { samplers, channels, tracks } = buildClipChannels(builder, clip, name, nodeOf, warnings);
    if (tracks === 0) {
      warnings.push(`${name}: no track matched a skeleton bone; clip dropped`);
    } else {
      builder.addAnimation(name, samplers, channels);
    }
    return { name, duration: clip.duration, tracks };
  });
  return { glb: builder.toGlb(), clips, warnings };
}
