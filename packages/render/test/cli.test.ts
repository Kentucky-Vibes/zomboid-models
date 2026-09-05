import { describe, expect, it } from 'vitest';

import { ASSET_BASE_URL, assetPathOf, assetSource, contentTypeOf } from '../src/assets.js';
import { outputPathFor, parseCliArgs } from '../src/cliRun.js';

describe('parseCliArgs', () => {
  it('reads the assets, the files, and the picture options', () => {
    const parsed = parseCliArgs([
      '--assets',
      './assets',
      '-w',
      '320',
      '-H',
      '240',
      '--format',
      'webp',
      '-q',
      '0.8',
      '--lighting',
      'dusk',
      '--camera',
      '{"yaw":45}',
      '--animation',
      'none',
      '--pose-time',
      '0.5',
      'a.json',
      'b.json',
    ]);
    expect(parsed).toEqual({
      ok: true,
      value: {
        assets: './assets',
        files: ['a.json', 'b.json'],
        out: undefined,
        options: {
          width: 320,
          height: 240,
          format: 'webp',
          quality: 0.8,
          lighting: 'dusk',
          camera: { yaw: 45 },
          animation: null,
          poseTime: 0.5,
        },
      },
    });
  });

  it('takes the format from a single output file and reports what is missing', () => {
    const single = parseCliArgs(['-a', 'x', '-o', 'out/pic.webp', 'a.json']);
    expect(single.ok && single.value !== 'help' && single.value.options.format).toBe('webp');
    expect(parseCliArgs(['a.json'])).toEqual({ ok: false, error: '--assets is required' });
    expect(parseCliArgs(['-a', 'x'])).toEqual({
      ok: false,
      error: 'give at least one document file',
    });
    expect(parseCliArgs(['-a', 'x', '-f', 'gif', 'a.json'])).toEqual({
      ok: false,
      error: '--format must be png or webp',
    });
    expect(parseCliArgs(['-a', 'x', '-w', 'wide', 'a.json'])).toEqual({
      ok: false,
      error: '--width must be a number',
    });
    expect(parseCliArgs(['--help'])).toEqual({ ok: true, value: 'help' });
    expect(parseCliArgs(['-a', 'x', '--lighting', '{"hour":6}', 'a.json'])).toMatchObject({
      value: { options: { lighting: { hour: 6 } } },
    });
  });
});

describe('outputPathFor', () => {
  it('puts the picture next to the document, in a folder, or at the named file', () => {
    expect(outputPathFor('docs/a.json', undefined, 'png', true)).toBe(
      ['docs', 'a.png'].join(process.platform === 'win32' ? '\\' : '/'),
    );
    expect(outputPathFor('a.json', 'out/pic.webp', 'webp', true)).toBe('out/pic.webp');
    expect(outputPathFor('a.json', 'out', 'png', false)).toBe(
      ['out', 'a.png'].join(process.platform === 'win32' ? '\\' : '/'),
    );
    // With several documents an output ending in .png is a folder name.
    expect(outputPathFor('a.json', 'shots.png', 'png', false)).toBe(
      ['shots.png', 'a.png'].join(process.platform === 'win32' ? '\\' : '/'),
    );
  });
});

describe('assets', () => {
  it('tells a folder from a URL and maps routed requests to paths', () => {
    expect(assetSource('https://cdn.example/pz').kind).toBe('url');
    expect(assetSource('https://cdn.example/pz').base).toBe('https://cdn.example/pz/');
    expect(assetSource('./assets').kind).toBe('folder');
    expect(assetPathOf(`${ASSET_BASE_URL}models/a%20b.glb?x=1`)).toBe('models/a b.glb');
    expect(assetPathOf(`${ASSET_BASE_URL}../secret`)).toBeUndefined();
    expect(assetPathOf('https://elsewhere/manifest.json')).toBeUndefined();
    expect(contentTypeOf('manifest.json')).toBe('application/json');
    expect(contentTypeOf('models/a.glb')).toBe('model/gltf-binary');
    expect(contentTypeOf('textures/a.PNG')).toBe('image/png');
    expect(contentTypeOf('x.bin')).toBe('application/octet-stream');
  });
});
