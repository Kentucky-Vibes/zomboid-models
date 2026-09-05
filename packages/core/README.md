# zomboid-models

The browser renderer for Project Zomboid (Build 42) characters, animals, items, vehicles, and scenes, built on three.js. It draws what a JSON document describes, with the game's own models, textures, animations, and rules: a character with its clothing, hair, held items, blood, wounds, and bandages; a zombie with its decay stage and gait; an animal with its breed; a vehicle with its paint, rust, damage, blood, lights, and doors; and any of these walking, running, attacking, eating, sitting, or asleep as the game animates it.

```bash
npm install zomboid-models three
```

```js
import { createViewer } from 'zomboid-models';

const viewer = createViewer(document.querySelector('#hero'), {
  assetBaseUrl: '/assets/',
  mode: 'showcase',
  document: character,
});
```

The package loads assets that `zomboid-models-pipeline` converts from your own copy of the game, served from a URL you host; it ships none. The document formats, their JSON Schemas, and the validators are exported from the package root, the catalog file formats from `zomboid-models/format`, and the game's rules the renderer applies (the outfit randomiser, the clip selection, the vehicle look, the daylight arithmetic) from `zomboid-models/rules`.

The [integration guide](https://github.com/kentucky-vibes/zomboid-models/blob/main/docs/integration.md) covers the options, the Web Component and React packages, hosting, and pictures; the [format guide](https://github.com/kentucky-vibes/zomboid-models/blob/main/docs/format.md) covers the documents; the [API reference](https://kentucky-vibes.github.io/zomboid-models/api/) lists every export.

Hosting converted game assets is subject to The Indie Stone's Terms and Conditions, which allow non-commercial fan use with the thank-you wording the viewer shows by default, and to the permissions of the mod authors whose work is included.
