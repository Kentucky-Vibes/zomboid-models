# Document formats

Everything the renderer shows is described by a JSON document: a character (this section and the ones up to the body part names), an animal, an item, or a vehicle (the last three sections). The renderer, the Web Component, and the React component all take the same documents, and any exporter (a server mod, a script, a form on a website) produces them. Each document mirrors the state the game itself keeps for the subject, so nothing is lost between the game and the page.

The JSON Schema is published as `schema/character.schema.json` in the `zomboid-models` package, and `validateCharacterDescription()` from the same package checks a parsed document at runtime and returns typed errors.

## Shape

```json
{
  "format": "zomboid-models/character",
  "version": 1,
  "body": {
    "sex": "male",
    "skin": 1,
    "bodyHair": true,
    "hair": "CrewCut",
    "beard": "Full",
    "hairColor": { "r": 0.29, "g": 0.18, "b": 0.1 },
    "blood": { "Head": 0.4, "Hand_R": 1 }
  },
  "worn": [
    { "item": "Base.Trousers_Denim", "textureChoice": 2 },
    {
      "item": "Base.Tshirt_DefaultDECAL",
      "decal": "TShirtSpiffo1",
      "tint": { "r": 0.9, "g": 0.9, "b": 0.6 }
    },
    {
      "item": "Base.Jacket_Police",
      "blood": { "Torso_Upper": 0.8 },
      "holes": { "Torso_Upper": true }
    },
    { "item": "Base.Hat_BaseballCap_Police" }
  ],
  "held": { "primary": { "item": "Base.Axe" } },
  "attached": [{ "location": "Rifle On Back", "item": "Base.VarmintRifle" }],
  "damage": {
    "ForeArm_L": { "bandage": "dirty" },
    "Neck": { "scratched": true }
  }
}
```

`format` and `version` identify the document. `body` is the only required section.

## body

- `sex`: `male` or `female`. Selects the body mesh and the mesh of every worn item.
- `skin`: index into the sex's skin textures (0 to 4 in the vanilla game), as `HumanVisual` stores it. `skinTexture` names a texture directly instead, for example `MaleBody03`, and wins over `skin`.
- `bodyHair`: uses the body-hair variant of the skin texture where one exists (male skins only).
- `hair`, `beard`: style names from the game's hair and beard data, for example `CrewCut` or `Full`. Omit them for no hair or no beard. A hat replaces the hair by the style's alternate for that hat category, as in the game.
- `hairColor`, `beardColor`: colours with channels from 0 to 1; the beard colour defaults to the hair colour.
- `blood`, `dirt`: amount per body part, from 0 to 1.
- `zombie`: makes the body a zombie. `rot` (1 to 3) picks the decay stage of the skin, `skeleton` (`burned`, `plain`, `muscle`) renders the skeleton body instead, and `seed` decides whatever the document leaves open: the rot stage, the skin, the blood on the body, and the speed and starting point of the idle. Zombies never have body hair, and `skin` indexes the zombie skins of the stage (four per stage in the vanilla game) or the three skeleton textures.

## stance

`standing` (the default), `crawling`, `onBack`, `sitting`, or `corpse`. Each maps to a clip of the game's animation sets: for players the sitting and dead body clips, for zombies the idle, crawler, floor, wall, and corpse clips, at the speed the game plays them. A viewer told to play a named clip ignores the stance.

## action

What the character is doing, as a looped clip from the game's animation sets; the idle of the stance when absent. Players have `walk`, `sneak`, `run`, `sprint`, `aim`, `attack`, `sitChair`, `sleep`, `lieAwake`, `eat`, `drink`, and `drive`; zombies have `walk`, `sprint`, `lunge`, `attack`, and `eat` while standing and `walk` while crawling. An action the kind lacks is reported as a warning and the idle plays instead.

