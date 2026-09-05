import { describe, expect, it } from 'vitest';

import { buildIdleClipTable, parseAnimNode, weaponTypeOf } from '../src/game/animSets.js';
import {
  bodyLocationId,
  parseAttachedLocationsLua,
  parseBodyLocationsLua,
} from '../src/game/lua.js';
import { parseScript } from '../src/game/scripts.js';

describe('body locations', () => {
  it('maps Lua arguments to resource ids', () => {
    expect(bodyLocationId('ItemBodyLocation.BELT_EXTRA')).toBe('base:beltextra');
    expect(bodyLocationId('ItemBodyLocation.PANTS')).toBe('base:pants');
    expect(bodyLocationId('"MyMod:Cape"')).toBe('mymod:cape');
    expect(bodyLocationId("'Cape'")).toBe('base:cape');
    expect(bodyLocationId('ItemBodyLocation.NOPE_NOT_REAL')).toBeUndefined();
    expect(bodyLocationId('someVariable')).toBeUndefined();
  });

  it('reads order, exclusivity, hiding, alternates, and multi-item flags', () => {
    const data = parseBodyLocationsLua(`
-- Locations must be declared in render-order.
local group = BodyLocations.getGroup("Human")
local other = BodyLocations.getGroup("Animal")

group:getOrCreateLocation(ItemBodyLocation.BANDAGE)
group:getOrCreateLocation(ItemBodyLocation.TSHIRT) -- TShirt/Vest (goes under shirt)
group:getOrCreateLocation(ItemBodyLocation.PANTS)
group:getOrCreateLocation(ItemBodyLocation.PANTS)
--group:getOrCreateLocation(ItemBodyLocation.HAT)
other:getOrCreateLocation(ItemBodyLocation.HAT)
group:getOrCreateLocation("MyMod:Cape")
--[[ group:setExclusive(ItemBodyLocation.PANTS, ItemBodyLocation.TSHIRT) ]]
group:setExclusive(ItemBodyLocation.SKIRT, ItemBodyLocation.PANTS)
group:setHideModel(ItemBodyLocation.FULL_SUIT, ItemBodyLocation.LEFT_WRIST)
group:setAltModel(ItemBodyLocation.JACKET, ItemBodyLocation.SHIRT)
group:setMultiItem(ItemBodyLocation.BELT_EXTRA, true)
group:setMultiItem(ItemBodyLocation.BELT, false)
`);
    expect(data.order).toEqual(['base:bandage', 'base:tshirt', 'base:pants', 'mymod:cape']);
    expect(data.exclusive).toEqual([['base:skirt', 'base:pants']]);
    expect(data.hides).toEqual([['base:fullsuit', 'base:leftwrist']]);
    expect(data.alt).toEqual([['base:jacket', 'base:shirt']]);
    expect(data.multiItem).toEqual(['base:beltextra']);
  });
});

describe('attached locations', () => {
  it('reads display names and attachment names for the Human group', () => {
    const locations = parseAttachedLocationsLua(`
local group = AttachedLocations.getGroup("Animal")
group:getOrCreateLocation("Saddle"):setAttachmentName("saddle")
group = AttachedLocations.getGroup("Human")
group:getOrCreateLocation("Rifle On Back"):setAttachmentName("rifle_back")
--group:getOrCreateLocation("Knife Belt Back"):setAttachmentName("knife_belt_back")
group:getOrCreateLocation("Holster Right"):setAttachmentName("holster_right")
`);
    expect(locations).toEqual({
      Saddle: 'saddle',
      'Rifle On Back': 'rifle_back',
      'Holster Right': 'holster_right',
    });
  });
});

