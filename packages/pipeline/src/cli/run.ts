import { parseArgs } from 'node:util';

import { DEFAULT_CONFIG_FILE } from '../config.js';
import { runBuildCommand } from './build.js';
import { runDoctor } from './doctor.js';
import { runInit } from './init.js';

export const CLI_NAME = 'zomboid-models';

const COMMANDS = ['init', 'build', 'doctor'] as const;
type Command = (typeof COMMANDS)[number];

const USAGE = `Usage: ${CLI_NAME} <command> [options]

Commands:
  init      Detect a Project Zomboid install and write a configuration file
  build     Convert game and mod assets into the output folder
  doctor    Check the configuration, the install, and the mod folders

Options:
  -c, --config <path>   Configuration file (default: ${DEFAULT_CONFIG_FILE})
  -f, --force           init: overwrite an existing configuration file
  -h, --help            Show this help
`;

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const defaultIo: CliIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

function isCommand(value: string | undefined): value is Command {
  return COMMANDS.includes(value as Command);
}

/** Parses the arguments, dispatches the command, and returns the process exit code. */
export function runCli(argv: readonly string[], io: CliIo = defaultIo): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        config: { type: 'string', short: 'c', default: DEFAULT_CONFIG_FILE },
        force: { type: 'boolean', short: 'f', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    io.err(USAGE);
    return 2;
  }

  const command = parsed.positionals[0];
  if (parsed.values.help || command === undefined) {
    io.out(USAGE);
    return command === undefined && !parsed.values.help ? 2 : 0;
  }
  if (!isCommand(command)) {
    io.err(`Unknown command "${command}".`);
    io.err(USAGE);
    return 2;
  }

  const configPath = String(parsed.values.config);
  switch (command) {
    case 'init':
      return runInit({ configPath, force: Boolean(parsed.values.force) }, io);
    case 'doctor':
      return runDoctor(configPath, io);
    case 'build':
      return runBuildCommand(configPath, io);
  }
}
