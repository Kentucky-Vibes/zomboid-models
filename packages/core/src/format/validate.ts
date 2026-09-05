import {
  BODY_PARTS,
  CHARACTER_FORMAT,
  CHARACTER_FORMAT_VERSION,
  STANCES,
  type BodyPart,
  type CharacterDescription,
  CHARACTER_ACTIONS,
} from './types.js';

export type CharacterValidationResult =
  { ok: true; value: CharacterDescription } | { ok: false; errors: string[] };

type Json = Record<string, unknown>;

const PATCH_TYPES = new Set(['basic', 'denim', 'leather']);
const BANDAGE_STATES = new Set(['clean', 'dirty']);
const DAMAGE_FLAGS = [
  'bitten',
  'scratched',
  'cut',
  'deepWound',
  'bulletWound',
  'burnt',
  'stitched',
  'splint',
  'bleeding',
];
const BODY_PART_SET: ReadonlySet<string> = new Set(BODY_PARTS);
const STANCE_SET: ReadonlySet<string> = new Set(STANCES);
const ACTION_SET: ReadonlySet<string> = new Set(CHARACTER_ACTIONS);
const SKELETON_KINDS = new Set(['burned', 'plain', 'muscle']);

class Checker {
  readonly errors: string[] = [];

  fail(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`);
  }

  record(value: unknown, path: string): Json | undefined {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Json;
    }
    this.fail(path, 'must be an object');
    return undefined;
  }

  optionalRecord(value: unknown, path: string): Json | undefined {
    return value === undefined ? undefined : this.record(value, path);
  }

  string(value: unknown, path: string): void {
    if (typeof value !== 'string' || value.length === 0) {
      this.fail(path, 'must be a non-empty string');
    }
  }

  optionalString(value: unknown, path: string): void {
    if (value !== undefined) this.string(value, path);
  }

  optionalBoolean(value: unknown, path: string): void {
    if (value !== undefined && typeof value !== 'boolean') {
      this.fail(path, 'must be a boolean');
    }
  }

  optionalInteger(value: unknown, path: string): void {
    if (value !== undefined && !Number.isInteger(value)) {
      this.fail(path, 'must be an integer');
    }
  }

  optionalNumber(value: unknown, path: string): void {
    if (value !== undefined && !Number.isFinite(value)) {
      this.fail(path, 'must be a finite number');
    }
  }

  unit(value: unknown, path: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      this.fail(path, 'must be a number between 0 and 1');
    }
  }

  optionalUnit(value: unknown, path: string): void {
    if (value !== undefined) this.unit(value, path);
  }

  optionalColor(value: unknown, path: string): void {
    const color = this.optionalRecord(value, path);
    if (!color) return;
    for (const channel of ['r', 'g', 'b']) {
      this.unit(color[channel], `${path}.${channel}`);
    }
  }

  partKeys(value: unknown, path: string, check: (entry: unknown, entryPath: string) => void): void {
    const map = this.optionalRecord(value, path);
    if (!map) return;
    for (const [part, entry] of Object.entries(map)) {
      if (!BODY_PART_SET.has(part)) {
        this.fail(`${path}.${part}`, 'is not a body part name');
        continue;
      }
      check(entry, `${path}.${part}`);
    }
  }

  partAmounts(value: unknown, path: string): void {
    this.partKeys(value, path, (entry, entryPath) => this.unit(entry, entryPath));
  }

  partFlags(value: unknown, path: string): void {
    this.partKeys(value, path, (entry, entryPath) => {
      if (typeof entry !== 'boolean') this.fail(entryPath, 'must be a boolean');
    });
  }

  partPatches(value: unknown, path: string): void {
    this.partKeys(value, path, (entry, entryPath) => {
      if (typeof entry !== 'string' || !PATCH_TYPES.has(entry)) {
        this.fail(entryPath, 'must be one of basic, denim, leather');
      }
    });
  }

  optionalArray(
    value: unknown,
    path: string,
    check: (entry: unknown, entryPath: string) => void,
  ): void {
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      this.fail(path, 'must be an array');
      return;
    }
    value.forEach((entry, index) => check(entry, `${path}[${index}]`));
  }
}

function checkBody(c: Checker, value: unknown): void {
  const body = c.record(value, 'body');
  if (!body) return;
  if (body['sex'] !== 'male' && body['sex'] !== 'female') {
    c.fail('body.sex', 'must be "male" or "female"');
  }
  c.optionalInteger(body['skin'], 'body.skin');
  c.optionalString(body['skinTexture'], 'body.skinTexture');
  c.optionalBoolean(body['bodyHair'], 'body.bodyHair');
  c.optionalString(body['hair'], 'body.hair');
  c.optionalString(body['beard'], 'body.beard');
  c.optionalColor(body['hairColor'], 'body.hairColor');
  c.optionalColor(body['beardColor'], 'body.beardColor');
  c.partAmounts(body['blood'], 'body.blood');
  c.partAmounts(body['dirt'], 'body.dirt');
  const zombie = c.optionalRecord(body['zombie'], 'body.zombie');
  if (zombie) {
    const rot = zombie['rot'];
    if (rot !== undefined && rot !== 1 && rot !== 2 && rot !== 3) {
      c.fail('body.zombie.rot', 'must be 1, 2, or 3');
    }
    const skeleton = zombie['skeleton'];
    if (skeleton !== undefined && (typeof skeleton !== 'string' || !SKELETON_KINDS.has(skeleton))) {
      c.fail('body.zombie.skeleton', 'must be one of burned, plain, muscle');
    }
    c.optionalInteger(zombie['seed'], 'body.zombie.seed');
  }
}

function checkWornItem(c: Checker, value: unknown, path: string): void {
  const item = c.record(value, path);
  if (!item) return;
  c.string(item['item'], `${path}.item`);
  c.optionalString(item['clothingItem'], `${path}.clothingItem`);
  c.optionalString(item['alternateModel'], `${path}.alternateModel`);
  c.optionalInteger(item['textureChoice'], `${path}.textureChoice`);
  c.optionalInteger(item['baseTexture'], `${path}.baseTexture`);
  c.optionalColor(item['tint'], `${path}.tint`);
  c.optionalNumber(item['hue'], `${path}.hue`);
  c.optionalString(item['decal'], `${path}.decal`);
  c.partAmounts(item['blood'], `${path}.blood`);
  c.partAmounts(item['dirt'], `${path}.dirt`);
  c.partFlags(item['holes'], `${path}.holes`);
  c.partPatches(item['patches'], `${path}.patches`);
}

function checkHeldItem(c: Checker, value: unknown, path: string): void {
  if (value === undefined) return;
  const item = c.record(value, path);
  if (!item) return;
  c.string(item['item'], `${path}.item`);
  c.optionalUnit(item['blood'], `${path}.blood`);
}

function checkAttachedItem(c: Checker, value: unknown, path: string): void {
  const item = c.record(value, path);
  if (!item) return;
  c.string(item['location'], `${path}.location`);
  c.string(item['item'], `${path}.item`);
}

function checkDamage(c: Checker, value: unknown): void {
  c.partKeys(value, 'damage', (entry, path) => {
    const damage = c.record(entry, path);
    if (!damage) return;
    const bandage = damage['bandage'];
    if (bandage !== undefined && (typeof bandage !== 'string' || !BANDAGE_STATES.has(bandage))) {
      c.fail(`${path}.bandage`, 'must be "clean" or "dirty"');
    }
    for (const flag of DAMAGE_FLAGS) {
      c.optionalBoolean(damage[flag], `${path}.${flag}`);
    }
  });
}

function checkOutfit(c: Checker, value: unknown): void {
  const outfit = c.optionalRecord(value, 'outfit');
  if (!outfit) return;
  c.string(outfit['name'], 'outfit.name');
  c.optionalInteger(outfit['seed'], 'outfit.seed');
  c.optionalNumber(outfit['worldAge'], 'outfit.worldAge');
}

function checkStance(c: Checker, value: unknown): void {
  if (value !== undefined && (typeof value !== 'string' || !STANCE_SET.has(value))) {
    c.fail('stance', `must be one of ${STANCES.join(', ')}`);
  }
}

function checkAction(c: Checker, value: unknown): void {
  if (value !== undefined && (typeof value !== 'string' || !ACTION_SET.has(value))) {
    c.fail('action', `must be one of ${CHARACTER_ACTIONS.join(', ')}`);
  }
}

/** Checks that a parsed JSON value is a character description and narrows its type. */
export function validateCharacterDescription(value: unknown): CharacterValidationResult {
  const c = new Checker();
  const doc = c.record(value, '$');
  if (!doc) {
    return { ok: false, errors: c.errors };
  }
  if (doc['format'] !== CHARACTER_FORMAT) {
    c.fail('format', `must be "${CHARACTER_FORMAT}"`);
  }
  if (doc['version'] !== CHARACTER_FORMAT_VERSION) {
    c.fail('version', `must be ${CHARACTER_FORMAT_VERSION}`);
  }
  checkBody(c, doc['body']);
  c.optionalArray(doc['worn'], 'worn', (entry, path) => checkWornItem(c, entry, path));
  checkOutfit(c, doc['outfit']);
  checkStance(c, doc['stance']);
  checkAction(c, doc['action']);
  const held = c.optionalRecord(doc['held'], 'held');
  if (held) {
    checkHeldItem(c, held['primary'], 'held.primary');
    checkHeldItem(c, held['secondary'], 'held.secondary');
  }
  c.optionalArray(doc['attached'], 'attached', (entry, path) => checkAttachedItem(c, entry, path));
  checkDamage(c, doc['damage']);
  c.optionalRecord(doc['meta'], 'meta');

  if (c.errors.length > 0) {
    return { ok: false, errors: c.errors };
  }
  return { ok: true, value: doc as unknown as CharacterDescription };
}

export function isBodyPart(value: string): value is BodyPart {
  return BODY_PART_SET.has(value);
}
