/**
 * The game's outfit randomiser, ported call for call from `Outfit.Randomize`,
 * `ClothingItemReference.randomize`, `HumanVisual.dressInOutfit`, `HairOutfitDefinitions`,
 * `UnderwearDefinition`, `AttachedWeaponDefinitions`, and `IsoZombie.addRandomBloodDirtHolesEtc`.
 * Every draw from the outfit generator happens in the same order as in the game, so a seed
 * gives the same clothes, hair, colours, and extras. The parts the game takes from its global,
 * unseeded generator (blood amounts on clothes and weapons) come from a second stream derived
 * from the seed; they look right but are the one place a comparison with the game may differ.
 */

import type {
  AttachedItemDescription,
  BodyPart,
  CharacterCatalog,
  ManifestChance,
  ManifestClothingItem,
  ManifestOutfit,
  ManifestOutfitItem,
  PartAmounts,
  PartFlags,
  RgbColor,
  Sex,
  WornItemDescription,
} from '../format/index.js';
import { BODY_PARTS } from '../format/index.js';
import { OutfitRng } from './rng.js';

export interface OutfitGenerationOptions {
  catalog: CharacterCatalog;
  sex: Sex;
  /** Outfit name as in `clothing.xml`. */
  name: string;
  /** Seed of the game's outfit generator. */
  seed: number | bigint;
  /** World age in days; unlocks some hair styles and attached weapons. */
  worldAge?: number;
  /** Applies the zombie extras: underwear, attached weapon, wounds, bandages, rot, and skin. */
  zombie?: boolean;
  /** Skeleton zombies get no underwear, wounds, or rot roll. */
  skeleton?: boolean;
  /** Sandbox `NoBlackClothes`; the game's default is true. */
  noBlackClothes?: boolean;
  /** Sandbox `ZombieLore.ChanceOfAttachedWeapon`; the game's default is 6. */
  chanceOfAttachedWeapon?: number;
  /** Sandbox `ClothingDegradation` as the game's enum index; the default is 3. */
  clothingDegradation?: number;
}

export interface GeneratedOutfit {
  /** Worn items in the game's render order, ready for the character document. */
  worn: WornItemDescription[];
  /** Wound and bandage overlays the game adds to zombies, as hidden worn items. */
  bodyVisuals: WornItemDescription[];
  hair?: string;
  beard?: string;
  hairColor?: RgbColor;
  /** Zombie rot stage, rolled the way the game does when it first draws the skin. */
  rot?: 1 | 2 | 3;
  /** Skin index, rolled when the game first draws the skin. */
  skin?: number;
  attached: AttachedItemDescription[];
  /** Blood level of the attached weapon, when it has one. */
  attachedBlood?: number;
  /** Blood the zombie extras put on the body. */
  bodyBlood?: PartAmounts;
  warnings: string[];
}

interface ItemRandomData {
  active: boolean;
  hue: number;
  tint: RgbColor | undefined;
  baseTexture: string | undefined;
  textureChoice: string | undefined;
  decal: string | undefined;
  /** The picked reference, itself or one of its sub items. */
  picked: ItemRef | undefined;
}

interface ItemRef {
  clothingItem: string | undefined;
  probability: number;
  subItems: ItemRef[];
  random: ItemRandomData;
}

interface Visual {
  item: string;
  clothingItem: string;
  location: string;
  hue: number;
  tint: RgbColor | undefined;
  baseTexture: number;
  textureChoice: number;
  decal: string | undefined;
  blood: PartAmounts;
  dirt: PartAmounts;
  holes: PartFlags;
}

const WHITE: RgbColor = { r: 1, g: 1, b: 1 };
const f = Math.fround;

function isWhite(color: RgbColor | undefined): boolean {
  return color === undefined || (color.r >= 0.999 && color.g >= 0.999 && color.b >= 0.999);
}

function toItemRef(item: ManifestOutfitItem): ItemRef {
  return {
    clothingItem: item.clothingItem,
    probability: item.probability,
    subItems: item.subItems.map(toItemRef),
    random: {
      active: true,
      hue: 0,
      tint: WHITE,
      baseTexture: undefined,
      textureChoice: undefined,
      decal: undefined,
      picked: undefined,
    },
  };
}

/** The dressing state of one character while an outfit is generated. */
class Dresser {
  readonly rng: OutfitRng;
  /** Stream for the amounts the game draws from its global generator. */
  readonly side: OutfitRng;
  readonly visuals: Visual[] = [];
  readonly bodyVisuals: Visual[] = [];
  readonly warnings: string[] = [];
  private readonly catalog: CharacterCatalog;
  private readonly sex: Sex;
  private readonly noBlackClothes: boolean;
  private readonly worldAge: number;

  constructor(options: OutfitGenerationOptions) {
    this.catalog = options.catalog;
    this.sex = options.sex;
    this.noBlackClothes = options.noBlackClothes ?? true;
    this.worldAge = options.worldAge ?? 0;
    this.rng = new OutfitRng(options.seed);
    const seed = typeof options.seed === 'bigint' ? options.seed : BigInt(Math.trunc(options.seed));
    this.side = new OutfitRng(seed ^ SIDE_STREAM_SALT);
  }

  // --- ClothingItemReference ---------------------------------------------------------------

