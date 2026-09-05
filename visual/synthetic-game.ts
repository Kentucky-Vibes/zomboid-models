/**
 * A tiny game folder made of the test fixtures: one skinned quad for every body and clothing
 * mesh, an idle clip, a cow, an axe, a car with one wheel, and English names. The screenshot
 * tests build an asset folder from it, so they check the renderer without any game file.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { SIMPLE_ANIMATION, SKINNED_QUAD } from '../packages/pipeline/test/fixtures/x.js';
import { TRIANGLE_TXT } from '../packages/pipeline/test/fixtures/textMesh.js';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 2x2 RGBA PNG of one colour, so that a texture is opaque and visibly coloured. */
function png(r: number, g: number, b: number, a = 255): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(2 * (1 + 2 * 4));
  for (let y = 0; y < 2; y++) {
    const row = y * 9;
    raw[row] = 0;
    for (let x = 0; x < 2; x++) raw.set([r, g, b, a], row + 1 + x * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** Texture colours: skin, cloth, animal hide, a paintable red shell, the head zone, and a tyre. */
const TEXTURES: Record<string, Buffer> = {
  'body/malebody01': png(224, 172, 140),
  'body/femalebody01': png(224, 172, 140),
  'body/cow_black': png(60, 50, 45),
  'clothes/cloth': png(40, 80, 200),
  f_hair_white: png(240, 240, 240),
  'vehicles/vehicle_carnormalshell': png(200, 40, 40, 0),
  'vehicles/vehicle_carnormal_mask': png(255, 0, 0),
  'vehicles/vehicle_wheel': png(70, 70, 70),
};

function file(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Writes the synthetic game folder under `root/game` and returns its path. */
export function writeSyntheticGame(root: string): string {
  const game = join(root, 'game');
  const media = join(game, 'media');
  file(
    join(media, 'scripts', 'items.txt'),
    `module Base {
      item Trousers { BodyLocation = base:pants, ClothingItem = Quad, BloodLocation = Trousers, DisplayName = Quad Trousers, }
      item Axe { WeaponSprite = Quad, SwingAnim = Bat, TwoHandWeapon = true, WorldStaticModel = AxeGround, DisplayName = Axe, }
      model Quad { mesh = Skinned/Quad, texture = clothes/cloth, }
      model AxeGround { mesh = Skinned/Quad, texture = clothes/cloth, scale = 0.5, }
      model MaleBody { mesh = Skinned/MaleBody, static = false, attachment Bip01_Prop2 { offset = 0 0 0, rotate = 0 0 0, } }
      model CowBody { mesh = Skinned/CowBody, shader = animalEffect, static = false, animationsMesh = CowAndBull, }
      model Vehicles_CarNormal { mesh = Skinned/Quad, shader = vehicle_multiuv, scale = 0.5, }
      model Vehicles_Wheel { mesh = Vehicles_Wheel, texture = Vehicles/vehicle_wheel, shader = vehiclewheel, }
    }`,
  );
  file(
    join(media, 'scripts', 'vehicles', 'vehicle_car_normal.txt'),
    `module Base {
      template vehicle Tire {
        part TireFrontLeft { wheel = FrontLeft, }
        part Tire* { category = tire, model InflatedTirePlusWheel { file = Vehicles_Wheel, } }
      }
      vehicle CarNormal {
        template = Tire,
        textureMask = Vehicles/vehicle_carnormal_mask,
        skin { texture = Vehicles/vehicle_carnormalshell, }
        extents = 1 1 2,
        model { file = Vehicles_CarNormal, scale = 2, offset = 0 0.5 0, }
        wheel FrontLeft { front = true, offset = 0.5 -0.3 0.8, radius = 0.15, width = 0.2, }
        part DoorFrontLeft { door { } }
        part Windshield { window { } }
      }
    }`,
  );
  file(
    join(media, 'clothing', 'clothingItems', 'Quad.xml'),
    '<clothingItem><m_GUID>quad-guid</m_GUID><m_MaleModel>skinned\\quad</m_MaleModel><m_FemaleModel>skinned\\quad</m_FemaleModel><m_Masks>7</m_Masks><textureChoices>clothes\\cloth</textureChoices></clothingItem>',
  );
  file(join(media, 'clothing', 'clothing.xml'), '<outfitManager></outfitManager>');
  for (const name of ['malebody', 'femalebody', 'quad', 'cowbody']) {
    file(join(media, 'models_x', 'skinned', `${name}.x`), SKINNED_QUAD);
  }
  file(join(media, 'models', 'Vehicles_Wheel.txt'), TRIANGLE_TXT);
  file(join(media, 'anims_x', 'bob', 'bob_idle.x'), SIMPLE_ANIMATION);
  file(join(media, 'anims_x', 'cow', 'cow_idle01.x'), SIMPLE_ANIMATION);
  file(
    join(media, 'animsets', 'player', 'idle', 'Idle.xml'),
    '<animNode><m_Name>Idle</m_Name><m_AnimName>Bob_Idle</m_AnimName></animNode>',
  );
  file(
    join(media, 'animsets', 'cow', 'idle', 'idle1.xml'),
    '<animNode><m_Name>idle1</m_Name><m_AnimName>Cow_Idle01</m_AnimName></animNode>',
  );
  for (const [texture, data] of Object.entries(TEXTURES)) {
    file(join(media, 'textures', `${texture}.png`), data);
  }
  file(join(media, 'hairStyles', 'hairStyles.xml'), '<hairStyles></hairStyles>');
  file(join(media, 'hairStyles', 'beardStyles.xml'), '<beardStyles/>');
  file(
    join(media, 'lua', 'shared', 'NPCs', 'BodyLocations.lua'),
    'local group = BodyLocations.getGroup("Human")\ngroup:getOrCreateLocation(ItemBodyLocation.PANTS)\n',
  );
  file(join(media, 'lua', 'shared', 'NPCs', 'AttachedLocations.lua'), '');
  file(
    join(media, 'lua', 'shared', 'Definitions', 'animal', 'CowDefinitions.lua'),
    `AnimalDefinitions = AnimalDefinitions or {}
AnimalDefinitions.breeds = AnimalDefinitions.breeds or {}
AnimalDefinitions.breeds.cow = { breeds = { black = { name = "black", texture = { "Cow_Black" }, textureMale = {}, textureBaby = {} } } }
AnimalDefinitions.animals = AnimalDefinitions.animals or {}
AnimalDefinitions.animals.cow = { bodyModel = "CowBody", bodyModelSkel = "CowBody", animset = "cow", breeds = { "black" }, female = true, minSize = 1, maxSize = 1, }
`,
  );
  file(
    join(media, 'lua', 'shared', 'Translate', 'EN', 'ItemName.json'),
    '{"Base.Axe": "Fire Axe", "Base.Trousers": "Trousers"}',
  );
  file(
    join(media, 'lua', 'shared', 'Translate', 'EN', 'IG_UI.json'),
    '{"IGUI_VehicleNameCarNormal": "Chevalier Nyala", "IGUI_AnimalType_cow": "Cow"}',
  );
  file(
    join(media, 'lua', 'shared', 'Translate', 'EN', 'UI.json'),
    '{"UI_ClothingType_Pants": "Pants"}',
  );
  return game;
}
