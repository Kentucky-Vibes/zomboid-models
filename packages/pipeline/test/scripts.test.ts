import { describe, expect, it } from 'vitest';

import { entryValue, entryValues, parseScript, ScriptSyntaxError } from '../src/game/scripts.js';

const SAMPLE = `/* header comment */
module Base
{
    imports
    {
        Base
    }

    item Trousers_Denim
    {
        DisplayCategory = Clothing,
        ItemType = base:clothing,
        BloodLocation = Trousers,
        BodyLocation = base:pants,
        ClothingItem = Trousers_Denim,
        IconsForTexture = TrousersDenimBlue;TrousersDenimBlack,
    }

    model FireAxe
    {
        mesh = weapons/2handed/FireAxe, // trailing comment
        attachment world
        {
            offset = 0.0179 0.173 -0.007,
            rotate = 180.0 -21.0 180.0,
        }
        attachment Bip01_Prop2
        {
            offset = 0.0 0.0 0.0,
        }
    }

    craftRecipe Make_Plank
    {
        inputs
        {
            item 1 Base.Log,
        }
    }
}
`;

describe('parseScript', () => {
  it('parses modules, blocks, entries, nested blocks, and comments', () => {
    const blocks = parseScript(SAMPLE);
    expect(blocks).toHaveLength(1);
    const module = blocks[0];
    expect(module?.type).toBe('module');
    expect(module?.name).toBe('Base');
    expect(module?.blocks.map((b) => `${b.type}:${b.name}`)).toEqual([
      'imports:',
      'item:Trousers_Denim',
      'model:FireAxe',
      'craftRecipe:Make_Plank',
    ]);

    const imports = module?.blocks[0];
    expect(imports?.entries).toEqual([{ key: 'Base', value: '' }]);

    const item = module?.blocks[1];
    expect(item?.line).toBe(9);
    expect(entryValue(item as NonNullable<typeof item>, 'bodylocation')).toBe('base:pants');
    expect(entryValue(item as NonNullable<typeof item>, 'IconsForTexture')).toBe(
      'TrousersDenimBlue;TrousersDenimBlack',
    );

    const model = module?.blocks[2];
    expect(entryValue(model as NonNullable<typeof model>, 'mesh')).toBe('weapons/2handed/FireAxe');
    expect(model?.blocks.map((b) => b.name)).toEqual(['world', 'Bip01_Prop2']);
    expect(entryValues(model?.blocks[0] as NonNullable<typeof model>, 'offset')).toEqual([
      '0.0179 0.173 -0.007',
    ]);

    const recipe = module?.blocks[3];
    expect(recipe?.blocks[0]?.entries).toEqual([{ key: 'item 1 Base.Log', value: '' }]);
  });

  it('tolerates a byte order mark and missing trailing commas', () => {
    const blocks = parseScript('﻿module M { item A { X = 1 } }');
    expect(blocks[0]?.blocks[0]?.entries).toEqual([{ key: 'X', value: '1' }]);
  });

  it('reports unterminated blocks and missing braces', () => {
    expect(() => parseScript('module M { item A { X = 1, }')).toThrow(ScriptSyntaxError);
    expect(() => parseScript('module M { item A { X = 1, }')).toThrow(
      'unterminated block "module M"',
    );
    expect(() => parseScript('module M')).toThrow('expected "{" after "module M"');
  });
});
