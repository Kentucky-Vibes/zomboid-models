/**
 * Builds a scene: every subject built the way it is built on its own, then placed on one
 * ground plane at the game's relative sizes, characters seated in vehicles where asked.
 */
import { type Box3, CircleGeometry, Color, Mesh, MeshBasicMaterial, Vector3 } from 'three';

import { autoAnimalClip, buildAnimal } from '../animal/AnimalBuilder.js';
import type { AssetCache } from '../assets/AssetCache.js';
import { autoClip, buildCharacter, loadClip } from '../character/CharacterBuilder.js';
import { CharacterRig, type RigWarning } from '../character/CharacterRig.js';
import { ANIMAL_FORMAT } from '../format/animal.js';
import { ITEM_FORMAT } from '../format/item.js';
import type { ManifestVehicle, ScriptVector } from '../format/manifest.js';
import type { SceneDescription, SceneSubject } from '../format/scene.js';
import { VEHICLE_FORMAT } from '../format/vehicle.js';
import { buildItem } from '../item/ItemBuilder.js';
import type { TextureComposer } from '../texture/TextureComposer.js';
import { buildVehicle } from '../vehicle/VehicleBuilder.js';

/**
 * The game draws character, animal, and item models 1.5 times their file units in the world
 * (`Model.CharacterModelCameraBegin`, `WorldItemAtlas`), while a vehicle's own script scale
 * already gives world units. Scenes apply this so that a survivor stands as tall next to a car
 * as in the game.
 */
export const GAME_MODEL_SCALE = 1.5;

/** Space left between subjects that the scene lines up on its own. */
const ROW_GAP = 0.4;

export interface SceneBuildContext {
  cache: AssetCache;
  composer?: TextureComposer;
}

export interface BuiltScene {
  rig: CharacterRig;
  warnings: RigWarning[];
}

interface PlacedSubject {
  subject: SceneSubject;
  rig: CharacterRig;
  /** Bounds in the subject's own units before the game scale. */
  box: Box3;
  scale: number;
  /** Extra turn so that yaw 0 faces the camera for every kind. */
  facing: number;
  vehicle: ManifestVehicle | undefined;
}

const RAD = Math.PI / 180;

async function buildOne(
  context: SceneBuildContext,
  subject: SceneSubject,
  warnings: RigWarning[],
): Promise<PlacedSubject> {
  const { cache } = context;
  const document = subject.document;
  const speedOf = (speed: number): { timeScale: number; startFraction: number } => ({
    timeScale: speed,
    startFraction: 0,
  });
  let rig: CharacterRig;
  let scale = GAME_MODEL_SCALE;
  let facing = 0;
  let vehicle: ManifestVehicle | undefined;
  if (document.format === VEHICLE_FORMAT) {
    const catalog = await cache.loadVehicleCatalog();
    const built = await buildVehicle({ cache, catalog }, document);
    rig = built.rig;
    scale = 1;
    facing = Math.PI;
    vehicle = catalog.vehicles[document.vehicle];
  } else if (document.format === ANIMAL_FORMAT) {
    const catalog = await cache.loadAnimalCatalog();
    const built = await buildAnimal(
      { cache, catalog, ...(context.composer ? { composer: context.composer } : {}) },
      document,
    );
    rig = built.rig;
    const auto = subject.animation === undefined ? autoAnimalClip(catalog, document) : undefined;
    const name = subject.animation === undefined ? (auto?.clip ?? null) : subject.animation;
    const clip = name === null ? null : await loadClip(cache, catalog, name, rig.warnings);
    rig.playClip(clip, speedOf(auto?.speed ?? 1));
  } else if (document.format === ITEM_FORMAT) {
    const catalog = await cache.loadItemCatalog();
    rig = (await buildItem({ cache, catalog }, document)).rig;
  } else {
    const catalog = await cache.loadCharacterCatalog();
    const built = await buildCharacter(
      { cache, manifest: catalog, ...(context.composer ? { composer: context.composer } : {}) },
      document,
    );
    rig = built.rig;
    const seated = subject.seat !== undefined;
    let name: string | null;
    let options = speedOf(1);
    if (subject.animation !== undefined) {
      name = subject.animation;
    } else if (seated && catalog.vehicleIdle) {
      name = catalog.vehicleIdle.clip;
      options = speedOf(catalog.vehicleIdle.speed);
    } else {
      const auto = autoClip(catalog, document);
      name = auto.clip;
      options = { timeScale: auto.timeScale, startFraction: auto.startFraction };
    }
    const clip = name === null ? null : await loadClip(cache, catalog, name, rig.warnings);
    rig.playClip(clip, options);
  }
  warnings.push(...rig.warnings);
  rig.update(0);
  rig.updateMatrixWorld(true);
  return { subject, rig, box: rig.bounds(), scale, facing, vehicle };
}

