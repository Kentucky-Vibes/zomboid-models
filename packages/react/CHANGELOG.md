# zomboid-models-react

## 1.0.0

### Major Changes

- [`22299d2`](https://github.com/Kentucky-Vibes/zomboid-models/commit/22299d2b2c4735e45aac2550fed33dcf33472054) Thanks [@tlagx](https://github.com/tlagx)! - 1.0. The document formats, the viewer's options and methods, the element's attributes, the React props, the render package, the pipeline's configuration and commands, and the exporter's index now follow semantic versioning; the catalog files stay a contract between the pipeline and the viewer of one major version, and `zomboid-models/rules` follows the game.
  
  Breaking changes: the game's rules (outfit generation, the random number generators, clip selection, the looks of animals, items, and vehicles, the vehicle shader state and zones, the daylight arithmetic, the shadow sizes, the catalog types) are exported from `zomboid-models/rules` instead of the package root. The `character` option and `setCharacter()` are gone (`document` and `setDocument()`), as are the `<zomboid-character>` element, the `ZomboidCharacter` component, the `ViewerDocument` type (`SubjectDescription`), the `Manifest` alias (`CharacterCatalog`), and `ValidationResult` (`CharacterValidationResult`). The element's boolean attributes follow one rule: present is on, the value `false` is off. Node.js 22 is the minimum.
  
  New: `setPoseTime()` and `setAnimateLightbar()` on the viewer; `shadow`, `animate-lightbar`, and `max-pixel-ratio` attributes on the element; in-place updates of the pose time, the light bar, and the callbacks in the React component; `getAssetCache` and `AssetCache` exported for pages that need the catalogs and the names; asset requests that are retried and time out; a `context-lost` warning when the browser drops the WebGL context and a `catalog-version` warning when the asset folder comes from another major version of the pipeline, which now stamps its version into `manifest.json`; glTF sources copied by the pipeline and its FBX converter exported; an `--animation-speed` flag for the render command line.

### Minor Changes

- [`88d4405`](https://github.com/Kentucky-Vibes/zomboid-models/commit/88d44057ea2447da04bdf05e7ccafba32e351a9c) Thanks [@tlagx](https://github.com/tlagx)! - Animals. A `zomboid-models/animal` document names one of the thirty Build 42 animal types with a breed, a texture, a body variant (live, rotten, skinned, skeleton, headless, fleece, sheared), a size, tint, hue, and a stance; the pipeline reads the game's animal definitions and writes an animal catalog, and the viewer renders animal documents next to characters.

- [`1e9029b`](https://github.com/Kentucky-Vibes/zomboid-models/commit/1e9029b1af49256196155ff98933a7bff6eed7f8) Thanks [@tlagx](https://github.com/tlagx)! - FBX meshes and items. The pipeline converts the game's FBX files (the 1900 ground models of items, the held items it used to skip, the vehicle bodies) through the three.js FBX loader, and a `zomboid-models/item` document shows one item on its own, on the ground or in the hand, from an item catalog.

- [`a5c3b99`](https://github.com/Kentucky-Vibes/zomboid-models/commit/a5c3b99dfd988e4927ea51de2c6386bb92b6ed01) Thanks [@tlagx](https://github.com/tlagx)! - Fidelity. Characters, animals, and vehicles cast the game's blob shadows (`shadow` option); held weapons show the blood the document gives them through the game's overlay masks; a vehicle's light bar flashes with the pattern of its `lightbarMode` (`animateLightbar` option) and a new description of the same vehicle applies in place; the doors, hoods, and trunks of the cars with hinged meshes open and close with the clips and rates of their scripts, which the pipeline now keeps as skins and animations in the converted model; and the `lighting` option lights the scene for a time of day (`day`, `dusk`, `night`, `studio`, or an hour with a season and a moon) from the game's climate tables.

- [`7a8df89`](https://github.com/Kentucky-Vibes/zomboid-models/commit/7a8df89c9afb79b0e60eacbffb33f3dbb9a92f2f) Thanks [@tlagx](https://github.com/tlagx)! - Display names per language and the players index. The pipeline writes `catalog-names-<lang>-<hash>.json` for every language in `languages` (`EN` by default) from the game's translation files: items, vehicles, hair and beard styles, animal types and breeds, and body locations, with English and the script names filling what a language lacks. `loadNames(language)` on the asset cache and `displayName()` read them; the playground shows names in the language you pick. `runBuild`, `resolveConfig`, and `loadConfig` are exported for builds from code. The exporter mod writes `players.json`, exports the vehicle a player sits in, and links it from the player's document.

- [`38cda7e`](https://github.com/Kentucky-Vibes/zomboid-models/commit/38cda7eb64820d45e2c62b725b26cf88bb599cc1) Thanks [@tlagx](https://github.com/tlagx)! - Scenes. A `zomboid-models/scene` document places several characters, animals, items, and vehicles together on one ground plane, in the game's units and at the game's relative sizes, with `yaw: 0` facing the camera for every kind, and seats characters in vehicles on the seats of the vehicle script with the game's driving idle. The vehicle catalog carries the seat positions and the character catalog the vehicle idle clip. The Web Component is now `<zomboid-view>` and the React component `ZomboidView`; `<zomboid-character>` and `ZomboidCharacter` stay as aliases until 1.0.

- [`43ccba9`](https://github.com/Kentucky-Vibes/zomboid-models/commit/43ccba90d28fb6e484a34e7485a79d055aff868e) Thanks [@tlagx](https://github.com/tlagx)! - Vehicles. A `zomboid-models/vehicle` document names a vehicle script with its skin, paint, rust, the state of its parts, its lights, and the blood on its sides; the renderer draws it with a port of the game's vehicle shader (paint zones, rust, damage, blood, lights), the wheels from the game's text meshes, and the part models where the scripts place them. The pipeline reads the vehicle scripts with their templates and builds a vehicle catalog. `validateDescription()` checks a document of any kind, and the Web Component loads any kind through `src`.

### Patch Changes

- Updated dependencies [[`dfdac0b`](https://github.com/Kentucky-Vibes/zomboid-models/commit/dfdac0b713dc6e471d4e47dff8be4e5a00104717), [`88d4405`](https://github.com/Kentucky-Vibes/zomboid-models/commit/88d44057ea2447da04bdf05e7ccafba32e351a9c), [`1e9029b`](https://github.com/Kentucky-Vibes/zomboid-models/commit/1e9029b1af49256196155ff98933a7bff6eed7f8), [`a5c3b99`](https://github.com/Kentucky-Vibes/zomboid-models/commit/a5c3b99dfd988e4927ea51de2c6386bb92b6ed01), [`7a8df89`](https://github.com/Kentucky-Vibes/zomboid-models/commit/7a8df89c9afb79b0e60eacbffb33f3dbb9a92f2f), [`22299d2`](https://github.com/Kentucky-Vibes/zomboid-models/commit/22299d2b2c4735e45aac2550fed33dcf33472054), [`4d4715c`](https://github.com/Kentucky-Vibes/zomboid-models/commit/4d4715cae2ded3e7fe4c1eee9048e439862331fc), [`38cda7e`](https://github.com/Kentucky-Vibes/zomboid-models/commit/38cda7eb64820d45e2c62b725b26cf88bb599cc1), [`43ccba9`](https://github.com/Kentucky-Vibes/zomboid-models/commit/43ccba90d28fb6e484a34e7485a79d055aff868e)]:
  - zomboid-models@1.0.0

## 0.2.0

### Minor Changes

- [`9cb33e1`](https://github.com/Kentucky-Vibes/zomboid-models/commit/9cb33e10f94ff4d768e01b4fc4808350d063ac60) Thanks [@tlagx](https://github.com/tlagx)! - Zombies, outfits by name, stances, and animation speed.
  
  - Idle clips now play at the speed the game's animation sets give them (the unarmed idle at 0.48, the zombie idle at 0.23 with a per-zombie random multiplier and start), and a `animationSpeed` option multiplies it.
  - `body.zombie` renders a zombie: rotten skin by stage, skeleton bodies, no body hair, the zombie animation set.
  - `outfit` dresses the character from one of the game's named outfits with a bit-exact port of the game's randomiser, so a seed gives the same clothes, hair, colours, underwear, attached weapon, wounds, and bandages as in the game.
  - `stance` picks a pose: standing, crawling, on the back, sitting, or a corpse.
  - The manifest is now an index (`manifest.json`, version 2) plus one catalog file per kind of subject; assets have to be rebuilt.
  - The viewer takes `document` and `setDocument()`; `character` and `setCharacter()` stay as aliases.

### Patch Changes

- Updated dependencies [[`9cb33e1`](https://github.com/Kentucky-Vibes/zomboid-models/commit/9cb33e10f94ff4d768e01b4fc4808350d063ac60)]:
  - zomboid-models@0.2.0

## 0.1.0

### Minor Changes

- [`c0afbde`](https://github.com/Kentucky-Vibes/zomboid-models/commit/c0afbdeca99feed9ea6edadf21033b1a40858254) Thanks [@tlagx](https://github.com/tlagx)! - First release: asset pipeline for Build 42 (`.x` meshes and animations, textures, scripts, clothing, decals, mods), the three.js renderer with texture compositing (blood, dirt, holes, patches, tint, hue, decals, wounds, bandages), held and attached items, idle animations by held item, the Web Component, and the React component.

### Patch Changes

- Updated dependencies [[`c0afbde`](https://github.com/Kentucky-Vibes/zomboid-models/commit/c0afbdeca99feed9ea6edadf21033b1a40858254)]:
  - zomboid-models@0.1.0
