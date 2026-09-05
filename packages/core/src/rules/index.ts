/**
 * The game's rules as the renderer applies them: how outfits are rolled from a seed, which clip
 * plays for a document, how a vehicle looks, how the light falls at an hour, what the catalog
 * files hold. These follow Build 42 and change with it in minor releases; the viewer and the
 * document formats in the package root are the part that stays put.
 */
export { autoClip, prepareCharacter, resolveSpeedVariable } from '../character/CharacterBuilder.js';
export type {
  AutoClip,
  PreparedCharacter,
  SpeedVariableValue,
} from '../character/CharacterBuilder.js';
export { autoAnimalClip, resolveAnimalLook } from '../animal/AnimalBuilder.js';
export type { AnimalLook } from '../animal/AnimalBuilder.js';
export { resolveItemLook } from '../item/ItemBuilder.js';
export type { ItemLook } from '../item/ItemBuilder.js';
export {
  placeVehicleModels,
  resolveVehicleLook,
  rollVehiclePaint,
} from '../vehicle/VehicleBuilder.js';
export type { PlacedVehicleModel, VehicleLook } from '../vehicle/VehicleBuilder.js';
export { vehicleShaderState } from '../vehicle/VehicleState.js';
export type { VehicleShaderState } from '../vehicle/VehicleState.js';
export { ZONE, ZONE_COLORS, zoneOfIndex1, zoneOfIndex2 } from '../vehicle/zones.js';
export type { ZoneValues } from '../vehicle/zones.js';
export { defaultVehicleLighting, scaledVehicleLighting } from '../vehicle/VehicleMaterial.js';
export type { VehicleLighting } from '../vehicle/VehicleMaterial.js';
export { lightbarSideAt } from '../vehicle/lightbar.js';
export type { LightbarLitSide, LightbarMode } from '../vehicle/lightbar.js';
export {
  LIGHTING_PRESETS,
  climateAt,
  dayHours,
  lightingLinear,
  resolveLighting,
  squareLight,
} from '../lighting/gameLight.js';
export type {
  Climate,
  DayHours,
  LightingOption,
  LightingPreset,
  LightingTime,
  Rgba,
  SceneLighting,
  Season,
} from '../lighting/gameLight.js';
export { GAME_MODEL_SCALE } from '../character/scale.js';
export { characterShadowParams } from '../character/shadow.js';
export type { ShadowParams } from '../character/shadow.js';
export { generateOutfit, randomBodyBlood, rollRotStage } from '../outfit/generate.js';
export type { GeneratedOutfit, OutfitGenerationOptions } from '../outfit/generate.js';
export { LocationRng, OutfitRng, hsbToRgb } from '../outfit/rng.js';
export { emptyCharacterCatalog } from '../format/emptyCatalog.js';
export * from '../format/manifest.js';
