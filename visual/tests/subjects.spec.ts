import { expect, test } from '@playwright/test';

import { openDocument } from './helpers.js';

const DOCUMENTS: Record<string, object> = {
  character: {
    format: 'zomboid-models/character',
    version: 1,
    body: { sex: 'male', skin: 0 },
    worn: [{ item: 'Base.Trousers' }],
    held: { primary: { item: 'Base.Axe' } },
  },
  zombie: {
    format: 'zomboid-models/character',
    version: 1,
    body: { sex: 'female', zombie: { rot: 1, seed: 3 } },
    stance: 'crawling',
  },
  animal: { format: 'zomboid-models/animal', version: 1, type: 'cow' },
  item: { format: 'zomboid-models/item', version: 1, item: 'Base.Axe' },
  scene: {
    format: 'zomboid-models/scene',
    version: 1,
    subjects: [
      {
        document: {
          format: 'zomboid-models/vehicle',
          version: 1,
          vehicle: 'Base.CarNormal',
          rust: 0,
        },
      },
      {
        document: { format: 'zomboid-models/character', version: 1, body: { sex: 'male' } },
        seat: 'FrontLeft',
        in: 0,
      },
      { document: { format: 'zomboid-models/animal', version: 1, type: 'cow' }, yaw: 45 },
      { document: { format: 'zomboid-models/item', version: 1, item: 'Base.Axe' } },
    ],
    ground: '#3a3b3f',
  },
  vehicle: {
    format: 'zomboid-models/vehicle',
    version: 1,
    vehicle: 'Base.CarNormal',
    paint: { hue: 0.6, saturation: 0.9, value: 0.7 },
    rust: 1,
    headlights: true,
    parts: { DoorFrontLeft: { condition: 30 }, Windshield: { missing: true } },
  },
};

for (const [name, document] of Object.entries(DOCUMENTS)) {
  test(`${name} renders the same frame as before`, async ({ page }) => {
    await openDocument(page, '/visual-assets/', document);
    await expect(page.locator('#viewer canvas')).toHaveScreenshot(`${name}.png`);
  });
}

for (const lighting of ['dusk', 'night', 'studio']) {
  test(`${lighting} lighting renders the same frame as before`, async ({ page }) => {
    await openDocument(
      page,
      '/visual-assets/',
      DOCUMENTS['character'] as object,
      undefined,
      lighting,
    );
    await expect(page.locator('#viewer canvas')).toHaveScreenshot(`character-${lighting}.png`);
  });
}
