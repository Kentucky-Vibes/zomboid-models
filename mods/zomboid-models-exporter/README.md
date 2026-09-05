# zomboid-models exporter mod

A small Project Zomboid (Build 42) mod that writes the appearance of players as zomboid-models character documents (see [docs/format.md](../../docs/format.md)). It is the reference exporter for the renderer: any website that wants to show real characters can read these files, and other mods can call `ZomboidModels.export(character)` or `ZomboidModels.describe(character)` themselves. Vehicles are described on request: `ZomboidModels.describeVehicle(vehicle)` returns a vehicle document as a table and `ZomboidModels.exportVehicle(vehicle)` writes it to `Zomboid/Lua/zomboid-models/vehicle-<script>-<id>.json`; nothing exports vehicles on its own.

## What it writes

`Zomboid/Lua/zomboid-models/<username>.json`, one file per player, containing the body (sex, skin, body hair, hair and beard with colours, blood and dirt per body part), every worn item with its texture choice, tint, hue, decal, blood, dirt, holes, and patches, the items in both hands, the attached items, the bandage and wound state of every body part, and what the player was doing: the stance (sitting on the ground) and the action (driving, sleeping or lying awake, sitting on furniture, eating or drinking, attacking, aiming, or the gait while moving), read from the game's flags and animation variables.

`Zomboid/Lua/zomboid-models/players.json`, the index: every player exported so far with the file name, the time of the last export in Unix seconds, whether the player was online at that time, and the vehicle they sat in. A player sitting in a vehicle also gets `vehicle-<script>-<id>.json` written, and their document links to it through `meta.vehicleId` and `meta.vehicleFile`.

- On a dedicated server the files land in the server's Zomboid folder. Every player online is written every ten in-game minutes, players who left are marked offline in the index, and a client can request an immediate refresh.
- On a client (single player or multiplayer) the local player is written on game start, whenever their clothing changes, and when they get into, out of, or across the seats of a vehicle, and the client asks the server to refresh its copy too.

## Install

Copy the `zomboid-models-exporter` folder into `Zomboid/mods` (or upload it to the Workshop) and enable `ZomboidModelsExporter`. There are no options.

## Limits

The mod runs inside the game's Kahlua Lua runtime, which has no JSON library and limited standard functions, so it ships its own encoder and decoder (the decoder reads the index back at startup). Calls into the game are guarded: an item type without a visual state is exported with its type only. The file is rewritten as a whole on every export.

## Testing

`test/exporter.test.ts` runs the Lua files under a Lua interpreter in Node.js (fengari) against mock game objects, validates the produced document with the renderer's schema, and checks the values. The mod has also been run on a Build 42.20.3 dedicated server; the document it produced is kept unedited as [docs/examples/exported-player.json](../../docs/examples/exported-player.json).
