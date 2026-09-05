# zomboid-models-react

The `ZomboidView` React component, a thin wrapper around the `zomboid-models` renderer. It shows one document: a character, an animal, an item, a vehicle, or a scene.

```bash
npm install zomboid-models-react zomboid-models three
```

```tsx
import { ZomboidView } from 'zomboid-models-react';

<ZomboidView
  assetBaseUrl="/assets/"
  mode="showcase"
  document={character}
  action="walk"
  style={{ width: 320, height: 480 }}
  onWarning={(warning) => console.warn(warning.message)}
/>;
```

Props are the viewer options (`assetBaseUrl`, `mode`, `document`, `animation`, `animationSpeed`, `poseTime`, `shadow`, `animateLightbar`, `lighting`, `background`, `autoRotate`, `maxPixelRatio`, `camera`, `attribution`, `onWarning`, `onError`) plus `className`, `style`, and `onReady`, which hands over the viewer for `toImage()`, `play()`, and `pause()`. The document, the animation, its speed, the pose time, and the light bar update in place; the other options rebuild the viewer.

The component only runs in the browser; in Next.js load it with `dynamic(() => import('zomboid-models-react').then((m) => m.ZomboidView), { ssr: false })`. See the [integration guide](https://github.com/kentucky-vibes/zomboid-models/blob/main/docs/integration.md) for the options and the asset folder the component needs.
