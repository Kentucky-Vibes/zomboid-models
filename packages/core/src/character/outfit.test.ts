import { describe, expect, it } from 'vitest';

import { MANIFEST_FORMAT, MANIFEST_VERSION, type Manifest } from '../format/manifest.js';
import {
  CHARACTER_FORMAT,
  CHARACTER_FORMAT_VERSION,
  type CharacterDescription,
} from '../format/types.js';
import { resolveBeard, resolveHair, resolveOutfit } from './outfit.js';

function manifest(): Manifest {
  return {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    gameVersion: '42.20.3',
    generatedAt: '2026-09-04T00:00:00Z',
    mods: [],
    bodies: {
      male: { model: 'skinned/malebody', skins: ['body/malebody01'], bodyHair: true },
      female: { model: 'skinned/femalebody', skins: ['body/femalebody01'], bodyHair: false },
    },
    bodyAttachments: {},
    models: {},
    textures: {},
    animations: {},
    idle: { default: 'Bob_Idle', byWeaponType: {} },
    clothingItems: {
      trousers: {
        static: false,
        textures: ['t'],
        baseTextures: [],
        masks: [],
        allowRandomTint: false,
        allowRandomHue: false,
        model: { male: 'm/trousers' },
      },
      skirt: {
        static: false,
        textures: ['s'],
        baseTextures: [],
        masks: [],
        allowRandomTint: false,
        allowRandomHue: false,
        model: { male: 'm/skirt', female: 'f/skirt' },
      },
      cap: {
        static: true,
        textures: ['c'],
        baseTextures: [],
        masks: [],
        allowRandomTint: false,
        allowRandomHue: false,
        model: { male: 'm/cap' },
        attachBone: 'Bip01_Head',
        hatCategory: 'Group01',
      },
      helmet: {
        static: true,
        textures: ['h'],
        baseTextures: [],
        masks: [],
        allowRandomTint: false,
        allowRandomHue: false,
        model: { male: 'm/helmet' },
        attachBone: 'Bip01_Head',
        hatCategory: 'nohairnobeard',
      },
      watch: {
        static: true,
        textures: ['w'],
        baseTextures: [],
        masks: [],
        allowRandomTint: false,
        allowRandomHue: false,
        model: { male: 'm/watch' },
        attachBone: 'Bip01_L_Hand',
      },
      robe: {
        static: false,
        textures: ['r'],
        baseTextures: [],
        masks: [],
        allowRandomTint: false,
        allowRandomHue: false,
        model: { male: 'm/robe' },
        altModel: { male: 'm/robe_alt' },
      },
    },
    wearables: {
      'Base.Trousers': { clothingItem: 'trousers', bodyLocation: 'base:pants', bloodLocation: [] },
      'Base.Skirt': { clothingItem: 'skirt', bodyLocation: 'base:skirt', bloodLocation: [] },
      'Base.Cap': { clothingItem: 'cap', bodyLocation: 'base:hat', bloodLocation: [] },
      'Base.Helmet': { clothingItem: 'helmet', bodyLocation: 'base:hat', bloodLocation: [] },
      'Base.Watch': { clothingItem: 'watch', bodyLocation: 'base:leftwrist', bloodLocation: [] },
      'Base.Robe': { clothingItem: 'robe', bodyLocation: 'base:bathrobe', bloodLocation: [] },
      'Base.Ring': { clothingItem: 'ring', bodyLocation: 'base:rightring', bloodLocation: [] },
    },
    heldItems: {},
    bodyLocations: {
      'base:leftwrist': { order: 0, exclusive: [], hides: [], multiItem: false },
      'base:pants': { order: 1, exclusive: ['base:skirt'], hides: [], multiItem: false },
      'base:skirt': { order: 2, exclusive: ['base:pants'], hides: [], multiItem: false },
      'base:bathrobe': { order: 3, exclusive: [], hides: ['base:leftwrist'], multiItem: false },
      'base:hat': { order: 4, exclusive: [], hides: [], multiItem: false },
    },
    attachedLocations: {},
    hair: {
      male: {
        Mullet: {
          model: 'm/hair_mullet',
          texture: 'f_hair_white',
          alternates: { default: 'Hat', group01: 'CrewCut' },
        },
        Hat: { model: 'm/hair_hat', texture: 'f_hair_white', alternates: {} },
        CrewCut: { model: 'm/hair_crewcut', texture: 'f_hair_white', alternates: {} },
        Ghost: { model: 'm/hair_ghost', texture: 'f_hair_white', alternates: { default: 'Nope' } },
      },
      female: {},
    },
    beards: { Full: { model: 'm/beard_full', texture: 'f_hair_white' } },
    bloodMasks: {},
  };
}

