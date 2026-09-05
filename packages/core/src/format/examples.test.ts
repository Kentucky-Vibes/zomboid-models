/**
 * Every document under docs/examples has to pass both the JSON Schema and the runtime
 * validator. The folder holds documents produced by the reference exporter mod inside the game,
 * so this is the closest thing to an end-to-end test of the format that runs without the game.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { validateCharacterDescription } from './validate.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, '../../../../docs/examples');
const schemaPath = join(here, '../../schema/character.schema.json');

const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const examples = readdirSync(examplesDir).filter((name) => name.endsWith('.json'));

describe('docs/examples', () => {
  it('contains at least one document', () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples)('%s passes the schema and the runtime validator', (name) => {
    const document = JSON.parse(readFileSync(join(examplesDir, name), 'utf8')) as unknown;
    expect(validateSchema(document), JSON.stringify(validateSchema.errors)).toBe(true);
    const result = validateCharacterDescription(document);
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });
});
