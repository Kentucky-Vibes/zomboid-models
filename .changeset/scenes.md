---
'zomboid-models': minor
'zomboid-models-pipeline': minor
'zomboid-models-element': minor
'zomboid-models-react': minor
---

Scenes. A `zomboid-models/scene` document places several characters, animals, items, and vehicles together on one ground plane, in the game's units and at the game's relative sizes, with `yaw: 0` facing the camera for every kind, and seats characters in vehicles on the seats of the vehicle script with the game's driving idle. The vehicle catalog carries the seat positions and the character catalog the vehicle idle clip. The Web Component is now `<zomboid-view>` and the React component `ZomboidView`; `<zomboid-character>` and `ZomboidCharacter` stay as aliases until 1.0.
