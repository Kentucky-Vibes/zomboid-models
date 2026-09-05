---
'zomboid-models': minor
'zomboid-models-pipeline': minor
---

Actions. Characters and animals take an `action` (`walk`, `sneak`, `run`, `sprint`, `aim`, `attack`, `sitChair`, `sleep`, `lieAwake`, `eat`, `drink`, `drive` for players; `walk`, `sprint`, `lunge`, `attack`, `eat` for zombies; `walk`, `run`, `eat` for animals) that the viewer plays as a loop, with the clip, blend, and speed the game's animation sets give a healthy character for the held item, and the gait the seed rolls for a zombie. The pipeline now reads the animation sets with their `x_extends` inheritance and condition logic, keeps 2D blends and speed variables in the catalog, and records the base speed, axe category, and eat type of held items. The viewer plays blended clips in step. The exporter mod writes the player's stance and action.
