/**
 * Parser for the game's script files (`media/scripts/**\/*.txt`): nested blocks such as
 * `module Base { item Axe { key = value, } }`. The result is a plain tree; what the blocks mean
 * is decided by the readers that consume them.
 */

export interface ScriptEntry {
  /** Key before the `=`, or the whole line when there is no `=` (recipe lines). */
  key: string;
  value: string;
}

export interface ScriptBlock {
  /** Block type such as `module`, `item`, `model`, `attachment`. */
  type: string;
  /** Block name, or an empty string for unnamed blocks such as `imports`. */
  name: string;
  entries: ScriptEntry[];
  blocks: ScriptBlock[];
  line: number;
}

export class ScriptSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
    this.name = 'ScriptSyntaxError';
  }
}

class Reader {
  pos = 0;
  line = 1;

  constructor(private readonly text: string) {}

  get done(): boolean {
    return this.pos >= this.text.length;
  }

  peek(offset = 0): string {
    return this.text[this.pos + offset] ?? '';
  }

  advance(count = 1): void {
    for (let i = 0; i < count && this.pos < this.text.length; i++) {
      if (this.text[this.pos] === '\n') this.line++;
      this.pos++;
    }
  }

  skipSpaceAndComments(): void {
    for (;;) {
      const c = this.peek();
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        this.advance();
      } else if (c === '/' && this.peek(1) === '*') {
        const end = this.text.indexOf('*/', this.pos + 2);
        this.advance((end < 0 ? this.text.length : end + 2) - this.pos);
      } else if (c === '/' && this.peek(1) === '/') {
        const end = this.text.indexOf('\n', this.pos);
        this.advance((end < 0 ? this.text.length : end) - this.pos);
      } else {
        return;
      }
    }
  }

  /** Reads up to (not including) the first of the given characters, skipping comments. */
  readUntil(stops: string): string {
    let out = '';
    while (!this.done) {
      const c = this.peek();
      if (stops.includes(c)) break;
      if (c === '/' && (this.peek(1) === '*' || this.peek(1) === '/')) {
        this.skipSpaceAndComments();
        out += ' ';
        continue;
      }
      out += c;
      this.advance();
    }
    return out;
  }
}

function parseHeader(header: string, line: number): { type: string; name: string } {
  const trimmed = header.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    throw new ScriptSyntaxError('block without a type', line);
  }
  const space = trimmed.indexOf(' ');
  if (space < 0) return { type: trimmed, name: '' };
  return { type: trimmed.slice(0, space), name: trimmed.slice(space + 1).trim() };
}

function parseEntry(text: string): ScriptEntry {
  const eq = text.indexOf('=');
  if (eq < 0) return { key: text.trim(), value: '' };
  return { key: text.slice(0, eq).trim(), value: text.slice(eq + 1).trim() };
}

function parseBody(reader: Reader, block: ScriptBlock): void {
  for (;;) {
    reader.skipSpaceAndComments();
    if (reader.done) {
      throw new ScriptSyntaxError(`unterminated block "${block.type} ${block.name}"`, block.line);
    }
    if (reader.peek() === '}') {
      reader.advance();
      return;
    }
    const startLine = reader.line;
    const text = reader.readUntil('{},');
    const stop = reader.peek();
    if (stop === '{') {
      reader.advance();
      const { type, name } = parseHeader(text, startLine);
      const child: ScriptBlock = { type, name, entries: [], blocks: [], line: startLine };
      parseBody(reader, child);
      block.blocks.push(child);
    } else {
      if (stop === ',') reader.advance();
      const trimmed = text.trim();
      if (trimmed.length > 0) block.entries.push(parseEntry(trimmed));
    }
  }
}

/** Parses one script file into its top-level blocks (normally a single `module`). */
export function parseScript(text: string): ScriptBlock[] {
  const reader = new Reader(text.replace(/^FEFF/, ''));
  const root: ScriptBlock = { type: '', name: '', entries: [], blocks: [], line: 1 };
  for (;;) {
    reader.skipSpaceAndComments();
    if (reader.done) break;
    const startLine = reader.line;
    const header = reader.readUntil('{');
    if (reader.done) {
      throw new ScriptSyntaxError(`expected "{" after "${header.trim()}"`, startLine);
    }
    reader.advance();
    const { type, name } = parseHeader(header, startLine);
    const block: ScriptBlock = { type, name, entries: [], blocks: [], line: startLine };
    parseBody(reader, block);
    root.blocks.push(block);
  }
  return root.blocks;
}

/** Returns the value of the first entry with the key, compared case-insensitively. */
export function entryValue(block: ScriptBlock, key: string): string | undefined {
  const lower = key.toLowerCase();
  return block.entries.find((e) => e.key.toLowerCase() === lower)?.value;
}

/** Returns the values of every entry with the key, compared case-insensitively. */
export function entryValues(block: ScriptBlock, key: string): string[] {
  const lower = key.toLowerCase();
  return block.entries.filter((e) => e.key.toLowerCase() === lower).map((e) => e.value);
}
