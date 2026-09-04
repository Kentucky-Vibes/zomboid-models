export interface FrameListener {
  /** Called once per animation frame with the elapsed time since the previous frame. */
  onFrame(deltaSeconds: number): void;
}

/**
 * A single requestAnimationFrame loop shared by every viewer on the page. It runs only while
 * at least one listener is registered, and stops when the page is hidden.
 */
export class RenderLoop {
  private readonly listeners = new Set<FrameListener>();
  private handle: number | undefined;
  private lastTime = 0;

  constructor(private readonly onVisibilityChange = () => this.sync()) {}

  add(listener: FrameListener): void {
    if (this.listeners.size === 0) {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.listeners.add(listener);
    this.sync();
  }

  remove(listener: FrameListener): void {
    this.listeners.delete(listener);
    if (this.listeners.size === 0) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.sync();
  }

  get running(): boolean {
    return this.handle !== undefined;
  }

  private sync(): void {
    const shouldRun = this.listeners.size > 0 && !document.hidden;
    if (shouldRun && this.handle === undefined) {
      this.lastTime = performance.now();
      this.handle = requestAnimationFrame(this.tick);
    } else if (!shouldRun && this.handle !== undefined) {
      cancelAnimationFrame(this.handle);
      this.handle = undefined;
    }
  }

  private readonly tick = (time: number): void => {
    this.handle = requestAnimationFrame(this.tick);
    const delta = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    for (const listener of this.listeners) {
      listener.onFrame(delta);
    }
  };
}

let loop: RenderLoop | undefined;

export function getRenderLoop(): RenderLoop {
  loop ??= new RenderLoop();
  return loop;
}
