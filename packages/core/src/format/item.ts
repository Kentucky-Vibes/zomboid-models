/**
 * The item description format: one inventory item shown on its own, as it lies on the ground
 * (its world model) or as it sits in a hand.
 */

export const ITEM_FORMAT = 'zomboid-models/item';
export const ITEM_FORMAT_VERSION = 1;

/** Which of the item's models to show. */
export type ItemModelKind = 'world' | 'held';

export interface ItemDescription {
  format: typeof ITEM_FORMAT;
  version: typeof ITEM_FORMAT_VERSION;
  /** Full item type, for example `Base.Axe`. */
  item: string;
  /** The model on the ground (`WorldStaticModel`) by default, else the held one when the item has no ground model. */
  model?: ItemModelKind;
  /** Blood on the item from 0 to 1, for weapons. */
  blood?: number;
  /** Free-form data for the producer of the document; the renderer ignores it. */
  meta?: Record<string, unknown>;
}

export type ItemValidationResult =
  { ok: true; value: ItemDescription } | { ok: false; errors: string[] };

/** Checks that a parsed JSON value is an item description and narrows its type. */
export function validateItemDescription(value: unknown): ItemValidationResult {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['$: must be an object'] };
  }
  const doc = value as Record<string, unknown>;
  if (doc['format'] !== ITEM_FORMAT) errors.push(`format: must be "${ITEM_FORMAT}"`);
  if (doc['version'] !== ITEM_FORMAT_VERSION)
    errors.push(`version: must be ${ITEM_FORMAT_VERSION}`);
  if (typeof doc['item'] !== 'string' || doc['item'].length === 0) {
    errors.push('item: must be a non-empty string');
  }
  const model = doc['model'];
  if (model !== undefined && model !== 'world' && model !== 'held') {
    errors.push('model: must be "world" or "held"');
  }
  const blood = doc['blood'];
  if (
    blood !== undefined &&
    (typeof blood !== 'number' || !Number.isFinite(blood) || blood < 0 || blood > 1)
  ) {
    errors.push('blood: must be a number between 0 and 1');
  }
  const meta = doc['meta'];
  if (meta !== undefined && (typeof meta !== 'object' || meta === null || Array.isArray(meta))) {
    errors.push('meta: must be an object');
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: doc as unknown as ItemDescription };
}
