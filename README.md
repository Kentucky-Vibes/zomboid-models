# zomboid-models

Renders Project Zomboid (Build 42) characters, animals, items, and vehicles in the browser: the body, clothing including clothing from mods, hair and beard, items in the hands, the blood, wounds, and bandages the game draws on them, animated with the game's own animation files; the animals with their breeds; items on the ground or in the hand; and vehicles with the game's paint, rust, damage, blood, and lights.

The project has three parts. A three.js library draws the character from a JSON description. A command line pipeline converts the assets from your own copy of the game or of the dedicated server into files a browser can load. A playground lets you assemble a character and look at the result.

Status: released on npm. The renderer draws players and zombies (bodies, clothing, hats, hair, held and attached items, blood, dirt, holes, patches, decals, wounds, bandages, outfits by name with the game's own randomiser), the thirty Build 42 animals with their breeds and body variants, any item on the ground or in the hand, and every vehicle with its paint, rust, damage, blood, and lights through a port of the game's vehicle shader. A reference mod exports players from the game and describes vehicles on request. See [docs/decisions.md](docs/decisions.md) for what is still open.

A live playground runs at https://kentucky-vibes.github.io/zomboid-models/. It ships without game assets, so paste the URL of a folder you built with the pipeline into its asset field.

## How it fits together

1. Run `zomboid-models build` against a Project Zomboid install and any mod folders. It writes a folder of meshes, textures, animations, and a catalog.
2. Serve that folder as static files.
3. In your page, give the library a JSON description of a character and the URL of that folder.

## Packages

| Package                   | Folder                         | What it is                                                       |
| ------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| `zomboid-models`          | `packages/core`                | The renderer, the character JSON format, and its schema          |
| `zomboid-models-pipeline` | `packages/pipeline`            | The `zomboid-models` command line tool                           |
| `zomboid-models-element`  | `packages/element`             | The `<zomboid-character>` Web Component, three.js bundled        |
| `zomboid-models-react`    | `packages/react`               | A React component around the renderer                            |
| playground                | `apps/playground`              | A Vite app for building and viewing characters (not published)   |
| exporter mod              | `mods/zomboid-models-exporter` | A Project Zomboid mod that writes players as character documents |

## Documentation

- [docs/integration.md](docs/integration.md): using the viewer from plain JavaScript, the Web Component, React, and Next.js; hosting the assets.
- [docs/format.md](docs/format.md): the character JSON document.
- [docs/pipeline.md](docs/pipeline.md): configuring and running the asset conversion.
- [docs/decisions.md](docs/decisions.md): why things are the way they are.
- [docs/research](docs/research): how the game loads models, composes textures, and merges mods.

## Assets and licensing

This repository contains no files from the game or from mods. You convert and host the assets yourself. The Indie Stone's [Terms and Conditions](https://projectzomboid.com/blog/support/terms-conditions/) allow fan use of the game's assets for non-commercial purposes when the required thank-you wording is shown, and the viewer shows it by default. Assets from mods need the permission of their authors; see the [Modding Policy](https://projectzomboid.com/blog/modding-policy/).

The code is licensed under [MIT](LICENSE).

## Development

Requires Node.js 20.19 or newer.

```bash
npm install
npm run check
```

`npm run check` builds the packages and runs type checking, linting, formatting checks, and the tests. Tests that need a real game install run only when the `PZ_DIR` environment variable points at one; `PZ_SWEEP=1` also parses every model and animation file in it.

To try the playground against your own install, build the assets into its public folder and start the dev server:

```bash
node packages/pipeline/dist/cli.js init
node packages/pipeline/dist/cli.js build   # with outDir set to apps/playground/public/dev-assets
npm run dev -w playground
```

## Credits

Thanks to The Indie Stone for creating Project Zomboid (https://projectzomboid.com/), which made this possible. This is an unofficial fan production for non-commercial purposes made under the Indie Stone Terms.

The viewer design owes several ideas to [openmp-models](https://github.com/AmyrAhmady/openmp-models) by AmyrAhmady.
