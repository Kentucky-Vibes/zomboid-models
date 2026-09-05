/**
 * The script the render package runs inside its headless browser: it builds one viewer in
 * image mode for a request, waits for the document to load, and hands back the picture as a
 * data URL together with the viewer's warnings.
 */
import {
  createViewer,
  type CameraOptions,
  type LightingOption,
  type RigWarning,
  type SubjectDescription,
  type ViewerOptions,
} from 'zomboid-models';

export interface PageRenderRequest {
  document: SubjectDescription;
  assetBaseUrl: string;
  width: number;
  height: number;
  type: 'image/png' | 'image/webp';
  quality?: number;
  camera?: CameraOptions;
  lighting?: LightingOption;
  background?: string;
  animation?: string | null;
  animationSpeed?: number;
  poseTime?: number;
}

export interface PageRenderResult {
  /** The picture as a data URL. */
  image: string;
  warnings: string[];
}

async function render(request: PageRenderRequest): Promise<PageRenderResult> {
  const host = document.createElement('div');
  host.style.width = `${request.width}px`;
  host.style.height = `${request.height}px`;
  document.body.append(host);
  const warnings: string[] = [];
  let failure: Error | undefined;
  const options: ViewerOptions = {
    assetBaseUrl: request.assetBaseUrl,
    mode: 'image',
    background: request.background ?? 'transparent',
    attribution: false,
    maxPixelRatio: 1,
    onWarning: (warning: RigWarning) => warnings.push(`${warning.code}: ${warning.message}`),
    onError: (error: Error) => {
      failure = error;
    },
  };
  if (request.camera) options.camera = request.camera;
  if (request.lighting !== undefined) options.lighting = request.lighting;
  if (request.animation !== undefined) options.animation = request.animation;
  if (request.animationSpeed !== undefined) options.animationSpeed = request.animationSpeed;
  if (request.poseTime !== undefined) options.poseTime = request.poseTime;
  const viewer = createViewer(host, options);
  try {
    await viewer.setDocument(request.document);
    if (failure) throw failure;
    const image = viewer.toImage({
      width: request.width,
      height: request.height,
      type: request.type,
      ...(request.quality === undefined ? {} : { quality: request.quality }),
    });
    return { image, warnings };
  } finally {
    viewer.dispose();
    host.remove();
  }
}

declare global {
  interface Window {
    zomboidModelsRender: { render: (request: PageRenderRequest) => Promise<PageRenderResult> };
  }
}

window.zomboidModelsRender = { render };
