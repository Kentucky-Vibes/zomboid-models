# How the game loads mods, scripts, and clothing data

Notes taken from reading the Build 42 code (decompiled locally, not committed). The pipeline copies these rules so that a modpack produces the same set of items and files as in the game.

## Game version

A version string is parsed as `major.minor` with an optional suffix (`42.20.3` is major 42, minor 20, suffix `.3`). Comparisons use `major * 1000 + minor` only; the suffix is ignored.

## Mod discovery

The game scans, in this order: the staged Workshop folders (`Workshop/<name>/Contents/mods`), the installed Workshop items (`steamapps/workshop/content/108600/<id>/mods`), and the user folder `Zomboid/mods`. The `mods` folder in the game install is not scanned, and `examplemod` is skipped.

Every immediate subfolder of those folders is a mod candidate. It counts as a mod only if `common/mod.info` or `<version>/mod.info` exists. A mod that only has a `media` folder at its root (the Build 41 layout) is invisible.

The version folder is chosen among the mod's subfolder names: a name is parsed as `int(first) * 1000 + min(int(second), 999)` (a third component is ignored, non-numeric names count as 0); the highest value that is at least 42000 and at most the game version wins, the last one on ties. Only that folder and `common` are loaded. Nothing is loaded from any other version folder.

`mod.info` is a list of `key=value` lines. `id` is required; `name`, `require` (comma-separated ids), `versionMin`, `versionMax`, `modversion`, `author`, `description`, `poster`, `icon`, `url`, `pack`, `tiledef` also exist. A mod is unavailable when `versionMin` is above or `versionMax` is below the game version. When two folders declare the same id, the one found first wins.

## Load order and file overrides

The active mod list comes from the server ini `Mods=` line, or from the user's `Zomboid/mods/default.txt`. Each mod's `require` entries are inserted before it. The game then builds one map from lowercased relative path (`media/...`) to absolute file, seeded from the game's own `media`, and for each mod in order adds every file under `common` and then under the version folder. The last writer wins, so a later mod replaces a vanilla or earlier-mod file at the same relative path.

## Scripts

Script files are every `.txt` under `media/scripts`, recursively, skipping paths that contain `tempNotWorking`. Game files come first, then the mods in load order (`common`, then the version folder). Files whose names start with `template_` sort first. Files are deduplicated by relative path through the map above.

A file holds `module <name> { ... }` blocks. Modules with the same name merge. Inside, `imports { ... }` and typed blocks such as `item`, `model`, `recipe`. Entries are `key = value,`; nested blocks use braces; values are split on the first `=`.

Redefining a block with the same name in a later file merges it per key onto the earlier one: keys that are set again are replaced, list-valued keys as a whole, and keys that are not mentioned keep their old value. `model` blocks are the exception: their scalar fields are reset and replaced, while their `attachment` blocks accumulate and are updated by name.

The full type of an item is `module.name`, for example `Base.Trousers_Denim`. A bare model reference like `StaticModel = Foo` is looked up in the item's module first and then in every other module.

Item keys that matter here: `BodyLocation`, `ClothingItem`, `BloodLocation` (split on `;`), `FabricType`, `WeaponSprite`, `StaticModel`, `WorldStaticModel`, `AttachmentType`, `AttachmentsProvided` (split on `;`), `ClothingItemExtra`, `Icon`, `DisplayName`, `SwingAnim`, `Ranged`, `TwoHandWeapon`. There are no tint or hue keys on items. `IdleAnim` is still parsed but never read; the idle animation is chosen by the animation state machine.

## Clothing XML

A worn item's `ClothingItem = X` names `media/clothing/clothingItems/X.xml`, resolved through the game's GUID table (`media/fileGuidTable.xml` in the game and in each mod) and then through the file map, so a mod can replace a vanilla item's XML by shipping a file at the same relative path and listing it in its own GUID table.

