/**
 * The clips of the actions a document can ask for, picked from the game's animation sets the
 * way the game picks them: each action is a set of animation variables, and the node of the
 * state whose conditions hold for those variables wins. Players get a variant per weapon type
 * (the `Weapon` variable) and per food type; zombies get one per gait, the `zombieWalkType`
 * the game rolls for each zombie.
 */
import type {
  CharacterAction,
  ManifestActionClips,
  ManifestClip,
  ManifestWeaponType,
} from 'zomboid-models/format';

import { blendedClipOf, pickNode, type AnimNode, type WeaponType } from './animSets.js';

export type StateNodes = { fileName: string; node: AnimNode }[];

/** Loads the nodes of one state of an animation set; `recursive` includes its subfolders. */
export type StateLoader = (animSet: string, state: string, recursive?: boolean) => StateNodes;

/** The variables the game would hold for the character while it performs one action. */
export interface ActionSource {
  animSet: string;
  /** The state folders searched; the game's state machine reaches these for the action. */
  states: string[];
  recursive?: boolean;
  variables: Record<string, string>;
  /** Where the character sits in a node's 2D blend: the values of its scalar variables. */
  scalars?: Record<string, number>;
}

const WEAPON_TYPES: WeaponType[] = [
  'unarmed',
  '1handed',
  '2handed',
  'heavy',
  'knife',
  'spear',
  'handgun',
  'firearm',
  'throwing',
  'chainsaw',
];

/** A healthy, uninjured player: the 2D blends of walking and running sit at these points. */
const HEALTHY_SCALARS = { WalkInjury: 0, WalkSpeed: 0.8, verticalAimAngle: 0 };

/** The variables a player has when nothing in particular is going on. */
const PLAYER_BASE: Record<string, string> = {
  isTurningAround: 'false',
  isTurning90: 'false',
  inTrees: 'false',
  nearWallCrouching: 'false',
  sneaking: 'false',
};

function playerSource(
  states: string[],
  variables: Record<string, string>,
  options: { recursive?: boolean; scalars?: Record<string, number> } = {},
): ActionSource {
  return {
    animSet: 'player',
    states,
    ...(options.recursive ? { recursive: true } : {}),
    variables: { ...PLAYER_BASE, ...variables },
    scalars: { ...HEALTHY_SCALARS, ...options.scalars },
  };
}

/**
 * The player's actions, by weapon type where the sets vary. Attacks are the plain hit of each
 * weapon (`AttackType` default, no critical, target standing) or the shot of a loaded firearm
 * in its default fire mode; sitting and lying are the looped poses once the transition is over.
 */
export const PLAYER_ACTION_SOURCES: Partial<Record<CharacterAction, ActionSource>> = {
  walk: playerSource(['movement'], {}),
  sneak: playerSource(['movement'], { sneaking: 'true' }),
  run: playerSource(['run'], {}),
  sprint: playerSource(['sprint'], { beensprintingfor: '0' }),
  aim: playerSource(['aim'], {}),
  attack: playerSource(
    ['melee', 'ranged'],
    {
      AimFloorAnim: 'false',
      CriticalHit: 'false',
      AttackType: 'default',
      AttackFromBehind: 'false',
      bDoShove: 'false',
      RangedWeaponEmpty: 'false',
      FireMode: '',
    },
    { recursive: true, scalars: { AttackVariationX: 0, AttackVariationY: 0, recoilVarY: 0 } },
  ),
  sitChair: playerSource(
    ['sitonfurniture'],
    { SitOnFurnitureAnim: 'Idle', SitOnFurnitureStarted: 'true', SitOnFurnitureDirection: 'Front' },
    { recursive: true },
  ),
  sleep: playerSource(['onbed'], { OnBedAnim: 'Asleep', OnBedStarted: 'true' }),
  lieAwake: playerSource(['onbed'], { OnBedAnim: 'Awake', OnBedStarted: 'true' }),
  eat: playerSource(['actions'], { PerformingAction: 'eat', FoodType: '' }),
  drink: playerSource(['actions'], { PerformingAction: 'drink', FoodType: '' }),
  drive: { animSet: 'player-vehicle', states: ['idle'], variables: {} },
};

/** The walk types `IsoZombie` rolls for a fast shambler, the default zombie of a new game. */
export const ZOMBIE_GAITS = ['1', '2', '3', '4', '5'];
/** The walk types of a sprinter. */
export const SPRINTER_GAITS = ['sprint1', 'sprint2', 'sprint3', 'sprint4', 'sprint5'];
/** The crawler types, `crawlerType` 1 and 2. */
export const CRAWLER_TYPES = ['1', '2'];

function zombieSource(
  state: string,
  variables: Record<string, string>,
  animSet = 'zombie',
): ActionSource {
  return { animSet, states: [state], variables };
}

/** A zombie's actions by gait: the node the walk type selects in each state. */
export const ZOMBIE_ACTION_SOURCES: Partial<
  Record<CharacterAction, { gaits: string[]; source: (gait: string) => ActionSource }>
> = {
  walk: {
    gaits: ZOMBIE_GAITS,
    source: (gait) => zombieSource('walktoward', { intrees: 'false', zombieWalkType: gait }),
  },
  sprint: {
    gaits: SPRINTER_GAITS,
    source: (gait) =>
      zombieSource('walktoward', {
        intrees: 'false',
        bhastarget: 'true',
        shouldSprint: 'true',
        zombieWalkType: gait,
      }),
  },
  lunge: {
    gaits: ZOMBIE_GAITS,
    source: (gait) => zombieSource('lunge', { intrees: 'false', zombieWalkType: gait }),
  },
  attack: {
    gaits: ['bite'],
    source: () =>
      zombieSource('attack', {
        AttackType: 'bite',
        AttackOutcome: 'start',
        bHasTarget: 'true',
        targetSeenTime: '1',
      }),
  },
  eat: {
    gaits: ['kneeling'],
    source: () => zombieSource('eatbody', { EatingStarted: 'true', onknees: 'true' }),
  },
};

