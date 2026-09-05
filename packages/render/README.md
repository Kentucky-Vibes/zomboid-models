# zomboid-models-render

Renders `zomboid-models` documents (characters, animals, items, vehicles, scenes) to PNG or WebP files from Node.js, in the Chromium that Playwright ships. Nothing needs to run on a page: the package loads the viewer into a headless browser, answers the viewer's requests for assets from a folder on disk or from the URL they are hosted at, and saves the picture the viewer draws.

```bash
npm install zomboid-models-render
npx playwright install chromium
```

The second command downloads the browser once; set `PLAYWRIGHT_BROWSERS_PATH` to keep it somewhere other than the home folder.

## Command line

```bash
npx zomboid-models-render --assets ./assets --out ./pictures --width 320 --height 480 players/*.json
```

Each document file becomes one picture, named after it, in `--out` (or next to the document when `--out` is absent; with one document `--out` may name the file itself, and its extension picks the format). Options: `--format png|webp`, `--quality` for WebP, `--camera` as JSON, `--lighting` (`day`, `dusk`, `night`, `studio`, or `{"hour":6,"season":"winter"}`), `--background` (a CSS colour, or `transparent`, the default), `--animation` (a clip name, or `none` for the bind pose), and `--pose-time` in seconds. Warnings about what could not be shown go to standard error; the exit code is 1 when a document failed.

## Node.js

```js
import { Renderer } from 'zomboid-models-render';

const renderer = await Renderer.launch({ assets: 'https://cdn.example.com/pz-assets/' });
try {
  const { image, warnings } = await renderer.render(document, { width: 320, height: 480 });
  await fs.writeFile('tlagx.png', image);
} finally {
  await renderer.close();
}
```

`Renderer.launch()` starts one browser and keeps it for as many `render()` calls as needed; `renderDocument(document, options)` does the same for a single picture. `render()` takes the size, `format` (`png` or `webp`), `quality`, and the viewer's `camera`, `lighting`, `background`, `animation`, `animationSpeed`, and `poseTime`, and returns the picture as a `Buffer` with the viewer's warnings. The browser draws with software rendering by default so that a server without a GPU produces the same pixels as a laptop; pass `args` to change that, or `executablePath` to use another Chromium.

The pictures do not carry the wording The Indie Stone's terms require for material from the game; show it next to them on the page that uses them.
