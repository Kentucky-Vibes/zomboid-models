declare const __ZOMBOID_MODELS_PIPELINE_VERSION__: string | undefined;

/** The version of this package, set when it is built; `0.0.0` in a source checkout. */
export const PIPELINE_VERSION: string =
  typeof __ZOMBOID_MODELS_PIPELINE_VERSION__ === 'string'
    ? __ZOMBOID_MODELS_PIPELINE_VERSION__
    : '0.0.0';
