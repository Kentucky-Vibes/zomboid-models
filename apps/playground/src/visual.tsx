/**
 * One viewer, one document, one frame: the page the screenshot tests open. Query parameters:
 * `assets` (asset folder URL, `/dev-assets/` by default), `doc` (a document as JSON), and
 * `camera` (camera options as JSON), and `lighting` (a preset name or a JSON object). The
 * `#status` element gets `data-ready` once the frame is
 * drawn and `data-error` when loading failed; its text lists the warnings.
 */
import {
  createViewer,
  validateDescription,
  type CameraOptions,
  type LightingOption,
} from 'zomboid-models';

const params = new URLSearchParams(window.location.search);
const host = document.getElementById('viewer');
const status = document.getElementById('status');
if (!host || !status) throw new Error('the page lacks its viewer or status element');

function finish(error?: string): void {
  if (error !== undefined) status?.setAttribute('data-error', error);
  status?.setAttribute('data-ready', 'true');
}

async function main(): Promise<void> {
  const docParam = params.get('doc');
  if (!docParam) throw new Error('the doc parameter is missing');
  const result = validateDescription(JSON.parse(docParam) as unknown);
  if (!result.ok) throw new Error(result.errors.join('; '));
  const cameraParam = params.get('camera');
  const camera = cameraParam ? (JSON.parse(cameraParam) as CameraOptions) : undefined;
  const lightingParam = params.get('lighting');
  const lighting: LightingOption | undefined = !lightingParam
    ? undefined
    : lightingParam.startsWith('{')
      ? (JSON.parse(lightingParam) as LightingOption)
      : (lightingParam as LightingOption);
  const warnings: string[] = [];
  let failure: string | undefined;
  const viewer = createViewer(host as HTMLElement, {
    assetBaseUrl: params.get('assets') ?? '/dev-assets/',
    mode: 'showcase',
    document: result.value,
    poseTime: 0,
    background: '#4a4c50',
    attribution: false,
    maxPixelRatio: 1,
    ...(camera ? { camera } : {}),
    ...(lighting ? { lighting } : {}),
    onWarning: (warning) => warnings.push(`${warning.code}: ${warning.message}`),
    onError: (error) => {
      failure = error.message;
    },
  });
  await viewer.setDocument(result.value);
  // Two frames: one for the render loop to pick the viewer up, one for it to draw.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  if (status) status.textContent = warnings.join('\n');
  finish(failure);
}

main().catch((error: unknown) => finish(error instanceof Error ? error.message : String(error)));
