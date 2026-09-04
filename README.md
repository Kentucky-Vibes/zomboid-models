# zomboid-models

Renders Project Zomboid (Build 42) characters in the browser: the body, clothing including clothing from mods, hair and beard, items in the hands, and the blood, wounds, and bandages the game draws on them, animated with the game's own animation files.

The project has three parts. A three.js library draws the character from a JSON description. A command line pipeline converts the assets from your own copy of the game or of the dedicated server into files a browser can load. A playground lets you assemble a character and look at the result.

Status: early development. Nothing is published to npm yet, and the renderer does not draw anything yet. The milestones are listed in [docs/decisions.md](docs/decisions.md).

## How it fits together

1. Run `zomboid-models build` against a Project Zomboid install and any mod folders. It writes a folder of meshes, textures, animations, and a catalog.
2. Serve that folder as static files.
3. In your page, give the library a JSON description of a character and the URL of that folder.

## Packages

| Package                   | Folder              | What it is                                               |
| ------------------------- | ------------------- | -------------------------------------------------------- |
| `zomboid-models`          | `packages/core`     | The renderer and the character JSON format               |
| `zomboid-models-pipeline` | `packages/pipeline` | The `zomboid-models` command line tool                   |
| playground                | `apps/playground`   | A Vite app for building and viewing characters (private) |

A Web Component and a React wrapper are planned once the renderer has a stable API.

## Assets and licensing

This repository contains no files from the game or from mods. You convert and host the assets yourself. The Indie Stone's [Terms and Conditions](https://projectzomboid.com/blog/support/terms-conditions/) allow fan use of the game's assets for non-commercial purposes when the required thank-you wording is shown, and the viewer shows it by default. Assets from mods need the permission of their authors; see the [Modding Policy](https://projectzomboid.com/blog/modding-policy/).

The code is licensed under [MIT](LICENSE).

## Development

Requires Node.js 20.19 or newer.

```bash
npm install
npm run check
npm run build
```

`npm run check` runs type checking, linting, formatting checks, and the tests. Tests that need a real game install run only when the `PZ_DIR` environment variable points at one.

## Credits

Thanks to The Indie Stone for creating Project Zomboid (https://projectzomboid.com/), which made this possible. This is an unofficial fan production for non-commercial purposes made under the Indie Stone Terms.

The viewer design owes several ideas to [openmp-models](https://github.com/AmyrAhmady/openmp-models) by AmyrAhmady.
