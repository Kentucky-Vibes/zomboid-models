# Integrating the viewer

Three packages show a character, an animal, an item, a vehicle, or a scene of several on a page. All of them need a folder of converted assets (see [pipeline.md](pipeline.md)) reachable by URL, and a document (see [format.md](format.md)).

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
- `document`: the document to show: a character, an animal, an item, a vehicle, or a scene (see [format.md](format.md)). `character` and `setCharacter()` mean the same and stay until 1.0.
- `animation`: a clip name from the catalog, `null` for the bind pose, or omitted for the clip the game would play: the idle for the held item, the stance's clip, or the zombie idle, at the speed the game's animation sets give it. Items and vehicles have no clips; in a scene each subject carries its own `animation`.
- `animationSpeed`: multiplies the playback speed; 1 by default. `setAnimationSpeed()` changes it in place.
- `poseTime`: freezes the clip at that time in seconds instead of playing it.
- `shadow`: draws the game's blob shadows under characters, animals, and vehicles; on by default.
- `animateLightbar`: flashes a vehicle's light bar with the pattern of its `lightbarMode`; on by default. Off, the bar holds the side the document records.
- `lighting`: the light of a time of day. A preset, `day` (the default), `dusk`, `night`, or `studio` (neutral white), or an object `{ hour, season, moon }` with the hour from 0 to 24, the season (`summer` by default), and how full the moon is from 0 to 1. The colour and the strength come from the game's climate tables and its dawn and dusk hours at the map's latitude, relative to a clear summer afternoon, which is the viewer's plain daylight; nights are as dark as in the game.
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

<zomboid-view asset-base-url="/assets/" src="/characters/42.json" mode="showcase"></zomboid-view>
```

`<zomboid-view>` is the element's name; `<zomboid-character>`, its first name, works the same and stays until 1.0. The element bundles three.js. Attributes map to the options above (`asset-base-url`, `mode`, `animation`, `animation-speed`, `pose-time`, `background`, `auto-rotate`, `attribution`, `camera` as JSON, `lighting` as a preset name or JSON), `src` loads a document of any kind by URL, and the `document` property (or `character`, its alias) takes an object. It dispatches `ready`, `warning`, and `error` events and has `toImage()`, `play()`, and `pause()` methods. Give it a size with CSS.

## React

```tsx
import { ZomboidView } from 'zomboid-models-react';

export function Avatar({ character }) {
  return (
    <ZomboidView
      assetBaseUrl="/assets/"
      mode="showcase"
      document={character}
      style={{ width: 320, height: 480 }}
    />
  );
}
```

`ZomboidCharacter` is the same component under its first name and stays until 1.0. Props are the viewer options plus `className`, `style`, and `onReady`. The component rebuilds the viewer when the asset folder, mode, background, or camera change and updates the document, the animation, and the speed in place.

## Next.js

The renderer touches `window` and WebGL, so load it on the client only:

```tsx
import dynamic from 'next/dynamic';

const ZomboidView = dynamic(() => import('zomboid-models-react').then((m) => m.ZomboidView), {
  ssr: false,
});
```

## Display names

The asset folder can carry display names per language (see [pipeline.md](pipeline.md)). `getAssetCache(assetBaseUrl).loadNames('RU')` loads one language, and `displayName(names, 'items', 'Base.Axe')` returns the name or the key when there is none:

```js
import { displayName, getAssetCache } from 'zomboid-models';

const names = await getAssetCache('/assets/').loadNames('RU');
label.textContent = displayName(names, 'vehicles', 'Base.CarLightsPolice');
```

The kinds are `items`, `vehicles`, `hair`, `beards`, `animals`, `breeds`, and `bodyLocations`.

## Reading what the exporter mod writes

The reference mod writes one document per player under `Zomboid/Lua/zomboid-models/` and an index, `players.json`:

```json
{
  "format": "zomboid-models/players",
  "version": 1,
  "updatedAt": 1700000000,
  "players": [
    {
      "username": "tlagx",
      "displayName": "Grey",
      "file": "zomboid-models/tlagx.json",
      "updatedAt": 1700000000,
      "online": true,
      "vehicleId": 42,
      "vehicleFile": "zomboid-models/vehicle-Base.CarNormal-42.json"
    }
  ]
}
```

Times are Unix seconds. A player who sits in a vehicle gets the vehicle written next to their document, linked from the index and from `meta.vehicleId` and `meta.vehicleFile` in the player's document. A page can show the player and the vehicle side by side from those two files.

## Hosting the assets

The asset folder is static: put it behind any web server or CDN. File names other than `manifest.json` contain a content hash, so they can be cached for a long time; `manifest.json` is fetched with revalidation. When the assets live on another origin than the page, the server has to send `Access-Control-Allow-Origin` for them.

## Images instead of a live viewer

`toImage()` returns a PNG data URL of the current frame at any size. For server-side rendering, run the page in headless Chromium (Playwright or Puppeteer) and call `toImage()` there; the packages do not render in Node.js on their own.
