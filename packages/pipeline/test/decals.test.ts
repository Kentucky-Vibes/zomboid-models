import { describe, expect, it } from 'vitest';

import { parseDecalGroupsXml, parseDecalXml } from '../src/game/decalsXml.js';

describe('decal XML', () => {
  it('parses groups and decals', () => {
    expect(
      parseDecalGroupsXml(
        '<clothingDecals><group><name>TShirtSpiffo</name><decal>TShirtSpiffo1</decal><decal>TShirtSpiffo2</decal></group><group><name>Empty</name></group></clothingDecals>',
      ),
    ).toEqual({ TShirtSpiffo: ['TShirtSpiffo1', 'TShirtSpiffo2'], Empty: [] });
    expect(
      parseDecalXml(
        '<clothingDecal><texture>shirtdecals/spiffo7</texture><x>102</x><y>118</y><width>52</width><height>52</height></clothingDecal>',
      ),
    ).toEqual({ texture: 'shirtdecals/spiffo7', x: 102, y: 118, width: 52, height: 52 });
  });

  it('rejects decals without a texture or with bad numbers', () => {
    expect(() => parseDecalXml('<clothingDecal><x>1</x></clothingDecal>')).toThrow('no texture');
    expect(() =>
      parseDecalXml('<clothingDecal><texture>t</texture><x>a</x></clothingDecal>'),
    ).toThrow('"x" is not a number');
  });
});
