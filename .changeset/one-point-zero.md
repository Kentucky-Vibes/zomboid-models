---
'zomboid-models': major
'zomboid-models-pipeline': major
'zomboid-models-element': major
'zomboid-models-react': major
'zomboid-models-render': major
---

1.0. The document formats, the viewer's options and methods, the element's attributes, the React props, the render package, the pipeline's configuration and commands, and the exporter's index now follow semantic versioning; the catalog files stay a contract between the pipeline and the viewer of one major version, and `zomboid-models/rules` follows the game.

Breaking changes: the game's rules (outfit generation, the random number generators, clip selection, the looks of animals, items, and vehicles, the vehicle shader state and zones, the daylight arithmetic, the shadow sizes, the catalog types) are exported from `zomboid-models/rules` instead of the package root. The `character` option and `setCharacter()` are gone (`document` and `setDocument()`), as are the `<zomboid-character>` element, the `ZomboidCharacter` component, the `ViewerDocument` type (`SubjectDescription`), the `Manifest` alias (`CharacterCatalog`), and `ValidationResult` (`CharacterValidationResult`). The element's boolean attributes follow one rule: present is on, the value `false` is off. Node.js 22 is the minimum.

New: `setPoseTime()` and `setAnimateLightbar()` on the viewer; `shadow`, `animate-lightbar`, and `max-pixel-ratio` attributes on the element; in-place updates of the pose time, the light bar, and the callbacks in the React component; `getAssetCache` and `AssetCache` exported for pages that need the catalogs and the names; asset requests that are retried and time out; a `context-lost` warning when the browser drops the WebGL context and a `catalog-version` warning when the asset folder comes from another major version of the pipeline, which now stamps its version into `manifest.json`; glTF sources copied by the pipeline and its FBX converter exported; an `--animation-speed` flag for the render command line.
