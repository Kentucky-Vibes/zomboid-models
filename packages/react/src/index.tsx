import { useEffect, useRef, type CSSProperties } from 'react';
import { createViewer, type Viewer, type ViewerOptions } from 'zomboid-models';

export type {
  CameraOptions,
  CharacterDescription,
  RigWarning,
  Viewer,
  ViewerDocument,
  ViewerMode,
  ViewerOptions,
} from 'zomboid-models';

export interface ZomboidCharacterProps extends ViewerOptions {
  className?: string;
  style?: CSSProperties;
  /** Receives the viewer once it is mounted, for `toImage()`, `play()`, and `pause()`. */
  onReady?: (viewer: Viewer) => void;
}

/**
 * Shows one character. The viewer is created when the component mounts and rebuilt when the
 * asset folder or mode changes; the character and the animation update in place.
 */
export function ZomboidCharacter({ className, style, onReady, ...options }: ZomboidCharacterProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const { assetBaseUrl, mode, background, autoRotate, attribution, maxPixelRatio } = options;
  const cameraKey = JSON.stringify(options.camera ?? null);

  useEffect(() => {
    if (!host.current) return;
    const instance = createViewer(host.current, latest.current);
    viewer.current = instance;
    onReady?.(instance);
    return () => {
      instance.dispose();
      viewer.current = null;
    };
    // The viewer is rebuilt only for the options that cannot change in place; the rest is read
    // from `latest` at mount time and applied through the update effects below.
  }, [assetBaseUrl, mode, background, autoRotate, attribution, maxPixelRatio, cameraKey, onReady]);

  const document = options.document ?? options.character;
  useEffect(() => {
    if (viewer.current && document) void viewer.current.setDocument(document);
  }, [document]);

  const animation = 'animation' in options ? options.animation : undefined;
  useEffect(() => {
    if (viewer.current && 'animation' in latest.current) {
      void viewer.current.setAnimation(animation ?? null);
    }
  }, [animation]);

  const { animationSpeed } = options;
  useEffect(() => {
    if (viewer.current && animationSpeed !== undefined) {
      viewer.current.setAnimationSpeed(animationSpeed);
    }
  }, [animationSpeed]);

  return (
    <div ref={host} className={className} style={{ width: '100%', height: '100%', ...style }} />
  );
}
