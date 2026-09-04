/** Runs only against a real Project Zomboid install: set PZ_DIR to the game or server folder. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseClothingItemXml } from '../../src/game/clothingXml.js';
import { parseBeardStylesXml, parseHairStylesXml } from '../../src/game/hairXml.js';
import { parseScript } from '../../src/game/scripts.js';

const PZ_DIR = process.env['PZ_DIR'];

function listFiles(dir: string, extension: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) listFiles(path, extension, out);
    else if (entry.toLowerCase().endsWith(extension)) out.push(path);
  }
  return out;
}

describe.skipIf(!PZ_DIR)('game data parsers on real files', () => {
  const media = join(PZ_DIR ?? '', 'media');

  it('parses every script file', () => {
    const files = listFiles(join(media, 'scripts'), '.txt');
    const failures: string[] = [];
    let blocks = 0;
    for (const path of files) {
      try {
        for (const module of parseScript(readFileSync(path, 'utf8')))
          blocks += module.blocks.length;
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(files.length).toBeGreaterThan(100);
    expect(failures).toEqual([]);
    expect(blocks).toBeGreaterThan(5000);
  });

  it('parses every clothing item XML', () => {
    const files = listFiles(join(media, 'clothing', 'clothingItems'), '.xml');
    const failures: string[] = [];
    let withModel = 0;
    for (const path of files) {
      try {
        const item = parseClothingItemXml(readFileSync(path, 'utf8'));
        if (item.maleModel || item.femaleModel) withModel++;
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(files.length).toBeGreaterThan(1000);
    expect(failures).toEqual([]);
    expect(withModel).toBeGreaterThan(500);
  });

  it('parses the hair and beard styles', () => {
    const hair = parseHairStylesXml(
      readFileSync(join(media, 'hairStyles', 'hairStyles.xml'), 'utf8'),
    );
    expect(hair.male.length).toBeGreaterThan(20);
    expect(hair.female.length).toBeGreaterThan(20);
    expect(hair.male.every((style) => style.name.length > 0)).toBe(true);
    const beards = parseBeardStylesXml(
      readFileSync(join(media, 'hairStyles', 'beardStyles.xml'), 'utf8'),
    );
    expect(beards.length).toBeGreaterThan(3);
  });
});
