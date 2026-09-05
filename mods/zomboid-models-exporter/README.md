# zomboid-models exporter mod

A small Project Zomboid (Build 42) mod that writes the appearance of players as zomboid-models character documents (see [docs/format.md](../../docs/format.md)). It is the reference exporter for the renderer: any website that wants to show real characters can read these files, and other mods can call `ZomboidModels.export(character)` or `ZomboidModels.describe(character)` themselves. Vehicles are described on request: `ZomboidModels.describeVehicle(vehicle)` returns a vehicle document as a table and `ZomboidModels.exportVehicle(vehicle)` writes it to `Zomboid/Lua/zomboid-models/vehicle-<script>-<id>.json`; nothing exports vehicles on its own.

## What it writes

`Zomboid/Lua/zomboid-models/<username>.json`, one file per player, containing the body (sex, skin, body hair, hair and beard with colours, blood and dirt per body part), every worn item with its texture choice, tint, hue, decal, blood, dirt, holes, and patches, the items in both hands, the attached items, and the bandage and wound state of every body part.

- On a dedicated server the files land in the server's Zomboid folder. Every player online is written every ten in-game minutes, and a client can request an immediate refresh.
- On a client (single player or multiplayer) the local player is written on game start and whenever their clothing changes, and the client asks the server to refresh its copy too.

## Install

Copy the `zomboid-models-exporter` folder into `Zomboid/mods` (or upload it to the Workshop) and enable `ZomboidModelsExporter`. There are no options.

## Limits

The mod runs inside the game's Kahlua Lua runtime, which has no JSON library and limited standard functions, so it ships its own encoder. Calls into the game are guarded: an item type without a visual state is exported with its type only. The file is rewritten as a whole on every export.

## Testing

`test/exporter.test.ts` runs the Lua files under a Lua interpreter in Node.js (fengari) against mock game objects, validates the produced document with the renderer's schema, and checks the values. The mod has also been run on a Build 42.20.3 dedicated server; the document it produced is kept unedited as [docs/examples/exported-player.json](../../docs/examples/exported-player.json).
