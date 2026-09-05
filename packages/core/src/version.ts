declare const __ZOMBOID_MODELS_VERSION__: string | undefined;

/** The version of this package, set when it is built; `0.0.0` in a source checkout. */
export const PACKAGE_VERSION: string =
  typeof __ZOMBOID_MODELS_VERSION__ === 'string' ? __ZOMBOID_MODELS_VERSION__ : '0.0.0';

/** The major part of a version string, or -1 when it has none. */
export function majorVersion(version: string): number {
  const match = /^(\d+)\./.exec(version.trim());
  return match ? Number(match[1]) : -1;
}
