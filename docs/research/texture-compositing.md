# How the game composes character textures

Notes taken from reading the Build 42 code (decompiled locally, not committed), the shaders in `media/shaders`, and the textures in `media/textures`. The renderer reproduces this sequence in a WebGL render target.

## Machinery

Every composite is a command list replayed into one framebuffer whose size is the next power of two of the largest input, which is 256 by 256 for all shipped character art. The mask texture is bound with nearest filtering; the result has linear filtering, no mipmaps, and no colour space conversion (everything is 8-bit non-linear RGBA). Each command is a full-screen quad drawn with one shader and one blend function. Decals use a rectangle in a fixed 256-unit coordinate space.

Blend functions used (source RGB, destination RGB, source alpha, destination alpha):

- `blit`, `bodyMask`, `hueChange`, `removeHole`: `SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA`
- `overlayMask` (blood) and `dirtMask`: `DST_COLOR, ONE_MINUS_SRC_ALPHA, DST_ALPHA, ONE_MINUS_SRC_ALPHA`
- `addHole`: `SRC_ALPHA, ZERO, ONE, ONE_MINUS_SRC_ALPHA`

## Body texture

1. Draw the skin: `media/textures/Body/<name>.png`. The name is `MaleBody01`..`05` or `FemaleBody01`..`05` chosen by the skin index, with an `a` suffix for male body hair (`MaleBody01a.png`).
2. For each of the 18 body parts in enum order, draw dirt then blood if the amount is above zero: `dirtMask` with `GrimeOverlay.png`, `overlayMask` with `BloodOverlay.png` and `bloodDark = 0.5`, each masked by `BloodTextures/BloodMask<Part>.png`. The amount goes straight into the `intensity` uniform.
3. Resolve, then draw the result through the body masks (`bodyMask`, one draw per visible mask part) so that skin under clothing is cut away, and re-draw the skin inside every hole of the outermost garment (`removeHole` with `HoleTextures/BloodMask<Part>.png`).
4. Model-less clothing layers are drawn on top in this order: body visuals such as stubble, wounds, and bandages, then worn items from inner to outer. These are ordinary clothing items whose XML has no model, only a base texture.

Mask part names come from `CharacterMask.Part`: `Head 0, Torso 1, Pelvis 2, LeftArm 3, LeftHand 4, RightArm 5, RightHand 6, LeftLeg 7, LeftFoot 8, RightLeg 9, RightFoot 10, Dress 11, Chest 12, Waist 13, Belt 14, Crotch 15`. `Torso` expands to `Chest` and `Waist`, `Pelvis` to `Belt` and `Crotch`, so a mask folder holds 14 files named after the leaf parts. The `m_Masks` numbers in a clothing XML are these indices.

Blood mask files per body part, in enum order: `BloodMaskHandL, HandR, LArmL, LArmR, UArmL, UArmR, Chest, Stomach, Head, Neck, Groin, ULegL, ULegR, LLegL, LLegR, FootL, FootR, Back`.

## Clothing item texture

When an item has no hue, a white tint, no decal, and no blood, dirt, holes, or patches, its texture is used as is. Otherwise:

1. Draw the base texture: the entry of `textureChoices` (items with a model) or `m_BaseTextures` (items without one) selected by the item's index, at `media/textures/<path>.png`. A tint multiplies the colour (`hueChange` with `R, G, B`); a hue shifts it (`hueChange` with `HueChange`, in HSV, wrapping at 2.0). Tint and hue never apply together.
2. Draw the decal, if any, as a rectangle at its `x, y, width, height`.
3. For each body part in enum order: blood (`overlayMask`), dirt (`dirtMask`), then a basic, denim, or leather patch drawn with `blit` from `patches/patches_<part>_sheet|denim|leather.png`. Head, neck, and feet have no patch textures.
4. For each part with a hole: resolve, then punch the hole with `addHole` and `HoleTextures/BloodMask<Part>.png` using `cutoffMin 0.2, cutoffMax 0.55`.
5. Resolve, then draw the result through the item's masks (`m_MasksFolder`, default `media/textures/Body/Masks`) and re-draw it inside the holes of the garments above it.

An item's `m_UnderlayMasksFolder`, when set, replaces the mask folder for every layer under it, body included. A folder of `none` or a hat mask folder means no masking.

Holes and patches are booleans per part; blood and dirt are bytes stored as `amount * 255` and read back as floats. Blood and dirt on the head also darken the hair tint slightly.

## Blood and dirt shader

For the masked overlays (`overlayMask.frag`, `dirtMask.frag`):

```
a = 1 - pow(1 - diffuse.a, 3)
m = 1 - pow(1 - mask.a, 3)
fa = clamp(a * m, 0, 1)
fa = clamp(fa - (1 - intensity), 0, 1) / intensity
rgb = diffuse.rgb * fa            (blood forces diffuse.r = bloodDark first)
out = vec4(rgb, fa)
```

## Wounds and bandages

Body damage is not a separate system in Build 42. Each body part maps to hidden clothing items (`Base.Bandage_Chest`, `Base.Bandage_Chest_Blood`, `Base.Wound_Chest_Bite_Male`, and so on) whose base textures live in `media/textures/BodyDmg`. The game equips them from the body part state: `bandaged` with a clean or dirty bandage (dirty when bandage life is zero), `bitten`, `scratched`, `cut`. Legs and feet have bandages but no wound overlays. Wound textures exist per sex. Stubble (`Body/Stubble/M_Hair_Stubble.png`) is the same kind of hidden clothing item.

## Hair colour

Hair and beard colours are not part of the composite. They are a per-instance colour multiplied into the fragment colour by `basicEffect.frag`.
