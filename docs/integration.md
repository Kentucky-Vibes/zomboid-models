# Integrating the viewer

Three packages show a character, an animal, an item, or a vehicle on a page. All of them need a folder of converted assets (see [pipeline.md](pipeline.md)) reachable by URL, and a document (see [format.md](format.md)).

## Plain JavaScript

```js
import { createViewer } from 'zomboid-models';

const viewer = createViewer(document.querySelector('#hero'), {
  assetBaseUrl: '/assets/',
  mode: 'showcase',
  document: character,
});

// later
viewer.setDocument(otherCharacter);
viewer.setAnimation('Bob_IdleRifle');
const png = viewer.toImage({ width: 512, height: 768 });
viewer.dispose();
```

`createViewer` appends a canvas to the host element and sizes it to the host, so give the host a width and height. `dispose()` removes everything the viewer added and releases its GPU resources. `three` is a peer dependency: install it next to `zomboid-models`.

Options:

- `assetBaseUrl`: the folder that holds `manifest.json`.
- `mode`: `viewer` (orbit controls, zoom) or `showcase` (no controls, transparent background by default, pauses when off screen and when the visitor prefers reduced motion).
- `document`: the document to show: a character, an animal, an item, or a vehicle (see [format.md](format.md)). `character` and `setCharacter()` mean the same and stay until 1.0.
- `animation`: a clip name from the catalog, `null` for the bind pose, or omitted for the clip the game would play: the idle for the held item, the stance's clip, or the zombie idle, at the speed the game's animation sets give it. Items and vehicles have no clips.
- `animationSpeed`: multiplies the playback speed; 1 by default. `setAnimationSpeed()` changes it in place.
- `poseTime`: freezes the clip at that time in seconds instead of playing it.
- `background`: a CSS colour or `transparent`.
- `autoRotate`, `maxPixelRatio`, `camera` (`fov`, `distance` as a multiple of the character's height, `yaw` and `pitch` in degrees, `targetHeight` as a fraction of the height).
- `attribution`: shows the wording The Indie Stone's terms require. It defaults to true; if you hide it, place the wording elsewhere on the page.
- `onWarning`, `onError`: callbacks. A warning means something in the document could not be shown (an item the manifest does not have, a missing texture); the rest still renders.

Every viewer on a page shares one WebGL context, so a list of twenty characters is fine.

## Web Component

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/zomboid-models-element/dist/index.js"
></script>

<zomboid-character
  asset-base-url="/assets/"
  src="/characters/42.json"
  mode="showcase"
></zomboid-character>
```

The element bundles three.js. Attributes map to the options above (`asset-base-url`, `mode`, `animation`, `animation-speed`, `pose-time`, `background`, `auto-rotate`, `attribution`, `camera` as JSON), `src` loads a document of any kind by URL, and the `document` property (or `character`, its alias) takes an object. It dispatches `ready`, `warning`, and `error` events and has `toImage()`, `play()`, and `pause()` methods. Give it a size with CSS.

## React

```tsx
import { ZomboidCharacter } from 'zomboid-models-react';

export function Avatar({ character }) {
  return (
    <ZomboidCharacter
      assetBaseUrl="/assets/"
      mode="showcase"
      document={character}
      style={{ width: 320, height: 480 }}
    />
  );
}
```

Props are the viewer options plus `className`, `style`, and `onReady`. The component rebuilds the viewer when the asset folder, mode, background, or camera change and updates the document, the animation, and the speed in place.

## Next.js

The renderer touches `window` and WebGL, so load it on the client only:

```tsx
import dynamic from 'next/dynamic';

const ZomboidCharacter = dynamic(
  () => import('zomboid-models-react').then((m) => m.ZomboidCharacter),
  { ssr: false },
);
```

## Hosting the assets

The asset folder is static: put it behind any web server or CDN. File names other than `manifest.json` contain a content hash, so they can be cached for a long time; `manifest.json` is fetched with revalidation. When the assets live on another origin than the page, the server has to send `Access-Control-Allow-Origin` for them.

## Images instead of a live viewer

`toImage()` returns a PNG data URL of the current frame at any size. For server-side rendering, run the page in headless Chromium (Playwright or Puppeteer) and call `toImage()` there; the packages do not render in Node.js on their own.
