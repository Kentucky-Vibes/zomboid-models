# zomboid-models-react

A React component around the `zomboid-models` renderer.

```tsx
import { ZomboidCharacter } from 'zomboid-models-react';

<ZomboidCharacter
  assetBaseUrl="/assets/"
  mode="showcase"
  character={character}
  style={{ width: 320, height: 480 }}
  onWarning={(warning) => console.warn(warning.message)}
/>;
```

Props are the viewer options (`assetBaseUrl`, `mode`, `character`, `animation`, `poseTime`, `background`, `autoRotate`, `camera`, `attribution`, `onWarning`, `onError`) plus `className`, `style`, and `onReady`, which hands over the viewer for `toImage()`, `play()`, and `pause()`. The component only runs in the browser; in Next.js load it with `dynamic(() => import(...), { ssr: false })`.

The package is in early development and is not published yet.
