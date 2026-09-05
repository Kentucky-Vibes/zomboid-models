import {
  AnimationClip,
  AnimationMixer,
  Bone,
  Box3,
  FrontSide,
  Group,
  Matrix4,
  MeshLambertMaterial,
  Skeleton,
  Vector3,
  type AnimationAction,
  type Color,
  type Material,
  type Mesh,
  Object3D,
  type SkinnedMesh,
  type Texture,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

import type { AssetCache } from '../assets/AssetCache.js';
import type { Manifest, ManifestHeldItem } from '../format/manifest.js';

import { attachmentNode } from './attachments.js';

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
  /**
   * Every named node of the body skeleton. Nodes that no vertex is weighted to (the prop bones,
   * for example) load as plain objects rather than bones, but items still attach to them.
   */
  readonly bones = new Map<string, Object3D>();
  readonly mixer: AnimationMixer;
  readonly warnings: RigWarning[] = [];
  private readonly attachmentNodes = new Map<string, Object3D[]>();
  private readonly ownedTextures: Texture[] = [];
  private readonly childRigs: CharacterRig[] = [];
  private action: AnimationAction | undefined;
  private shadow: Object3D | undefined;
  /** Rebuilds the shadow for the current pose; installed by the builders, called after posing. */
  shadowUpdater: (() => void) | undefined;

  protected constructor(readonly skeletonRoot: Object3D) {
    super();
    this.name = 'character';
    this.add(skeletonRoot);
    this.mixer = new AnimationMixer(this);
    skeletonRoot.traverse((object) => {
      if (object.name.length > 0 && !isMesh(object)) this.bones.set(object.name, object);
    });
  }

  /** A rig with no skeleton, for static models such as items shown on their own. */
  static empty(): CharacterRig {
    return new CharacterRig(new Object3D());
  }

  /** Loads the body model whose skeleton every other part binds to. */
  static async load(
    cache: AssetCache,
    manifest: Pick<Manifest, 'models'>,
    modelKey: string,
  ): Promise<CharacterRig> {
    const model = manifest.models[modelKey];
    if (!model) {
      throw new Error(`manifest has no model "${modelKey}" for the body`);
    }
    const gltf = await cache.loadGltf(model.file);
    const scene = cloneSkeleton(gltf.scene);
    scene.updateMatrixWorld(true);
    const bodyMesh = findSkinnedMesh(scene);
    if (!bodyMesh) {
      throw new Error(`body model "${modelKey}" contains no skinned mesh`);
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
    manifest: Pick<Manifest, 'models'>,
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

  /**
   * Adds a held item under a prop bone the way the game does: the body's attachment for that
   * prop, then the item's own attachment of the same name, then the mesh scaled by its script.
   */
  addHeldModel(
    cache: AssetCache,
    manifest: Manifest,
    key: string,
    held: ManifestHeldItem,
    propName: string,
  ): Promise<void> {
    return this.addAttachedModel(cache, manifest, key, held, propName, propName);
  }

  /**
   * Adds an item's mesh under a bone through a named attachment: the body model's attachment of
   * that name gives the placement on the bone, the item's own attachment of the same name (when
   * it has one) adjusts it, and the mesh is scaled by its script.
   */
  async addAttachedModel(
    cache: AssetCache,
    manifest: Manifest,
    key: string,
    held: ManifestHeldItem,
    attachmentName: string,
    boneName: string,
  ): Promise<void> {
    const model = manifest.models[held.model];
    if (!model) {
      this.warnings.push({
        code: 'missing-model',
        message: `manifest has no model "${held.model}" for ${key}`,
      });
      return;
    }
    const bone = this.bones.get(boneName);
    if (!bone) {
      this.warnings.push({
        code: 'missing-bone',
        message: `${key}: bone "${boneName}" is not in the body skeleton`,
      });
      return;
    }
    const gltf = await cache.loadGltf(model.file);
    const scene = cloneSkeleton(gltf.scene);
    scene.updateMatrixWorld(true);
    const parentNode = attachmentNode(
      manifest.bodyAttachments[attachmentName],
      `${key}:${attachmentName}`,
    );
    const selfNode = attachmentNode(held.attachments[attachmentName], `${key}:self`);
    bone.add(parentNode);
    parentNode.add(selfNode);
    this.attachmentNodes.set(key, [...(this.attachmentNodes.get(key) ?? []), parentNode]);
    const meshes: Mesh[] = [];
    scene.traverse((object) => {
      if (isMesh(object) && !isSkinnedMesh(object)) meshes.push(object);
    });
    for (const mesh of meshes) {
      const local = mesh.matrixWorld.clone();
      mesh.removeFromParent();
      selfNode.add(mesh);
      local.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.scale.multiplyScalar(held.scale);
      this.attachMesh(key, mesh);
    }
  }

  /** Registers a texture the rig created, to be freed with the rig. */
  ownTexture(texture: Texture): void {
    this.ownedTextures.push(texture);
  }

  /**
   * Adds an object assembled elsewhere, such as a vehicle. Its meshes count for the bounds and
   * are freed with the rig, but they keep their own materials.
   */
  addObject(object: Object3D): void {
    this.skeletonRoot.add(object);
  }

  /** Replaces the shadow quad under the rig; `undefined` removes it. */
  setShadow(mesh: Object3D | undefined): void {
    if (this.shadow) {
      this.shadow.removeFromParent();
      if (isMesh(this.shadow)) {
        this.shadow.geometry.dispose();
        disposeMaterial(this.shadow.material);
      }
    }
    this.shadow = mesh;
    if (mesh) this.skeletonRoot.add(mesh);
  }

  /** Rebuilds the shadow of this rig and its children from their current poses. */
  refreshShadow(): void {
    this.shadowUpdater?.();
    for (const rig of this.childRigs) rig.refreshShadow();
  }

  /** Adds another rig as a child: it animates, freezes, and is freed with this one. */
  adoptRig(rig: CharacterRig): void {
    this.childRigs.push(rig);
    this.skeletonRoot.add(rig);
  }

  /** Whether this rig or any child plays a clip. */
  get animated(): boolean {
    return this.action !== undefined || this.childRigs.some((rig) => rig.animated);
  }

  /** Advances every clip of this rig and its children by the time in seconds. */
  update(delta: number): void {
    this.mixer.update(delta);
    for (const rig of this.childRigs) rig.update(delta);
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
    for (const node of this.attachmentNodes.get(key) ?? []) node.removeFromParent();
    this.attachmentNodes.delete(key);
  }

  /** Plays a clip, ignoring tracks that target bones this rig does not have. */
  /**
   * Plays a clip in a loop. `timeScale` is the speed multiplier and `startFraction` the point of
   * the clip to start from, both from the game's animation node when the clip is an idle.
   */
  playClip(
    clip: AnimationClip | null,
    options: { timeScale?: number; startFraction?: number } = {},
  ): void {
    this.action?.stop();
    this.action = undefined;
    if (!clip) return;
    const tracks = clip.tracks.filter((track) =>
      this.bones.has(track.name.slice(0, track.name.lastIndexOf('.'))),
    );
    const usable =
      tracks.length === clip.tracks.length
        ? clip
        : new AnimationClip(clip.name, clip.duration, tracks);
    this.action = this.mixer.clipAction(usable);
    this.action.reset();
    this.action.timeScale = options.timeScale ?? 1;
    this.action.time = (options.startFraction ?? 0) * usable.duration;
    this.action.play();
  }

  /** Moves the animation to a time and stops there, in this rig and its children. */
  freezeAt(seconds: number): void {
    for (const rig of this.childRigs) rig.freezeAt(seconds);
    if (!this.action) return;
    this.action.paused = false;
    this.action.time = seconds;
    this.mixer.update(0);
    this.action.paused = true;
  }

  resume(): void {
    for (const rig of this.childRigs) rig.resume();
    if (this.action) this.action.paused = false;
  }

  /** Bounding box of the visible meshes in the rig's local space. */
  bounds(): Box3 {
    this.updateMatrixWorld(true);
    const box = new Box3();
    const point = new Vector3();
    this.traverseVisible((object) => {
      if (!isMesh(object) || object.userData['excludeFromBounds'] === true) return;
      const position = object.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        object.getVertexPosition(i, point);
        object.localToWorld(point);
        this.worldToLocal(point);
        box.expandByPoint(point);
      }
    });
    return box;
  }

  dispose(): void {
    for (const rig of this.childRigs) rig.dispose();
    this.childRigs.length = 0;
    this.mixer.stopAllAction();
    for (const part of this.parts) {
      part.mesh.geometry.dispose();
      part.material.dispose();
    }
    this.parts.length = 0;
    for (const texture of this.ownedTextures) texture.dispose();
    this.ownedTextures.length = 0;
    this.skeletonRoot.traverse((object) => {
      if (isMesh(object)) {
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
    const material = new MeshLambertMaterial({ alphaTest: 0.5, side: FrontSide });
    disposeMaterial(mesh.material);
    mesh.material = material;
    mesh.frustumCulled = false;
    this.parts.push({ key, mesh, material });
  }

  /**
   * Builds a skeleton made of the body's nodes in the order the mesh's own skeleton uses. A
   * skeleton only reads world matrices, so plain nodes serve as bones too.
   */
  private rebind(source: Skeleton, key: string): Skeleton {
    const bones = source.bones.map((bone) => {
      const existing = this.bones.get(bone.name);
      if (existing) return existing as Bone;
      this.warnings.push({
        code: 'missing-bone',
        message: `${key}: bone "${bone.name}" is not in the body skeleton; it was added under its parent`,
      });
      const added = new Bone();
      added.name = bone.name;
      added.position.copy(bone.position);
      added.quaternion.copy(bone.quaternion);
      added.scale.copy(bone.scale);
      const parent = bone.parent ? this.bones.get(bone.parent.name) : undefined;
      (parent ?? this.skeletonRoot).add(added);
      this.bones.set(bone.name, added);
      return added;
    });
    const inverses = source.boneInverses.map((m) => new Matrix4().copy(m));
    return new Skeleton(bones, inverses);
  }
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
