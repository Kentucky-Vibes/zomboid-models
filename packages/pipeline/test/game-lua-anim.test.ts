import { describe, expect, it } from 'vitest';

import {
  blendWeights,
  blendedClipOf,
  buildIdleClipTable,
  clipOf,
  conditionsHold,
  parseAnimNode,
  pickNode,
  weaponTypeOf,
  type AnimNode,
} from '../src/game/animSets.js';
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
      scalarX: undefined,
      scalarY: undefined,
      blends: [],
      triangles: [],
      speedVariable: undefined,
      priority: 0,
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

  it('reads 2D blends and weighs the clips at a point', () => {
    const walk = parseAnimNode(
      '<animNode><m_Name>defaultWalk</m_Name><m_AnimName>Bob_Walk</m_AnimName><m_SpeedScale>1.04</m_SpeedScale><m_Scalar>WalkInjury</m_Scalar><m_Scalar2>WalkSpeed</m_Scalar2><m_2DBlends><m_AnimName>Bob_WalkLightLimpR</m_AnimName><m_XPos>0.50</m_XPos><m_YPos>1.00</m_YPos></m_2DBlends><m_2DBlends><m_AnimName>Bob_Walk</m_AnimName><m_XPos>0.00</m_XPos><m_YPos>1.00</m_YPos></m_2DBlends><m_2DBlends><m_AnimName>Bob_WalkSlow</m_AnimName><m_XPos>0.00</m_XPos><m_YPos>0.00</m_YPos></m_2DBlends><m_2DBlendTri><node1>3</node1><node2>1</node2><node3>2</node3></m_2DBlendTri></animNode>',
    );
    expect(walk).toMatchObject({
      scalarX: 'WalkInjury',
      scalarY: 'WalkSpeed',
      blends: [
        { animName: 'Bob_WalkLightLimpR', x: 0.5, y: 1 },
        { animName: 'Bob_Walk', x: 0, y: 1 },
        { animName: 'Bob_WalkSlow', x: 0, y: 0 },
      ],
      triangles: [[2, 0, 1]],
    });
    if (!walk) return;
    expect(blendWeights(walk, 0, 0.8)).toEqual([
      { clip: 'Bob_Walk', weight: expect.closeTo(0.8, 6) as number },
      { clip: 'Bob_WalkSlow', weight: expect.closeTo(0.2, 6) as number },
    ]);
    expect(blendWeights(walk, 0.25, 1)).toEqual([
      { clip: 'Bob_WalkLightLimpR', weight: expect.closeTo(0.5, 6) as number },
      { clip: 'Bob_Walk', weight: expect.closeTo(0.5, 6) as number },
    ]);
    // Outside every triangle the nearest entry plays alone.
    expect(blendWeights(walk, -1, 1)).toEqual([{ clip: 'Bob_Walk', weight: 1 }]);
    expect(blendedClipOf(walk, 0, 0.8)).toEqual({
      clip: 'Bob_Walk',
      speed: 1.04,
      blend: [
        { clip: 'Bob_Walk', weight: expect.closeTo(0.8, 6) as number },
        { clip: 'Bob_WalkSlow', weight: expect.closeTo(0.2, 6) as number },
      ],
    });
    expect(blendedClipOf(walk, 0, 1)).toEqual({ clip: 'Bob_Walk', speed: 1.04 });
  });

  it('merges an extended node over its parent and keeps a speed variable', () => {
    const files: Record<string, string> = {
      'defaultWalktoward.xml': `<animNode><m_Name>defaultWalktoward</m_Name><m_SpeedScale>0.80</m_SpeedScale>
        <m_randomAdvanceFraction>0.25</m_randomAdvanceFraction>
        <m_Conditions x_name="a"><m_Name>intrees</m_Name><m_Type>BOOL</m_Type><m_Value>false</m_Value></m_Conditions>
        <m_2DBlends><m_AnimName>Base_A</m_AnimName><m_XPos>0</m_XPos><m_YPos>0</m_YPos></m_2DBlends>
        <m_2DBlends><m_AnimName>Base_B</m_AnimName><m_XPos>0</m_XPos><m_YPos>1</m_YPos></m_2DBlends></animNode>`,
      'walktoward1.xml': `<animNode x_extends="defaultWalktoward.xml"><m_Name>walktoward1</m_Name><m_AnimName>Zombie_Walk</m_AnimName>
        <m_SpeedScale>0.92</m_SpeedScale>
        <m_Conditions x_name="b"><m_Name>zombieWalkType</m_Name><m_Type>STRING</m_Type><m_Value>1</m_Value></m_Conditions>
        <m_2DBlends><m_AnimName>Child_A</m_AnimName></m_2DBlends></animNode>`,
      'sprintWalk1.xml': `<animNode x_extends="walktoward1.xml"><m_Name>sprintWalk1</m_Name>
        <m_Conditions x_name="b"><m_Name>zombieWalkType</m_Name><m_Type>STRING</m_Type><m_Value>sprint1</m_Value></m_Conditions></animNode>`,
      'eating.xml': `<animNode><m_Name>eating</m_Name><m_AnimName>Zombie_IdleEating</m_AnimName><m_SpeedScale>EatSpeed</m_SpeedScale></animNode>`,
    };
    const load = (name: string): string | undefined => files[name];
    const walk = parseAnimNode(files['walktoward1.xml'] as string, load);
    expect(walk).toMatchObject({
      name: 'walktoward1',
      animName: 'Zombie_Walk',
      speed: 0.92,
      randomStart: 0.25,
      conditions: [
        { name: 'intrees', type: 'BOOL', value: 'false' },
        { name: 'zombieWalkType', type: 'STRING', value: '1' },
      ],
      // Blend entries without a name replace the parent's entries at the same position.
      blends: [
        { animName: 'Child_A', x: 0, y: 0 },
        { animName: 'Base_B', x: 0, y: 1 },
      ],
    });
    const sprintWalk = parseAnimNode(files['sprintWalk1.xml'] as string, load);
    expect(sprintWalk?.conditions).toEqual([
      { name: 'intrees', type: 'BOOL', value: 'false' },
      { name: 'zombieWalkType', type: 'STRING', value: 'sprint1' },
    ]);
    expect(sprintWalk?.speed).toBe(0.92);
    const eating = parseAnimNode(files['eating.xml'] as string, load);
    expect(eating?.speed).toBe(1);
    expect(eating?.speedVariable).toBe('EatSpeed');
    expect(clipOf(eating as AnimNode, 'Zombie_IdleEating')).toEqual({
      clip: 'Zombie_IdleEating',
      speed: 1,
      speedVariable: 'EatSpeed',
    });
  });

  it('evaluates conditions as the game does and picks the most specific node', () => {
    const node = (name: string, conditions: string): AnimNode =>
      parseAnimNode(
        `<animNode><m_Name>${name}</m_Name><m_AnimName>${name}</m_AnimName>${conditions}</animNode>`,
      ) as AnimNode;
    const cond = (name: string, type: string, value: string): string =>
      `<m_Conditions><m_Name>${name}</m_Name><m_Type>${type}</m_Type><m_Value>${value}</m_Value></m_Conditions>`;
    const plain = node('plain', cond('intrees', 'BOOL', 'false'));
    const walk3 = node(
      'walk3',
      cond('intrees', 'BOOL', 'false') + cond('zombieWalkType', 'STRING', '3'),
    );
    const far = node('far', cond('targetSeenTime', 'GTR', '0.5'));
    const notKnife = node(
      'notKnife',
      cond('Weapon', 'STRNEQ', 'knife') + cond('Weapon', 'STRING', ''),
    );
    const either = node(
      'either',
      cond('Weapon', 'STRING', '') +
        cond('Aim', 'BOOL', 'false') +
        cond('', 'OR', '') +
        cond('Weapon', 'STRING', '1handed') +
        cond('Aim', 'BOOL', 'false'),
    );
    // Unset variables read as false and as the empty string; numeric tests need a value.
    expect(conditionsHold(plain, {})).toBe(true);
    expect(conditionsHold(walk3, { ZombieWalkType: '3' })).toBe(true);
    expect(conditionsHold(far, {})).toBe(false);
    expect(conditionsHold(far, { targetSeenTime: '1' })).toBe(true);
    expect(conditionsHold(notKnife, {})).toBe(true);
    expect(conditionsHold(notKnife, { Weapon: 'knife' })).toBe(false);
    expect(conditionsHold(either, { Weapon: '1handed' })).toBe(true);
    expect(conditionsHold(either, { Weapon: '2handed' })).toBe(false);
    const nodes = [plain, walk3, far].map((n) => ({ fileName: n.name, node: n }));
    expect(pickNode(nodes, { intrees: 'false', zombieWalkType: '3' })?.name).toBe('walk3');
    expect(pickNode(nodes, { intrees: 'false', zombieWalkType: '1' })?.name).toBe('plain');
    expect(pickNode(nodes, { intrees: 'true' })).toBeUndefined();
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
