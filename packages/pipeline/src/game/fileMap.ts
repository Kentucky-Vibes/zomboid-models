import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import type { DiscoveredMod } from './mods.js';

export interface MappedFile {
  /** Absolute path of the file that is in effect. */
  path: string;
  /** `game`, or the id of the mod that provided the file. */
  source: string;
}

/**
 * The game's view of `media/`: one entry per lowercased relative path, where the last folder
 * added wins. Built from the game's own `media` and then from every enabled mod's `common` and
 * version folders, in load order.
 */
export class ActiveFileMap {
  private readonly files = new Map<string, MappedFile>();
  /** Relative paths that a later folder replaced, for reporting. */
  readonly overrides: { relPath: string; previous: string; replacedBy: string }[] = [];

  /** Adds every file under `root/media`, keyed by its path relative to `root`. */
  addTree(root: string, source: string): number {
    const mediaDir = join(root, 'media');
    let count = 0;
    const walk = (dir: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const path = join(dir, entry);
        let isDir: boolean;
        try {
          isDir = statSync(path).isDirectory();
        } catch {
          continue;
        }
        if (isDir) {
          walk(path);
          continue;
        }
        const relPath = relative(root, path).split(sep).join('/').toLowerCase();
        const previous = this.files.get(relPath);
        if (previous && previous.source !== source) {
          this.overrides.push({ relPath, previous: previous.source, replacedBy: source });
        }
        this.files.set(relPath, { path, source });
        count++;
      }
    };
    walk(mediaDir);
    return count;
  }

  /** Looks up a relative path such as `media/clothing/clothingItems/Trousers_Denim.xml`. */
  get(relPath: string): MappedFile | undefined {
    return this.files.get(normalizeRelPath(relPath));
  }

  has(relPath: string): boolean {
    return this.files.has(normalizeRelPath(relPath));
  }

  /** Every entry whose relative path starts with the prefix, in insertion order. */
  under(prefix: string): { relPath: string; file: MappedFile }[] {
    const normalized = normalizeRelPath(prefix);
    const out: { relPath: string; file: MappedFile }[] = [];
    for (const [relPath, file] of this.files) {
      if (relPath.startsWith(normalized)) out.push({ relPath, file });
    }
    return out;
  }

  get size(): number {
    return this.files.size;
  }
}

export function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

/** Builds the file map for a game folder and an ordered list of mods. */
export function buildActiveFileMap(gameDir: string, mods: readonly DiscoveredMod[]): ActiveFileMap {
  const map = new ActiveFileMap();
  map.addTree(gameDir, 'game');
  for (const mod of mods) {
    if (mod.commonDir) map.addTree(mod.commonDir, mod.id);
    if (mod.versionDir) map.addTree(mod.versionDir, mod.id);
  }
  return map;
}