  clothingItemOf(ref: ItemRef): { name: string; item: ManifestClothingItem } | undefined {
    const name = ref.random.picked?.clothingItem ?? ref.clothingItem;
    if (name === undefined) return undefined;
    const item = this.catalog.clothingItems[name];
    return item === undefined ? undefined : { name, item };
  }

  /** `ClothingItemReference.randomize()`. */
  randomizeRef(ref: ItemRef): void {
    ref.random = {
      active: true,
      hue: 0,
      tint: WHITE,
      baseTexture: undefined,
      textureChoice: undefined,
      decal: undefined,
      picked: undefined,
    };
    for (const sub of ref.subItems) this.randomizeRef(sub);
    ref.random.picked = this.pickRandomItemInternal(ref);
    const clothing = this.clothingItemOf(ref);
    if (clothing === undefined) {
      ref.random.active = false;
      return;
    }
    this.randomizeValues(ref.random, clothing.item, ref.probability);
  }

  /** The draws `randomize()` makes for a resolved clothing item. */
  private randomizeValues(
    random: ItemRandomData,
    item: ManifestClothingItem,
    probability: number,
  ): void {
    random.active = this.rng.nextFloat(0, 1) <= f(probability);
    if (item.allowRandomHue) random.hue = f(f(this.rng.next(200) / 100) - 1);
    random.tint = item.allowRandomTint ? this.rng.randomColor(this.noBlackClothes) : WHITE;
    random.baseTexture = this.rng.pickRandom(item.baseTextures);
    random.textureChoice = this.rng.pickRandom(item.textures);
    if (item.decalGroup !== undefined && item.decalGroup.trim() !== '') {
      const decals = this.catalog.decalGroups[item.decalGroup] ?? [];
      random.decal = this.rng.pickRandom(decals);
    }
  }

  private pickRandomItemInternal(ref: ItemRef): ItemRef {
    if (ref.subItems.length === 0) return ref;
    const index = this.rng.next(ref.subItems.length + 1);
    if (index === 0) return ref;
    const sub = ref.subItems[index - 1] as ItemRef;
    return sub.random.picked ?? sub;
  }

  /** A fresh reference for a clothing item name, randomised like `new ClothingItemReference()`. */
  private freshRef(clothingItem: string): ItemRef {
    const ref = toItemRef({ clothingItem, probability: 1, subItems: [] });
    this.randomizeRef(ref);
    return ref;
  }

  // --- HumanVisual.addClothingItem --------------------------------------------------------------

  /** `ScriptManager.FindItem`: `Module.Name` exact, else `Base.Name`, else any module. */
  findItem(name: string): string | undefined {
    const wearables = this.catalog.wearables;
    if (name.includes('.')) return wearables[name] ? name : undefined;
    if (wearables[`Base.${name}`]) return `Base.${name}`;
    const suffix = `.${name}`;
    return Object.keys(wearables).find((type) => type.endsWith(suffix));
  }

  /**
   * `HumanVisual.addClothingItem(itemVisuals, locations, clothingName, itemRef)`: resolves the
   * item, rolls its values when no reference is given, and inserts it by body location.
   */
  addClothingItem(
    list: Visual[],
    clothingName: string,
    ref: ItemRef | undefined,
  ): Visual | undefined {
    if (ref !== undefined && !ref.random.active) return undefined;
    const key = clothingName.toLowerCase();
    const itemType = this.catalog.clothingItemToItem[key];
    if (itemType === undefined) {
      this.warnings.push(`outfit: no item uses clothing item "${clothingName}"`);
      return undefined;
    }
    const clothing = this.catalog.clothingItems[key];
    const wearable = this.catalog.wearables[itemType];
    if (clothing === undefined || wearable === undefined) return undefined;
    const locationId = wearable.bodyLocation;
    const location = this.catalog.bodyLocations[locationId];
    let reference = ref;
    if (reference === undefined) reference = this.freshRef(key);
    if (!reference.random.active) return undefined;
    if (location === undefined) {
      this.warnings.push(`outfit: unknown body location "${locationId}" for ${itemType}`);
      return undefined;
    }
    if (!location.multiItem) {
      const index = list.findIndex((visual) => visual.location === locationId);
      if (index !== -1) list.splice(index, 1);
    }
    for (let i = 0; i < list.length; i++) {
      const other = list[i] as Visual;
      if (
        location.exclusive.includes(other.location) ||
        (this.catalog.bodyLocations[other.location]?.exclusive.includes(locationId) ?? false)
      ) {
        list.splice(i, 1);
        i--;
      }
    }
    let insertAt = list.length;
    for (let i = 0; i < list.length; i++) {
      const other = this.catalog.bodyLocations[(list[i] as Visual).location];
      if (other !== undefined && other.order > location.order) {
        insertAt = i;
        break;
      }
    }
    const picked = this.clothingItemOf(reference);
    const visual: Visual = {
      item: itemType,
      clothingItem: picked?.name ?? key,
      location: locationId,
      hue: reference.random.hue,
      tint: reference.random.tint,
      baseTexture:
        reference.random.baseTexture === undefined
          ? -1
          : clothing.baseTextures.indexOf(reference.random.baseTexture),
      textureChoice:
        reference.random.textureChoice === undefined
          ? -1
          : clothing.textures.indexOf(reference.random.textureChoice),
      decal: reference.random.decal,
      blood: {},
      dirt: {},
      holes: {},
    };
    list.splice(insertAt, 0, visual);
    return visual;
  }

