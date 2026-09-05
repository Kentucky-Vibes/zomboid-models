import { useEffect, useRef, type CSSProperties } from 'react';
import { createViewer, type Viewer, type ViewerOptions } from 'zomboid-models';

export type {
  CameraOptions,
  LightingOption,
  RigWarning,
  SnapshotOptions,
  SubjectDescription,
  Viewer,
  ViewerMode,
  ViewerOptions,
} from 'zomboid-models';

export interface ZomboidViewProps extends ViewerOptions {
  className?: string;
  style?: CSSProperties;
  /** Receives the viewer once it is mounted, for `toImage()`, `play()`, and `pause()`. */
  onReady?: (viewer: Viewer) => void;
}

/**
 * Shows one document: a character, an animal, an item, a vehicle, or a scene. The viewer is
 * created when the component mounts and rebuilt when the asset folder, the mode, the
 * background, the camera, the lighting, or the shadows change; the document, the animation,
 * its speed, the pose time, and the light bar update in place.
 */
export function ZomboidView({ className, style, onReady, ...options }: ZomboidViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const { assetBaseUrl, mode, background, autoRotate, attribution, maxPixelRatio, shadow } =
    options;
  const cameraKey = JSON.stringify(options.camera ?? null);
  const lightingKey = JSON.stringify(options.lighting ?? null);

  useEffect(() => {
    if (!host.current) return;
    // The callbacks read the latest props, so a re-render never leaves a stale handler behind.
    const instance = createViewer(host.current, {
      ...latest.current,
      onWarning: (warning) => latest.current.onWarning?.(warning),
      onError: (error) => latest.current.onError?.(error),
    });
    viewer.current = instance;
    onReady?.(instance);
    return () => {
      instance.dispose();
      viewer.current = null;
    };
    // The viewer is rebuilt only for the options that cannot change in place; the rest is read
    // from `latest` at mount time and applied through the update effects below.
  }, [
    assetBaseUrl,
    mode,
    background,
    autoRotate,
    attribution,
    maxPixelRatio,
    shadow,
    cameraKey,
    lightingKey,
    onReady,
  ]);

  const { document } = options;
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

  const { poseTime } = options;
  useEffect(() => {
    viewer.current?.setPoseTime(poseTime);
  }, [poseTime]);

  const { animateLightbar } = options;
  useEffect(() => {
    if (viewer.current && animateLightbar !== undefined) {
      viewer.current.setAnimateLightbar(animateLightbar);
    }
  }, [animateLightbar]);

  return (
    <div ref={host} className={className} style={{ width: '100%', height: '100%', ...style }} />
  );
}
