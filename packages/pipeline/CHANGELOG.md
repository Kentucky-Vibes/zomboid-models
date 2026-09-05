# zomboid-models-pipeline

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
