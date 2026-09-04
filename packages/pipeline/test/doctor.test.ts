import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { existsIgnoringCase } from '../src/cli/doctor.js';

const root = mkdtempSync(join(tmpdir(), 'zomboid-models-doctor-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('existsIgnoringCase', () => {
  mkdirSync(join(root, 'models_x', 'skinned'), { recursive: true });
  writeFileSync(join(root, 'models_x', 'skinned', 'malebody.x'), '');

  it('finds paths whose components differ only in case', () => {
    expect(existsIgnoringCase(root, 'models_X/Skinned/MaleBody.x')).toBe(true);
    expect(existsIgnoringCase(root, 'models_x/skinned')).toBe(true);
    expect(existsIgnoringCase(root, '')).toBe(true);
  });

  it('rejects paths that do not exist under any case', () => {
    expect(existsIgnoringCase(root, 'models_X/Skinned/FemaleBody.x')).toBe(false);
    expect(existsIgnoringCase(root, 'anims_X/Bob')).toBe(false);
    expect(existsIgnoringCase(join(root, 'missing'), 'models_X')).toBe(false);
  });
});
