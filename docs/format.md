# Character document format

A character is described by a JSON document. The renderer, the Web Component, and the React component all take the same document, and any exporter (a server mod, a script, a form on a website) produces it. The document mirrors the state the game itself keeps for a player's appearance, so nothing is lost between the game and the page.

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

Instead of listing `worn`, `outfit` names one of the game's outfits with an optional seed, for demos and placeholders. This is planned and not implemented yet.

## Body part names

`Hand_L`, `Hand_R`, `ForeArm_L`, `ForeArm_R`, `UpperArm_L`, `UpperArm_R`, `Torso_Upper`, `Torso_Lower`, `Head`, `Neck`, `Groin`, `UpperLeg_L`, `UpperLeg_R`, `LowerLeg_L`, `LowerLeg_R`, `Foot_L`, `Foot_R`, `Back`. These are the game's own names.

## Example

[examples/exported-player.json](examples/exported-player.json) is a document the reference mod wrote for a real player on a Build 42.20.3 server, unedited. It is also a test fixture: every file in that folder has to pass the schema and the runtime validator.

## Where the values come from in the game

The reference mod in `mods/zomboid-models-exporter` does exactly this and writes one file per player; read it for the method names.

An exporter running inside the game can fill the document from `IsoPlayer`: `getHumanVisual()` for the body (skin texture index, hair and beard models and colours, blood and dirt per `BloodBodyPartType`), `getWornItems()` and each item's `getVisual()` for the worn list (texture choice, base texture, tint, hue, decal, blood, dirt, holes, patches), `getPrimaryHandItem()` and `getSecondaryHandItem()`, `getAttachedItems()`, and `getBodyDamage()` for the parts' bandage and wound state.
