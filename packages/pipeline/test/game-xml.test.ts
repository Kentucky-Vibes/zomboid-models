import { describe, expect, it } from 'vitest';

import {
  modelKeyFromReference,
  parseClothingItemXml,
  textureKeyFromReference,
} from '../src/game/clothingXml.js';
import { parseBeardStylesXml, parseHairStylesXml } from '../src/game/hairXml.js';

const TROUSERS = `<?xml version="1.0" encoding="utf-8"?>
<clothingItem>
  <m_GUID>229b23f6-8e8f-4f16-837b-4fe950c48bfc</m_GUID>
  <m_MaleModel>skinned\\clothes\\bob_trousers</m_MaleModel>
  <m_FemaleModel>skinned\\clothes\\kate_trousers</m_FemaleModel>
  <m_AltMaleModel>null</m_AltMaleModel>
  <m_AltFemaleModel>null</m_AltFemaleModel>
  <m_Static>false</m_Static>
  <m_AllowRandomHue>false</m_AllowRandomHue>
  <m_AllowRandomTint>false</m_AllowRandomTint>
  <m_AttachBone></m_AttachBone>
  <m_Masks>14</m_Masks>
  <m_Masks>15</m_Masks>
  <textureChoices>clothes\\trousers_mesh\\trousersmesh_denim</textureChoices>
  <textureChoices>clothes\\trousers_mesh\\trousersmesh_denimblack</textureChoices>
</clothingItem>`;

const HAT = `<clothingItem>
  <m_MaleModel>media\\models_X\\Static\\Clothes\\M_BaseballCap.X</m_MaleModel>
  <m_FemaleModel>static\\clothes\\f_baseballcap</m_FemaleModel>
  <m_Static>true</m_Static>
  <m_AllowRandomTint>true</m_AllowRandomTint>
  <m_AttachBone>Bip01_Head</m_AttachBone>
  <m_HatCategory>Group01</m_HatCategory>
  <m_MasksFolder>media/textures/Clothes/Hat/Masks</m_MasksFolder>
  <m_UnderlayMasksFolder>media/textures/Clothes/Dress_Textures/JudgeRobeMask/</m_UnderlayMasksFolder>
  <m_BaseTextures>clothes\\hat\\baseballcapred</m_BaseTextures>
  <m_DecalGroup>TShirtSpiffo</m_DecalGroup>
  <m_SpawnWith>ElbowPad_Right</m_SpawnWith>
</clothingItem>`;

describe('parseClothingItemXml', () => {
  it('normalises models, textures, masks, and flags', () => {
    expect(parseClothingItemXml(TROUSERS)).toEqual({
      guid: '229b23f6-8e8f-4f16-837b-4fe950c48bfc',
      maleModel: 'skinned/clothes/bob_trousers',
      femaleModel: 'skinned/clothes/kate_trousers',
      altMaleModel: undefined,
      altFemaleModel: undefined,
      static: false,
      attachBone: undefined,
      allowRandomHue: false,
      allowRandomTint: false,
      masks: [14, 15],
      masksFolder: undefined,
      underlayMasksFolder: undefined,
      textureChoices: [
        'clothes/trousers_mesh/trousersmesh_denim',
        'clothes/trousers_mesh/trousersmesh_denimblack',
      ],
      baseTextures: [],
      hatCategory: undefined,
      decalGroup: undefined,
      spawnWith: [],
    });
  });

  it('handles absolute model paths, static items, and folders', () => {
    const hat = parseClothingItemXml(HAT);
    expect(hat.maleModel).toBe('static/clothes/m_baseballcap');
    expect(hat.femaleModel).toBe('static/clothes/f_baseballcap');
    expect(hat.static).toBe(true);
    expect(hat.attachBone).toBe('Bip01_Head');
    expect(hat.hatCategory).toBe('Group01');
    expect(hat.masksFolder).toBe('clothes/hat/masks');
    expect(hat.underlayMasksFolder).toBe('clothes/dress_textures/judgerobemask');
    expect(hat.baseTextures).toEqual(['clothes/hat/baseballcapred']);
    expect(hat.decalGroup).toBe('TShirtSpiffo');
    expect(hat.spawnWith).toEqual(['ElbowPad_Right']);
    expect(hat.masks).toEqual([]);
  });

  it('rejects files without the root element and bad mask indices', () => {
    expect(() => parseClothingItemXml('<other/>')).toThrow('missing <clothingItem>');
    expect(() => parseClothingItemXml('<clothingItem><m_Masks>x</m_Masks></clothingItem>')).toThrow(
      'not an integer',
    );
  });
});

describe('key helpers', () => {
  it('normalise references', () => {
    expect(modelKeyFromReference('Skinned\\MaleBody')).toBe('skinned/malebody');
    expect(modelKeyFromReference('media\\models_X\\Skinned\\Clothes\\Bob_JudegsRobe.x')).toBe(
      'skinned/clothes/bob_judegsrobe',
    );
    expect(textureKeyFromReference('media/textures/Body/MaleBody01.png')).toBe('body/malebody01');
    expect(textureKeyFromReference('Clothes\\Hat\\BaseballCapRed')).toBe(
      'clothes/hat/baseballcapred',
    );
  });
});

describe('hair and beard styles', () => {
  it('parses hair styles with alternates', () => {
    const styles = parseHairStylesXml(`<hairStyles>
      <male>
        <name>Picard</name>
        <model>skinned/hair/m_hair_picard</model>
        <texture>F_Hair_White</texture>
        <alternate category="default" style="Hat" />
        <alternate category="Group01" style="Picard" />
        <level>1</level>
      </male>
      <male>
        <name>Bald</name>
        <level>0</level>
        <noChoose>true</noChoose>
      </male>
      <female>
        <name>Bob</name>
        <model>skinned/hair/f_hair_bob</model>
        <level>2</level>
      </female>
    </hairStyles>`);
    expect(styles.male).toEqual([
      {
        name: 'Picard',
        model: 'skinned/hair/m_hair_picard',
        texture: 'f_hair_white',
        level: 1,
        alternates: { default: 'Hat', group01: 'Picard' },
        noChoose: false,
      },
      {
        name: 'Bald',
        model: undefined,
        texture: 'f_hair_white',
        level: 0,
        alternates: {},
        noChoose: true,
      },
    ]);
    expect(styles.female[0]?.model).toBe('skinned/hair/f_hair_bob');
  });

  it('parses beard styles', () => {
    const beards = parseBeardStylesXml(`<beardStyles>
      <style>
        <name>BeardOnly</name>
        <model>skinned/beards/bob_beard_only</model>
        <texture>F_Hair_White</texture>
        <growReference>true</growReference>
        <level>1</level>
        <trimChoices>Chops</trimChoices>
        <trimChoices>Goatee</trimChoices>
      </style>
    </beardStyles>`);
    expect(beards).toEqual([
      {
        name: 'BeardOnly',
        model: 'skinned/beards/bob_beard_only',
        texture: 'f_hair_white',
        level: 1,
        growReference: true,
        trimChoices: ['Chops', 'Goatee'],
      },
    ]);
  });
});
