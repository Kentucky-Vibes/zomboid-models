---
'zomboid-models': minor
'zomboid-models-pipeline': minor
'zomboid-models-element': minor
'zomboid-models-react': minor
---

Display names per language and the players index. The pipeline writes `catalog-names-<lang>-<hash>.json` for every language in `languages` (`EN` by default) from the game's translation files: items, vehicles, hair and beard styles, animal types and breeds, and body locations, with English and the script names filling what a language lacks. `loadNames(language)` on the asset cache and `displayName()` read them; the playground shows names in the language you pick. `runBuild`, `resolveConfig`, and `loadConfig` are exported for builds from code. The exporter mod writes `players.json`, exports the vehicle a player sits in, and links it from the player's document.
