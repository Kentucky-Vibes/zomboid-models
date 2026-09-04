import { runBuild } from '../build/build.js';
import { loadConfig } from '../config.js';
import type { CliIo } from './run.js';

/** Loads the configuration, runs the build, and prints the report. */
export function runBuildCommand(configPath: string, io: CliIo): number {
  let config;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
  try {
    const report = runBuild(config, {
      info: (message) => io.out(message),
      warn: (message) => io.err(`warning: ${message}`),
    });
    io.out(
      `built ${report.models} models, ${report.textures} textures, ${report.animations} animations, ` +
        `${report.wearables} wearables, ${report.heldItems} held items in ${report.seconds.toFixed(1)}s`,
    );
    io.out(`manifest written to ${report.outDir}`);
    if (report.warnings.length > 0) io.out(`${report.warnings.length} warnings`);
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
