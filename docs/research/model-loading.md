# How the game loads character models

Notes taken from reading the Build 42 code (decompiled locally, not committed) and the data files. They describe what the converter has to reproduce. Class names refer to the game's `zombie.core.skinnedmodel` package.

## File formats

Character, clothing, hair, and weapon meshes are ASCII DirectX `.x` files (`xof 0303txt 0032`), and so are all animations in `media/anims_X`. FBX and glTF are used only for props lying on the ground.

The game does not parse `.x` itself. It calls Assimp through JNI (`jassimp64.dll`) with the flags `FIND_INSTANCES`, `MAKE_LEFT_HANDED`, `LIMIT_BONE_WEIGHTS`, `TRIANGULATE`, `OPTIMIZE_MESHES`, `REMOVE_REDUNDANT_MATERIALS`, `JOIN_IDENTICAL_VERTICES`. Animations use only `MAKE_LEFT_HANDED` and `REMOVE_REDUNDANT_MATERIALS`. No `FLIP_UVS`, no global scale, no axis conversion for `.x`; the `0.01` scale and the -90 degree X rotation in the loader apply to FBX only.

After import the game flips V manually (`v = 1 - v`) because it renders with OpenGL, and reverses the triangle winding when it fills its index buffer. Matrices are kept in the file's row-vector order throughout; the shader upload transposes them.

Consequences for the converter:

- A row-major row-vector matrix has the same 16 numbers as a column-major column-vector one, so matrices need no reordering.
- UVs go into glTF unchanged, because glTF's texture origin is the top-left corner like DirectX's.
- The file coordinates are left-handed. Rendered as they are in a right-handed viewer, the character faces -Z and the lettering on a police cap reads mirrored. The converter therefore negates Z everywhere: positions, normals, bone matrices, inverse bind matrices, animation translations (Z) and rotations (X and Y components of the quaternion), and the attachment offsets and X and Y angles from the model scripts. It also swaps two indices of every triangle; after that the triangles are counter-clockwise with respect to the file's vertex normals for the body and clothing meshes that were checked, so front-face culling works.

## Model scripts and paths

A `model` block in `media/scripts` has `mesh`, `texture` (defaults to the mesh name), `shader` (default `basicEffect`), `static` (default `true`), `scale` (default `1`), `invertX` (only flips the cull face for vehicles), `animationsMesh`, and nested `attachment` blocks with `bone`, `offset`, `rotate`, `scale`.

`mesh = Skinned/MaleBody` resolves by probing, with the name lowercased, `media/models_x/skinned/malebody.fbx`, then `.glb`, then `.x`, then `media/models/skinned/malebody.txt`. A name containing `media/` or a dot is used directly. A `|` splits the file from a sub-mesh name. Worn clothing meshes are not declared in scripts at all; the clothing XML points at them directly, either relative (`skinned\clothes\bob_trousers`) or absolute (`media\models_X\Skinned\Clothes\Bob_JudegsRobe.x`).

## Skeleton and skinning

The skeleton root is the frame named `Dummy01`; the `Translation_Data` frame and its parents are added to the bone list as well. Master_Bones.xml lists the canonical 33 bones.

Every clothing mesh carries its own copy of the skeleton. The game binds a garment to the body by bone name: the body's bone indices are copied first, bones the garment adds are appended, and a bone the garment lacks keeps an identity offset. Names are matched exactly and case-sensitively.

Skin weights are limited to four per vertex and normalised to sum to one. The inverse bind matrix of each bone is the `SkinWeights.matrixOffset` from the file, used verbatim.

Females use separate meshes (`FemaleBody`, `Kate_*`) but the same skeleton and the same animations; there is no retargeting. All human animations are loaded onto the `Human` animations mesh, which is `Skinned/MaleBody`, from the directories `Bob`, `Kate`, and `Zombie` under `media/anims_X`.

## Animations

Animation files contain the frame hierarchy plus one `AnimationSet`, with an `Animation` per bone holding rotation (key type 0, quaternion as w, x, y, z), scale (type 1), and position (type 2) keys. Times are ticks at `AnimTicksPerSecond` (4800 in the shipped files); the game converts them to seconds and interpolates with slerp and lerp.

The rotation keys store the inverse of the rotation that the frame matrices describe (the `Dummy01` key is +90 degrees about X while its matrix is -90 degrees), so the converter conjugates them.

The game reads clip names from the animation name and, if it contains `|`, keeps the part after it. `Translation_Data` carries root motion, which the game extracts separately; the converter keeps it as an ordinary bone track.

## Attachments and static items

An attachment on a model is `T(offset) * Rx * Ry * Rz * S(scale)` with the angles in degrees, applied in the bone's space. A static clothing item (`m_Static = true`) is parented to the bone named by `m_AttachBone` with identity offset unless an attachment block matches. `ModelScript.scale` multiplies the instance afterwards.

## Hair

Hair and beard styles are skinned meshes listed in `media/hairStyles/hairStyles.xml` and `beardStyles.xml`, each with a model path, a texture (default `F_Hair_White`), and hat alternates. Their colour is not baked into a texture: the game multiplies the texture by a per-instance `TintColour` uniform in `basicEffect.frag`. A hat category containing `nobeard` hides the beard.