/** A crawling zombie's actions by crawler type. */
export const CRAWLER_ACTION_SOURCES: Partial<
  Record<CharacterAction, { gaits: string[]; source: (gait: string) => ActionSource }>
> = {
  walk: {
    gaits: CRAWLER_TYPES,
    source: (type) =>
      zombieSource('pathfind', { bMoving: 'true', CrawlerType: type }, 'zombie-crawler'),
  },
};

/** The nodes of every state of a source, in state order. */
function sourceNodes(load: StateLoader, source: ActionSource): StateNodes {
  return source.states.flatMap((state) => load(source.animSet, state, source.recursive === true));
}

/** The clip the game would play for a source, with its 2D blend resolved at the scalars. */
export function resolveActionClip(
  load: StateLoader,
  source: ActionSource,
  extra: Record<string, string> = {},
): ManifestClip | undefined {
  const node = pickNode(sourceNodes(load, source), { ...source.variables, ...extra });
  if (!node) return undefined;
  const scalars = source.scalars ?? {};
  const x = node.scalarX === undefined ? 0 : (scalars[node.scalarX] ?? 0);
  const y = node.scalarY === undefined ? 0 : (scalars[node.scalarY] ?? 0);
  return blendedClipOf(node, x, y);
}

/** The value of the game's `Weapon` variable for a weapon type: unarmed is the empty string. */
export function weaponVariable(weaponType: WeaponType): string {
  return weaponType === 'unarmed' ? '' : weaponType;
}

/** The player's clips for one action: the unarmed clip as the default, plus each weapon type. */
export function buildPlayerActionClips(
  load: StateLoader,
  source: ActionSource,
): ManifestActionClips | undefined {
  const clips: ManifestActionClips = {};
  const same = (clip: ManifestClip): boolean =>
    clips.default !== undefined && JSON.stringify(clip) === JSON.stringify(clips.default);
  for (const weaponType of WEAPON_TYPES) {
    const clip = resolveActionClip(load, source, { Weapon: weaponVariable(weaponType) });
    if (!clip) continue;
    if (weaponType === 'unarmed') clips.default = clip;
    else if (!same(clip)) (clips.byWeaponType ??= {})[weaponType as ManifestWeaponType] = clip;
  }
  // Only the food types that change the clip are kept; the rest fall back to the plain one.
  for (const foodType of foodTypesOf(load, source)) {
    const clip = resolveActionClip(load, source, { FoodType: foodType });
    if (clip && !same(clip)) (clips.byFoodType ??= {})[foodType.toLowerCase()] = clip;
  }
  return clips.default || clips.byWeaponType || clips.byFoodType ? clips : undefined;
}

/** The `FoodType` values the nodes of a source distinguish, for eating and drinking. */
function foodTypesOf(load: StateLoader, source: ActionSource): string[] {
  const values = new Set<string>();
  for (const { node } of sourceNodes(load, source)) {
    for (const condition of node.conditions) {
      if (condition.name.toLowerCase() === 'foodtype' && condition.type === 'STRING') {
        if (condition.value.length > 0) values.add(condition.value);
      }
    }
  }
  return [...values];
}

/** A zombie's clips for one action, one per gait. */
export function buildZombieActionClips(
  load: StateLoader,
  entry: { gaits: string[]; source: (gait: string) => ActionSource },
): ManifestActionClips | undefined {
  const byGait: ManifestClip[] = [];
  for (const gait of entry.gaits) {
    const clip = resolveActionClip(load, entry.source(gait));
    if (!clip) return undefined;
    byGait.push(clip);
  }
  if (byGait.length === 0) return undefined;
  return byGait.length === 1 ? { default: byGait[0] as ManifestClip } : { byGait };
}

export interface ActionTables {
  player: Partial<Record<CharacterAction, ManifestActionClips>>;
  zombie: Partial<Record<CharacterAction, ManifestActionClips>>;
  crawler: Partial<Record<CharacterAction, ManifestActionClips>>;
}

/** Builds the action tables of players, zombies, and crawlers, reporting the actions with no clip. */
export function buildActionTables(load: StateLoader, warnings: string[]): ActionTables {
  const tables: ActionTables = { player: {}, zombie: {}, crawler: {} };
  for (const [action, source] of Object.entries(PLAYER_ACTION_SOURCES)) {
    if (!source) continue;
    const clips = buildPlayerActionClips(load, source);
    if (clips) tables.player[action as CharacterAction] = clips;
    else warnings.push(`no clip for the player action "${action}"`);
  }
  const zombieSets: [keyof ActionTables, typeof ZOMBIE_ACTION_SOURCES][] = [
    ['zombie', ZOMBIE_ACTION_SOURCES],
    ['crawler', CRAWLER_ACTION_SOURCES],
  ];
  for (const [kind, sources] of zombieSets) {
    for (const [action, entry] of Object.entries(sources)) {
      if (!entry) continue;
      const clips = buildZombieActionClips(load, entry);
      if (clips) tables[kind][action as CharacterAction] = clips;
      else warnings.push(`no clip for the ${kind} action "${action}"`);
    }
  }
  return tables;
}
