/**
 * The command line: renders document files to pictures next to them or into a folder.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { parseArgs } from 'node:util';

import type { CameraOptions, LightingOption } from 'zomboid-models';
import { validateDescription } from 'zomboid-models/format';

import { Renderer, type ImageFormat, type RenderOptions } from './renderer.js';

export const CLI_NAME = 'zomboid-models-render';

const USAGE = `Usage: ${CLI_NAME} --assets <folder or URL> [options] <document.json>...

Renders each document to a PNG or WebP picture.

Options:
  -a, --assets <path or URL>  The built assets: a folder, or the base URL they are hosted at
  -o, --out <path>            Output folder, or the output file when there is one document
                              (default: next to each document)
  -w, --width <pixels>        Picture width (default: 400)
  -H, --height <pixels>       Picture height (default: 400)
  -f, --format <png|webp>     Picture format (default: png, or from the --out file's extension)
  -q, --quality <0..1>        WebP quality
      --camera <json>         Camera options, as JSON
      --lighting <value>      day, dusk, night, studio, or {"hour":..,"season":..} as JSON
      --background <colour>   CSS colour, or transparent (default)
      --animation <clip>      A clip name, or "none" for the bind pose
      --animation-speed <n>   Playback speed multiplier (default: 1)
      --pose-time <seconds>   The time of the clip to draw (default: 0)
  -h, --help                  Show this help
`;

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const defaultIo: CliIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

/** One run of the command line as the arguments describe it. */
export interface CliInvocation {
  assets: string;
  files: string[];
  out: string | undefined;
  options: RenderOptions;
}

export type CliParse = { ok: true; value: CliInvocation | 'help' } | { ok: false; error: string };

function parseLighting(value: string): LightingOption {
  return value.startsWith('{') ? (JSON.parse(value) as LightingOption) : (value as LightingOption);
}

function parseNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`);
  return parsed;
}

/** Reads the arguments into an invocation, or a help request, or an error message. */
export function parseCliArgs(argv: readonly string[]): CliParse {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        assets: { type: 'string', short: 'a' },
        out: { type: 'string', short: 'o' },
        width: { type: 'string', short: 'w' },
        height: { type: 'string', short: 'H' },
        format: { type: 'string', short: 'f' },
        quality: { type: 'string', short: 'q' },
        camera: { type: 'string' },
        lighting: { type: 'string' },
        background: { type: 'string' },
        animation: { type: 'string' },
        'animation-speed': { type: 'string' },
        'pose-time': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
    if (values.help) return { ok: true, value: 'help' };
    if (values.assets === undefined) return { ok: false, error: '--assets is required' };
    if (positionals.length === 0) return { ok: false, error: 'give at least one document file' };
    const options: RenderOptions = {};
    const width = parseNumber(values.width, '--width');
    const height = parseNumber(values.height, '--height');
    const quality = parseNumber(values.quality, '--quality');
    const poseTime = parseNumber(values['pose-time'], '--pose-time');
    const animationSpeed = parseNumber(values['animation-speed'], '--animation-speed');
    if (animationSpeed !== undefined) options.animationSpeed = animationSpeed;
    if (width !== undefined) options.width = width;
    if (height !== undefined) options.height = height;
    if (quality !== undefined) options.quality = quality;
    if (poseTime !== undefined) options.poseTime = poseTime;
    let format = values.format;
    if (format === undefined && values.out !== undefined && positionals.length === 1) {
      const extension = extname(values.out).slice(1).toLowerCase();
      if (extension === 'png' || extension === 'webp') format = extension;
    }
    if (format !== undefined) {
      if (format !== 'png' && format !== 'webp') {
        return { ok: false, error: '--format must be png or webp' };
      }
      options.format = format;
    }
    if (values.camera !== undefined) {
      options.camera = JSON.parse(values.camera) as CameraOptions;
    }
    if (values.lighting !== undefined) options.lighting = parseLighting(values.lighting);
    if (values.background !== undefined) options.background = values.background;
    if (values.animation !== undefined) {
      options.animation = values.animation === 'none' ? null : values.animation;
    }
    return {
      ok: true,
      value: { assets: values.assets, files: positionals, out: values.out, options },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Where a document's picture goes: the `--out` file for one document, else a folder. */
export function outputPathFor(
  file: string,
  out: string | undefined,
  format: ImageFormat,
  single: boolean,
): string {
  const name = `${basename(file, extname(file))}.${format}`;
  if (out === undefined) return join(dirname(file), name);
  if (single && /\.(png|webp)$/i.test(out)) return out;
  return join(out, name);
}

/** Runs the command line and returns the exit code. */
export async function runCli(argv: readonly string[], io: CliIo = defaultIo): Promise<number> {
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    io.err(`${CLI_NAME}: ${parsed.error}`);
    io.err(USAGE);
    return 2;
  }
  if (parsed.value === 'help') {
    io.out(USAGE);
    return 0;
  }
  const { assets, files, out, options } = parsed.value;
  const format = options.format ?? 'png';
  const single = files.length === 1;
  let renderer: Renderer;
  try {
    renderer = await Renderer.launch({ assets });
  } catch (error) {
    io.err(`${CLI_NAME}: could not start the browser: ${message(error)}`);
    return 1;
  }
  let failures = 0;
  try {
    for (const file of files) {
      const target = outputPathFor(file, out, format, single);
      try {
        const text = await readFile(file, 'utf8');
        const validated = validateDescription(JSON.parse(text) as unknown);
        if (!validated.ok) throw new Error(validated.errors.join('; '));
        const result = await renderer.render(validated.value, { ...options, format });
        const folder = dirname(target);
        if (!(await exists(folder))) await mkdir(folder, { recursive: true });
        await writeFile(target, result.image);
        io.out(`${file} -> ${target}`);
        for (const warning of result.warnings) io.err(`  ${warning}`);
      } catch (error) {
        failures++;
        io.err(`${file}: ${message(error)}`);
      }
    }
  } finally {
    await renderer.close();
  }
  return failures === 0 ? 0 : 1;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
