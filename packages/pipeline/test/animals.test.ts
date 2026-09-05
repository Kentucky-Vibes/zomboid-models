import { describe, expect, it } from 'vitest';

import { readAnimalDefinitions } from '../src/game/animals.js';

const COW = `
AnimalDefinitions = AnimalDefinitions or {};
AnimalDefinitions.stages = AnimalDefinitions.stages or {};
AnimalDefinitions.stages["cow"] = {};
AnimalDefinitions.stages["cow"].stages = {};
AnimalDefinitions.stages["cow"].stages["cowcalf"] = {};
AnimalDefinitions.stages["cow"].stages["cowcalf"].ageToGrow = 6 * 30;
AnimalDefinitions.stages["cow"].stages["cowcalf"].nextStage = "cow";
AnimalDefinitions.stages["cow"].stages["cowcalf"].nextStageMale = "bull";
AnimalDefinitions.stages["cow"].stages["cow"] = {};
AnimalDefinitions.stages["cow"].stages["cow"].ageToGrow = 12 * 30;
AnimalDefinitions.breeds = AnimalDefinitions.breeds or {};
AnimalDefinitions.breeds["cow"] = {};
AnimalDefinitions.breeds["cow"].breeds = {};
AnimalDefinitions.breeds["cow"].breeds["angus"] = {};
AnimalDefinitions.breeds["cow"].breeds["angus"].name = "angus";
AnimalDefinitions.breeds["cow"].breeds["angus"].texture = "Cow_Black";
AnimalDefinitions.breeds["cow"].breeds["angus"].textureMale = "Bull_Black";
AnimalDefinitions.breeds["cow"].breeds["angus"].rottenTexture = "CowBlack_Rotting";
AnimalDefinitions.breeds["cow"].breeds["holstein"] = {};
AnimalDefinitions.breeds["cow"].breeds["holstein"].name = "holstein";
AnimalDefinitions.breeds["cow"].breeds["holstein"].texture = "Cow_BW_01,Cow_BW_02, Cow_BW_03";
AnimalDefinitions.breeds["cow"].breeds["holstein"].textureMale = "Bull_BW_01";
AnimalDefinitions.animals = AnimalDefinitions.animals or {};
AnimalDefinitions.animals["cowcalf"] = {};
AnimalDefinitions.animals["cowcalf"].bodyModel = "CowCalf_Body";
AnimalDefinitions.animals["cowcalf"].bodyModelSkel = "CowCalf_Skeleton";
AnimalDefinitions.animals["cowcalf"].textureSkeleton = "Bull_Skeleton";
AnimalDefinitions.animals["cowcalf"].animset = "cowcalf";
AnimalDefinitions.animals["cowcalf"].minSize = 0.9;
AnimalDefinitions.animals["cowcalf"].maxSize = 1.2;
AnimalDefinitions.animals["cowcalf"].group = "cow";
AnimalDefinitions.animals["cowcalf"].breeds = AnimalDefinitions.breeds["cow"].breeds;
AnimalDefinitions.animals["cowcalf"].stages = AnimalDefinitions.stages["cow"].stages;
AnimalDefinitions.animals["cow"] = {};
AnimalDefinitions.animals["cow"].bodyModel = "CowBody"
AnimalDefinitions.animals["cow"].bodyModelSkel = "Cow_Skeleton";
AnimalDefinitions.animals["cow"].textureSkeleton = "Bull_Skeleton";
AnimalDefinitions.animals["cow"].textureSkeletonBloody = "CowBull_Skeleton_Butchered";
AnimalDefinitions.animals["cow"].textureSkinned = "Cow_Skinned";
AnimalDefinitions.animals["cow"].bodyModelHeadless = "Cow_Headless";
AnimalDefinitions.animals["cow"].bodyModelSkelNoHead = "Cow_Skeleton_NoHead";
AnimalDefinitions.animals["cow"].animset = "cow"
AnimalDefinitions.animals["cow"].animalSize = 0.3
AnimalDefinitions.animals["cow"].minSize = 0.9
AnimalDefinitions.animals["cow"].maxSize = 1.1
AnimalDefinitions.animals["cow"].female = true
AnimalDefinitions.animals["cow"].group = "cow";
AnimalDefinitions.animals["cow"].breeds = AnimalDefinitions.breeds["cow"].breeds;
AnimalDefinitions.animals["cow"].stages = AnimalDefinitions.stages["cow"].stages;
`;

const AVATARS = `
AnimalAvatarDefinition = {};
AnimalAvatarDefinition["cow"] = {};
AnimalAvatarDefinition["cow"].zoom = 0;
AnimalAvatarDefinition["cow"].xoffset = 0.1;
AnimalAvatarDefinition["cow"].yoffset = 0;
AnimalAvatarDefinition["cow"].avatarWidth = 200;
AnimalAvatarDefinition["cow"].avatarDir = IsoDirections.SE;
`;

describe('readAnimalDefinitions', () => {
  it('reads types, breeds, stages, sizes, and avatar framing from the Lua', () => {
    const animals = readAnimalDefinitions([COW, AVATARS]);
    expect(animals.map((a) => a.type)).toEqual(['cow', 'cowcalf']);
    const cow = animals[0];
    expect(cow).toMatchObject({
      type: 'cow',
      group: 'cow',
      female: true,
      baby: false,
      bodyModel: 'CowBody',
      bodyModelSkel: 'Cow_Skeleton',
      bodyModelSkelNoHead: 'Cow_Skeleton_NoHead',
      bodyModelHeadless: 'Cow_Headless',
      bodyModelFleece: undefined,
      textureSkeleton: 'Bull_Skeleton',
      textureSkeletonBloody: 'CowBull_Skeleton_Butchered',
      textureSkinned: 'Cow_Skinned',
      animSet: 'cow',
      minSize: 0.9,
      maxSize: 1.1,
      breedOrder: ['angus', 'holstein'],
      avatar: { zoom: 0, xoffset: 0.1, yoffset: 0, width: 200, direction: 'SE' },
    });
    expect(cow?.breeds['holstein']).toEqual({
      textures: ['Cow_BW_01', 'Cow_BW_02', 'Cow_BW_03'],
      texturesMale: ['Bull_BW_01'],
      texturesBaby: [],
    });
    expect(cow?.breeds['angus']?.rottenTexture).toBe('CowBlack_Rotting');
    const calf = animals[1];
    expect(calf?.baby).toBe(true);
    expect(calf?.female).toBe(false);
    expect(calf?.avatar).toBeUndefined();
  });

  it('skips types without a body model', () => {
    const animals = readAnimalDefinitions([
      'AnimalDefinitions = { animals = { ghost = { animset = "ghost" } } }',
    ]);
    expect(animals).toEqual([]);
  });
});
