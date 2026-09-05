# Asset pipeline

`zomboid-models-pipeline` converts the character assets of a Project Zomboid (Build 42) install into files a browser can load: one glTF binary per mesh and per animation, the PNG textures, a small `manifest.json` index, and one catalog file per kind of subject that describes bodies, clothing, held items, hair, outfits, animations, and the rules the game applies to them.

The tool reads the game's own files. Both the Steam client and the dedicated server ship the `media` folder it needs, so it can run on a development machine or on the server host. The output contains copies of The Indie Stone's assets and of any mod's assets you include; hosting it is subject to their terms (see the repository README).

## Install and configure

```bash
npm install --save-dev zomboid-models-pipeline
npx zomboid-models init
```

`init` looks for the game in the Steam libraries of the machine, reads the game version from the user's `Zomboid/version.txt`, finds the Workshop content and user mod folders, and writes `zomboid-models.config.json`:

```json
{
  "gameDir": "C:/Program Files (x86)/Steam/steamapps/common/ProjectZomboid",
  "gameVersion": "42.20.3",
  "modDirs": ["C:/Program Files (x86)/Steam/steamapps/workshop/content/108600"],
  "outDir": "assets-out"
}
```

Fields:

- `gameDir`: the folder that holds `media`.
- `gameVersion`: used to choose each mod's version folder the way the game does. Read from `version.txt` when omitted.
- `modDirs`: folders to scan. Each can be a mod, a folder of mods, a Workshop item, or a whole Workshop content folder.
- `mods`: ordered ids to enable; every discovered mod when omitted. `serverIni` reads the order from a server's `Mods=` line instead.
- `outDir`: where the assets go. It is recreated on every build.
- `animations`: extra clip names from any folder under `anims_X` to convert on top of the idle and stance clips.
- `subjects`: which catalogs to build, from `characters`, `vehicles`, `animals`, and `items`; all of them when omitted. `characters`, `animals`, and `items` exist in this version.

`zomboid-models doctor` checks the configuration, the install, the mod folders, and the output folder, and lists the mods it found with the version folder it picked for each.

## Build

```bash
npx zomboid-models build
```

The build discovers mods, orders them with their `require` entries like the game, and overlays their files on the game's `media` (a later mod replaces an earlier file at the same relative path). It then reads the scripts, clothing XML, the outfit list, hair styles, body locations, attachment points, animation sets, and decals, runs the Lua definition files behind outfit randomisation (default clothing, hair pools, underwear, attached weapons) in a sandboxed Lua interpreter, converts every mesh and animation it needs, copies the textures, and writes the catalogs and the index. A vanilla build takes under a minute; the output for the vanilla game is about 60 MB.

Warnings list what could not be converted. Meshes stored as FBX (items on the ground, vehicles, a few held items) go through the three.js FBX loader; their skinned parts (the doors of three cars) are written in their bind pose.

## Output layout

```
assets-out/
  manifest.json
  catalog-characters-<hash>.json
  catalog-animals-<hash>.json
  catalog-items-<hash>.json
  models/<key>-<hash>.glb
  textures/<key>-<hash>.png
  anims/<clip>-<hash>.glb
```

`manifest.json` is the index: the format version, the game version, the mod ids, and the catalog file of each subject kind that was built. The renderer loads only the catalog of the document it shows. Keys are the game's own paths, lowercased. Every file name carries a content hash, so a web server can cache them for a long time; only `manifest.json` changes in place.

The character catalog also carries what the outfit randomiser needs, so that a page can dress a character from an outfit name without the game: the outfits of `clothing.xml`, the hair and beard style lists in the game's order, the hair definitions and colours, the default clothing names, the underwear and attached weapon definitions, and the speed of every idle and stance clip as the game's animation sets set it.

## Coordinates

The game's meshes are left-handed. The converter mirrors them into glTF's right-handed space (Z negated, winding reversed, bone matrices and animations adjusted) so that any glTF viewer shows what the game shows, including readable lettering on textures. Attachment offsets and angles in the manifest are already in that space.