  /** `HumanVisual.addBodyVisualFromItemType`: wound and bandage overlays, one per clothing item. */
  addBodyVisualFromItemType(itemType: string): void {
    const wearable = this.catalog.wearables[itemType];
    if (wearable === undefined) return;
    if (this.bodyVisuals.some((visual) => visual.clothingItem === wearable.clothingItem)) return;
    const clothing = this.catalog.clothingItems[wearable.clothingItem];
    if (clothing === undefined) return;
    const ref = this.freshRef(wearable.clothingItem);
    this.bodyVisuals.push({
      item: itemType,
      clothingItem: wearable.clothingItem,
      location: wearable.bodyLocation,
      hue: ref.random.hue,
      tint: ref.random.tint,
      baseTexture:
        ref.random.baseTexture === undefined
          ? -1
          : clothing.baseTextures.indexOf(ref.random.baseTexture),
      textureChoice:
        ref.random.textureChoice === undefined
          ? -1
          : clothing.textures.indexOf(ref.random.textureChoice),
      decal: ref.random.decal,
      blood: {},
      dirt: {},
      holes: {},
    });
  }

  // --- HairOutfitDefinitions ------------------------------------------------------------------

  private isHaircutValid(outfit: string, haircut: string): boolean {
    if (outfit === '') return true;
    for (const def of this.catalog.hairDefinitions.restricted) {
      if (def.style === haircut) {
        if (!def.onlyFor.includes(outfit)) return false;
        if (this.worldAge < def.minWorldAge) return false;
      }
    }
    return true;
  }

  private validHairStyles(outfit: string, sex: Sex): string[] {
    const styles = this.catalog.hair[sex];
    return this.catalog.hairOrder[sex].filter((name) => {
      const style = styles[name];
      return style !== undefined && !style.noChoose && this.isHaircutValid(outfit, name);
    });
  }

  /** The chance-list resolution shared by the haircut pickers. */
  private fromChances(chances: ManifestChance[], fallback: string, valid: string[]): string {
    const choice = this.rng.nextFloat(0, 100);
    let subtotal = 0;
    for (const entry of chances) {
      subtotal = f(subtotal + f(entry.chance));
      if (choice < subtotal) {
        let picked = entry.value;
        if (picked.toLowerCase() === 'null') picked = '';
        if (picked.toLowerCase() === 'random') picked = this.rng.pickRandom(valid) ?? '';
        return picked;
      }
    }
    return fallback;
  }

  /** `getRandomMaleHaircut` and `getRandomFemaleHaircut`, which share their structure. */
  randomHaircut(outfit: string, sex: Sex): string {
    const valid = this.validHairStyles(outfit, sex);
    if (valid.length === 0) return '';
    let haircut = this.rng.pickRandom(valid) ?? '';
    for (const def of this.catalog.hairDefinitions.byOutfit) {
      if (def.outfit !== outfit) continue;
      const own = sex === 'female' ? def.femaleHaircut : def.maleHaircut;
      if (own !== undefined) {
        const choice = this.rng.nextFloat(0, 100);
        let subtotal = 0;
        for (const entry of own) {
          subtotal = f(subtotal + f(entry.chance));
          if (choice < subtotal) {
            haircut = entry.value;
            if (haircut.toLowerCase() === 'null') haircut = '';
            if (haircut.toLowerCase() === 'random') haircut = this.rng.pickRandom(valid) ?? '';
            return haircut;
          }
        }
        return haircut;
      }
      if (def.haircut !== undefined) {
        return this.fromChances(def.haircut, haircut, valid);
      }
    }
    return haircut;
  }

  /** `getRandomBeard`. */
  randomBeard(outfit: string): string {
    const list = this.catalog.beardOrder;
    let beard = this.rng.pickRandom(list) ?? '';
    for (const def of this.catalog.hairDefinitions.byOutfit) {
      if (def.outfit !== outfit || def.beard === undefined) continue;
      const choice = this.rng.nextFloat(0, 100);
      let subtotal = 0;
      for (const entry of def.beard) {
        subtotal = f(subtotal + f(entry.chance));
        if (choice < subtotal) {
          beard = entry.value;
          if (beard.toLowerCase() === 'null') beard = '';
          if (beard.toLowerCase() === 'random') beard = this.rng.pickRandom(list) ?? '';
          return beard;
        }
      }
      break;
    }
    return beard;
  }

  /** `getRandomHaircutColor`. */
  randomHairColor(outfit: string): RgbColor | undefined {
    const colors = this.catalog.hairDefinitions.colors;
    if (colors.length === 0) return undefined;
    let result = colors[this.rng.next(colors.length)];
    let text: string | undefined;
    for (const def of this.catalog.hairDefinitions.byOutfit) {
      if (def.outfit !== outfit || def.haircutColor === undefined) continue;
      const choice = this.rng.nextFloat(0, 100);
      let subtotal = 0;
      for (const entry of def.haircutColor) {
        subtotal = f(subtotal + f(entry.chance));
        if (choice < subtotal) {
          text = entry.value;
          if (text.toLowerCase() === 'random') {
            result = colors[this.rng.next(colors.length)];
            text = undefined;
          }
          break;
        }
      }
      break;
    }
    if (text !== undefined && text !== '') {
      const [r, g, b] = text.split(',').map((v) => Number(v));
      if ([r, g, b].every((c) => c !== undefined && Number.isFinite(c))) {
        const clamp = (c: number): number => Math.min(Math.max(f(c), 0), 1);
        return { r: clamp(r as number), g: clamp(g as number), b: clamp(b as number) };
      }
    }
    return result;
  }

