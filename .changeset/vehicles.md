---
'zomboid-models': minor
'zomboid-models-pipeline': minor
'zomboid-models-element': minor
'zomboid-models-react': minor
---

Vehicles. A `zomboid-models/vehicle` document names a vehicle script with its skin, paint, rust, the state of its parts, its lights, and the blood on its sides; the renderer draws it with a port of the game's vehicle shader (paint zones, rust, damage, blood, lights), the wheels from the game's text meshes, and the part models where the scripts place them. The pipeline reads the vehicle scripts with their templates and builds a vehicle catalog. `validateDescription()` checks a document of any kind, and the Web Component loads any kind through `src`.
