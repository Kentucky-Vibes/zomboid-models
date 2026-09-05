# Decisions

This file records the choices that shape zomboid-models and the reasons behind them. An entry stays in force until a later entry replaces it. The first block was agreed on 2026-09-04, before any code was written.

## Purpose and scope

zomboid-models renders Project Zomboid (Build 42) player characters in a web page: the body, clothing including clothing from mods, hair and beard, items held in the hands, items attached to the body, and the blood, dirt, wounds, and bandages the game draws on skin and cloth. It plays the game's own animations.

It is a general tool, not a feature of one website. Kentucky Vibes is the first user and keeps its integration, including any code that talks to its private server mod, in a separate repository. Nothing in this repository depends on that mod.

Out of scope: zombies, animals, vehicles, and Build 41. The design does not block adding them later, but nothing is built for them.

## Packages

The npm package names are unscoped: `zomboid-models` (the renderer), `zomboid-models-pipeline` (the converter), and, once the renderer has a public API, `zomboid-models-element` (a Web Component) and `zomboid-models-react` (a thin React wrapper). The repository is an npm workspaces monorepo, and the published packages share one version number through changesets.

Reason: short names, no npm organization to manage, and authorship stays visible in the package metadata and on GitHub.

## Character description

The renderer takes a JSON document that mirrors the game's own state: the `HumanVisual` fields (sex, skin, hair, beard, colours), one `ItemVisual` per worn item (texture choice, tint, hue, decal, and blood, dirt, holes, and patches per body part), the items in each hand, attached items, and `BodyDamage` per body part. The document carries a format version and is described by a published JSON Schema. A builder API exists for writing such documents by hand.

Reason: an exporter running inside the game can copy these fields without losing information, and the renderer can reproduce exactly what the game shows. A friendlier layer can sit on top; the canonical form is the low-level one.

A reference exporter, an open Lua mod with a server part that writes one file per player and a client part that exports the local player, is planned after the first milestone. It has to work within the limits of the game's Kahlua Lua runtime.

## Assets and licensing

This repository contains no files from the game or from mods, and never will. Tests use small synthetic fixtures written for the project.

The pipeline runs on the user's own install. Both the game client and the dedicated server ship the full `media/` folder, so either works. The output is a folder of static files; the renderer needs only its base URL. Whoever hosts that folder is responsible for The Indie Stone's Terms and Conditions (section 2.2 allows fan use for non-commercial purposes when the required thank-you wording is shown) and for the permissions of the mod authors whose work is included. The renderer shows the required wording by default.

Code is licensed under MIT.

## Input formats and conversion

Character, clothing, hair, and weapon meshes in Build 42 are ASCII DirectX `.x` files, each carrying its own copy of the skeleton and its skin weights. The 2209 animations are `.x` files too. Textures are 256 by 256 PNG. FBX (binary for items lying on the ground, ASCII for vehicles) is read with the three.js loader running in Node; as the game flips every import into its left-handed frame and FBX data is right-handed to begin with, FBX meshes are written to glTF as they are while `.x` meshes are mirrored. The vehicle wheels are stored in the game's own text mesh format (`# Project Zomboid Mesh`, one line per vertex attribute, then the faces), which the pipeline reads with a small parser of its own and mirrors like the `.x` files, since those files hold the game's in-memory, left-handed data.

The pipeline parses `.x` with its own TypeScript parser. Reason: the format is text, the subset the game uses is small, and a dependency on Assimp or Blender would make the tool harder to install. Assimp, which the game itself uses through jassimp, may be used as an optional cross-check in local tests.

Output is one glTF binary (GLB) per mesh and per animation clip, without geometry compression, plus PNG textures copied as they are, plus a `manifest.json` catalog. File names include a content hash so that hosting can use long cache lifetimes. Reason: GLB is a standard with loaders and validators, the meshes are small enough that brotli on the server is all the compression needed, and the decoder for meshopt would cost more than it saves.

