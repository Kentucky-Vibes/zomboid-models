/**
 * Screenshots against an asset folder built from a real game install (the playground's
 * `dev-assets`). Runs only with `ZM_VISUAL_REAL=1`; the screenshots stay out of the repository.
 * The first run records them, later runs compare.
 */
import { expect, test } from '@playwright/test';

import { openDocument } from './helpers.js';

const DOCUMENTS: Record<string, object> = {
  survivor: {
    format: 'zomboid-models/character',
    version: 1,
    body: { sex: 'male', skin: 0, hair: 'CrewCut', hairColor: { r: 0.29, g: 0.18, b: 0.1 } },
    worn: [
      { item: 'Base.Trousers_Denim', textureChoice: 0 },
      { item: 'Base.Tshirt_WhiteTINT' },
      { item: 'Base.Jacket_Police' },
      { item: 'Base.Hat_BaseballCap_Police' },
    ],
    held: { primary: { item: 'Base.Axe' } },
  },
  zombie: {
    format: 'zomboid-models/character',
    version: 1,
    body: { sex: 'female', zombie: { seed: 7 } },
    outfit: { name: 'Nurse', seed: 7 },
  },
  cow: { format: 'zomboid-models/animal', version: 1, type: 'cow', breed: 'holstein' },
  axe: { format: 'zomboid-models/item', version: 1, item: 'Base.Axe' },
  police: {
    format: 'zomboid-models/vehicle',
    version: 1,
    vehicle: 'Base.CarLightsPolice',
    rust: 1,
    headlights: true,
    lightbar: 'left',
    blood: { front: 1 },
  },
  martin: {
    format: 'zomboid-models/vehicle',
    version: 1,
    vehicle: 'Base.ModernCar_Martin',
    paint: { hue: 0.58, saturation: 0.9, value: 0.7 },
    parts: { DoorFrontLeft: { condition: 45 }, Windshield: { missing: true } },
  },
};

for (const [name, document] of Object.entries(DOCUMENTS)) {
  test(`${name} renders the same frame as before`, async ({ page }) => {
    const warnings = await openDocument(page, '/dev-assets/', document);
    // Models on attachment points are a known gap; anything else is a regression.
    const unexpected = warnings
      .split('\n')
      .filter((line) => line.length > 0 && !line.includes('attachments are not drawn yet'));
    expect(unexpected, 'warnings while loading').toEqual([]);
    await expect(page.locator('#viewer canvas')).toHaveScreenshot(`${name}.png`);
  });
}
