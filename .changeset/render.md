---
'zomboid-models-render': minor
'zomboid-models': minor
---

A render package and an image mode. `zomboid-models-render` renders documents to PNG and WebP files from Node.js, through a command line or a `Renderer` kept open for many pictures, in the Chromium Playwright ships, from a folder of assets or from the URL they are hosted at, without an HTTP server. The viewer gains `mode: 'image'`, which draws only through `toImage()` with the animation held at `poseTime`, and `toImage()` takes a `type` (`image/webp`) and a `quality`.
