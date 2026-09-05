# Integrating the viewer

Three packages show a character, an animal, an item, a vehicle, or a scene of several on a page, and a fourth makes pictures of them from Node.js. All of them need a folder of converted assets (see [pipeline.md](pipeline.md)) reachable by URL, and a document (see [format.md](format.md)).

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
- `mode`: `viewer` (orbit controls, zoom), `showcase` (no controls, transparent background by default, pauses when off screen and when the visitor prefers reduced motion), or `image` (draws only when asked through `toImage()`, with the animation held at `poseTime`, 0 by default).
- `document`: the document to show: a character, an animal, an item, a vehicle, or a scene.
- `animation`: a clip name from the catalog, `null` for the bind pose, or omitted for the clip the game would play: the document's action, the idle for the held item, the stance's clip, or the zombie idle, at the speed the game's animation sets give it. Items and vehicles have no clips; in a scene each subject carries its own `animation`.
- `animationSpeed`: multiplies the playback speed; 1 by default.
- `poseTime`: holds the clip at that time in seconds instead of playing it.
- `shadow`: draws the game's blob shadows under characters, animals, and vehicles; on by default.
- `animateLightbar`: flashes a vehicle's light bar with the pattern of its `lightbarMode`; on by default. Off, the bar holds the side the document records.
- `lighting`: the light of a time of day. A preset, `day` (the default), `dusk`, `night`, or `studio` (neutral white), or an object `{ hour, season, moon }` with the hour from 0 to 24, the season (`summer` by default), and how full the moon is from 0 to 1. The colour and the strength come from the game's climate tables and its dawn and dusk hours at the map's latitude, relative to a clear summer afternoon, which is the viewer's plain daylight; nights are as dark as in the game.
- `background`: a CSS colour or `transparent`.
- `autoRotate`, `maxPixelRatio`, `camera` (`fov`, `distance` as a multiple of the character's height, `yaw` and `pitch` in degrees, `targetHeight` as a fraction of the height).
- `attribution`: shows the wording The Indie Stone's terms require. It defaults to true; if you hide it, place the wording elsewhere on the page.
- `onWarning`, `onError`: callbacks. An error means the document could not be shown at all. A warning means part of it could not, or that something is worth knowing; the rest still renders.

Methods that change a viewer in place: `setDocument()` (a vehicle of the same script and skin keeps its rig, so a door swings instead of the car being rebuilt), `setAnimation()`, `setAnimationSpeed()`, `setPoseTime()`, `setAnimateLightbar()`, `play()`, `pause()`, and `toImage()`. The other options need a new viewer. `viewer.scene` and `viewer.camera` are the live three.js objects, there for anyone who wants to add to the scene; what the viewer puts in them is not part of the versioned API.

Warnings carry a `code`: `missing-item`, `missing-model`, `missing-texture`, `missing-bone`, and `missing-animation` name something the document asked for that the asset folder does not have; `catalog-version` says the folder was built by a pipeline of another major version and should be rebuilt; `context-lost` says the browser dropped the WebGL context, which it restores on its own, after which the viewer draws again.

Every viewer on a page shares one WebGL context, so a list of twenty characters is fine. Viewers with the same `assetBaseUrl` share one cache of catalogs, models, and textures. A request that fails is tried three times over a few seconds when the failure looks temporary (the network, a server error); a file that does not exist fails at once and is reported.

## Web Component

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/zomboid-models-element/dist/index.js"
></script>

<zomboid-view asset-base-url="/assets/" src="/characters/42.json" mode="showcase"></zomboid-view>
```

The element bundles three.js. Attributes map to the options above: `asset-base-url`, `mode`, `animation`, `animation-speed`, `pose-time`, `background`, `max-pixel-ratio`, `camera` as JSON, `lighting` as a preset name or JSON, and the boolean ones, `auto-rotate`, `attribution`, `shadow`, and `animate-lightbar`, which are on when present and off with the value `false` (`shadow="false"`). `src` loads a document of any kind by URL, and the `document` property takes an object. Changing `animation`, `animation-speed`, `pose-time`, `animate-lightbar`, `src`, or the `document` property updates the viewer in place; changing any other attribute rebuilds it. The element dispatches `ready` (with the viewer), `warning`, and `error` events and has `toImage()`, `play()`, and `pause()` methods; `viewerInstance` is the viewer itself. Give the element a size with CSS.

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

Props are the viewer options plus `className`, `style`, and `onReady`, which receives the viewer for `toImage()`, `play()`, and `pause()`. The component updates the document, the animation, its speed, the pose time, and the light bar in place, always calls the latest `onWarning` and `onError`, and rebuilds the viewer when the asset folder, the mode, the background, the auto rotation, the attribution, the pixel ratio, the shadows, the camera, or the lighting change.

## Next.js

The renderer touches `window` and WebGL, so load it on the client only:

```tsx
import dynamic from 'next/dynamic';

const ZomboidView = dynamic(() => import('zomboid-models-react').then((m) => m.ZomboidView), {
  ssr: false,
});
```

## The catalogs and the names

`getAssetCache(assetBaseUrl)` is the cache the viewers use, and a page can read from it too: `loadManifest()` for the index, `loadCharacterCatalog()`, `loadAnimalCatalog()`, `loadItemCatalog()`, and `loadVehicleCatalog()` for the catalogs (the lists of items, outfits, hair styles, animal types, vehicle scripts, and the rest a picker needs), and `loadNames(language)` for the display names of one language when the assets were built with it. `displayName(names, kind, key)` returns a name or the key when there is none:

```js
import { displayName, getAssetCache } from 'zomboid-models';

const cache = getAssetCache('/assets/');
const names = await cache.loadNames('RU');
label.textContent = displayName(names, 'vehicles', 'Base.CarLightsPolice');
```

The kinds are `items`, `vehicles`, `hair`, `beards`, `animals`, `breeds`, and `bodyLocations`. The catalog types are exported from `zomboid-models/rules`.

## The game's rules

`zomboid-models/rules` exports what the renderer knows about the game so that other tools can use it without a viewer: the outfit randomiser (`generateOutfit` and the game's random number generators, so a seed gives the same clothes as in the game), the clip a document plays (`autoClip`, `autoAnimalClip`, `resolveSpeedVariable`), how an animal, an item, or a vehicle looks (`resolveAnimalLook`, `resolveItemLook`, `resolveVehicleLook`, `placeVehicleModels`, `vehicleShaderState`, the paint zones), the light of a time of day (`climateAt`, `dayHours`, `squareLight`, `resolveLighting`), the shadow sizes, and the catalog types. These follow Build 42 and may change in a minor release when the game does; the package root does not.

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

Times are Unix seconds. A player who sits in a vehicle gets the vehicle written next to their document, linked from the index and from `meta.vehicleId` and `meta.vehicleFile` in the player's document. A page can show the player and the vehicle side by side from those two files, and the player's `stance` and `action` say what they were doing.

## Hosting the assets

The asset folder is static: put it behind any web server or CDN. File names other than `manifest.json` contain a content hash, so they can be cached for a long time; `manifest.json` is fetched with revalidation. When the assets live on another origin than the page, the server has to send `Access-Control-Allow-Origin` for them. When you move to a new major version of the packages, rebuild the folder with the matching pipeline; the viewer warns (`catalog-version`) when the folder is from another one.

## Images instead of a live viewer

`toImage()` returns a data URL of the current frame at any size, as PNG or, with `type: 'image/webp'`, as WebP. A viewer in `mode: 'image'` draws nothing on its own and holds the animation at `poseTime` (the first frame when absent), which is the mode for a page that only wants the picture.

To make pictures without a page, `zomboid-models-render` runs the viewer in the Chromium that Playwright ships and saves PNG or WebP files from Node.js, from a folder of assets or from the URL they are hosted at:

```bash
npx zomboid-models-render --assets ./assets --out ./pictures --width 320 --height 480 players/*.json
```

```js
import { Renderer } from 'zomboid-models-render';

const renderer = await Renderer.launch({ assets: './assets' });
const { image } = await renderer.render(document, { width: 320, height: 480, format: 'webp' });
await renderer.close();
```

The pictures do not carry the wording The Indie Stone's terms require; show it next to them. See the package's README for the options.
