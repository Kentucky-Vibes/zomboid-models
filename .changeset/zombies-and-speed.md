---
'zomboid-models': minor
'zomboid-models-pipeline': minor
'zomboid-models-element': minor
'zomboid-models-react': minor
---

Zombies, outfits by name, stances, and animation speed.

- Idle clips now play at the speed the game's animation sets give them (the unarmed idle at 0.48, the zombie idle at 0.23 with a per-zombie random multiplier and start), and a `animationSpeed` option multiplies it.
- `body.zombie` renders a zombie: rotten skin by stage, skeleton bodies, no body hair, the zombie animation set.
- `outfit` dresses the character from one of the game's named outfits with a bit-exact port of the game's randomiser, so a seed gives the same clothes, hair, colours, underwear, attached weapon, wounds, and bandages as in the game.
- `stance` picks a pose: standing, crawling, on the back, sitting, or a corpse.
- The manifest is now an index (`manifest.json`, version 2) plus one catalog file per kind of subject; assets have to be rebuilt.
- The viewer takes `document` and `setDocument()`; `character` and `setCharacter()` stay as aliases.
