/**
 * Creates a GitHub release for every package tag that points at HEAD and has none yet, with
 * the matching section of the package's CHANGELOG.md as its notes. Run after `changeset publish`
 * has created the tags (and after they are pushed). Needs the `gh` command and a token.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

/** The folder of the package with this name, found through the workspace package.json files. */
function packageFolder(name) {
  for (const folder of readdirSync('packages')) {
    const file = join('packages', folder, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (pkg.name === name) return join('packages', folder);
  }
  return undefined;
}

/** The changelog section of one version: from its heading to the next version heading. */
function changelogSection(folder, version) {
  const file = join(folder, 'CHANGELOG.md');
  if (!existsSync(file)) return '';
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start < 0) return '';
  let end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  if (end < 0) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

const tags = run('git', ['tag', '--points-at', 'HEAD'])
  .split('\n')
  .map((tag) => tag.trim())
  .filter((tag) => /^[a-z0-9-]+@\d+\.\d+\.\d+$/.test(tag));

const existing = new Set(
  run('gh', ['release', 'list', '--limit', '200', '--json', 'tagName', '--jq', '.[].tagName'])
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean),
);

for (const tag of tags) {
  if (existing.has(tag)) {
    console.log(`${tag}: release exists`);
    continue;
  }
  const at = tag.lastIndexOf('@');
  const name = tag.slice(0, at);
  const version = tag.slice(at + 1);
  const folder = packageFolder(name);
  const notes = folder ? changelogSection(folder, version) : '';
  const notesFile = join(tmpdir(), `${tag.replace('@', '-')}-notes.md`);
  writeFileSync(notesFile, notes || `${name} ${version}.`);
  run('gh', ['release', 'create', tag, '--title', tag, '--notes-file', notesFile]);
  console.log(`${tag}: release created`);
}
