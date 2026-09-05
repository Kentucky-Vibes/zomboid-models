import { runCli } from './cliRun.js';

process.exitCode = await runCli(process.argv.slice(2));
