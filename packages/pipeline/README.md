# zomboid-models-pipeline

The command line that reads a Project Zomboid (Build 42) install, either the game client or the dedicated server, plus any number of mod folders, and writes the meshes, textures, animations, and catalogs that the `zomboid-models` renderer loads in the browser.

```bash
npm install --save-dev zomboid-models-pipeline
npx zomboid-models init      # finds the install and writes zomboid-models.config.json
npx zomboid-models doctor    # checks the configuration, the install, and the mods
npx zomboid-models build     # converts everything into the output folder
```

A vanilla build with every subject takes under a minute and produces about 150 MB of static files: one glTF binary per mesh and per animation clip, the PNG textures, a `manifest.json` index, and one catalog per kind of subject, with display names per language when asked for. The [pipeline guide](https://github.com/kentucky-vibes/zomboid-models/blob/main/docs/pipeline.md) explains the configuration, the mod handling, and the output.

The package can also be used from Node.js: `runBuild(config)` runs a build, `loadConfig` and `resolveConfig` read a configuration, and the converters for the game's file formats are exported on their own (`parseX` and `convertMeshFile` and `convertAnimationFile` for the `.x` files, `convertFbxFile` for FBX, `convertTextMeshFile` for the game's text meshes).

Requires Node.js 22 or later. The output folder contains converted copies of game and mod assets, so hosting it publicly is subject to The Indie Stone's Terms and Conditions and to the permissions of the mod authors involved. The tool itself ships no assets.