describe('idle animation nodes', () => {
  const idle = `<animNode><m_Name>Idle</m_Name><m_AnimName>Bob_Idle</m_AnimName>
    <m_Conditions><m_Name>isTurning90</m_Name><m_Type>BOOL</m_Type><m_Value>false</m_Value></m_Conditions></animNode>`;
  const rifle = `<animNode x_extends="Idle.xml"><m_Name>IdleRifle</m_Name><m_AnimName>Bob_IdleRifle</m_AnimName>
    <m_Conditions x_name="a"><m_Name>Weapon</m_Name><m_Type>STRING</m_Type><m_Value>firearm</m_Value></m_Conditions></animNode>`;
  const sneak = `<animNode><m_Name>sneakIdleRifle</m_Name><m_AnimName>Bob_IdleSneak_Shotgun</m_AnimName>
    <m_Conditions><m_Name>Weapon</m_Name><m_Type>STRING</m_Type><m_Value>firearm</m_Value></m_Conditions></animNode>`;

  it('parses nodes and builds the clip table', () => {
    expect(parseAnimNode(rifle)).toEqual({
      name: 'IdleRifle',
      animName: 'Bob_IdleRifle',
      speed: 1,
      speedRandom: undefined,
      randomStart: undefined,
      looped: true,
      conditions: [{ name: 'Weapon', type: 'STRING', value: 'firearm' }],
      weapon: 'firearm',
    });
    expect(parseAnimNode('<other/>')).toBeUndefined();
    const nodes = [idle, rifle, sneak]
      .map((xml) => parseAnimNode(xml))
      .filter((n) => n !== undefined);
    expect(buildIdleClipTable(nodes)).toEqual({
      default: { clip: 'Bob_Idle', speed: 1 },
      byWeaponType: { firearm: { clip: 'Bob_IdleRifle', speed: 1 } },
    });
    const slow = parseAnimNode(
      '<animNode><m_Name>Idle</m_Name><m_AnimName>Bob_Idle</m_AnimName><m_SpeedScale>0.48</m_SpeedScale><m_SpeedScaleRandomMultiplierMin>0.2</m_SpeedScaleRandomMultiplierMin><m_SpeedScaleRandomMultiplierMax>1.25</m_SpeedScaleRandomMultiplierMax><m_randomAdvanceFraction>0.5</m_randomAdvanceFraction><m_Looped>false</m_Looped></animNode>',
    );
    expect(slow).toMatchObject({
      speed: 0.48,
      speedRandom: [0.2, 1.25],
      randomStart: 0.5,
      looped: false,
    });
    expect(buildIdleClipTable(slow ? [slow] : []).default).toEqual({
      clip: 'Bob_Idle',
      speed: 0.48,
      speedRandom: [0.2, 1.25],
      randomStart: 0.5,
    });
  });

  it('derives weapon types from item scripts', () => {
    const script = parseScript(`module Base {
      item Axe { SwingAnim = Bat, TwoHandWeapon = true, WeaponSprite = FireAxe, }
      item Hammer { SwingAnim = Bat, WeaponSprite = Hammer, }
      item Pistol { SwingAnim = Handgun, Ranged = true, WeaponSprite = Handgun03, }
      item Shotgun { SwingAnim = Rifle, Ranged = true, TwoHandWeapon = true, }
      item Knife { SwingAnim = Stab, }
      item Sledge { SwingAnim = Heavy, TwoHandWeapon = true, }
      item Spear { SwingAnim = Spear, }
      item Rock { SwingAnim = Throw, }
      item Chainsaw { Type = Chainsaw, SwingAnim = Bat, }
      item Book { DisplayCategory = Literature, }
    }`);
    const items = script[0]?.blocks ?? [];
    const types = items.map((block) => `${block.name}:${weaponTypeOf(block)}`);
    expect(types).toEqual([
      'Axe:2handed',
      'Hammer:1handed',
      'Pistol:handgun',
      'Shotgun:firearm',
      'Knife:knife',
      'Sledge:heavy',
      'Spear:spear',
      'Rock:throwing',
      'Chainsaw:chainsaw',
      'Book:unarmed',
    ]);
  });
});
