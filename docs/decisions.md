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

Character, clothing, hair, and weapon meshes in Build 42 are ASCII DirectX `.x` files, each carrying its own copy of the skeleton and its skin weights. The 2209 animations are `.x` files too. Textures are 256 by 256 PNG. FBX is used only for props lying on the ground.

The pipeline parses `.x` with its own TypeScript parser. Reason: the format is text, the subset the game uses is small, and a dependency on Assimp or Blender would make the tool harder to install. Assimp, which the game itself uses through jassimp, may be used as an optional cross-check in local tests.

Output is one glTF binary (GLB) per mesh and per animation clip, without geometry compression, plus PNG textures copied as they are, plus a `manifest.json` catalog. File names include a content hash so that hosting can use long cache lifetimes. Reason: GLB is a standard with loaders and validators, the meshes are small enough that brotli on the server is all the compression needed, and the decoder for meshopt would cost more than it saves.

The build merges vanilla and mods into one output. Reason: rebuilding after a modpack change is cheap, and a layered runtime would complicate the renderer.

Mods are discovered the way the game does it: `mod.info`, a `common` folder plus the best matching `42.x` version folder, and both the plain mod layout and the Workshop `Contents/mods/*` layout. The set and order of mods come from an explicit list, which can be imported from a server `.ini`, or from every mod found in the configured folders. The game version is read from `version.txt` in the user's Zomboid folder and can be overridden.

## Rendering

The renderer uses three.js. One WebGL renderer is shared by every viewer on the page; each viewer owns an ordinary canvas that receives its frame through `drawImage`. Reason: browsers cap the number of live WebGL contexts, and characters are meant to appear as interface elements, possibly many at once.

Two modes exist. The viewer mode has orbit controls and zoom. The showcase mode has no controls, a transparent background, camera framing from options, and autoplay, and it pauses when off screen or when the user prefers reduced motion. A pose can be frozen at any time in any clip. Both modes can export a PNG.

All worn meshes bind to one skeleton taken from the body mesh, matched by bone name. Textures are baked once per item into a render target with shaders ported from the game's own GLSL: blood, dirt, holes, patches, tint, hue, and the masks that hide skin under clothing. The rules from the game's data are followed as they are: render order and mutual exclusion of clothing slots, hair replaced by a flattened variant under hats, paired models, and shirt decals. The idle animation is chosen per held item, the way the game resolves it through its animation sets. Lighting is simple and there are no shadows, so the result looks like the game.

The character description may name an outfit from the game's outfit data, with a seed, instead of listing items. Reason: demos and placeholders without hand-written item lists.

## Tooling

TypeScript in strict mode, ESM only, Node 20.19 or newer. three.js is a peer dependency of the renderer and is bundled into the Web Component build. Packages are built with tsup, the playground with Vite. Tests run with vitest on synthetic fixtures; tests that need a real install run only when a `PZ_DIR` environment variable is set. ESLint and Prettier enforce style. GitHub Actions runs the checks and publishes releases through changesets. Commits follow Conventional Commits. Everything is written in English. Documentation lives in `docs/` as Markdown.

The game's Java classes are decompiled locally to understand model loading, texture composition, and the visual state, and the decompiled code is never committed.

## Milestones

1. Scaffold, continuous integration, decompilation for research.
2. Pipeline for vanilla assets; body, clothing, and hair from a hand-written JSON document; a looped idle animation; viewer and showcase modes; the playground.
3. Held items and attached items.
4. Blood, wounds, bandages, dirt, holes, and patches.
5. Mod scanning.
6. The reference exporter mod.

## Credits

The viewer design, the render scheduler, and the way the rendering layer stays independent of the user interface follow ideas from openmp-models by AmyrAhmady, a viewer for GTA San Andreas assets. No code was copied from it.