The clip is the node the game's state machine would reach for a healthy, uninjured character, picked from the animation set the way the game picks it, with the primary held item deciding the variant: the weapon type for walking, running, aiming, attacking, and sitting (a rifle is carried and swung differently from a bat), and the item's eat type for eating and drinking (a can, a bowl, a bottle). Where the game blends clips, the document gets the same blend: a healthy walker mixes the slow walk into the walk at one to four, as the game's `WalkSpeed` of 0.8 does. Speeds follow the animation sets, including the variables the sets name: the attack speed is the game's combat speed formula for a fresh character (the weapon's base speed, 0.8 of that for an axe, a roll between 1.1 and 1.2, 1.2 for a heavy weapon), the aim pose all but stands still at the game's idle speed of 0.01, and a zombie eats at a speed rolled between 0.64 and 0.96. A zombie's gait comes from the seed the way the game rolls a walk type at spawn: one of five walks for the fast shamblers a new game has, one of five sprints for a sprinter, and one of two crawls. `sitChair`, `sleep`, and `lieAwake` bring their own pose and take precedence over `stance`. A viewer told to play a named clip ignores the action, as it ignores the stance.

## worn

Each entry is an item the character wears. The order is the order they were put on; the renderer applies the game's rules from there: an item replaces what was worn at the same location (unless the location holds several items), removes items at exclusive locations, and everything draws in the render order the game data declares.

- `item`: the full item type, for example `Base.Trousers_Denim`.
- `clothingItem`: overrides the clothing definition the item script names. Rarely needed.
- `alternateModel`: a model key to use instead of the item's own, as the game's `ItemVisual` stores it for some items.
- `textureChoice`, `baseTexture`: indices into the clothing definition's texture lists.
- `tint`: a colour multiplied into the texture; `hue`: a hue shift from -1 to 1. The game applies one or the other, tint first.
- `decal`: a decal name from the game's decal data, drawn into the shirt texture.
- `blood`, `dirt`: amounts per body part; `holes`: flags per body part; `patches`: `basic`, `denim`, or `leather` per body part.

## held and attached

`held.primary` and `held.secondary` name the items in the right and left hand. The idle animation follows the primary item's weapon type unless the viewer is told which clip to play. `attached` lists items on the body's attachment points, by the location names the game data declares (`Rifle On Back`, `Holster Right`, and so on).

## damage

Per body part: `bandage` (`clean` or `dirty`), and the wound flags `bitten`, `scratched`, `cut`, `deepWound`, `bulletWound`, `burnt`, `stitched`, `splint`, `bleeding`. The renderer draws what the game draws: bandages and the bite, scratch, and laceration overlays on the parts that have them. Flags the game has no texture for are accepted and ignored.

## outfit

`outfit` names one of the game's outfits (`Police`, `Nurse`, `Bandit`, and about four hundred more from `clothing.xml`) and dresses the character with the game's own randomiser, ported bit for bit: the same `seed` gives the same clothes, texture choices, tints, hues, decals, hair, beard, and hair colour as the game gives a zombie or survivor with that outfit generator seed. Items listed in `worn` are put on afterwards, and `hair`, `beard`, `hairColor`, and `skin` in `body` override what the outfit rolled.

For a zombie the game's extras apply in the game's order: underwear, the outfit, the rot stage and skin, an attached weapon by the sandbox chance, wounds and bandages, and the wear the clothing degradation setting adds. `worldAge` (days) unlocks the hair styles and attached weapons the game reserves for older worlds. The game draws a few amounts (blood on an attached weapon, dirt) from its unseeded generator; those come from a second stream derived from the seed and are the only part that may differ from the game.

## Body part names

`Hand_L`, `Hand_R`, `ForeArm_L`, `ForeArm_R`, `UpperArm_L`, `UpperArm_R`, `Torso_Upper`, `Torso_Lower`, `Head`, `Neck`, `Groin`, `UpperLeg_L`, `UpperLeg_R`, `LowerLeg_L`, `LowerLeg_R`, `Foot_L`, `Foot_R`, `Back`. These are the game's own names.

## Example

[examples/exported-player.json](examples/exported-player.json) is a document the reference mod wrote for a real player on a Build 42.20.3 server, unedited. It is also a test fixture: every file in that folder has to pass the schema and the runtime validator.

## Where the values come from in the game

The reference mod in `mods/zomboid-models-exporter` does exactly this and writes one file per player; read it for the method names.

An exporter running inside the game can fill the document from `IsoPlayer`: `getHumanVisual()` for the body (skin texture index, hair and beard models and colours, blood and dirt per `BloodBodyPartType`), `getWornItems()` and each item's `getVisual()` for the worn list (texture choice, base texture, tint, hue, decal, blood, dirt, holes, patches), `getPrimaryHandItem()` and `getSecondaryHandItem()`, `getAttachedItems()`, and `getBodyDamage()` for the parts' bandage and wound state.

## Animals

Build 42 animals have their own document, `zomboid-models/animal`:

```json
{
  "format": "zomboid-models/animal",
  "version": 1,
  "type": "cow",
  "breed": "holstein",
  "texture": 1,
  "variant": "normal",
  "size": 1.05,
  "hue": 0,
  "stance": "standing"
}
```

- `type`: the animal type as the game's definitions name it: `cow`, `bull`, `cowcalf`, `ewe`, `ram`, `lamb`, `hen`, `cockerel`, `chick`, `sow`, `boar`, `piglet`, `doe`, `buck`, `fawn`, `rabdoe`, `rabbuck`, `rabkitten`, `turkeyhen`, `gobblers`, `turkeypoult`, `rat`, `ratfemale`, `ratbaby`, `mouse`, `mousefemale`, `mousepups`, `raccoonsow`, `raccoonboar`, `raccoonkit`. The type carries the sex and the growth stage, so the renderer picks the male, female, or young texture of the breed the way `IsoAnimal` does.
- `breed`: a breed of the type, for example `angus`, `simmental`, or `holstein` for cows; the first breed when absent.
- `texture`: an index into the breed's texture list for the animal's sex and age, or a texture name such as `Cow_BW_02`. When absent the seed picks one, as the game picks at random.
- `variant`: `normal`, `rotten` (the breed's rotting texture), `skinned` (the butchered carcass texture), `skeleton`, `skeletonBloody`, `headless`, `skeletonHeadless`, and for sheep `fleece` and `sheared`. Variants a type lacks fall back to the live body with a warning.
- `size`: the size factor the game grows an animal through, between the type's `minSize` and `maxSize`; the grown size when absent. Animals scale relative to a human exactly by this factor, as in the game.
- `tint`, `hue`: the `TintColour` and `HueChange` of the game's animal shader.
- `stance`: `standing` (the idle loop), `sitting`, or `corpse`, from the type's animation set.
- `action`: `walk`, `run`, or `eat`, the looped clips of the type's animation set (the walk of a rabbit is its hop, and its run a faster hop); the stance's idle when absent.
- `seed`: for the texture choice.

The pipeline writes the animal catalog when `subjects` includes `animals`; the viewer loads it for animal documents. The JSON Schema is `schema/animal.schema.json`, and `validateAnimalDescription()` checks a document at runtime.

## Items

One inventory item on its own has the document `zomboid-models/item`:

```json
{ "format": "zomboid-models/item", "version": 1, "item": "Base.Axe", "model": "held" }
```

- `item`: the full item type.
- `model`: `world` for the model the item shows lying on the ground (`WorldStaticModel` in the item script), `held` for the model it shows in a hand (`WeaponSprite` or `StaticModel`). The ground model is the default; an item that lacks the requested model shows the other one with a warning.
- `blood`: blood on a weapon from 0 to 1, drawn through the game's blood overlay and its mask.

The pipeline writes the item catalog when `subjects` includes `items`. Ground models are FBX files in the game, which the pipeline converts through the three.js FBX loader; the model's script scale applies, so a hammer on the ground is hammer-sized next to a character. The JSON Schema is `schema/item.schema.json`, and `validateItemDescription()` checks a document at runtime.

## Vehicles

A vehicle has the document `zomboid-models/vehicle`:

```json
{
  "format": "zomboid-models/vehicle",
  "version": 1,
  "vehicle": "Base.CarLightsPolice",
  "skin": 0,
  "paint": { "hue": 0.6, "saturation": 0.9, "value": 0.7 },
  "rust": 1,
  "parts": {
    "DoorFrontLeft": { "condition": 45 },
    "WindowFrontLeft": { "open": true },
    "TireRearRight": { "missing": true }
  },
  "headlights": true,
  "lightbar": "left",
  "blood": { "front": 0.5, "left": 1 }
}
```

- `vehicle`: the full script name, `Base.CarNormal`, `Base.PickUpVan`, or a mod's vehicle.
- `skin`: an index into the script's skins, as `getSkinIndex()` returns it.
- `paint`: hue, saturation, and value from 0 to 1, as `BaseVehicle` stores its colour. The shell texture marks the painted areas with its alpha; the shader replaces their hue and shifts saturation and value by the paint's values around 0.5.
- `rust`: from 0 to 1, the opacity of the rust atlas.
- `parts`: the state of parts by their script id, for those that differ from an installed, intact, closed part. `condition` is the item's condition from 0 to 100: bodywork and windows show the first damage texture from 59 down to 40 and the second one below 40. `missing` means no item is installed: doors, windows, and a trunk that carries the rear lights show the game's uninstalled shade, and tires and the doors of the three cars with door meshes are not drawn. `open` applies to windows, which show the uninstalled shade when open, and to the doors, hoods, and trunks of the three cars with hinged meshes, which are drawn open; when a viewer receives a new description of the same vehicle, a part that changed state swings there with the clip and rate of the script's `Open` or `Close` anim.
- `headlights`, `stoplights`, `interiorLight`: which light zones show the lights texture, as `updateLights` sets them for headlights with battery charge, brake lights, and the interior light on the windows.
- `lightbar`: `left` or `right`, the half of a light bar that is lit, for the police and emergency vehicles that have one.
- `blood`: per side from 0 to 1, as `getBloodIntensity()` reports `Front`, `Rear`, `Left`, and `Right`; each side covers the zones the game covers.
- `lightbarMode`: the flashing pattern of the light bar, 1 to 3, as the game's `LightbarLightsMode` numbers them: the viewer flashes the bar with that pattern (1 by default) when `lightbar` or `lightbarMode` is set.
- `seed`: picks the rust, the paint, and the skin the document leaves open, the way the game rolls them at spawn: no rust or full rust, one of the game's five paint families, any skin.

The renderer draws the body with a port of the game's vehicle shader: the mask texture cuts the body into 27 zones, and per zone the state above decides between the plain shell, the two damage textures, the uninstalled shade, the lights, and the blood. Wheels come from the game's text meshes and sit at the wheel offsets of the script; the models of parts (light bars, van seats, the doors of the three cars that have separate door meshes) sit where the script places them. The hinged parts of the three cars that have them keep their bones and their closing clips in the converted model, so they open and close as in the game. Every vehicle casts the game's blob shadow, a quad with the script's shadow extents and offset. Not drawn yet: models placed on attachment points (the hood ornament of one car) and the sky box the game reflects in the windows, which is a soft gradient here.

The pipeline writes the vehicle catalog when `subjects` includes `vehicles`. The JSON Schema is `schema/vehicle.schema.json`, and `validateVehicleDescription()` checks a document at runtime. `validateDescription()` checks a document of any kind by its `format`.

The reference mod has `ZomboidModels.describeVehicle(vehicle)` and `ZomboidModels.exportVehicle(vehicle)`, which fill the document from `BaseVehicle`: `getScriptName()`, `getSkinIndex()`, `getColorHue()`, `getColorSaturation()`, `getColorValue()`, `getRust()`, every part with `getInventoryItem()`, its condition, and its window and door state, `getHeadlightsOn()`, `getStoplightsOn()`, `getWindowLightsOn()`, the light bar mode, and `getBloodIntensity()` per side. Nothing exports vehicles on its own; call `exportVehicle` from the Lua console or from another mod.

## Scenes

Several subjects together have the document `zomboid-models/scene`:

```json
{
  "format": "zomboid-models/scene",
  "version": 1,
  "subjects": [
    {
      "document": {
        "format": "zomboid-models/vehicle",
        "version": 1,
        "vehicle": "Base.CarLightsPolice"
      }
    },
    {
      "document": { "format": "zomboid-models/character", "version": 1, "body": { "sex": "male" } },
      "seat": "FrontLeft",
      "in": 0
    },
    {
      "document": { "format": "zomboid-models/animal", "version": 1, "type": "cow" },
      "position": [-3.5, 0],
      "yaw": 30
    }
  ],
  "ground": "#3a3b3f"
}
```

- `subjects`: the documents to show, each a character, animal, item, or vehicle document as described above, in drawing order.
- `position`: where the subject stands on the ground, in the game's units (one tile is one unit): `x` runs to the right as seen from the default camera and `z` toward it. Subjects without a position line up in a row, centred, left to right in document order.
- `yaw`: a turn in degrees; 0 faces the default camera for every kind, positive turns to the subject's left. Vehicles face the camera with their front, the way a character does with their face.
- `animation`: a clip name for this subject, `null` for the bind pose, the game's clip when absent.
- `seat` and `in`: for a character, the seat of the vehicle at index `in` of `subjects` (`FrontLeft`, `FrontRight`, `RearLeft`, `RearRight`, and whatever else the vehicle script declares). The character sits at the seat's `inside` position of the script and plays the game's driving idle, driver and passengers alike, as the game does.
- `ground`: a CSS colour for a disc of ground under the subjects; nothing is drawn when absent.

Characters, animals, and items are drawn 1.5 times their file units, the factor the game applies to them in the world, so a survivor stands as tall next to a car as in the game. The camera frames the whole group. The JSON Schema is `schema/scene.schema.json`, and `validateSceneDescription()` checks a document at runtime.