/** The seat's point in the vehicle rig's space, as `BaseVehicle.getPassengerLocalPos` gives it. */
function seatPoint(vehicle: ManifestVehicle, seat: string): Vector3 | undefined {
  const offset = vehicle.seats?.[seat];
  const body = vehicle.models[0];
  if (!offset || !body) return undefined;
  const scale = vehicle.modelScale;
  const local: ScriptVector = [
    -(body.offset[0] + offset[0]) * scale,
    (body.offset[1] + offset[1]) * scale,
    -(body.offset[2] + offset[2]) * scale,
  ];
  return new Vector3(...local);
}

/** Builds the scene's rig: subjects placed on the ground, seated characters inside vehicles. */
export async function buildScene(
  context: SceneBuildContext,
  description: SceneDescription,
): Promise<BuiltScene> {
  const warnings: RigWarning[] = [];
  const placed: PlacedSubject[] = [];
  for (const subject of description.subjects)
    placed.push(await buildOne(context, subject, warnings));

  const scene = CharacterRig.empty();
  const standing = placed.filter((p) => p.subject.seat === undefined);
  // Subjects without a position line up in a row, centred, left to right in document order.
  const footprint = (p: PlacedSubject): number => {
    const size = p.box.getSize(new Vector3()).multiplyScalar(p.scale);
    return Math.max(size.x, size.z, 0.2);
  };
  const unplaced = standing.filter((p) => p.subject.position === undefined);
  const rowWidth =
    unplaced.reduce((sum, p) => sum + footprint(p), 0) + ROW_GAP * Math.max(unplaced.length - 1, 0);
  let cursor = -rowWidth / 2;
  for (const p of standing) {
    let position = p.subject.position;
    if (position === undefined) {
      const width = footprint(p);
      position = [cursor + width / 2, 0];
      cursor += width + ROW_GAP;
    }
    const center = p.box.getCenter(new Vector3());
    // Feet on the ground and the subject's own centre on its position, like the single viewer.
    p.rig.position.set(-center.x * p.scale, -p.box.min.y * p.scale, -center.z * p.scale);
    const holder = p.rig;
    holder.scale.setScalar(p.scale);
    // Turn around the subject's centre: rotate the offset along with the mesh.
    const yaw = (p.subject.yaw ?? 0) * RAD + p.facing;
    holder.position.applyAxisAngle(new Vector3(0, 1, 0), yaw);
    holder.rotation.set(0, yaw, 0);
    holder.position.x += position[0];
    holder.position.z += position[1];
    scene.adoptRig(holder);
  }

  for (const p of placed) {
    if (p.subject.seat === undefined) continue;
    const host = placed[p.subject.in ?? -1];
    const seat = host?.vehicle ? seatPoint(host.vehicle, p.subject.seat) : undefined;
    if (!host || !seat) {
      warnings.push({
        code: 'missing-item',
        message: `subject ${placed.indexOf(p)}: no seat "${p.subject.seat}" in subject ${p.subject.in ?? '?'}`,
      });
      p.rig.dispose();
      continue;
    }
    p.rig.position.copy(seat);
    p.rig.scale.setScalar(p.scale);
    // Facing the vehicle's front, which lies along -Z in the vehicle rig's space.
    p.rig.rotation.set(0, Math.PI, 0);
    host.rig.adoptRig(p.rig);
  }

  if (description.ground !== undefined) {
    scene.updateMatrixWorld(true);
    const box = scene.bounds();
    const radius = box.isEmpty()
      ? 2
      : Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z) * 1.3 + 0.5;
    const ground = new Mesh(
      new CircleGeometry(radius, 64),
      new MeshBasicMaterial({ color: new Color(description.ground) }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.002;
    ground.name = 'ground';
    // The ground is as wide as the camera needs, not what the camera should frame.
    ground.userData['excludeFromBounds'] = true;
    scene.addObject(ground);
  }
  return { rig: scene, warnings };
}
