# zomboid-models-element

The `<zomboid-character>` Web Component. It wraps the `zomboid-models` renderer, bundles three.js, and works in plain HTML pages and in any framework. Removing the element from the page disposes the viewer.

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/zomboid-models-element/dist/index.js"
></script>

<zomboid-character
  asset-base-url="/assets/"
  src="/characters/tlagx.json"
  mode="showcase"
  style="width: 320px; height: 480px"
></zomboid-character>
```

Attributes: `asset-base-url` (required), `src` or the `character` property, `mode` (`viewer` or `showcase`), `animation` (a clip name, `none` for the bind pose, omitted for the game's idle), `pose-time`, `background`, `auto-rotate`, `attribution`, `camera` (JSON). Events: `ready`, `warning`, `error`. Methods: `toImage()`, `play()`, `pause()`.

The package is in early development and is not published yet. See the repository README for the asset pipeline and the character JSON format.
