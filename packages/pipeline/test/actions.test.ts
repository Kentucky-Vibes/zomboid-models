import { describe, expect, it } from 'vitest';

import {
  buildActionTables,
  buildPlayerActionClips,
  buildZombieActionClips,
  PLAYER_ACTION_SOURCES,
  ZOMBIE_ACTION_SOURCES,
  type ActionSource,
  type StateLoader,
} from '../src/game/actions.js';
import { parseAnimNode } from '../src/game/animSets.js';

const cond = (name: string, type: string, value: string): string =>
  `<m_Conditions x_name="${name}-${value}"><m_Name>${name}</m_Name><m_Type>${type}</m_Type><m_Value>${value}</m_Value></m_Conditions>`;

/** A few files of the game's sets, trimmed to what the selection reads. */
const FILES: Record<string, Record<string, string>> = {
  'player/movement': {
    'defaultWalk.xml': `<animNode><m_Name>defaultWalk</m_Name><m_AnimName>Bob_Walk</m_AnimName>
      <m_SpeedScale>1.04</m_SpeedScale><m_Scalar>WalkInjury</m_Scalar><m_Scalar2>WalkSpeed</m_Scalar2>
      <m_2DBlends><m_AnimName>Bob_Walk</m_AnimName><m_XPos>0</m_XPos><m_YPos>1</m_YPos></m_2DBlends>
      <m_2DBlends><m_AnimName>Bob_WalkSlow</m_AnimName><m_XPos>0</m_XPos><m_YPos>0</m_YPos></m_2DBlends>
      <m_2DBlends><m_AnimName>Bob_WalkLimp</m_AnimName><m_XPos>1</m_XPos><m_YPos>1</m_YPos></m_2DBlends>
      <m_2DBlendTri><node1>1</node1><node2>2</node2><node3>3</node3></m_2DBlendTri>
      ${cond('isTurningAround', 'BOOL', 'false')}</animNode>`,
    'walk2handed.xml': `<animNode x_extends="defaultWalk.xml"><m_Name>walk2handed</m_Name><m_AnimName>Bob_WalkBat</m_AnimName>
      <m_2DBlends><m_AnimName>Bob_WalkBat</m_AnimName></m_2DBlends>
      <m_2DBlends><m_AnimName>Bob_WalkSlow_Bat</m_AnimName></m_2DBlends>
      ${cond('Weapon', 'STRING', '2handed')}</animNode>`,
    'sneakWalk.xml': `<animNode><m_Name>sneakWalk</m_Name><m_AnimName>Bob_WalkSneak</m_AnimName>
      <m_SpeedScale>sneakLimpSpeedScale</m_SpeedScale>
      ${cond('sneaking', 'BOOL', 'true')}${cond('inTrees', 'BOOL', 'false')}${cond('isTurningAround', 'BOOL', 'false')}</animNode>`,
  },
  'player/actions': {
    'Eat.xml': `<animNode><m_Name>Eat</m_Name><m_SpeedScale>0.80</m_SpeedScale>${cond('PerformingAction', 'STRING', 'eat')}</animNode>`,
    'Eat1Hand.xml': `<animNode x_extends="Eat.xml"><m_Name>Eat1Hand</m_Name><m_AnimName>Bob_IdleEating1Hand</m_AnimName></animNode>`,
    'EatFromCan.xml': `<animNode x_extends="Eat.xml"><m_Name>EatFromCan</m_Name><m_AnimName>Bob_IdleEatingFromCan</m_AnimName>
      <m_SpeedScale>1.20</m_SpeedScale>${cond('FoodType', 'STRING', 'can')}</animNode>`,
    'DrinkBottle.xml': `<animNode><m_Name>DrinkBottle</m_Name><m_AnimName>Bob_DrinkFromBottle</m_AnimName>${cond('PerformingAction', 'STRING', 'drink')}</animNode>`,
  },
  'zombie/walktoward': {
    'defaultWalktoward.xml': `<animNode><m_Name>defaultWalktoward</m_Name><m_SpeedScale>0.80</m_SpeedScale>
      <m_randomAdvanceFraction>0.25</m_randomAdvanceFraction>${cond('intrees', 'BOOL', 'false')}</animNode>`,
    'walktoward1.xml': `<animNode x_extends="defaultWalktoward.xml"><m_Name>walktoward1</m_Name><m_AnimName>Zombie_Walk</m_AnimName>
      <m_SpeedScale>0.92</m_SpeedScale>${cond('zombieWalkType', 'STRING', '1')}</animNode>`,
    'walktoward3.xml': `<animNode x_extends="defaultWalktoward.xml"><m_Name>walktoward3</m_Name><m_AnimName>Zombie_Walk3</m_AnimName>
      ${cond('zombieWalkType', 'STRING', '3')}</animNode>`,
  },
  'zombie/lunge': {
    'defaultLunge.xml': `<animNode><m_Name>defaultLunge</m_Name><m_SpeedScale>0.80</m_SpeedScale>${cond('intrees', 'BOOL', 'false')}</animNode>`,
    'lunge1.xml': `<animNode x_extends="defaultLunge.xml"><m_Name>lunge1</m_Name><m_AnimName>Zombie_Lunge</m_AnimName><m_SpeedScale>0.64</m_SpeedScale></animNode>`,
    'lunge2.xml': `<animNode x_extends="defaultLunge.xml"><m_Name>lunge2</m_Name><m_AnimName>Zombie_Walk5_Faster</m_AnimName>
      ${cond('zombieWalkType', 'STRING', '3')}</animNode>`,
  },
  'zombie/eatbody': {
    'eating.xml': `<animNode><m_Name>eating</m_Name><m_AnimName>Zombie_IdleEating</m_AnimName><m_SpeedScale>EatSpeed</m_SpeedScale>
      ${cond('EatingStarted', 'BOOL', 'true')}</animNode>`,
    'onKnees.xml': `<animNode x_extends="eating.xml"><m_Name>onKnees</m_Name><m_AnimName>Zombie_IdleEating_OnKnees</m_AnimName>
      ${cond('onknees', 'BOOL', 'true')}</animNode>`,
  },
};