The build merges vanilla and mods into one output. Reason: rebuilding after a modpack change is cheap, and a layered runtime would complicate the renderer.

Mods are discovered the way the game does it: `mod.info`, a `common` folder plus the best matching `42.x` version folder, and both the plain mod layout and the Workshop `Contents/mods/*` layout. The set and order of mods come from an explicit list, which can be imported from a server `.ini`, or from every mod found in the configured folders. The game version is read from `version.txt` in the user's Zomboid folder and can be overridden.

## Rendering

The renderer uses three.js. One WebGL renderer is shared by every viewer on the page; each viewer owns an ordinary canvas that receives its frame through `drawImage`. Reason: browsers cap the number of live WebGL contexts, and characters are meant to appear as interface elements, possibly many at once.

Two modes exist. The viewer mode has orbit controls and zoom. The showcase mode has no controls, a transparent background, camera framing from options, and autoplay, and it pauses when off screen or when the user prefers reduced motion. A pose can be frozen at any time in any clip. Both modes can export a PNG.

All worn meshes bind to one skeleton taken from the body mesh, matched by bone name. Textures are baked once per item into a render target with shaders ported from the game's own GLSL: blood, dirt, holes, patches, tint, hue, and the masks that hide skin under clothing. The rules from the game's data are followed as they are: render order and mutual exclusion of clothing slots, hair replaced by a flattened variant under hats, paired models, and shirt decals. The idle animation is chosen per held item, the way the game resolves it through its animation sets. Lighting is simple and there are no shadows, so the result looks like the game.

The character description may name an outfit from the game's outfit data, with a seed, instead of listing items. The randomiser behind it is a port of the game's own, bit for bit: the generator (`LocationRNG`, a xoroshiro128+ seeded through SplitMix64), the single-precision arithmetic, and the order of every draw in `Outfit.Randomize`, `dressInOutfit`, the hair definitions, the underwear, attached weapon, wound, and bandage code of zombies. Reason: a seed then gives the same zombie as the game, which is the point of a renderer that follows the game's rules; a generator of our own would only look similar. The generator is checked against values dumped from the game's classes with a small Java program.

Animations play at the speed the game's animation sets set for each node (`m_SpeedScale`), with the per-character random multiplier and starting point some nodes declare. Reason: the clip files run at 4800 ticks per second and, played as they are, the unarmed idle was twice too fast; the game slows it down through the animation set, not the file.

Zombies share the player's body meshes, clothing, and texture compositing; they differ by skin texture (four bodies in three decay stages, or a skeleton), the absence of body hair, and their animation set. A `stance` field selects the clip for standing, crawling, lying on the back, sitting, and dead characters, for players and zombies alike.

Vehicles are drawn with a port of the game's vehicle shader, line by line: the mask texture cuts the body into 27 zones, four pairs of matrices switch the lights, the two damage textures, the uninstalled shade, and the blood per zone, the paint recolours the shell through HSV, and rust and damage come from a second UV set. The document stores the game's state (the parts with their condition, whether they are missing or open, the lights, the blood per side, the paint, the rust, the skin) rather than the zone switches. Reason: an exporter copies plain fields from `BaseVehicle`, and the zone logic of `checkDamage`, `updateLights`, and `doBloodOverlay` is ported once, index by index, in the transposed matrix layout the game uploads. The body, the wheels, and the part models are placed as `updateTransform` places them, composed in the game's frame and mirrored as a whole. What differs from the game: the sky box it reflects in the windows is a soft gradient, the sphere map uses eye-space vectors, the lighting is ambient plus one fixed light, doors and hoods are drawn closed (the three cars with door meshes have no animation yet), and models placed on attachment points (one hood ornament) are skipped.

The manifest is an index plus one catalog file per subject kind. Reason: the character catalog alone is a few megabytes with outfits and definitions, and vehicles, animals, and items will add their own; a page should download only what it shows.

