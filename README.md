# zomboid-models

Renders Project Zomboid (Build 42) characters, animals, items, and vehicles in the browser, from JSON documents that mirror the game's own state, with the game's own models, textures, animations, and rules. A character is drawn with its clothing (including clothing from mods), hair and beard, the items in its hands and on its back, and the blood, wounds, and bandages the game paints on skin and cloth. Zombies come with their decay stages and gaits, animals with their breeds and body variants, vehicles with their paint, rust, damage, blood, lights, and doors that open. Several subjects can share a scene, survivors can sit in their car, and everything can walk, run, attack, eat, sit, or sleep the way the game animates it.

The project is a set of building blocks: a renderer, a pipeline that converts the assets from your own copy of the game, wrappers for pages and React, and a Node.js renderer for pictures. It ships no game files; you convert and host the assets yourself.

A playground runs at https://kentucky-vibes.github.io/zomboid-models/ and the API reference at https://kentucky-vibes.github.io/zomboid-models/api/. The playground has no assets of its own: paste the URL of a folder you built with the pipeline into its asset field.

## How it fits together

1. Run `zomboid-models build` against a Project Zomboid install and any mod folders. It writes a folder of meshes, textures, animations, and catalogs.
2. Serve that folder as static files.
3. In your page, give the viewer a document (a character, an animal, an item, a vehicle, or a scene) and the URL of that folder. Or render the document to a PNG from Node.js.

```js
import { createViewer } from 'zomboid-models';

createViewer(document.querySelector('#hero'), {
  assetBaseUrl: '/assets/',
  mode: 'showcase',
  document: {
    format: 'zomboid-models/character',
    version: 1,
    body: { sex: 'female', hair: 'Bob' },
    worn: [{ item: 'Base.Jacket_Varsity' }, { item: 'Base.Trousers_Denim' }],
    held: { primary: { item: 'Base.Axe' } },
    action: 'walk',
  },
});
```

## Packages

| Package                   | Folder                         | What it is                                                                |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `zomboid-models`          | `packages/core`                | The renderer, the document formats with their schemas, the game rules     |
| `zomboid-models-pipeline` | `packages/pipeline`            | The `zomboid-models` command line that converts the assets                |
| `zomboid-models-element`  | `packages/element`             | The `<zomboid-view>` Web Component, three.js bundled                      |
| `zomboid-models-react`    | `packages/react`               | The `ZomboidView` React component                                         |
| `zomboid-models-render`   | `packages/render`              | Renders documents to PNG and WebP files from Node.js                      |
| playground                | `apps/playground`              | A Vite app for building and viewing documents (not published)             |
| exporter mod              | `mods/zomboid-models-exporter` | A Project Zomboid mod that writes players and their vehicles as documents |

The five packages are released together under one version number.

## Documentation

- [docs/integration.md](docs/integration.md): the viewer from plain JavaScript, the Web Component, React, and Next.js; the names, the exporter's files, hosting, pictures.
- [docs/format.md](docs/format.md): the document formats.
- [docs/pipeline.md](docs/pipeline.md): configuring and running the asset conversion.
- [docs/decisions.md](docs/decisions.md): why things are the way they are, and what the project will not do.
- [docs/research](docs/research): how the game loads models, composes textures, merges mods, and animates animals.
- [API reference](https://kentucky-vibes.github.io/zomboid-models/api/): every exported function and type.

## What 1.0 promises

The document formats (`version: 1`), the viewer's options and methods, the element's attributes, the React props, the render package's API and command line, the pipeline's configuration and commands, and the exporter's `players.json` follow semantic versioning from 1.0 on: a minor release adds, a major release changes. Two things sit outside that promise on purpose. The catalog files the pipeline writes are a contract between the pipeline and the viewer of the same major version, so rebuild the assets when you move to a new major; the viewer warns when the folder comes from another one. And `zomboid-models/rules`, the game's rules as the renderer applies them, follows Build 42 and changes with it in minor releases.

Supported: Node.js 22 or later for the pipeline and the render package; browsers with WebGL 2 (current Chrome, Firefox, and Safari) for the viewer, with `three` 0.185 as a peer dependency; Project Zomboid Build 42, checked against 42.20.3, with mods through the pipeline's configuration.

## What it does not do

The project draws what the game draws in 3D and stops there. It has no editor for characters or scenes beyond the playground, no runtime for scripted or animated scenes, no hosting of assets (the docs give a recipe), and no tiles, buildings, or furniture, which the game draws as sprites. Sites that need more build it on top, from the viewer and the exported rules, or in a fork.

## Assets and licensing

This repository contains no files from the game or from mods. You convert and host the assets yourself. The Indie Stone's [Terms and Conditions](https://projectzomboid.com/blog/support/terms-conditions/) allow fan use of the game's assets for non-commercial purposes when the required thank-you wording is shown, and the viewer shows it by default. Assets from mods need the permission of their authors; see the [Modding Policy](https://projectzomboid.com/blog/modding-policy/).

The code is licensed under [MIT](LICENSE).

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run check
```

`npm run check` builds the packages and runs type checking, linting, formatting checks, and the tests. Tests that need a real game install run only when the `PZ_DIR` environment variable points at one; `PZ_SWEEP=1` also parses every model and animation file in it. `npm test -- --coverage` adds a coverage report.

`npm run test:visual` takes screenshots of the viewer in headless Chromium (install it once with `npx playwright install chromium`) and compares them with the ones under `visual/tests/__screenshots__`; pass `--update-snapshots` after an intended change. With `ZM_VISUAL_REAL=1` it also renders documents from `apps/playground/public/dev-assets`, a folder built from your own install, and keeps those screenshots locally. The render package's tests use the same Chromium and skip without it.

To try the playground against your own install, build the assets into its public folder and start the dev server:

```bash
node packages/pipeline/dist/cli.js init
node packages/pipeline/dist/cli.js build   # with outDir set to apps/playground/public/dev-assets
npm run dev -w playground
```

`npm run docs:api` builds the API reference into the playground's `dist/api` folder.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how changes are made and [SECURITY.md](SECURITY.md) for reporting a vulnerability.

## Credits

Thanks to The Indie Stone for creating Project Zomboid (https://projectzomboid.com/), which made this possible. This is an unofficial fan production for non-commercial purposes made under the Indie Stone Terms.

The viewer design owes several ideas to [openmp-models](https://github.com/AmyrAhmady/openmp-models) by AmyrAhmady.
