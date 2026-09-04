import { Viewer, type ViewerOptions } from './Viewer.js';

/**
 * Mounts a character viewer into `host`. The returned viewer removes everything it added when
 * `dispose()` is called.
 */
export function createViewer(host: HTMLElement, options: ViewerOptions): Viewer {
  return new Viewer(host, options);
}
