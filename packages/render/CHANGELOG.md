# zomboid-models-render

## 1.0.0

### Major Changes

- [`22299d2`](https://github.com/Kentucky-Vibes/zomboid-models/commit/22299d2b2c4735e45aac2550fed33dcf33472054) Thanks [@tlagx](https://github.com/tlagx)! - 1.0. The document formats, the viewer's options and methods, the element's attributes, the React props, the render package, the pipeline's configuration and commands, and the exporter's index now follow semantic versioning; the catalog files stay a contract between the pipeline and the viewer of one major version, and `zomboid-models/rules` follows the game.
  
  Breaking changes: the game's rules (outfit generation, the random number generators, clip selection, the looks of animals, items, and vehicles, the vehicle shader state and zones, the daylight arithmetic, the shadow sizes, the catalog types) are exported from `zomboid-models/rules` instead of the package root. The `character` option and `setCharacter()` are gone (`document` and `setDocument()`), as are the `<zomboid-character>` element, the `ZomboidCharacter` component, the `ViewerDocument` type (`SubjectDescription`), the `Manifest` alias (`CharacterCatalog`), and `ValidationResult` (`CharacterValidationResult`). The element's boolean attributes follow one rule: present is on, the value `false` is off. Node.js 22 is the minimum.
  
  New: `setPoseTime()` and `setAnimateLightbar()` on the viewer; `shadow`, `animate-lightbar`, and `max-pixel-ratio` attributes on the element; in-place updates of the pose time, the light bar, and the callbacks in the React component; `getAssetCache` and `AssetCache` exported for pages that need the catalogs and the names; asset requests that are retried and time out; a `context-lost` warning when the browser drops the WebGL context and a `catalog-version` warning when the asset folder comes from another major version of the pipeline, which now stamps its version into `manifest.json`; glTF sources copied by the pipeline and its FBX converter exported; an `--animation-speed` flag for the render command line.

### Minor Changes

- [`4d4715c`](https://github.com/Kentucky-Vibes/zomboid-models/commit/4d4715cae2ded3e7fe4c1eee9048e439862331fc) Thanks [@tlagx](https://github.com/tlagx)! - A render package and an image mode. `zomboid-models-render` renders documents to PNG and WebP files from Node.js, through a command line or a `Renderer` kept open for many pictures, in the Chromium Playwright ships, from a folder of assets or from the URL they are hosted at, without an HTTP server. The viewer gains `mode: 'image'`, which draws only through `toImage()` with the animation held at `poseTime`, and `toImage()` takes a `type` (`image/webp`) and a `quality`.

### Patch Changes

- Updated dependencies [[`dfdac0b`](https://github.com/Kentucky-Vibes/zomboid-models/commit/dfdac0b713dc6e471d4e47dff8be4e5a00104717), [`88d4405`](https://github.com/Kentucky-Vibes/zomboid-models/commit/88d44057ea2447da04bdf05e7ccafba32e351a9c), [`1e9029b`](https://github.com/Kentucky-Vibes/zomboid-models/commit/1e9029b1af49256196155ff98933a7bff6eed7f8), [`a5c3b99`](https://github.com/Kentucky-Vibes/zomboid-models/commit/a5c3b99dfd988e4927ea51de2c6386bb92b6ed01), [`7a8df89`](https://github.com/Kentucky-Vibes/zomboid-models/commit/7a8df89c9afb79b0e60eacbffb33f3dbb9a92f2f), [`22299d2`](https://github.com/Kentucky-Vibes/zomboid-models/commit/22299d2b2c4735e45aac2550fed33dcf33472054), [`4d4715c`](https://github.com/Kentucky-Vibes/zomboid-models/commit/4d4715cae2ded3e7fe4c1eee9048e439862331fc), [`38cda7e`](https://github.com/Kentucky-Vibes/zomboid-models/commit/38cda7eb64820d45e2c62b725b26cf88bb599cc1), [`43ccba9`](https://github.com/Kentucky-Vibes/zomboid-models/commit/43ccba90d28fb6e484a34e7485a79d055aff868e)]:
  - zomboid-models@1.0.0
