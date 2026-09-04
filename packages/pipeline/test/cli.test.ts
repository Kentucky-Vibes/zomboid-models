import { describe, expect, it } from 'vitest';

import { runCli } from '../src/cli/run.js';

describe('runCli', () => {
  it('prints usage and fails when no command is given', () => {
    const lines: string[] = [];
    const code = runCli([], { out: (l) => lines.push(l), err: (l) => lines.push(l) });
    expect(code).toBe(2);
    expect(lines.join('\n')).toContain('Usage:');
  });

  it('prints usage and succeeds for --help', () => {
    const lines: string[] = [];
    const code = runCli(['--help'], { out: (l) => lines.push(l), err: () => undefined });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Commands:');
  });

  it('rejects unknown commands', () => {
    const errors: string[] = [];
    const code = runCli(['frobnicate'], { out: () => undefined, err: (l) => errors.push(l) });
    expect(code).toBe(2);
    expect(errors[0]).toContain('frobnicate');
  });

  it('rejects unknown options', () => {
    const errors: string[] = [];
    const code = runCli(['build', '--nope'], { out: () => undefined, err: (l) => errors.push(l) });
    expect(code).toBe(2);
    expect(errors.length).toBeGreaterThan(0);
  });
});