## Tooling

Screenshot tests run the viewer in headless Chromium through Playwright, with software rendering so that every machine draws the same pixels. The committed screenshots come from a synthetic asset folder built out of the test fixtures; a second set against a real install runs only on request and keeps its screenshots out of the repository, because images rendered from the game's assets are the game's assets too.

TypeScript in strict mode, ESM only, Node 20.19 or newer. three.js is a peer dependency of the renderer and is bundled into the Web Component build. Packages are built with tsup, the playground with Vite. Tests run with vitest on synthetic fixtures; tests that need a real install run only when a `PZ_DIR` environment variable is set. ESLint and Prettier enforce style. GitHub Actions runs the checks and publishes releases through changesets. Commits follow Conventional Commits. Everything is written in English. Documentation lives in `docs/` as Markdown.

The game's Java classes are decompiled locally to understand model loading, texture composition, and the visual state, and the decompiled code is never committed.

## Milestones

1. Scaffold, continuous integration, decompilation for research. Done.
2. Pipeline for vanilla assets; body, clothing, and hair from a hand-written JSON document; a looped idle animation; viewer and showcase modes; the playground. Done.
3. Held items and attached items. Done for `.x` meshes; props stored as FBX are skipped by the pipeline until it learns to read FBX.
4. Blood, wounds, bandages, dirt, holes, patches, tint, hue, and decals. Done.
5. Mod scanning. Done; the outfit-by-name feature from the character format is still open.
6. The reference exporter mod. Done as `mods/zomboid-models-exporter`, tested under a Lua interpreter in Node.js against mock game objects; a run inside the game is still owed.

Later additions to the list: the Web Component and React packages exist (decided in the first session, delivered with milestone 4), and the playground deploys to GitHub Pages from every push to main. The mod has since been run on a dedicated server.

After the first release the plan grew, in this order, each step a minor release:

- 0.2: animation speed from the animation sets, zombies, outfits by name with the game's randomiser, stances, the manifest split into catalogs, the `document` option. Done.
- 0.3: animals from Build 42: the thirty types of the definitions with their breeds and textures, the body variants (rotten, skinned, skeleton, headless, fleece), the size as the game scales it, tint and hue from the animal shader, and the idle, sitting, and corpse clips of each animation set. Done.
- 0.4: FBX through the three.js loader in Node, for the ground models of items, the held items that were skipped, and the vehicle bodies; an item document that shows one item on its own, on the ground or in the hand. Done.
- 0.5: vehicles with a live port of the game's vehicle shader (paint zones, rust, damage, blood, lights) and the game's text mesh format for wheels. Done; the document stores the parts' state as the game keeps it, and the exporter mod describes vehicles on request.

- 0.6: display names per language from the game's translation files, the players index and the vehicle a player sits in from the exporter mod, and the screenshot tests. Done. Names are baked complete per language (a language's text, else English, else the script's name) so that a page loads one file; outfit names stay identifiers because the game does not translate them.

Planned next, in this order: 0.7 scenes with several subjects, passengers on the seats of vehicles, and the `zomboid-view` element and `ZomboidView` component names; 0.8 ground shadows, lighting by hour and season from the game's tables, blood on weapons, animated doors and hoods, the light bar modes; 0.9 actions from the animation sets (walking, running, attacking, eating, and more) for players, zombies, and animals; 0.10 a package that renders documents to PNG and WebP without a browser on the page, and an image mode in the viewer.

Open after 0.5: models placed on attachment points and a vehicle example exported from a server.

Coverage of the game's subjects stops at things that are drawn in 3D. Tiles, buildings, and furniture are sprites and stay out.

## Credits

The viewer design, the render scheduler, and the way the rendering layer stays independent of the user interface follow ideas from openmp-models by AmyrAhmady, a viewer for GTA San Andreas assets. No code was copied from it.
