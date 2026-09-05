# zomboid-models-element

The `<zomboid-view>` Web Component. It wraps the `zomboid-models` renderer, bundles three.js, and works in plain HTML pages and in any framework. It shows one document: a character, an animal, an item, a vehicle, or a scene. Removing the element from the page disposes the viewer.

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/zomboid-models-element/dist/index.js"
></script>

<zomboid-view
  asset-base-url="/assets/"
  src="/characters/tlagx.json"
  mode="showcase"
  style="width: 320px; height: 480px"
></zomboid-view>
```

Attributes: `asset-base-url` (required), `src` (a document by URL) or the `document` property (an object), `mode` (`viewer`, `showcase`, or `image`), `animation` (a clip name, `none` for the bind pose, omitted for the clip the game would play), `animation-speed`, `pose-time`, `background`, `max-pixel-ratio`, `camera` (JSON), `lighting` (a preset name or JSON), and the boolean attributes `auto-rotate`, `attribution`, `shadow`, and `animate-lightbar`, which are on when present and off with the value `false`. Events: `ready`, `warning`, `error`. Methods: `toImage()`, `play()`, `pause()`; `viewerInstance` is the viewer itself.

The element needs an asset folder converted with `zomboid-models-pipeline` from your own copy of the game. See the [integration guide](https://github.com/kentucky-vibes/zomboid-models/blob/main/docs/integration.md) for the options and the [format guide](https://github.com/kentucky-vibes/zomboid-models/blob/main/docs/format.md) for the documents.
