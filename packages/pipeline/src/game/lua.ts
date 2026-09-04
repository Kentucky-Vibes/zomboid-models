import { BODY_LOCATION_IDS } from './bodyLocationIds.js';

/**
 * Readers for the two Lua data files that declare clothing slots and attachment points. The
 * files are lists of method calls on a group object, so a small pattern match is enough; no Lua
 * interpreter is involved.
 */

export interface BodyLocationsData {
  /** Location ids in declaration order, which is the render order. */
  order: string[];
  /** Pairs that cannot be worn together (declared once, symmetric). */
  exclusive: [string, string][];
  /** Wearing the first hides the model worn at the second. */
  hides: [string, string][];
  /** Wearing the first switches the item at the second to its alternate model. */
  alt: [string, string][];
  /** Locations that hold several items at once. */
  multiItem: string[];
}

/** Removes `--` line comments and `--[[ ]]` block comments. */
export function stripLuaComments(text: string): string {
  return text.replace(/--\[\[[\s\S]*?\]\]/g, ' ').replace(/--[^\n]*/g, '');
}

/**
 * Turns a location argument as written in Lua into a resource id: `ItemBodyLocation.BELT_EXTRA`
 * becomes `base:beltextra`, a string literal is lowercased and gets the `base:` namespace when it
 * has none.
 */
export function bodyLocationId(argument: string): string | undefined {
  const trimmed = argument.trim();
  const constant = /^ItemBodyLocation\.([A-Z0-9_]+)$/.exec(trimmed);
  if (constant) return BODY_LOCATION_IDS[constant[1] as string];
  const literal = /^["']([^"']+)["']$/.exec(trimmed);
  if (literal) {
    const id = (literal[1] as string).toLowerCase();
    return id.includes(':') ? id : `base:${id}`;
  }
  return undefined;
}

/** Finds the local variable names bound to `<Registry>.getGroup("<name>")`. */
function groupVariables(text: string, registry: string, group: string): string[] {
  const pattern = new RegExp(
    `(?:local\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${registry}\\.getGroup\\(\\s*["']${group}["']\\s*\\)`,
    'g',
  );
  const names = new Set<string>();
  for (const match of text.matchAll(pattern)) names.add(match[1] as string);
  return [...names];
}

function callArguments(text: string, variables: string[], method: string): string[][] {
  if (variables.length === 0) return [];
  const pattern = new RegExp(
    `\\b(?:${variables.map((v) => v.replace(/[$]/g, '\\$')).join('|')})\\s*:\\s*${method}\\s*\\(([^)]*)\\)`,
    'g',
  );
  return [...text.matchAll(pattern)].map((match) =>
    (match[1] as string).split(',').map((argument) => argument.trim()),
  );
}

/** Parses `BodyLocations.lua` for one group (`Human` by default). */
export function parseBodyLocationsLua(text: string, group = 'Human'): BodyLocationsData {
  const source = stripLuaComments(text);
  const variables = groupVariables(source, 'BodyLocations', group);
  const data: BodyLocationsData = { order: [], exclusive: [], hides: [], alt: [], multiItem: [] };
  const pair = (args: string[]): [string, string] | undefined => {
    const a = bodyLocationId(args[0] ?? '');
    const b = bodyLocationId(args[1] ?? '');
    return a !== undefined && b !== undefined ? [a, b] : undefined;
  };
  for (const args of callArguments(source, variables, 'getOrCreateLocation')) {
    const id = bodyLocationId(args[0] ?? '');
    if (id !== undefined && !data.order.includes(id)) data.order.push(id);
  }
  for (const args of callArguments(source, variables, 'setExclusive')) {
    const ids = pair(args);
    if (ids) data.exclusive.push(ids);
  }
  for (const args of callArguments(source, variables, 'setHideModel')) {
    const ids = pair(args);
    if (ids) data.hides.push(ids);
  }
  for (const args of callArguments(source, variables, 'setAltModel')) {
    const ids = pair(args);
    if (ids) data.alt.push(ids);
  }
  for (const args of callArguments(source, variables, 'setMultiItem')) {
    const id = bodyLocationId(args[0] ?? '');
    if (id !== undefined && (args[1] ?? '').trim() === 'true') data.multiItem.push(id);
  }
  return data;
}

/** Parses `AttachedLocations.lua` for one group into display name to attachment name. */
export function parseAttachedLocationsLua(text: string, group = 'Human'): Record<string, string> {
  const source = stripLuaComments(text);
  const variables = groupVariables(source, 'AttachedLocations', group);
  if (variables.length === 0) return {};
  const pattern = new RegExp(
    `\\b(?:${variables.join('|')})\\s*:\\s*getOrCreateLocation\\(\\s*["']([^"']+)["']\\s*\\)\\s*:\\s*setAttachmentName\\(\\s*["']([^"']+)["']\\s*\\)`,
    'g',
  );
  const locations: Record<string, string> = {};
  for (const match of source.matchAll(pattern)) {
    locations[match[1] as string] = match[2] as string;
  }
  return locations;
}
