// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeViewer {
  options: Record<string, unknown>;
  disposed: boolean;
  calls: [string, unknown][];
}

const viewers: FakeViewer[] = [];

vi.mock('zomboid-models', () => ({
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
      dispose: () => {
        viewer.disposed = true;
      },
    };
  },
}));

const { ZomboidView } = await import('./index.js');

const CHARACTER = { format: 'zomboid-models/character', version: 1, body: { sex: 'male' } };
const ZOMBIE = { ...CHARACTER, body: { sex: 'female', zombie: {} } };

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  viewers.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: React.ReactElement): void {
  act(() => root.render(element));
}

describe('<ZomboidView>', () => {
  it('creates a viewer with its props and hands it to onReady', () => {
    const ready = vi.fn();
    render(
      <ZomboidView
        assetBaseUrl="/assets/"
        mode="showcase"
        document={CHARACTER as never}
        shadow={false}
        onReady={ready}
      />,
    );
    expect(viewers).toHaveLength(1);
    expect(viewers[0]?.options).toMatchObject({
      assetBaseUrl: '/assets/',
      mode: 'showcase',
      document: CHARACTER,
      shadow: false,
    });
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('updates the document, the animation, the speed, the pose, and the light bar in place', () => {
    render(<ZomboidView assetBaseUrl="/assets/" document={CHARACTER as never} />);
    const viewer = viewers[0] as FakeViewer;
    render(
      <ZomboidView
        assetBaseUrl="/assets/"
        document={ZOMBIE as never}
        animation="Bob_Walk"
        animationSpeed={2}
        poseTime={0.5}
        animateLightbar={false}
      />,
    );
    expect(viewers).toHaveLength(1);
    expect(viewer.calls).toEqual(
      expect.arrayContaining([
        ['setDocument', ZOMBIE],
        ['setAnimation', 'Bob_Walk'],
        ['setAnimationSpeed', 2],
        ['setPoseTime', 0.5],
        ['setAnimateLightbar', false],
      ]),
    );
  });

  it('rebuilds the viewer when the asset folder or the shadows change', () => {
    render(<ZomboidView assetBaseUrl="/assets/" />);
    render(<ZomboidView assetBaseUrl="/assets/" shadow={false} />);
    expect(viewers).toHaveLength(2);
    expect(viewers[0]?.disposed).toBe(true);
    expect(viewers[1]?.options).toMatchObject({ shadow: false });
    render(<ZomboidView assetBaseUrl="/other/" shadow={false} />);
    expect(viewers).toHaveLength(3);
  });

  it('calls the latest warning handler, not the one from the first render', () => {
    const first = vi.fn();
    const second = vi.fn();
    render(<ZomboidView assetBaseUrl="/assets/" onWarning={first} />);
    render(<ZomboidView assetBaseUrl="/assets/" onWarning={second} />);
    expect(viewers).toHaveLength(1);
    const onWarning = viewers[0]?.options['onWarning'] as (warning: unknown) => void;
    onWarning({ code: 'missing-item', message: 'x' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ code: 'missing-item', message: 'x' });
  });

  it('disposes the viewer on unmount', () => {
    render(<ZomboidView assetBaseUrl="/assets/" />);
    act(() => root.unmount());
    expect(viewers[0]?.disposed).toBe(true);
    root = createRoot(container);
  });
});
