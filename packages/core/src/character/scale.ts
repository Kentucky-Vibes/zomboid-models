/**
 * The game draws character, animal, and item models 1.5 times their file units in the world
 * (`Model.CharacterModelCameraBegin`, `Model.worldToModel`, `WorldItemAtlas`), while a vehicle's
 * own script scale already gives world units. Rigs of the first three kinds carry this scale so
 * that a survivor stands as tall next to a car as in the game.
 */
export const GAME_MODEL_SCALE = 1.5;