Elements and defaults: `m_GUID`, `m_MaleModel`, `m_FemaleModel`, `m_AltMaleModel`, `m_AltFemaleModel`, `m_Static` (false), `m_BaseTextures` (list), `m_AttachBone`, `m_Masks` (list of integers), `m_MasksFolder` (`media/textures/Body/Masks`), `m_UnderlayMasksFolder` (same default), `textureChoices` (list), `m_AllowRandomHue` (false), `m_AllowRandomTint` (false), `m_DecalGroup`, `m_Shader`, `m_HatCategory`, `m_SpawnWith` (list). Backslashes become slashes and consumers lowercase the paths.

A model reference that contains `media/` or a dot is used as written; otherwise the game probes `media/models_x/<name>.fbx`, `.glb`, `.x`, then `media/models/<name>.txt`. A texture reference is `media/textures/<name>.png` unless it already contains `media/`.

`m_Masks` lists the body parts the garment hides, as `CharacterMask.Part` indices.

## Outfits

`media/clothing/clothing.xml` holds the named outfits, per sex. Each mod may ship its own file in the version folder (or `common` when the version folder has none); outfits with an existing name replace it, new ones are appended. An outfit has `m_items` with a `probability` per item reference and optional `subItems`, plus flags `m_Top`, `m_Pants`, `m_AllowPantsHue`, `m_AllowPantsTint`, `m_AllowTopTint`, `m_AllowTShirtDecal` and texture lists for the default top and pants.

Dressing in a named outfit draws, in a fixed order, from a seeded random generator: each item reference (active when a random number is at most its probability, with random hue, tint, base texture, texture choice, and decal when the clothing item allows them), then hair, beard, and the default top and pants. Reproducing the game's exact random sequence would need its generator; the pipeline offers its own deterministic seeding instead.

## Hair and beards

`media/hairStyles/hairStyles.xml` (elements `male` and `female`) and `beardStyles.xml` (element `style`) list the styles; mods replace same-name styles in place. A style has `name`, `model`, `texture` (default `F_Hair_White`), `level`, `alternate` entries with `category` and `style` attributes, `trimChoices`, `growReference`, `noChoose`.

With a hat on, the hair style is replaced by the alternate whose category matches the hat's `m_HatCategory` (case-insensitive), falling back to the style's own name; a hat category of `nohair` or `nohairnobeard` removes the hair, and one containing `nobeard` removes the beard. The first worn item with a hat category counts as the hat.

## Body locations and attachments

`media/lua/shared/NPCs/BodyLocations.lua` declares the locations of the `Human` group in render order, then `setExclusive(a, b)` (symmetric), `setHideModel(a, b)` and `setAltModel(a, b)` (one directional: wearing `a` hides, or switches to the alternate model of, an item in `b`), and `setMultiItem`.

Adding a worn item removes any item at the same location (unless the location allows several) and any item at an exclusive location, and inserts the new one so that the list stays in declaration order. At draw time an item is hidden when another worn item's location declares `setHideModel` for it.

`media/lua/shared/NPCs/AttachedLocations.lua` maps display names such as `Rifle On Back` to attachment names such as `rifle_back`. An attached item is drawn by looking up the attachment of that name on the body's model script, which gives the bone, offset, rotation, and scale.

## Animation sets

`media/AnimSets/player/<state>/*.xml` nodes select clips by conditions on animation variables. Idle nodes such as `IdleRifle.xml` extend `Idle.xml` and add a condition on the `Weapon` variable, whose values are `UNARMED`, `2handed`, `1handed`, `heavy`, `knife`, `spear`, `handgun`, `firearm`, `throwing`, `chainsaw`. The weapon type of a held item follows from its script: a `SwingAnim` of `Stab`, `Heavy`, `Throw`, or `Spear` gives knife, heavy, throwing, or spear; a `Type` of `Chainsaw` gives chainsaw; a ranged weapon is a handgun or a firearm depending on `TwoHandWeapon`; anything else is one or two handed by the same flag.
