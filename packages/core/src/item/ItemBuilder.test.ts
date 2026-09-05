import { describe, expect, it } from 'vitest';

import { validateItemDescription, type ItemDescription } from '../format/item.js';
import type { ItemCatalog } from '../format/manifest.js';
import { resolveItemLook } from './ItemBuilder.js';

function catalog(): ItemCatalog {
  return {
    models: {},
    textures: {},
    items: {
      'Base.Axe': {
        displayName: 'Axe',
        world: { model: 'worlditems/axe', texture: 'worlditems/axe', scale: 0.4, attachments: {} },
        held: {
          model: 'weapons/2handed/axe',
          texture: 'weapons/2handed/axe',
          scale: 1,
          attachments: {},
        },
      },
      'Base.Pillow': {
        world: { model: 'worlditems/pillow', scale: 0.3, attachments: {} },
      },
      'Base.Hammer': {
        held: { model: 'weapons/1handed/hammer', scale: 1, attachments: {} },
      },
    },
  };
}

function item(overrides: Partial<ItemDescription> = {}): ItemDescription {
  return { format: 'zomboid-models/item', version: 1, item: 'Base.Axe', ...overrides };
}

describe('resolveItemLook', () => {
  it('prefers the ground model and honours an explicit choice', () => {
    expect(resolveItemLook(catalog(), item())).toMatchObject({ kind: 'world', warnings: [] });
    expect(resolveItemLook(catalog(), item({ model: 'held' }))).toMatchObject({
      kind: 'held',
      model: { model: 'weapons/2handed/axe' },
    });
  });

  it('falls back to the other model and says so only when one was asked for', () => {
    const hammer = resolveItemLook(catalog(), item({ item: 'Base.Hammer' }));
    expect(hammer.kind).toBe('held');
    expect(hammer.warnings).toEqual([]);
    const pillow = resolveItemLook(catalog(), item({ item: 'Base.Pillow', model: 'held' }));
    expect(pillow.kind).toBe('world');
    expect(pillow.warnings[0]).toContain('no held model');
  });

  it('reports unknown items', () => {
    const look = resolveItemLook(catalog(), item({ item: 'Base.Nope' }));
    expect(look.model).toBeUndefined();
    expect(look.warnings[0]).toContain('not in the catalog');
  });
});

describe('validateItemDescription', () => {
  it('accepts a document and rejects wrong fields', () => {
    expect(validateItemDescription(item({ model: 'held', blood: 0.5, meta: {} })).ok).toBe(true);
    const bad = validateItemDescription({
      format: 'zomboid-models/item',
      version: 1,
      item: '',
      model: 'floor',
      blood: 2,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors).toEqual([
        'item: must be a non-empty string',
        'model: must be "world" or "held"',
        'blood: must be a number between 0 and 1',
      ]);
    }
  });
});
