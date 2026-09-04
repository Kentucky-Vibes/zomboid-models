import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildActiveFileMap } from '../src/game/fileMap.js';
import {
  chooseVersionDirName,
  discoverMods,
  isModAvailable,
  parseModInfo,
  readServerIniMods,
  resolveLoadOrder,
} from '../src/game/mods.js';
import { parseGameVersion, versionInt, versionIntFromFolderName } from '../src/game/version.js';

const GAME_VERSION = { major: 42, minor: 20, suffix: '.3' };

function file(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('version', () => {
  it('parses and compares versions on major and minor only', () => {
    expect(parseGameVersion('42.20.3')).toEqual({ major: 42, minor: 20, suffix: '.3' });
    expect(parseGameVersion('42.0')).toEqual({ major: 42, minor: 0, suffix: '' });
    expect(parseGameVersion('nope')).toBeUndefined();
    expect(versionInt({ major: 42, minor: 20, suffix: '.3' })).toBe(42020);
  });

  it('turns folder names into version integers like the game', () => {
    expect(versionIntFromFolderName('42')).toBe(42000);
    expect(versionIntFromFolderName('42.18')).toBe(42018);
    expect(versionIntFromFolderName('42.1.7')).toBe(42001);
    expect(versionIntFromFolderName('42.1234')).toBe(42999);
    expect(versionIntFromFolderName('common')).toBe(0);
  });

  it('chooses the best version folder', () => {
    expect(chooseVersionDirName(['common', '42', '42.18', '42.30'], GAME_VERSION)).toBe('42.18');
    expect(chooseVersionDirName(['41', 'media'], GAME_VERSION)).toBe('42.0');
    expect(chooseVersionDirName(['42', '42.0'], GAME_VERSION)).toBe('42.0');
  });
});

describe('parseModInfo', () => {
  it('reads the keys the game reads', () => {
    const info = parseModInfo(
      "name=Spongie's Open Jackets\nid=SpnOpenCloth\nrequire=Base, Other\\\nversionMin=42.0\nversionMax=42.99\nmodversion=18\nauthor=Spongie\nposter=poster.png\n",
    );
    expect(info).toEqual({
      id: 'SpnOpenCloth',
      name: "Spongie's Open Jackets",
      require: ['Base', 'Other'],
      versionMin: { major: 42, minor: 0, suffix: '' },
      versionMax: { major: 42, minor: 99, suffix: '' },
      modVersion: '18',
      author: 'Spongie',
    });
  });

  it('rejects files without an id', () => {
    expect(parseModInfo('name=No id here\n')).toBeUndefined();
  });
});

describe('discoverMods and load order', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'zm-mods-'));
    // Plain mod folder with a version folder and a common folder.
    file(join(root, 'mods', 'Alpha', '42.18', 'mod.info'), 'id=Alpha\nrequire=Beta\n');
    file(join(root, 'mods', 'Alpha', '42.18', 'media', 'scripts', 'alpha.txt'), 'module Base {}');
    file(join(root, 'mods', 'Alpha', 'common', 'media', 'textures', 'a.png'), 'png');
    file(join(root, 'mods', 'Alpha', 'common', 'media', 'shared.txt'), 'from common');
    file(join(root, 'mods', 'Alpha', '42.18', 'media', 'shared.txt'), 'from version');
    // Workshop content layout.
    file(
      join(root, 'workshop', '3745718141', 'mods', 'Beta', '42', 'mod.info'),
      'id=Beta\nversionMax=42.10\n',
    );
    file(
      join(root, 'workshop', '3745718141', 'mods', 'Beta', '42', 'media', 'textures', 'a.png'),
      'png2',
    );
    // Workshop staging layout.
    file(
      join(root, 'staging', 'KCHAT', 'Contents', 'mods', 'Gamma', 'common', 'mod.info'),
      'id=Gamma\n',
    );
    // Build 41 layout: not a mod in Build 42.
    file(join(root, 'mods', 'Old', 'mod.info'), 'id=Old\n');
    file(join(root, 'mods', 'Old', 'media', 'x.txt'), '');
    // Example mod is skipped.
    file(join(root, 'mods', 'examplemod', '42', 'mod.info'), 'id=exampleMod\n');
    // Duplicate id: the second occurrence loses.
    file(join(root, 'mods', 'AlphaCopy', '42', 'mod.info'), 'id=Alpha\n');
    // Game folder.
    file(join(root, 'game', 'media', 'textures', 'a.png'), 'vanilla');
    file(join(root, 'game', 'media', 'scripts', 'items.txt'), 'module Base {}');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds mods in every supported layout and skips what the game skips', () => {
    const mods = discoverMods(
      [join(root, 'mods'), join(root, 'workshop'), join(root, 'staging')],
      GAME_VERSION,
    );
    expect(mods.map((m) => `${m.id}@${m.versionDirName}`)).toEqual([
      'Alpha@42.18',
      'Beta@42',
      'Gamma@42.0',
    ]);
    expect(mods[0]?.commonDir).toBe(join(root, 'mods', 'Alpha', 'common'));
    expect(mods[0]?.versionDir).toBe(join(root, 'mods', 'Alpha', '42.18'));
    expect(mods[0]?.dir).toBe(join(root, 'mods', 'Alpha'));
    expect(mods[2]?.versionDir).toBeUndefined();
  });

  it('accepts a single mod folder as a root', () => {
    const mods = discoverMods([join(root, 'mods', 'Alpha')], GAME_VERSION);
    expect(mods.map((m) => m.id)).toEqual(['Alpha']);
  });

  it('accepts a single Workshop item or staging folder as a root', () => {
    expect(
      discoverMods([join(root, 'workshop', '3745718141')], GAME_VERSION).map((m) => m.id),
    ).toEqual(['Beta']);
    expect(discoverMods([join(root, 'staging', 'KCHAT')], GAME_VERSION).map((m) => m.id)).toEqual([
      'Gamma',
    ]);
  });

  it('checks availability against the game version', () => {
    const mods = discoverMods([join(root, 'mods'), join(root, 'workshop')], GAME_VERSION);
    const beta = mods.find((m) => m.id === 'Beta');
    expect(beta && isModAvailable(beta, GAME_VERSION)).toBe(false);
    expect(beta && isModAvailable(beta, { major: 42, minor: 5, suffix: '' })).toBe(true);
  });

  it('inserts required mods before the ones that need them', () => {
    const mods = discoverMods(
      [join(root, 'mods'), join(root, 'workshop'), join(root, 'staging')],
      GAME_VERSION,
    );
    const order = resolveLoadOrder(mods, ['Gamma', 'Alpha', 'Nope']);
    expect(order.mods.map((m) => m.id)).toEqual(['Gamma', 'Beta', 'Alpha']);
    expect(order.missing).toEqual(['Nope']);
    expect(resolveLoadOrder(mods, undefined).mods.map((m) => m.id)).toEqual([
      'Beta',
      'Alpha',
      'Gamma',
    ]);
  });

  it('builds the active file map with the last mod winning', () => {
    const mods = discoverMods([join(root, 'mods'), join(root, 'workshop')], GAME_VERSION);
    const order = resolveLoadOrder(mods, ['Alpha']);
    const map = buildActiveFileMap(join(root, 'game'), order.mods);
    expect(map.get('media/textures/a.png')?.source).toBe('Alpha');
    expect(map.get('MEDIA\\Textures\\A.PNG')?.path).toBe(
      join(root, 'mods', 'Alpha', 'common', 'media', 'textures', 'a.png'),
    );
    expect(map.get('media/shared.txt')?.path).toBe(
      join(root, 'mods', 'Alpha', '42.18', 'media', 'shared.txt'),
    );
    expect(map.get('media/scripts/items.txt')?.source).toBe('game');
    expect(map.under('media/scripts/').map((e) => e.relPath)).toEqual([
      'media/scripts/items.txt',
      'media/scripts/alpha.txt',
    ]);
    expect(map.overrides.map((o) => `${o.relPath}:${o.previous}>${o.replacedBy}`)).toEqual([
      'media/textures/a.png:game>Beta',
      'media/textures/a.png:Beta>Alpha',
    ]);
  });
});

describe('readServerIniMods', () => {
  it('reads the ordered id list', () => {
    expect(readServerIniMods('PVP=true\nMods=Alpha;Beta ; Gamma;\nWorkshopItems=1;2\n')).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
    expect(readServerIniMods('PVP=true\n')).toEqual([]);
  });
});
