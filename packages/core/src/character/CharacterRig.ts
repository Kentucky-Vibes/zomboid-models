import {
  AnimationClip,
  AnimationMixer,
  Bone,
  Box3,
  DoubleSide,
  Group,
  Matrix4,
  MeshLambertMaterial,
  Skeleton,
  Vector3,
  type AnimationAction,
  type Color,
  type Material,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
  type Texture,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

import type { AssetCache } from '../assets/AssetCache.js';
import type { Manifest } from '../format/manifest.js';
import type { CharacterDescription, Sex } from '../format/types.js';

export interface RigWarning {
  code: 'missing-item' | 'missing-model' | 'missing-texture' | 'missing-bone' | 'missing-animation';
  message: string;
}

export interface RigPart {
  /** Full item type for worn items, `body`, `hair`, or `beard`. */
  key: string;
  mesh: Mesh;
  material: MeshLambertMaterial;
}

/**
 * The assembled three.js object of one character: the body, its skeleton, every worn mesh
 * bound to that skeleton by bone name, and the animation mixer that drives it.
 */
export class CharacterRig extends Group {
  readonly parts: RigPart[] = [];
  readonly bones = new Map<string, Bone>();
  readonly mixer: AnimationMixer;
  readonly warnings: RigWarning[] = [];
  private action: AnimationAction | undefined;

  private constructor(readonly skeletonRoot: Object3D) {
    super();
    this.name = 'character';
    // The game's meshes face -Z; turn them to face +Z, which is where the camera sits.
    this.rotation.y = Math.PI;
    this.add(skeletonRoot);
    this.mixer = new AnimationMixer(this);
    skeletonRoot.traverse((object) => {
      if (isBone(object)) this.bones.set(object.name, object);
    });
  }

  /** Loads the body for the description's sex and returns a rig with only the body attached. */
  static async load(
    cache: AssetCache,
    manifest: Manifest,
    description: CharacterDescription,
  ): Promise<CharacterRig> {
    const sex: Sex = description.body.sex;
    const body = manifest.bodies[sex];
    const model = manifest.models[body.model];
    if (!model) {
      throw new Error(`manifest has no model "${body.model}" for the ${sex} body`);
    }
    const gltf = await cache.loadGltf(model.file);
    const scene = cloneSkeleton(gltf.scene);
    scene.updateMatrixWorld(true);
    const bodyMesh = findSkinnedMesh(scene);
    if (!bodyMesh) {
      throw new Error(`body model "${body.model}" contains no skinned mesh`);
    }
    const rig = new CharacterRig(scene);
    rig.attachSkinned('body', bodyMesh);
    return rig;
  }

  /** Adds every skinned mesh of a model, rebinding it to the body skeleton by bone name. */
  async addWornModel(
    cache: AssetCache,
    manifest: Manifest,
    key: string,
    modelKey: string,
  ): Promise<void> {
    const model = manifest.models[modelKey];
    if (!model) {
      this.warnings.push({
        code: 'missing-model',
        message: `manifest has no model "${modelKey}" for ${key}`,
      });
      return;
    }
    const gltf = await cache.loadGltf(model.file);
    const scene = cloneSkeleton(gltf.scene);
    scene.updateMatrixWorld(true);
    const meshes: SkinnedMesh[] = [];
    scene.traverse((object) => {
      if (isSkinnedMesh(object)) meshes.push(object);
    });
    for (const mesh of meshes) {
      const bindMatrix = mesh.matrixWorld.clone();
      const skeleton = this.rebind(mesh.skeleton, key);
      mesh.removeFromParent();
      this.add(mesh);
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
      mesh.bind(skeleton, bindMatrix);
      this.attachSkinned(key, mesh, true);
    }
  }

  /**
   * Adds every mesh of a static model as a child of a bone, keeping the transform the mesh has
   * inside its own file. Without a bone name the meshes sit at the skeleton root.
   */
  async addStaticModel(
    cache: AssetCache,
    manifest: Manifest,
    key: string,
    modelKey: string,
    boneName: string | undefined,
  ): Promise<void> {
    const model = manifest.models[modelKey];
    if (!model) {
      this.warnings.push({
        code: 'missing-model',
        message: `manifest has no model "${modelKey}" for ${key}`,
      });
      return;
    }
    const parent = boneName === undefined ? undefined : this.bones.get(boneName);
    if (boneName !== undefined && !parent) {
      this.warnings.push({
        code: 'missing-bone',
        message: `${key}: bone "${boneName}" is not in the body skeleton`,
      });
    }
    const gltf = await cache.loadGltf(model.file);
    const scene = cloneSkeleton(gltf.scene);
    scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    scene.traverse((object) => {
      if (isMesh(object) && !isSkinnedMesh(object)) meshes.push(object);
    });
    for (const mesh of meshes) {
      const local = mesh.matrixWorld.clone();
      mesh.removeFromParent();
      (parent ?? this.skeletonRoot).add(mesh);
      local.decompose(mesh.position, mesh.quaternion, mesh.scale);
      this.attachMesh(key, mesh);
    }
  }

  /** Applies a texture to every part with the given key. */
  setTexture(key: string, texture: Texture | null): void {
    for (const part of this.parts) {
      if (part.key !== key) continue;
      part.material.map = texture;
      part.material.needsUpdate = true;
    }
  }

  /** Multiplies the texture of every part with the given key by a colour, like the game's tint. */
  setTint(key: string, color: Color): void {
    for (const part of this.parts) {
      if (part.key === key) part.material.color.copy(color);
    }
  }

  /** Removes every part with the given key and frees its resources. */
  removeParts(key: string): void {
    for (const part of [...this.parts]) {
      if (part.key !== key) continue;
      part.mesh.removeFromParent();
      part.mesh.geometry.dispose();
      part.material.dispose();
      this.parts.splice(this.parts.indexOf(part), 1);
    }
  }

  /** Plays a clip, ignoring tracks that target bones this rig does not have. */
  playClip(clip: AnimationClip | null): void {
    this.action?.stop();
    this.action = undefined;
    if (!clip) return;
    const tracks = clip.tracks.filter((track) => {
      const boneName = track.name.slice(0, track.name.lastIndexOf('.'));
      return this.bones.has(boneName) || this.skeletonRoot.getObjectByName(boneName) !== undefined;
    });
    const usable =
      tracks.length === clip.tracks.length
        ? clip
        : new AnimationClip(clip.name, clip.duration, tracks);
    this.action = this.mixer.clipAction(usable);
    this.action.reset().play();
  }

  /** Moves the animation to a time and stops there. */
  freezeAt(seconds: number): void {
    if (!this.action) return;
    this.action.paused = false;
    this.action.time = seconds;
    this.mixer.update(0);
    this.action.paused = true;
  }

  resume(): void {
    if (this.action) this.action.paused = false;
  }

  /** Bounding box of the visible meshes in the rig's local space. */
  bounds(): Box3 {
    this.updateMatrixWorld(true);
    const box = new Box3();
    const point = new Vector3();
    for (const part of this.parts) {
      const geometry = part.mesh.geometry;
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        part.mesh.getVertexPosition(i, point);
        part.mesh.localToWorld(point);
        this.worldToLocal(point);
        box.expandByPoint(point);
      }
    }
    return box;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const part of this.parts) {
      part.mesh.geometry.dispose();
      part.material.dispose();
    }
    this.parts.length = 0;
    this.skeletonRoot.traverse((object) => {
      if (isSkinnedMesh(object)) {
        object.geometry.dispose();
        disposeMaterial(object.material);
      }
    });
    this.clear();
  }

  private attachSkinned(key: string, mesh: SkinnedMesh, replaceMaterial = true): void {
    if (replaceMaterial || !(mesh.material instanceof MeshLambertMaterial)) {
      this.attachMesh(key, mesh);
      return;
    }
    mesh.frustumCulled = false;
    this.parts.push({ key, mesh, material: mesh.material });
  }

  private attachMesh(key: string, mesh: Mesh): void {
    const material = new MeshLambertMaterial({ alphaTest: 0.5, side: DoubleSide });
    disposeMaterial(mesh.material);
    mesh.material = material;
    mesh.frustumCulled = false;
    this.parts.push({ key, mesh, material });
  }

  /** Builds a skeleton made of the body's bones in the order the mesh's own skeleton uses. */
  private rebind(source: Skeleton, key: string): Skeleton {
    const bones = source.bones.map((bone) => {
      const existing = this.bones.get(bone.name);
      if (existing) return existing;
      this.warnings.push({
        code: 'missing-bone',
        message: `${key}: bone "${bone.name}" is not in the body skeleton; it was added under its parent`,
      });
      const added = new Bone();
      added.name = bone.name;
      added.position.copy(bone.position);
      added.quaternion.copy(bone.quaternion);
      added.scale.copy(bone.scale);
      const parent =
        bone.parent && isBone(bone.parent) ? this.bones.get(bone.parent.name) : undefined;
      (parent ?? this.skeletonRoot).add(added);
      this.bones.set(bone.name, added);
      return added;
    });
    const inverses = source.boneInverses.map((m) => new Matrix4().copy(m));
    return new Skeleton(bones, inverses);
  }
}

function isBone(object: Object3D): object is Bone {
  return (object as Partial<Bone>).isBone === true;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Partial<Mesh>).isMesh === true;
}

function isSkinnedMesh(object: Object3D): object is SkinnedMesh {
  return (object as Partial<SkinnedMesh>).isSkinnedMesh === true;
}

function findSkinnedMesh(root: Object3D): SkinnedMesh | undefined {
  let found: SkinnedMesh | undefined;
  root.traverse((object) => {
    if (!found && isSkinnedMesh(object)) found = object;
  });
  return found;
}

function disposeMaterial(material: Material | Material[]): void {
  for (const m of Array.isArray(material) ? material : [material]) m.dispose();
}