  // --- Outfit.Randomize and dressInOutfit --------------------------------------------------------

  /** `Outfit.Randomize()`: the item rolls, then hair, colours, and the default-clothing flags. */
  randomizeOutfit(outfit: ManifestOutfit, refs: ItemRef[]): OutfitRandomData {
    for (const ref of refs) this.randomizeRef(ref);
    const hairColor = this.randomHairColor(outfit.name);
    const femaleHair = this.randomHaircut(outfit.name, 'female');
    const maleHair = this.randomHaircut(outfit.name, 'male');
    const beard = this.randomBeard(outfit.name);
    this.rng.randomColor(this.noBlackClothes);
    this.rng.randomColor(this.noBlackClothes);
    if (this.rng.next(4) === 0) this.rng.next(200);
    let hasTop = this.rng.next(16) !== 0;
    const hasTshirt = this.rng.next(2) === 0;
    const hasTshirtDecal = this.rng.next(4) === 0;
    if (outfit.top) hasTop = true;
    return { hairColor, femaleHair, maleHair, beard, hasTop, hasTshirt, hasTshirtDecal };
  }

  private torsoVisible(refs: ItemRef[]): boolean {
    for (const ref of refs) {
      if (!ref.random.active) continue;
      const clothing = this.clothingItemOf(ref);
      if (clothing?.item.masks.includes(TORSO_MASK_PART)) return false;
    }
    return true;
  }

  /** `HumanVisual.dressInOutfit`. */
  dressInOutfit(outfit: ManifestOutfit, refs: ItemRef[], random: OutfitRandomData): void {
    const defaults = this.catalog.defaultClothing;
    if (outfit.pants) {
      const name = outfit.allowPantsHue
        ? this.rng.pickRandom(defaults.pants.hue)
        : outfit.allowPantsTint
          ? this.rng.pickRandom(defaults.pants.tint)
          : this.rng.pickRandom(defaults.pants.texture);
      if (name !== undefined) this.addClothingItem(this.visuals, name, undefined);
    }
    if (outfit.top && random.hasTop) {
      let name: string | undefined;
      if (random.hasTshirt) {
        if (random.hasTshirtDecal && this.torsoVisible(refs) && outfit.allowTshirtDecal) {
          name = outfit.allowTopTint
            ? this.rng.pickRandom(defaults.tShirtDecal.tint)
            : this.rng.pickRandom(defaults.tShirtDecal.texture);
        } else {
          name = outfit.allowTopTint
            ? this.rng.pickRandom(defaults.tShirt.tint)
            : this.rng.pickRandom(defaults.tShirt.texture);
        }
      } else {
        name = outfit.allowTopTint
          ? this.rng.pickRandom(defaults.vest.tint)
          : this.rng.pickRandom(defaults.vest.texture);
      }
      if (name !== undefined) this.addClothingItem(this.visuals, name, undefined);
    }
    for (const ref of refs) {
      const clothing = this.clothingItemOf(ref);
      if (clothing === undefined) continue;
      const visual = this.addClothingItem(this.visuals, clothing.name, ref);
      if (visual === undefined) continue;
      for (const spawnWith of clothing.item.spawnWith ?? []) {
        const spawned = this.addClothingItem(this.visuals, spawnWith, undefined);
        if (spawned !== undefined) {
          spawned.hue = visual.hue;
          spawned.tint = visual.tint;
          spawned.baseTexture = visual.baseTexture;
          spawned.textureChoice = visual.textureChoice;
          spawned.decal = visual.decal;
        }
      }
    }
  }

  // --- UnderwearDefinition ----------------------------------------------------------------------

  /** `UnderwearDefinition.addRandomUnderwear`. */
  addRandomUnderwear(): void {
    const underwear = this.catalog.underwear;
    if (this.rng.next(100) > underwear.baseChance) return;
    const valid = underwear.definitions.filter((def) => def.female === (this.sex === 'female'));
    const totalChance = valid.reduce((sum, def) => sum + def.chanceToSpawn, 0);
    const choice = this.rng.next(totalChance);
    let subtotal = 0;
    const toDo = valid.find((def) => {
      subtotal += def.chanceToSpawn;
      return choice < subtotal;
    });
    if (toDo === undefined) return;
    const bottomType = this.findItem(toDo.bottom);
    const bottom = bottomType === undefined ? undefined : this.addClothingItemOfType(bottomType);
    if (toDo.top !== undefined) {
      const topTotal = toDo.top.reduce((sum, entry) => sum + Math.trunc(entry.chance), 0);
      const topChoice = this.rng.next(topTotal);
      let topSubtotal = 0;
      const top = toDo.top.find((entry) => {
        topSubtotal = Math.trunc(topSubtotal + entry.chance);
        return topChoice < topSubtotal;
      });
      if (top !== undefined) {
        const topType = this.findItem(top.value);
        if (topType !== undefined) {
          const topVisual = this.addClothingItemOfType(topType);
          if (this.rng.next(100) < 60 && topVisual !== undefined && bottom !== undefined) {
            topVisual.tint = bottom.tint;
          }
        }
      }
    }
  }

