import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export interface SteamInstalls {
  /** Game client folders that exist, one per Steam library. */
  clients: string[];
  /** Dedicated server folders that exist. */
  servers: string[];
  /** Workshop content folders (`steamapps/workshop/content/108600`) that exist. */
  workshop: string[];
}

const CLIENT_FOLDER = 'ProjectZomboid';
const SERVER_FOLDER = 'Project Zomboid Dedicated Server';
const WORKSHOP_APP_ID = '108600';

/** Candidate `libraryfolders.vdf` locations for the current platform. */
export function libraryFoldersCandidates(): string[] {
  const home = homedir();
  switch (platform()) {
    case 'win32':
      return [
        join(
          process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
          'Steam',
          'steamapps',
          'libraryfolders.vdf',
        ),
        join(
          process.env['ProgramFiles'] ?? 'C:\\Program Files',
          'Steam',
          'steamapps',
          'libraryfolders.vdf',
        ),
      ];
    case 'darwin':
      return [
        join(home, 'Library', 'Application Support', 'Steam', 'steamapps', 'libraryfolders.vdf'),
      ];
    default:
      return [
        join(home, '.steam', 'steam', 'steamapps', 'libraryfolders.vdf'),
        join(home, '.local', 'share', 'Steam', 'steamapps', 'libraryfolders.vdf'),
        join(
          home,
          '.var',
          'app',
          'com.valvesoftware.Steam',
          '.local',
          'share',
          'Steam',
          'steamapps',
          'libraryfolders.vdf',
        ),
      ];
  }
}

/** Extracts the library paths from a `libraryfolders.vdf` file. */
export function parseLibraryFolders(vdf: string): string[] {
  const paths: string[] = [];
  for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
    paths.push((match[1] as string).replace(/\\\\/g, '\\'));
  }
  return paths;
}

/** Finds Project Zomboid installs in every Steam library on this machine. */
export function findSteamInstalls(candidates = libraryFoldersCandidates()): SteamInstalls {
  const installs: SteamInstalls = { clients: [], servers: [], workshop: [] };
  const libraries = new Set<string>();
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    libraries.add(join(candidate, '..', '..'));
    for (const path of parseLibraryFolders(readFileSync(candidate, 'utf8'))) libraries.add(path);
  }
  for (const library of libraries) {
    const client = join(library, 'steamapps', 'common', CLIENT_FOLDER);
    const server = join(library, 'steamapps', 'common', SERVER_FOLDER);
    const workshop = join(library, 'steamapps', 'workshop', 'content', WORKSHOP_APP_ID);
    if (existsSync(join(client, 'media'))) installs.clients.push(client);
    if (existsSync(join(server, 'media'))) installs.servers.push(server);
    if (existsSync(workshop)) installs.workshop.push(workshop);
  }
  return installs;
}
