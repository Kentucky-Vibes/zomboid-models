import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assembleNames } from '../src/build/names.js';
import { ActiveFileMap } from '../src/game/fileMap.js';
import { availableLanguages, readTranslations } from '../src/game/translations.js';

function file(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('translations', () => {
  let root: string;
  let files: ActiveFileMap;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'zm-names-'));
    const game = join(root, 'game', 'media', 'lua', 'shared', 'Translate');
    file(
      join(game, 'EN', 'ItemName.json'),
      '{\n  "Base.Axe": "Firefighter Axe",\n  "Base.Trousers_Denim": "Jeans",\n  "Base.Spoon": "Spoon"\n}\n',
    );
    file(
      join(game, 'EN', 'IG_UI.json'),
      '{"IGUI_VehicleNameCarNormal": "Chevalier Dart", "IGUI_Hair_CrewCut": "Crew Cut", "IGUI_Beard_Full": "Full Beard", "IGUI_AnimalType_cow": "Cow", "IGUI_Breed_holstein": "Holstein"}',
    );
    file(
      join(game, 'EN', 'UI.json'),
      '{"UI_ClothingType_Hat": "Hat", "UI_ClothingType_Pants": "Pants"}',
    );
    file(
      join(game, 'RU', 'ItemName.json'),
      '﻿{"Base.Axe": "Топор пожарного", "Base.Spoon": "Ложка"}',
    );
    file(
      join(game, 'RU', 'IG_UI.json'),
      '{"IGUI_Hair_CrewCut": "Ёжик", "IGUI_AnimalType_cow": "Корова"}',
    );
    file(join(game, 'RU', 'UI.json'), '{"UI_ClothingType_Hat": "Головной убор"}');
    file(join(game, 'FR', 'language.json'), '{"language_name": "French"}');
    const mod = join(root, 'mods', 'Alpha', 'media', 'lua', 'shared', 'Translate');
    file(join(mod, 'RU', 'ItemName.json'), '{"Base.Spoon": "Ложечка", "Alpha.Hat": "Шляпа"}');
    file(join(mod, 'RU', 'UI.json'), 'not json');
    files = new ActiveFileMap();
    files.addTree(join(root, 'game'), 'game');
    files.addTree(join(root, 'mods', 'Alpha'), 'Alpha');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists the languages that have a folder', () => {
    expect(availableLanguages(files)).toEqual(['EN', 'FR', 'RU']);
  });

  it('merges the game and the mods in load order and tolerates bad files', () => {
    const warnings: string[] = [];
    const ru = readTranslations(files, 'RU', warnings);
    expect(ru?.ItemName.get('Base.Axe')).toBe('Топор пожарного');
    expect(ru?.ItemName.get('Base.Spoon')).toBe('Ложечка');
    expect(ru?.ItemName.get('Alpha.Hat')).toBe('Шляпа');
    expect(ru?.UI.get('UI_ClothingType_Hat')).toBe('Головной убор');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('media/lua/shared/Translate/RU/UI.json');
    expect(readTranslations(files, 'DE', warnings)).toBeUndefined();
  });

  it('assembles a complete names file, English and identifiers filling the gaps', () => {
    const warnings: string[] = [];
    const english = readTranslations(files, 'EN', warnings);
    const ru = readTranslations(files, 'RU', warnings);
    const keys = {
      items: new Map<string, string | undefined>([
        ['Base.Axe', 'Axe'],
        ['Base.Trousers_Denim', 'Denim Trousers'],
        ['Base.Unknown', 'Mystery'],
        ['Base.Nameless', undefined],
      ]),
      vehicles: new Map<string, string | undefined>([
        ['Base.CarNormal', undefined],
        ['Base.CarLightsPolice', 'CarLightsPolice'],
      ]),
      hair: ['CrewCut', 'Bob'],
      beards: ['', 'Full'],
      animals: ['cow'],
      breeds: ['holstein', 'angus'],
      bodyLocations: ['base:hat', 'base:pants', 'base:tail'],
    };
    const names = assembleNames('RU', ru, english, keys);
    expect(names.format).toBe('zomboid-models/names');
    expect(names.language).toBe('RU');
    expect(names.items).toEqual({
      'Alpha.Hat': 'Шляпа',
      'Base.Axe': 'Топор пожарного',
      'Base.Nameless': 'Base.Nameless',
      'Base.Spoon': 'Ложечка',
      'Base.Trousers_Denim': 'Jeans',
      'Base.Unknown': 'Mystery',
    });
    expect(names.vehicles).toEqual({
      'Base.CarLightsPolice': 'CarLightsPolice',
      'Base.CarNormal': 'Chevalier Dart',
    });
    expect(names.hair).toEqual({ Bob: 'Bob', CrewCut: 'Ёжик' });
    expect(names.beards).toEqual({ Full: 'Full Beard' });
    expect(names.animals).toEqual({ cow: 'Корова' });
    expect(names.breeds).toEqual({ angus: 'angus', holstein: 'Holstein' });
    expect(names.bodyLocations).toEqual({
      'base:hat': 'Головной убор',
      'base:pants': 'Pants',
      'base:tail': 'tail',
    });
    const en = assembleNames('EN', english, english, keys);
    expect(en.items['Base.Axe']).toBe('Firefighter Axe');
    expect(en.items['Base.Spoon']).toBe('Spoon');
  });
});
