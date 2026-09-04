/**
 * Tokenizer for the text form of DirectX .x files (`xof 0303txt 0032`).
 *
 * Tokens are braces, identifiers, quoted strings, numbers, `<uuid>` literals, and the brackets
 * and ellipses of template declarations. The separators `;` and `,` carry no structure because
 * every array in the format is preceded by its length, so they are treated as whitespace.
 * Comments start with `//` or `#` and run to the end of the line.
 */

export type TokenType = 'open' | 'close' | 'ident' | 'string' | 'number' | 'uuid' | 'punct';

export interface Token {
  type: TokenType;
  /** Raw text of the token, without quotes for strings and without angle brackets for uuids. */
  text: string;
  line: number;
}

export class XSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
    this.name = 'XSyntaxError';
  }
}

const HEADER_LENGTH = 16;

function isIdentStart(code: number): boolean {
  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  );
}

function isIdentPart(code: number): boolean {
  return isIdentStart(code) || (code >= 48 && code <= 57) || code === 45; // digits and -
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isNumberPart(code: number): boolean {
  return isDigit(code) || code === 46 || code === 45 || code === 43 || code === 101 || code === 69; // . - + e E
}

/** Splits the text of a .x file into tokens. The 16-byte `xof` header is skipped. */
export function tokenize(text: string): Token[] {
  if (!text.startsWith('xof ')) {
    throw new XSyntaxError('missing xof header', 1);
  }
  const tokens: Token[] = [];
  let pos = HEADER_LENGTH;
  let line = 1;
  const length = text.length;

  while (pos < length) {
    const code = text.charCodeAt(pos);

    if (code === 10) {
      line++;
      pos++;
      continue;
    }
    if (code === 32 || code === 9 || code === 13 || code === 59 || code === 44) {
      pos++;
      continue;
    }
    if (code === 47 && text.charCodeAt(pos + 1) === 47) {
      pos = skipLine(text, pos);
      continue;
    }
    if (code === 35) {
      pos = skipLine(text, pos);
      continue;
    }
    if (code === 123) {
      tokens.push({ type: 'open', text: '{', line });
      pos++;
      continue;
    }
    if (code === 125) {
      tokens.push({ type: 'close', text: '}', line });
      pos++;
      continue;
    }
    // Brackets and ellipses only occur inside template declarations, which the parser skips.
    if (code === 91 || code === 93) {
      tokens.push({ type: 'punct', text: text[pos] as string, line });
      pos++;
      continue;
    }
    if (code === 46 && !isDigit(text.charCodeAt(pos + 1))) {
      let end = pos + 1;
      while (end < length && text.charCodeAt(end) === 46) end++;
      tokens.push({ type: 'punct', text: text.slice(pos, end), line });
      pos = end;
      continue;
    }
    if (code === 34) {
      const end = text.indexOf('"', pos + 1);
      if (end < 0) {
        throw new XSyntaxError('unterminated string', line);
      }
      tokens.push({ type: 'string', text: text.slice(pos + 1, end), line });
      pos = end + 1;
      continue;
    }
    if (code === 60) {
      const end = text.indexOf('>', pos + 1);
      if (end < 0) {
        throw new XSyntaxError('unterminated uuid', line);
      }
      tokens.push({ type: 'uuid', text: text.slice(pos + 1, end), line });
      pos = end + 1;
      continue;
    }
    if (isDigit(code) || ((code === 45 || code === 46) && isDigit(text.charCodeAt(pos + 1)))) {
      let end = pos + 1;
      while (end < length && isNumberPart(text.charCodeAt(end))) end++;
      tokens.push({ type: 'number', text: text.slice(pos, end), line });
      pos = end;
      continue;
    }
    if (isIdentStart(code)) {
      let end = pos + 1;
      while (end < length && isIdentPart(text.charCodeAt(end))) end++;
      tokens.push({ type: 'ident', text: text.slice(pos, end), line });
      pos = end;
      continue;
    }
    throw new XSyntaxError(`unexpected character "${text[pos] as string}"`, line);
  }
  return tokens;
}

function skipLine(text: string, pos: number): number {
  const end = text.indexOf('\n', pos);
  return end < 0 ? text.length : end;
}
