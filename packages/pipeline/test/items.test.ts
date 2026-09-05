import { describe, expect, it } from 'vitest';

import { planItemAssets } from '../src/build/items.js';
import { loadCatalog } from '../src/game/catalog.js';
import { ActiveFileMap } from '../src/game/fileMap.js';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('planItemAssets', () => {
  it('collects ground and held models with their textures, scales, and attachments', () => {
    const root = mkdtempSync(join(tmpdir(), 'zm-items-'));
    try {
      const scripts = join(root, 'media', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(
        join(scripts, 'items.txt'),
        `module Base {
          model AxeGround { mesh = WorldItems/Axe, texture = WorldItems/Axe, scale = 0.4, attachment world { offset = 0 0.1 0, rotate = 0 0 90, } }
          model Axe { mesh = weapons/2handed/Axe, texture = weapons/2handed/Axe, }
          model Pillow { mesh = WorldItems/Pillow, scale = 0.3, }
          item Axe { WeaponSprite = Axe, WorldStaticModel = AxeGround, DisplayName = Axe, }
          item Pillow { WorldStaticModel = Pillow, }
          item Ghost { WorldStaticModel = Missing, }
          item Paper { DisplayName = Paper, }
        }`,
      );
      const files = new ActiveFileMap();
      files.addTree(root, 'game');
      const catalog = loadCatalog(files, []);
      const plan = planItemAssets(catalog);
      expect([...plan.models].sort()).toEqual([
        'weapons/2handed/axe',
        'worlditems/axe',
        'worlditems/pillow',
      ]);
      expect([...plan.textures].sort()).toEqual([
        'weapons/2handed/axe',
        'worlditems/axe',
        'worlditems/pillow',
      ]);
      expect(plan.items['Base.Axe']).toEqual({
        displayName: 'Axe',
        world: {
          model: 'worlditems/axe',
          texture: 'worlditems/axe',
          scale: 0.4,
          attachments: { world: { offset: [0, 0.1, 0], rotate: [0, 0, 90], scale: 1 } },
        },
        held: {
          model: 'weapons/2handed/axe',
          texture: 'weapons/2handed/axe',
          scale: 1,
          attachments: {},
        },
      });
      expect(plan.items['Base.Pillow']).toEqual({
        world: {
          model: 'worlditems/pillow',
          texture: 'worlditems/pillow',
          scale: 0.3,
          attachments: {},
        },
      });
      expect(plan.items['Base.Paper']).toBeUndefined();
      expect(plan.items['Base.Ghost']).toBeUndefined();
      expect(plan.warnings).toEqual(['Base.Ghost: model "Missing" is not defined']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