  /** `HumanVisual.addClothingItem(itemVisuals, scriptItem)`: by item type, with fresh rolls. */
  addClothingItemOfType(itemType: string): Visual | undefined {
    const wearable = this.catalog.wearables[itemType];
    if (wearable === undefined) return undefined;
    return this.addClothingItem(this.visuals, wearable.clothingItem, undefined);
  }

  // --- AttachedWeaponDefinitions ----------------------------------------------------------------

  /** `AttachedWeaponDefinitions.addRandomAttachedWeapon`. */
  addRandomAttachedWeapon(
    outfitName: string,
    chanceOfAttachedWeapon: number,
  ): { attached: AttachedItemDescription[]; blood?: number } {
    const result: { attached: AttachedItemDescription[]; blood?: number } = { attached: [] };
    const data = this.catalog.attachedWeapons;
    if (data.definitions.length === 0) return result;
    let definitions: CharacterCatalog['attachedWeapons']['definitions'] = [];
    let repeat = 1;
    let custom: CharacterCatalog['attachedWeapons']['byOutfit'][number] | undefined;
    for (const entry of data.byOutfit) {
      custom = entry;
      if (entry.outfit === outfitName && this.rng.next(100) < entry.chance) {
        definitions = [...entry.weapons];
        repeat = entry.maxItems > -1 ? entry.maxItems : 1;
        break;
      }
      custom = undefined;
    }
    if (definitions.length === 0) {
      if (this.rng.next(100) + 1 > chanceOfAttachedWeapon) return result;
      definitions = [...data.definitions];
    }
    while (repeat > 0) {
      const toDo = this.pickAttachedWeapon(definitions, outfitName);
      if (toDo === undefined) return result;
      definitions.splice(definitions.indexOf(toDo), 1);
      repeat--;
      const added = this.addAttachedWeapon(toDo);
      if (added !== undefined) {
        result.attached.push(added.item);
        if (added.blood !== undefined) result.blood = added.blood;
      }
      if (custom !== undefined && this.rng.next(100) >= custom.chance) return result;
    }
    return result;
  }

  private pickAttachedWeapon(
    definitions: CharacterCatalog['attachedWeapons']['definitions'],
    outfitName: string,
  ): CharacterCatalog['attachedWeapons']['definitions'][number] | undefined {
    const possibilities: typeof definitions = [];
    let totalChance = 0;
    for (const value of definitions) {
      if (value.daySurvived > 0) {
        if (this.worldAge > value.daySurvived) {
          totalChance += value.chance;
          possibilities.push(value);
        }
      } else if (value.outfit.length > 0) {
        if (value.outfit.includes(outfitName)) {
          totalChance += value.chance;
          possibilities.push(value);
        }
      } else {
        totalChance += value.chance;
        possibilities.push(value);
      }
    }
    const choice = this.rng.next(totalChance);
    let subtotal = 0;
    return possibilities.find((value) => {
      subtotal += value.chance;
      return choice < subtotal;
    });
  }

  private addAttachedWeapon(
    toDo: CharacterCatalog['attachedWeapons']['definitions'][number],
  ): { item: AttachedItemDescription; blood?: number } | undefined {
    const weaponType = this.rng.pickRandom(toDo.weapons);
    if (weaponType === undefined) return undefined;
    const held = this.catalog.heldItems[weaponType];
    if (held === undefined) {
      this.warnings.push(`outfit: attached weapon "${weaponType}" is not in the catalog`);
      return undefined;
    }
    const conditionMax = held.conditionMax ?? 10;
    this.rng.nextInt(Math.max(2, conditionMax - 5), conditionMax);
    const location = this.rng.pickRandom(toDo.weaponLocation);
    if (location === undefined) return undefined;
    if (toDo.ensureItem !== undefined) {
      const ensureType = this.findItem(toDo.ensureItem);
      if (ensureType !== undefined && !this.visuals.some((visual) => visual.item === ensureType)) {
        this.addClothingItemOfType(ensureType);
      }
    }
    let blood: number | undefined;
    if (toDo.bloodLocations.length > 0) {
      blood = Math.max(
        this.side.next(100) / 100,
        this.side.next(100) / 100,
        this.side.next(100) / 100,
      );
      for (const part of toDo.bloodLocations) {
        for (let i = 0; i < 3; i++) this.characterAddBlood(part, true, true, true);
        if (toDo.addHoles) this.characterAddHole(part, true);
      }
    }
    return { item: { location, item: weaponType }, ...(blood !== undefined ? { blood } : {}) };
  }

  // --- BloodClothingType and IsoGameCharacter -----------------------------------------------------

  readonly bodyBlood: PartAmounts = {};
  readonly bodyDirt: PartAmounts = {};
  clothingDegradation = 3;

  /** The blood or dirt intensity `BloodClothingType` rolls for the sandbox degradation setting. */
  private rollIntensity(): number {
    switch (this.clothingDegradation) {
      case 2:
        return this.rng.nextFloat(0.001, 0.01);
      case 3:
        return this.rng.nextFloat(0.05, 0.1);
      case 4:
        return this.rng.nextFloat(0.01, 0.05);
      default:
        return 0;
    }
  }

  /** Whether the item covers the part without a hole there (`coveredParts` and `getHole`). */
  private coversWithoutHole(visual: Visual, part: BodyPart): boolean {
    const wearable = this.catalog.wearables[visual.item];
    return (
      wearable !== undefined &&
      bloodLocationCovers(wearable.bloodLocation, part) &&
      visual.holes[part] !== true
    );
  }

