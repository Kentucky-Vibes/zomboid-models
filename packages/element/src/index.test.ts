// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ZomboidModels from 'zomboid-models';

import type { ZomboidViewElement } from './index.js';

interface FakeViewer {
  options: Record<string, unknown>;
  disposed: boolean;
  calls: [string, unknown][];
}

const viewers: FakeViewer[] = [];

vi.mock('zomboid-models', async () => {
  const actual = await vi.importActual<typeof ZomboidModels>('zomboid-models');
  return {
    ...actual,
    createViewer: (_host: HTMLElement, options: Record<string, unknown>) => {
      const viewer: FakeViewer = { options, disposed: false, calls: [] };
      const record = (name: string) => (value: unknown) => {
        viewer.calls.push([name, value]);
        return Promise.resolve();
      };
      viewers.push(viewer);
      return {
        setDocument: record('setDocument'),
        setAnimation: record('setAnimation'),
        setAnimationSpeed: record('setAnimationSpeed'),
        setPoseTime: record('setPoseTime'),
        setAnimateLightbar: record('setAnimateLightbar'),
        play: record('play'),
        pause: record('pause'),
        toImage: (options: unknown) => {
          viewer.calls.push(['toImage', options]);
          return 'data:image/png;base64,';
        },
        dispose: () => {
          viewer.disposed = true;
        },
      };
    },
  };
});

// Importing the element registers it with the page.
await import('./index.js');

const CHARACTER = { format: 'zomboid-models/character', version: 1, body: { sex: 'male' } };

function mount(attributes: Record<string, string>): ZomboidViewElement {
  const element = document.createElement('zomboid-view');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
}

beforeEach(() => {
  viewers.length = 0;
  document.body.innerHTML = '';
});

describe('<zomboid-view>', () => {
  it('turns its attributes into viewer options', () => {
    mount({
      'asset-base-url': '/assets/',
      mode: 'showcase',
      animation: 'none',
      'animation-speed': '1.5',
      'pose-time': '0.5',
      background: '#000',
      'auto-rotate': '',
      attribution: 'false',
      shadow: 'false',
      'animate-lightbar': 'true',
      'max-pixel-ratio': '2',
      camera: '{"yaw":45}',
      lighting: 'dusk',
    });
    expect(viewers).toHaveLength(1);
    expect(viewers[0]?.options).toMatchObject({
      assetBaseUrl: '/assets/',
      mode: 'showcase',
      animation: null,
      animationSpeed: 1.5,
      poseTime: 0.5,
      background: '#000',
      autoRotate: true,
      attribution: false,
      shadow: false,
      animateLightbar: true,
      maxPixelRatio: 2,
      camera: { yaw: 45 },
      lighting: 'dusk',
    });
  });

  it('defaults the boolean attributes and reads a lighting object', () => {
    mount({ 'asset-base-url': '/assets/', lighting: '{"hour":6,"season":"winter"}' });
    expect(viewers[0]?.options).toMatchObject({
      autoRotate: false,
      attribution: true,
      shadow: true,
      animateLightbar: true,
      lighting: { hour: 6, season: 'winter' },
    });
    expect(viewers[0]?.options).not.toHaveProperty('animation');
  });

  it('does not build a viewer without an asset folder', () => {
    mount({ mode: 'viewer' });
    expect(viewers).toHaveLength(0);
  });

  it('updates the document, the animation, the speed, the pose, and the light bar in place', () => {
    const element = mount({ 'asset-base-url': '/assets/' });
    const viewer = viewers[0] as FakeViewer;
    element.document = CHARACTER as never;
    element.setAttribute('animation', 'Bob_Walk');
    element.setAttribute('animation-speed', '2');
    element.setAttribute('pose-time', '1.25');
    element.setAttribute('animate-lightbar', 'false');
    expect(viewer.calls).toEqual([
      ['setDocument', CHARACTER],
      ['setAnimation', 'Bob_Walk'],
      ['setAnimationSpeed', 2],
      ['setPoseTime', 1.25],
      ['setAnimateLightbar', false],
    ]);
    expect(viewers).toHaveLength(1);
    expect(viewer.disposed).toBe(false);
  });

  it('rebuilds the viewer when an attribute that cannot change in place changes', () => {
    const element = mount({ 'asset-base-url': '/assets/' });
    element.setAttribute('shadow', 'false');
    expect(viewers).toHaveLength(2);
    expect(viewers[0]?.disposed).toBe(true);
    expect(viewers[1]?.options).toMatchObject({ shadow: false });
  });

  it('disposes the viewer when removed from the page and reports bad JSON', () => {
    const element = mount({ 'asset-base-url': '/assets/' });
    const errors: unknown[] = [];
    element.addEventListener('error', (event) =>
      errors.push((event as unknown as CustomEvent).detail),
    );
    element.setAttribute('camera', '{not json');
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('camera is not valid JSON');
    element.remove();
    expect(viewers.every((viewer) => viewer.disposed)).toBe(true);
  });

  it('exposes the viewer and forwards image requests', () => {
    const element = mount({ 'asset-base-url': '/assets/' });
    expect(element.viewerInstance).toBeDefined();
    expect(element.toImage({ width: 10, height: 10, type: 'image/webp' })).toMatch(/^data:/);
    expect(viewers[0]?.calls).toEqual([['toImage', { width: 10, height: 10, type: 'image/webp' }]]);
  });
});
