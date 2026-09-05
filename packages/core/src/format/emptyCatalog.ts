import type { CharacterCatalog } from './manifest.js';

/**
 * A character catalog with nothing in it, for tests and for code that fills a catalog by hand.
 * Every record is empty and the idle clip is the game's default name.
 */
export function emptyCharacterCatalog(): CharacterCatalog {
  return {
    bodies: {
      male: { model: 'skinned/malebody', skins: [], bodyHair: false },
      female: { model: 'skinned/femalebody', skins: [], bodyHair: false },
    },
    bodyAttachments: {},
    models: {},
    textures: {},
    animations: {},
    idle: { default: { clip: 'Bob_Idle', speed: 1 }, byWeaponType: {} },
    stances: { player: {}, zombie: {} },
    clothingItems: {},
    wearables: {},
    clothingItemToItem: {},
    heldItems: {},
    bodyLocations: {},
    attachedLocations: {},
    hair: { male: {}, female: {} },
    hairOrder: { male: [], female: [] },
    beards: { '': { texture: 'f_hair_white' } },
    beardOrder: [''],
    bloodMasks: {},
    decals: {},
    decalGroups: {},
    outfits: { male: {}, female: {} },
    hairDefinitions: { restricted: [], byOutfit: [], colors: [] },
    defaultClothing: {
      pants: { hue: [], texture: [], tint: [] },
      tShirt: { texture: [], tint: [] },
      tShirtDecal: { texture: [], tint: [] },
      vest: { texture: [], tint: [] },
    },
    underwear: { baseChance: 50, definitions: [] },
    attachedWeapons: { definitions: [], byOutfit: [] },
    zombieDamageItems: [],
    bandageItems: {},
  };
}
