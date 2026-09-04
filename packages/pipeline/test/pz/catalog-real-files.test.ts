/** Runs only against a real Project Zomboid install: set PZ_DIR to the game or server folder. */
import { describe, expect, it } from 'vitest';

import { loadCatalog, resolveModel } from '../../src/game/catalog.js';
import { buildActiveFileMap } from '../../src/game/fileMap.js';
import { entryValue } from '../../src/game/scripts.js';

const PZ_DIR = process.env['PZ_DIR'];

describe.skipIf(!PZ_DIR)('catalog of the real game', () => {
  it('reads items, models, clothing, hair, locations, and idle clips', { timeout: 120_000 }, () => {
    const files = buildActiveFileMap(PZ_DIR ?? '', []);
    expect(files.size).toBeGreaterThan(10_000);
    const catalog = loadCatalog(files, []);

    expect(catalog.items.size).toBeGreaterThan(3000);
    expect(catalog.models.size).toBeGreaterThan(1000);
    expect(catalog.clothingItems.size).toBeGreaterThan(1000);
    expect(catalog.hair.male.length).toBeGreaterThan(20);
    expect(catalog.beards.length).toBeGreaterThan(3);
    expect(catalog.bodyLocations.order.length).toBeGreaterThan(100);
    expect(catalog.bodyLocations.order[0]).toBe('base:bandage');
    expect(catalog.bodyLocations.exclusive.length).toBeGreaterThan(300);
    expect(catalog.idle.byWeaponType['firearm']).toBe('Bob_IdleRifle');
    expect(catalog.idle.default).toBe('Bob_Idle');

    const trousers = catalog.items.get('Base.Trousers_Denim');
    expect(trousers).toBeDefined();
    expect(
      entryValue(trousers?.block as NonNullable<typeof trousers>['block'], 'BodyLocation'),
    ).toBe('base:pants');
    const clothing = catalog.clothingItems.get('trousers_denim');
    expect(clothing?.maleModel).toBe('skinned/clothes/bob_trousers');
    expect(clothing?.femaleModel).toBe('skinned/clothes/kate_trousers');
    expect(clothing?.textureChoices[0]).toBe('clothes/trousers_mesh/trousersmesh_denim');
    expect(files.has('media/models_x/skinned/clothes/bob_trousers.x')).toBe(true);
    expect(files.has('media/textures/clothes/trousers_mesh/trousersmesh_denim.png')).toBe(true);

    const axe = catalog.items.get('Base.Axe');
    const sprite = entryValue(axe?.block as NonNullable<typeof axe>['block'], 'WeaponSprite');
    expect(sprite).toBe('FireAxe');
    expect(resolveModel(catalog.models, sprite ?? '', 'Base')?.mesh).toBe(
      'weapons/2handed/fireaxe',
    );
    expect(
      resolveModel(catalog.models, 'MaleBody', 'Base')?.attachments['Bip01_Prop2'],
    ).toBeDefined();

    const missingXml = catalog.warnings.filter((w) => w.includes('has no XML file'));
    expect(missingXml.length).toBeLessThan(20);
  });
});