  /** `BloodClothingType.addBlood(part, intensity, ...)`: the top layer, or every layer. */
  private clothingAddBlood(part: BodyPart, intensity: number, allLayers: boolean): void {
    if (!allLayers) {
      const hit = [...this.visuals]
        .reverse()
        .find((visual) => this.coversWithoutHole(visual, part));
      if (hit !== undefined) {
        if (intensity > 0) hit.blood[part] = f((hit.blood[part] ?? 0) + intensity);
      } else {
        this.bodyBlood[part] = f((this.bodyBlood[part] ?? 0) + 0.05);
      }
      return;
    }
    this.bodyBlood[part] = f((this.bodyBlood[part] ?? 0) + 0.05);
    let current = this.bodyBlood[part] ?? 0;
    if (this.rng.nextBool(Math.abs(Math.trunc(f(current * 100)) - 100))) return;
    for (const visual of this.visuals) {
      if (!this.coversWithoutHole(visual, part)) continue;
      if (intensity > 0) {
        visual.blood[part] = f((visual.blood[part] ?? 0) + intensity);
        current = visual.blood[part] ?? 0;
      }
      if (this.rng.nextBool(Math.abs(Math.trunc(f(current * 100)) - 100))) break;
    }
  }

  /** `BloodClothingType.addDirt(part, intensity, ...)`; its layer checks use the unseeded stream. */
  private clothingAddDirt(part: BodyPart, intensity: number, allLayers: boolean): void {
    if (!allLayers) {
      const hit = [...this.visuals]
        .reverse()
        .find((visual) => this.coversWithoutHole(visual, part));
      if (hit !== undefined) {
        if (intensity > 0) hit.dirt[part] = f((hit.dirt[part] ?? 0) + intensity);
      } else {
        this.bodyDirt[part] = f((this.bodyDirt[part] ?? 0) + 0.05);
      }
      return;
    }
    this.bodyDirt[part] = f((this.bodyDirt[part] ?? 0) + 0.05);
    let current = this.bodyDirt[part] ?? 0;
    if (this.side.nextBool(Math.abs(Math.trunc(f(current * 100)) - 100))) return;
    for (const visual of this.visuals) {
      if (!this.coversWithoutHole(visual, part)) continue;
      if (intensity > 0) {
        visual.dirt[part] = f((visual.dirt[part] ?? 0) + intensity);
        current = visual.dirt[part] ?? 0;
      }
      if (this.side.nextBool(Math.abs(Math.trunc(f(current * 100)) - 100))) break;
    }
  }

  /** `BloodClothingType.addHole`: a hole in the top covering layer, or in every layer. */
  private clothingAddHole(part: BodyPart, allLayers: boolean): void {
    for (let i = this.visuals.length - 1; i >= 0; i--) {
      const visual = this.visuals[i] as Visual;
      if (!this.coversWithoutHole(visual, part)) continue;
      if (this.catalog.wearables[visual.item]?.canHaveHoles !== false) visual.holes[part] = true;
      if (!allLayers) break;
    }
  }

  /** `BloodBodyPartType.FromIndex(OutfitRNG.Next(0, MAX))`. */
  private randomPart(): BodyPart {
    return BODY_PARTS[this.rng.nextInt(0, BODY_PARTS.length)] ?? 'Head';
  }

  /** `IsoGameCharacter.addBlood(part, scratched, bitten, allLayers)` for a zombie without a weapon. */
  characterAddBlood(
    part: BodyPart | undefined,
    scratched: boolean,
    bitten: boolean,
    allLayers: boolean,
  ): void {
    let count = 1;
    if (bitten) count = 20;
    if (scratched) count = 5;
    count += 8;
    for (let i = 0; i < count; i++) {
      const target = part ?? this.randomPart();
      this.clothingAddBlood(target, this.rollIntensity(), allLayers);
    }
  }

  /** `IsoGameCharacter.addLotsOfDirt`; the amounts come from the unseeded stream in the game. */
  characterAddLotsOfDirt(
    part: BodyPart | undefined,
    count: number | undefined,
    allLayers: boolean,
  ): void {
    const total = count ?? this.rng.nextInt(5, 10);
    for (let i = 0; i < total; i++) {
      const target = part ?? this.randomPart();
      this.clothingAddDirt(target, this.side.nextFloat(0.01, 1), allLayers);
    }
  }

  characterAddHole(part: BodyPart, allLayers: boolean): void {
    this.clothingAddHole(part, allLayers);
  }

  /** `IsoZombie.addRandomVisualDamages`. */
  addRandomVisualDamages(): void {
    for (let i = 0; i < 5; i++) {
      if (this.rng.next(5) === 0) {
        const name = this.rng.pickRandom(this.catalog.zombieDamageItems);
        if (name !== undefined) this.addBodyVisualFromItemType(`Base.${name}`);
      }
    }
  }

  /** `IsoZombie.addRandomVisualBandages`. */
  addRandomVisualBandages(): void {
    for (let i = 0; i < 5; i++) {
      if (this.rng.next(10) === 0) {
        const part = BODY_PARTS[this.rng.nextInt(0, BODY_PARTS.length)] as BodyPart;
        const bandage = this.catalog.bandageItems[part];
        if (bandage !== undefined) this.addBodyVisualFromItemType(`${bandage}_Blood`);
      }
    }
  }