function character(worn: NonNullable<CharacterDescription['worn']>): CharacterDescription {
  return {
    format: CHARACTER_FORMAT,
    version: CHARACTER_FORMAT_VERSION,
    body: { sex: 'male' },
    worn,
  };
}

describe('resolveOutfit', () => {
  it('sorts by render order and applies slot and exclusivity rules', () => {
    const result = resolveOutfit(
      manifest(),
      character([
        { item: 'Base.Cap' },
        { item: 'Base.Trousers' },
        { item: 'Base.Skirt' },
        { item: 'Base.Helmet' },
      ]),
    );
    expect(result.worn.map((w) => w.description.item)).toEqual(['Base.Skirt', 'Base.Helmet']);
    expect(result.hatCategory).toBe('nohairnobeard');
    expect(result.warnings).toEqual([]);
  });

  it('hides items under other items and honours explicit alternate models', () => {
    const result = resolveOutfit(
      manifest(),
      character([{ item: 'Base.Watch' }, { item: 'Base.Robe', alternateModel: 'm/robe_alt' }]),
    );
    expect(
      result.worn.map(
        (w) => `${w.description.item}:${w.hidden ? 'hidden' : 'shown'}:${w.model ?? ''}`,
      ),
    ).toEqual(['Base.Watch:hidden:m/watch', 'Base.Robe:shown:m/robe_alt']);
  });

  it('reports items the manifest does not know', () => {
    const result = resolveOutfit(
      manifest(),
      character([{ item: 'Base.Ring' }, { item: 'Base.Nope' }]),
    );
    expect(result.worn).toEqual([]);
    expect(result.warnings).toEqual([
      'worn item "Base.Ring" is not in the manifest',
      'worn item "Base.Nope" is not in the manifest',
    ]);
  });
});

describe('resolveHair and resolveBeard', () => {
  it('swaps the style under a hat by category, then by default', () => {
    const m = manifest();
    expect(resolveHair(m, 'male', 'Mullet', undefined).model).toBe('m/hair_mullet');
    expect(resolveHair(m, 'male', 'Mullet', 'Group01').model).toBe('m/hair_crewcut');
    expect(resolveHair(m, 'male', 'Mullet', 'Group02').model).toBe('m/hair_hat');
    expect(resolveHair(m, 'male', 'CrewCut', 'Group02').model).toBe('m/hair_crewcut');
    expect(resolveHair(m, 'male', 'Mullet', 'nohair').model).toBeUndefined();
    expect(resolveHair(m, 'male', undefined, undefined).model).toBeUndefined();
    expect(resolveHair(m, 'male', 'Ghost', 'Group01')).toEqual({
      model: 'm/hair_ghost',
      texture: 'f_hair_white',
      warnings: ['hair style "Ghost" names unknown alternate "Nope"'],
    });
    expect(resolveHair(m, 'male', 'Unknown', undefined).warnings).toEqual([
      'hair style "Unknown" is not in the manifest',
    ]);
  });

  it('removes the beard under hats that forbid it', () => {
    const m = manifest();
    expect(resolveBeard(m, 'Full', undefined).model).toBe('m/beard_full');
    expect(resolveBeard(m, 'Full', 'Group01').model).toBe('m/beard_full');
    expect(resolveBeard(m, 'Full', 'nohairnobeard').model).toBeUndefined();
    expect(resolveBeard(m, 'Nope', undefined).warnings).toEqual([
      'beard style "Nope" is not in the manifest',
    ]);
  });
});
