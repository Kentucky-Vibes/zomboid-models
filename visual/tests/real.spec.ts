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
  crew: {
    format: 'zomboid-models/scene',
    version: 1,
    subjects: [
      {
        document: {
          format: 'zomboid-models/vehicle',
          version: 1,
          vehicle: 'Base.CarLightsPolice',
          rust: 0,
        },
      },
      {
        document: {
          format: 'zomboid-models/character',
          version: 1,
          body: { sex: 'male', hair: 'CrewCut' },
          worn: [{ item: 'Base.Trousers_Denim' }, { item: 'Base.Jacket_Police' }],
        },
        seat: 'FrontLeft',
        in: 0,
      },
      {
        document: {
          format: 'zomboid-models/character',
          version: 1,
          body: { sex: 'female', zombie: { seed: 5 } },
          outfit: { name: 'Nurse', seed: 5 },
        },
        position: [3.2, 0.5],
        yaw: -20,
      },
      {
        document: { format: 'zomboid-models/animal', version: 1, type: 'cow' },
        position: [-3.4, 0],
        yaw: 30,
      },
    ],
    ground: '#3a3b3f',
  },
  martin: {
    format: 'zomboid-models/vehicle',
    version: 1,
    vehicle: 'Base.ModernCar_Martin',
    paint: { hue: 0.58, saturation: 0.9, value: 0.7 },
    parts: {
      DoorFrontLeft: { condition: 45, open: true },
      EngineDoor: { open: true },
      Windshield: { missing: true },
    },
  },
};

/** Documents rendered under a time of day, by screenshot name. */
const LIT: Record<string, { document: object; lighting: string | object }> = {
  'police-night': { document: DOCUMENTS['police'] as object, lighting: 'night' },
  'survivor-dusk': { document: DOCUMENTS['survivor'] as object, lighting: 'dusk' },
  'cow-winter-morning': {
    document: DOCUMENTS['cow'] as object,
    lighting: { hour: 8, season: 'winter' },
  },
};

/** The same subjects caught in the middle of an action, at the clip's first frame. */
const ACTING: Record<string, object> = {
  'survivor-walk': { ...DOCUMENTS['survivor'], action: 'walk' },
  'survivor-attack': { ...DOCUMENTS['survivor'], action: 'attack' },
  'survivor-sit': { ...DOCUMENTS['survivor'], action: 'sitChair' },
  'zombie-sprint': { ...DOCUMENTS['zombie'], action: 'sprint' },
  'zombie-eat': { ...DOCUMENTS['zombie'], action: 'eat' },
  'cow-eat': { ...DOCUMENTS['cow'], action: 'eat' },
};

for (const [name, document] of Object.entries({ ...DOCUMENTS, ...ACTING })) {
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

for (const [name, { document, lighting }] of Object.entries(LIT)) {
  test(`${name} renders the same frame as before`, async ({ page }) => {
    await openDocument(page, '/dev-assets/', document, undefined, lighting);
    await expect(page.locator('#viewer canvas')).toHaveScreenshot(`${name}.png`);
  });
}