  /** The clothing degradation block of `IsoZombie.addRandomBloodDirtHolesEtc`. */
  addWear(clothingDegradation: number): void {
    this.clothingDegradation = clothingDegradation;
    let factor = f(clothingDegradation);
    if (factor === 1) return;
    factor = f(f(factor - 1) / 2);
    factor = f(factor * factor);
    const allLayers = factor >= 1;
    this.characterAddBlood(undefined, false, true, false);
    const worldAgeMonths = Math.trunc(f(f(this.worldAge / 30) * factor));
    const dirtCount = Math.trunc(
      f((this.side.nextInt(5, 20) + Math.min(worldAgeMonths, 24)) * factor),
    );
    this.characterAddLotsOfDirt(undefined, dirtCount, allLayers);
    let rand = Math.max(8 - worldAgeMonths, 0);
    let rolls = Math.min(Math.max(worldAgeMonths, 5), 10) * Math.trunc(factor);
    for (let i = 0; i < rolls; i++) {
      if (this.rng.nextBool(rand)) this.characterAddBlood(undefined, false, true, false);
      if (this.rng.nextBool(Math.trunc(rand / 2))) {
        this.characterAddLotsOfDirt(undefined, undefined, allLayers);
      }
    }
    rolls = Math.min(Math.max(worldAgeMonths, 8), 16) * Math.trunc(factor);
    rand = Math.trunc(rand / 2);
    for (let i = 0; i < rolls; i++) {
      if (this.rng.nextBool(rand)) {
        const part = BODY_PARTS[this.rng.nextInt(0, BODY_PARTS.length)] as BodyPart;
        this.characterAddHole(part, allLayers);
        this.characterAddBlood(part, true, false, false);
      }
    }
    for (let i = 0; i < rolls; i++) {
      if (this.rng.nextBool(rand)) {
        const part = BODY_PARTS[this.rng.nextInt(0, BODY_PARTS.length)] as BodyPart;
        this.characterAddHole(part, allLayers);
        this.characterAddLotsOfDirt(part, 1, allLayers);
      }
    }
  }
}

interface OutfitRandomData {
  hairColor: RgbColor | undefined;
  femaleHair: string;
  maleHair: string;
  beard: string;
  hasTop: boolean;
  hasTshirt: boolean;
  hasTshirtDecal: boolean;
}

/** `CharacterMask.Part.Torso` as clothing XML masks index it. */
const TORSO_MASK_PART = 1;

/** Separates the stream for unseeded game draws from the outfit stream. */
const SIDE_STREAM_SALT = 0x5a17c0den;

/** Whether a blood location list from an item script covers a body part. */
export function bloodLocationCovers(bloodLocation: readonly string[], part: BodyPart): boolean {
  const covered = new Set<BodyPart>();
  for (const location of bloodLocation) {
    for (const mapped of BLOOD_LOCATION_PARTS[location] ?? []) covered.add(mapped);
  }
  return covered.has(part);
}

const SHIRT_NO_SLEEVES: BodyPart[] = ['Torso_Upper', 'Torso_Lower', 'Back'];
const SHIRT: BodyPart[] = [...SHIRT_NO_SLEEVES, 'UpperArm_L', 'UpperArm_R'];
const SHIRT_LONG_SLEEVES: BodyPart[] = [...SHIRT, 'ForeArm_L', 'ForeArm_R'];
const SHORTS_SHORT: BodyPart[] = ['Groin', 'UpperLeg_L', 'UpperLeg_R'];

/** The body parts each `BloodLocation` name from an item script stands for (`BloodClothingType`). */
const BLOOD_LOCATION_PARTS: Record<string, BodyPart[]> = {
  Apron: ['Torso_Upper', 'Torso_Lower', 'UpperLeg_L', 'UpperLeg_R'],
  ShirtNoSleeves: SHIRT_NO_SLEEVES,
  JumperNoSleeves: SHIRT_NO_SLEEVES,
  Shirt: SHIRT,
  ShirtLongSleeves: SHIRT_LONG_SLEEVES,
  Jumper: SHIRT_LONG_SLEEVES,
  Jacket: [...SHIRT_LONG_SLEEVES, 'Neck'],
  LongJacket: [...SHIRT_LONG_SLEEVES, 'Neck', 'Groin', 'UpperLeg_L', 'UpperLeg_R'],
  ShortsShort: SHORTS_SHORT,
  Trousers: [...SHORTS_SHORT, 'LowerLeg_L', 'LowerLeg_R'],
  Shoes: ['Foot_L', 'Foot_R'],
  FullHelmet: ['Head'],
  Bag: ['Back'],
  Hands: ['Hand_L', 'Hand_R'],
  Head: ['Head'],
  Neck: ['Neck'],
  UpperBody: ['Torso_Upper'],
  LowerBody: ['Torso_Lower'],
  LowerLegs: ['LowerLeg_L', 'LowerLeg_R'],
  UpperLegs: ['UpperLeg_L', 'UpperLeg_R'],
  LowerArms: ['ForeArm_L', 'ForeArm_R'],
  UpperArms: ['UpperArm_L', 'UpperArm_R'],
  Groin: ['Groin'],
  Hand_L: ['Hand_L'],
  Hand_R: ['Hand_R'],
  ForeArm_L: ['ForeArm_L'],
  ForeArm_R: ['ForeArm_R'],
  UpperArm_L: ['UpperArm_L'],
  UpperArm_R: ['UpperArm_R'],
  Torso_Upper: ['Torso_Upper'],
  Torso_Lower: ['Torso_Lower'],
  UpperLeg_L: ['UpperLeg_L'],
  UpperLeg_R: ['UpperLeg_R'],
  LowerLeg_L: ['LowerLeg_L'],
  LowerLeg_R: ['LowerLeg_R'],
  Foot_L: ['Foot_L'],
  Foot_R: ['Foot_R'],
  Back: ['Back'],
};