const load: StateLoader = (animSet, state) => {
  const folder = FILES[`${animSet}/${state}`] ?? {};
  return Object.entries(folder).flatMap(([fileName, xml]) => {
    const node = parseAnimNode(xml, (name) => folder[name]);
    return node ? [{ fileName: fileName.slice(0, -4), node }] : [];
  });
};

describe('player action clips', () => {
  it('picks the weapon variant, resolves the blend, and keeps speed variables', () => {
    const walk = buildPlayerActionClips(load, PLAYER_ACTION_SOURCES.walk as ActionSource);
    expect(walk?.default).toEqual({
      clip: 'Bob_Walk',
      speed: 1.04,
      blend: [
        { clip: 'Bob_Walk', weight: expect.closeTo(0.8, 6) as number },
        { clip: 'Bob_WalkSlow', weight: expect.closeTo(0.2, 6) as number },
      ],
    });
    expect(walk?.byWeaponType?.['2handed']).toEqual({
      clip: 'Bob_WalkBat',
      speed: 1.04,
      blend: [
        { clip: 'Bob_WalkBat', weight: expect.closeTo(0.8, 6) as number },
        { clip: 'Bob_WalkSlow_Bat', weight: expect.closeTo(0.2, 6) as number },
      ],
    });
    // A weapon whose clip is the plain one is not listed; the viewer falls back to the default.
    expect(walk?.byWeaponType?.['heavy']).toBeUndefined();
    const sneak = buildPlayerActionClips(load, PLAYER_ACTION_SOURCES.sneak as ActionSource);
    expect(sneak?.default).toEqual({
      clip: 'Bob_WalkSneak',
      speed: 1,
      speedVariable: 'sneakLimpSpeedScale',
    });
  });

  it('takes the plain eating clip by default and the food type variants by name', () => {
    const eat = buildPlayerActionClips(load, PLAYER_ACTION_SOURCES.eat as ActionSource);
    expect(eat?.default).toEqual({ clip: 'Bob_IdleEating1Hand', speed: 0.8 });
    expect(eat?.byFoodType).toEqual({ can: { clip: 'Bob_IdleEatingFromCan', speed: 1.2 } });
    const drink = buildPlayerActionClips(load, PLAYER_ACTION_SOURCES.drink as ActionSource);
    expect(drink?.default?.clip).toBe('Bob_DrinkFromBottle');
  });
});

describe('zombie action clips', () => {
  it('gives one clip per gait and prefers the more specific lunge', () => {
    const lunge = buildZombieActionClips(load, {
      gaits: ['1', '3'],
      source: ZOMBIE_ACTION_SOURCES.lunge!.source,
    });
    expect(lunge?.byGait).toEqual([
      { clip: 'Zombie_Lunge', speed: 0.64 },
      { clip: 'Zombie_Walk5_Faster', speed: 0.8 },
    ]);
    const eat = buildZombieActionClips(load, ZOMBIE_ACTION_SOURCES.eat!);
    expect(eat?.default).toEqual({
      clip: 'Zombie_IdleEating_OnKnees',
      speed: 1,
      speedVariable: 'EatSpeed',
    });
  });

  it('reports the actions with no clip and builds the rest', () => {
    const warnings: string[] = [];
    const tables = buildActionTables(load, warnings);
    expect(tables.zombie.walk?.byGait).toBeUndefined();
    expect(warnings).toContain('no clip for the zombie action "walk"');
    expect(warnings).toContain('no clip for the crawler action "walk"');
    expect(tables.player.walk?.default?.clip).toBe('Bob_Walk');
    expect(tables.zombie.eat?.default?.clip).toBe('Zombie_IdleEating_OnKnees');
  });
});