function toWorn(visual: Visual): WornItemDescription {
  const worn: WornItemDescription = { item: visual.item, clothingItem: visual.clothingItem };
  if (visual.textureChoice >= 0) worn.textureChoice = visual.textureChoice;
  if (visual.baseTexture >= 0) worn.baseTexture = visual.baseTexture;
  if (!isWhite(visual.tint) && visual.tint !== undefined) worn.tint = visual.tint;
  if (visual.hue !== 0) worn.hue = visual.hue;
  if (visual.decal !== undefined) worn.decal = visual.decal;
  if (Object.keys(visual.blood).length > 0) worn.blood = visual.blood;
  if (Object.keys(visual.dirt).length > 0) worn.dirt = visual.dirt;
  if (Object.keys(visual.holes).length > 0) worn.holes = visual.holes;
  return worn;
}

/**
 * Dresses a character in a named outfit with the game's randomiser. Follows
 * `PersistentOutfits.applyOutfit` for zombies (underwear, outfit, hair, skin, attached weapon,
 * wounds and bandages, wear) and `HumanVisual.dressInNamedOutfit` for players.
 */
export function generateOutfit(options: OutfitGenerationOptions): GeneratedOutfit {
  const { catalog, sex, name } = options;
  const outfit = catalog.outfits[sex][name];
  const dresser = new Dresser(options);
  if (outfit === undefined) {
    return {
      worn: [],
      bodyVisuals: [],
      attached: [],
      warnings: [`outfit "${name}" is not defined for ${sex} characters`],
    };
  }
  const zombie = options.zombie ?? false;
  const skeleton = options.skeleton ?? false;

  if (zombie && !skeleton) dresser.addRandomUnderwear();

  const refs = outfit.items.map(toItemRef);
  const random = dresser.randomizeOutfit(outfit, refs);
  dresser.dressInOutfit(outfit, refs, random);

  const result: GeneratedOutfit = {
    worn: [],
    bodyVisuals: [],
    attached: [],
    warnings: dresser.warnings,
  };
  const hair = sex === 'female' ? random.femaleHair : random.maleHair;
  if (hair !== '') result.hair = hair;
  if (sex === 'male' && random.beard !== '') result.beard = random.beard;
  if (random.hairColor !== undefined) result.hairColor = random.hairColor;

  // HumanVisual.synchWithOutfit ends with getSkinTexture(), which rolls the rot stage and skin.
  if (zombie && !skeleton) {
    result.rot = rollRotStage(dresser.rng, options.worldAge ?? 0);
  }
  const skins = zombie
    ? skeleton
      ? (catalog.skeletons?.[sex].skins ?? [])
      : (catalog.zombieSkins?.[sex][(result.rot ?? 1) - 1] ?? [])
    : catalog.bodies[sex].skins;
  if (skins.length > 0) result.skin = dresser.rng.next(skins.length);

  if (zombie) {
    const weapon = dresser.addRandomAttachedWeapon(name, options.chanceOfAttachedWeapon ?? 6);
    result.attached = weapon.attached;
    if (weapon.blood !== undefined) result.attachedBlood = weapon.blood;
    if (!skeleton) {
      dresser.addRandomVisualDamages();
      dresser.addRandomVisualBandages();
    }
    dresser.addWear(options.clothingDegradation ?? 3);
    if (Object.keys(dresser.bodyBlood).length > 0) result.bodyBlood = dresser.bodyBlood;
  }

  result.worn = dresser.visuals.map(toWorn);
  result.bodyVisuals = dresser.bodyVisuals.map(toWorn);
  return result;
}

/** `HumanVisual.pickRandomZombieRotStage`. */
export function rollRotStage(rng: OutfitRng, worldAgeDays: number): 1 | 2 | 3 {
  const days = Math.max(Math.trunc(worldAgeDays), 0);
  let stage1Second = 20;
  let stage2Second = 30;
  if (days >= 180) {
    stage1Second = 0;
    stage2Second = 10;
  }
  const delta = Math.min(Math.max(f(f(days - 20) / 70), 0), 1);
  const lerp = (a: number, b: number, t: number): number => f(a + f(f(b - a) * t));
  const chanceStage1 = lerp(100, stage1Second, delta);
  const chanceStage2 = lerp(10, stage2Second, delta);
  const roll = rng.next(100);
  if (roll < chanceStage1) return 1;
  return roll < f(chanceStage2 + chanceStage1) ? 2 : 3;
}

/** Per-part random blood the game gives every zombie on creation (`HumanVisual.randomBlood`). */
export function randomBodyBlood(seed: number | bigint): PartAmounts {
  const rng = new OutfitRng(seed);
  const blood: PartAmounts = {};
  for (const part of BODY_PARTS) blood[part] = rng.nextFloat(0, 1);
  return blood;
}
