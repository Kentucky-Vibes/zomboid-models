/**
 * A port of the game's vehicle shaders (`vehicle_multiuv.frag` with `vehicle_common.frag`, and
 * `vehiclewheel.frag`) as three.js shader materials. The fragment code follows the game's line
 * by line: the mask texture selects one of 27 zones, per-zone matrices switch the lights,
 * damage, uninstalled shade, and blood, the paint recolours the shell through HSV, rust and
 * damage atlases come from the second UV set, and the lights are added after the lighting.
 *
 * Differences from the game: the sky box the game reflects is a soft gradient here, the sphere
 * map uses the eye-space normal and position, and the lighting is one fixed light plus ambient
 * instead of the light sources near the vehicle.
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  Matrix4,
  NoColorSpace,
  RGBAFormat,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Texture,
} from 'three';

import type { VehicleShaderState } from './VehicleState.js';
import { zoneMatrices, ZONE_COLORS } from './zones.js';

const MATH_GLSL = `
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 desaturate(vec3 color, float amount) {
  vec3 gray = vec3(dot(vec3(0.2126, 0.7152, 0.0722), color));
  return mix(color, gray, amount);
}
float quantise(float amount, float steps) {
  return ceil(amount * steps) / steps;
}
vec3 vehicleLighting(vec3 normal) {
  vec3 lighting = AmbientColour;
  float dotprod = quantise(max(dot(normal, normalize(Light0Direction)), 0.0), 3.0);
  lighting += Light0Colour * dotprod;
  return clamp(lighting, 0.0, 1.0);
}
`;

const LIGHT_UNIFORMS = `
uniform vec3 TintColour;
uniform vec3 AmbientColour;
uniform vec3 Light0Direction;
uniform vec3 Light0Colour;
`;

/** The game's vertex stage, plus three.js skinning for the hinged parts that hang on bones. */
const VEHICLE_VERTEX = `
#include <skinning_pars_vertex>
attribute vec2 uv1;
varying vec3 vertNormal;
varying vec2 texCoords;
varying vec2 texCoords1;
varying vec3 positionEye;
void main() {
  texCoords = uv;
  texCoords1 = uv1;
  vec3 objectNormal = vec3(normal);
  vec3 transformed = vec3(position);
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vertNormal = normalize(normalMatrix * objectNormal);
  vec4 eye = modelViewMatrix * vec4(transformed, 1.0);
  positionEye = eye.xyz;
  gl_Position = projectionMatrix * eye;
}
`;

const ZONE_TABLE = ZONE_COLORS.map(
  ([r, g, b], i) =>
    `const vec3 colZone${i + 1} = vec3(${r.toFixed(2)}, ${g.toFixed(2)}, ${b.toFixed(2)});`,
).join('\n');

/** `texen1[c][r]` for zones 1 to 16 and `texen2[c][r]` for 17 to 27, as the game writes them. */
function zoneDecoding(): string {
  const lines: string[] = [];
  for (let zone = 1; zone <= 27; zone++) {
    const matrix = zone <= 16 ? 'texen1' : 'texen2';
    const k = zone <= 16 ? zone - 1 : zone - 17;
    lines.push(
      `${matrix}[${Math.floor(k / 4)}][${k % 4}] = 1.0 - step(0.01, length(texColorMask.xyz - colZone${zone}));`,
    );
  }
  return lines.join('\n');
}

const VEHICLE_FRAGMENT = `
varying vec3 vertNormal;
varying vec2 texCoords;
varying vec2 texCoords1;
varying vec3 positionEye;
uniform sampler2D Texture0;
uniform vec4 TexturePainColor;
uniform sampler2D TextureRust;
uniform float TextureRustA;
uniform sampler2D TextureMask;
uniform sampler2D TextureLights;
uniform sampler2D TextureDamage1Overlay;
uniform sampler2D TextureDamage1Shell;
uniform sampler2D TextureDamage2Overlay;
uniform sampler2D TextureDamage2Shell;
uniform sampler2D TextureReflection;
uniform vec3 ReflectionParam;
uniform mat4 TextureUninstall1;
uniform mat4 TextureUninstall2;
uniform mat4 TextureLightsEnables1;
uniform mat4 TextureLightsEnables2;
uniform mat4 TextureDamage1Enables1;
uniform mat4 TextureDamage1Enables2;
uniform mat4 TextureDamage2Enables1;
uniform mat4 TextureDamage2Enables2;
uniform mat4 MatBlood1Enables1;
uniform mat4 MatBlood1Enables2;
uniform mat4 MatBlood2Enables1;
uniform mat4 MatBlood2Enables2;
${LIGHT_UNIFORMS}
${MATH_GLSL}
${ZONE_TABLE}
float dommat4(mat4 a, mat4 b) {
  return dot(a[0], b[0]) + dot(a[1], b[1]) + dot(a[2], b[2]) + dot(a[3], b[3]);
}
vec2 sphereMap(vec3 normal, vec3 ecPosition) {
  vec3 u = normalize(ecPosition);
  vec3 r = reflect(u, -normal);
  float m = 2.0 * sqrt(r.x * r.x + r.y * r.y + (r.z + 1.0) * (r.z + 1.0));
  return vec2(r.x / m + 0.5, r.y / m + 0.5);
}
vec3 addDamage(vec3 col, vec4 texDamage, vec3 paintHSV, float alpha) {
  vec3 fragHSV = rgb2hsv(texDamage.xyz);
  fragHSV.x = paintHSV.x;
  fragHSV.y = clamp(fragHSV.y + paintHSV.y - 0.5, 0.0, 0.9999);
  fragHSV.z = clamp(fragHSV.z + paintHSV.z - 0.5, 0.0, 0.9999);
  fragHSV = mod(fragHSV, 1.0);
  return mix(col, hsv2rgb(fragHSV), texDamage.a * 0.75 * alpha);
}
vec3 addBlood(vec4 texColorBlood2, vec4 colmask, float intensity, float alpha2, vec3 colOut) {
  vec3 col = texColorBlood2.rgb;
  float a = 1.0 - pow(1.0 - texColorBlood2.a, 3.0);
  float mask_a = 1.0 - pow(1.0 - colmask.a, 3.0);
  float fa = a * mask_a;
  float intens = clamp(intensity, 0.0, 1.0);
  if (intens < 0.0001) return colOut;
  fa = clamp((fa - (1.0 - intens)) / intens, 0.0, 1.0);
  col *= fa;
  return mix(colOut, col, fa * texColorBlood2.a * alpha2);
}
void main() {
  vec3 normal = normalize(vertNormal);
  vec4 tex = texture2D(Texture0, texCoords);
  vec3 col = tex.xyz;
  vec4 texColorMask = texture2D(TextureMask, texCoords);
  vec4 texColorRust = texture2D(TextureRust, texCoords1);
  vec4 texColorLights = texture2D(TextureLights, texCoords);
  vec4 texColorDamage1Shell = texture2D(TextureDamage1Shell, texCoords1);
  vec4 texColorDamage2Shell = texture2D(TextureDamage2Shell, texCoords1);
  vec3 lighting = vehicleLighting(normal);
  vec3 TintColourNew = desaturate(TintColour, 0.3);
  mat4 texen1 = mat4(0.0);
  mat4 texen2 = mat4(0.0);
${zoneDecoding()}
  float t1en = step(0.5, dommat4(texen1, TextureLightsEnables1) + dommat4(texen2, TextureLightsEnables2));
  float t2en = step(0.5, dommat4(texen1, TextureDamage1Enables1) + dommat4(texen2, TextureDamage1Enables2));
  float t3en = step(0.5, dommat4(texen1, TextureDamage2Enables1) + dommat4(texen2, TextureDamage2Enables2));
  float t4en = step(0.5, dommat4(texen1, TextureUninstall1) + dommat4(texen2, TextureUninstall2));
  float windowAlpha = clamp(texen1[1][2] + texen1[1][3] + texen1[2][0] + texen1[2][1] + texen1[2][2] + texen1[2][3], 0.0, 1.0);
  float frontAlpha = clamp(texen1[0][0] + texen2[0][1] + texen2[0][2], 0.0, 1.0);
  float tailAlpha = clamp(texen1[0][1] + texen2[0][3] + texen2[1][0] + texen2[1][1] + texen2[1][2], 0.0, 1.0);
  float noTintAlpha = clamp(windowAlpha + frontAlpha + tailAlpha, 0.0, 1.0);
#ifndef NORANDOM
  vec3 fragHSV = rgb2hsv(col.rgb);
  fragHSV.x = TexturePainColor.x;
  fragHSV.y = clamp(fragHSV.y + TexturePainColor.y - 0.5, 0.0, 0.9999);
  fragHSV.z = clamp(fragHSV.z + TexturePainColor.z - 0.5, 0.0, 0.9999);
  fragHSV = mod(fragHSV, 1.0);
  col = mix(col, hsv2rgb(fragHSV), 1.0 - tex.a);
  vec3 paintColor = TexturePainColor.xyz;
#else
  vec3 paintColor = rgb2hsv(tex.rgb);
#endif
  float ref_en = texen1[1][2] + texen1[1][3] + texen1[2][0] + texen1[2][1] + texen1[2][2] + texen1[2][3];
  vec2 refTexCoord = sphereMap(normal, positionEye);
  vec3 texRef = texture2D(TextureReflection, refTexCoord).xyz;
  col = mix(col, texRef, ref_en * (0.1 + ReflectionParam.y * 0.5));
  col = mix(col, texRef / 4.0, (1.0 - ref_en) * (0.05 + ReflectionParam.z * 0.3));
  col = mix(col, texColorRust.xyz, texColorRust.a * TextureRustA);
  vec4 texColorBlood2 = texture2D(TextureDamage2Overlay, texCoords1);
  vec4 colmask = texture2D(TextureDamage1Overlay, texCoords1);
  float intensity = dommat4(texen1, MatBlood1Enables1) + dommat4(texen2, MatBlood1Enables2);
  float maskAlpha = step(0.5, dommat4(texen1, MatBlood2Enables1) + dommat4(texen2, MatBlood2Enables2));
  col = addBlood(texColorBlood2, colmask, intensity, maskAlpha * windowAlpha, col);
  col = addDamage(col, texColorDamage1Shell, paintColor, t2en * (1.0 - noTintAlpha));
  col = mix(col, texColorDamage1Shell.xyz, texColorDamage1Shell.a * t2en * noTintAlpha);
  col = addDamage(col, texColorDamage2Shell, paintColor, t3en * (1.0 - noTintAlpha));
  col = mix(col, texColorDamage2Shell.xyz, texColorDamage2Shell.a * t3en * noTintAlpha);
  col = addBlood(texColorBlood2, colmask, intensity, maskAlpha * (1.0 - windowAlpha), col);
  col = mix(col, vec3(0.2), t4en);
  col *= lighting * TintColourNew;
  col = mix(col, texColorLights.xyz, texColorLights.a * t1en);
  gl_FragColor = vec4(col, TexturePainColor.a);
}
`;

const WHEEL_VERTEX = `
varying vec3 vertNormal;
varying vec2 texCoords;
void main() {
  texCoords = uv;
  vertNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const WHEEL_FRAGMENT = `
varying vec3 vertNormal;
varying vec2 texCoords;
uniform sampler2D Texture;
uniform float Alpha;
${LIGHT_UNIFORMS}
${MATH_GLSL}
void main() {
  vec3 normal = normalize(vertNormal);
  vec3 col = texture2D(Texture, texCoords).xyz;
  vec3 lighting = vehicleLighting(normal);
  vec3 TintColourNew = desaturate(TintColour, 0.3);
  gl_FragColor = vec4(col * lighting * TintColourNew, Alpha);
}
`;

/** The lighting every vehicle material shares, in eye space. */
export interface VehicleLighting {
  ambient: Vector3;
  lightDirection: Vector3;
  lightColor: Vector3;
  tint: Vector3;
}

/** The daylight scaled per channel, for a time of day; see `resolveLighting`. */
export function scaledVehicleLighting(factor: [number, number, number]): VehicleLighting {
  const lighting = defaultVehicleLighting();
  lighting.ambient.multiply(new Vector3(...factor));
  lighting.lightColor.multiply(new Vector3(...factor));
  return lighting;
}

/** Daylight as the game shows it: mostly ambient, with one soft light above the camera. */
export function defaultVehicleLighting(): VehicleLighting {
  return {
    ambient: new Vector3(0.78, 0.78, 0.78),
    lightDirection: new Vector3(-0.35, 0.6, 0.72).normalize(),
    lightColor: new Vector3(0.3, 0.3, 0.3),
    tint: new Vector3(1, 1, 1),
  };
}

/** The textures of one skin; a missing texture is a transparent black pixel. */
export interface VehicleTextures {
  shell: Texture;
  mask: Texture;
  lights: Texture;
  rust: Texture;
  damage1Overlay: Texture;
  damage1Shell: Texture;
  damage2Overlay: Texture;
  damage2Shell: Texture;
}

function rawTexture(texture: DataTexture): DataTexture {
  texture.colorSpace = NoColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** A one-pixel transparent black texture for skins that lack one of the game's textures. */
export function emptyVehicleTexture(): Texture {
  return rawTexture(new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat));
}

/**
 * The reflection: a vertical gradient from a ground shade at the bottom through a pale horizon
 * to sky blue at the top, sampled through the sphere map like the game's sky box.
 */
export function gradientSkyTexture(): Texture {
  const width = 8;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  const ground = [77, 74, 70];
  const horizon = [219, 224, 230];
  const sky = [158, 191, 235];
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const [from, to, k] = t < 0.5 ? [ground, horizon, t * 2] : [horizon, sky, (t - 0.5) * 2];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        data[i + c] = Math.round(
          (from[c] as number) + ((to[c] as number) - (from[c] as number)) * k,
        );
      }
      data[i + 3] = 255;
    }
  }
  return rawTexture(new DataTexture(data, width, height, RGBAFormat));
}

function matrix(elements: Float32Array): Matrix4 {
  return new Matrix4().fromArray(elements);
}

export interface VehicleMaterialOptions {
  /** The `vehicle_norandom_*` shaders: the shell keeps its own colours and only damage is tinted. */
  noRandom?: boolean;
  lighting?: VehicleLighting;
}

/** Writes the paint, rust, reflection, and per-zone switches of a state into a material. */
export function applyVehicleMaterialState(
  material: ShaderMaterial,
  paint: { hue: number; saturation: number; value: number },
  state: VehicleShaderState,
): void {
  const pairs: [string, string, Float32Array][] = [
    ['TextureUninstall1', 'TextureUninstall2', state.uninstall],
    ['TextureLightsEnables1', 'TextureLightsEnables2', state.lights],
    ['TextureDamage1Enables1', 'TextureDamage1Enables2', state.damage1],
    ['TextureDamage2Enables1', 'TextureDamage2Enables2', state.damage2],
    ['MatBlood1Enables1', 'MatBlood1Enables2', state.blood],
    ['MatBlood2Enables1', 'MatBlood2Enables2', state.bloodMask],
  ];
  for (const [first, second, values] of pairs) {
    const [a, b] = zoneMatrices(values);
    (material.uniforms[first]?.value as Matrix4).fromArray(a);
    (material.uniforms[second]?.value as Matrix4).fromArray(b);
  }
  (material.uniforms['TexturePainColor']?.value as Vector4).set(
    paint.hue,
    paint.saturation,
    paint.value,
    1,
  );
  const rust = material.uniforms['TextureRustA'];
  if (rust) rust.value = state.rust;
  (material.uniforms['ReflectionParam']?.value as Vector3).set(1, state.refWindows, state.refBody);
}

/** Builds the body material for one skin, one paint, and one shader state. */
export function createVehicleMaterial(
  textures: VehicleTextures,
  reflection: Texture,
  paint: { hue: number; saturation: number; value: number },
  state: VehicleShaderState,
  options: VehicleMaterialOptions = {},
): ShaderMaterial {
  const lighting = options.lighting ?? defaultVehicleLighting();
  const [uninstall1, uninstall2] = zoneMatrices(state.uninstall);
  const [lights1, lights2] = zoneMatrices(state.lights);
  const [damage1a, damage1b] = zoneMatrices(state.damage1);
  const [damage2a, damage2b] = zoneMatrices(state.damage2);
  const [blood1a, blood1b] = zoneMatrices(state.blood);
  const [blood2a, blood2b] = zoneMatrices(state.bloodMask);
  return new ShaderMaterial({
    name: options.noRandom ? 'vehicle_norandom' : 'vehicle',
    defines: options.noRandom ? { NORANDOM: '' } : {},
    vertexShader: VEHICLE_VERTEX,
    fragmentShader: VEHICLE_FRAGMENT,
    uniforms: {
      Texture0: { value: textures.shell },
      TextureMask: { value: textures.mask },
      TextureLights: { value: textures.lights },
      TextureRust: { value: textures.rust },
      TextureDamage1Overlay: { value: textures.damage1Overlay },
      TextureDamage1Shell: { value: textures.damage1Shell },
      TextureDamage2Overlay: { value: textures.damage2Overlay },
      TextureDamage2Shell: { value: textures.damage2Shell },
      TextureReflection: { value: reflection },
      TexturePainColor: { value: new Vector4(paint.hue, paint.saturation, paint.value, 1) },
      TextureRustA: { value: state.rust },
      ReflectionParam: { value: new Vector3(1, state.refWindows, state.refBody) },
      TextureUninstall1: { value: matrix(uninstall1) },
      TextureUninstall2: { value: matrix(uninstall2) },
      TextureLightsEnables1: { value: matrix(lights1) },
      TextureLightsEnables2: { value: matrix(lights2) },
      TextureDamage1Enables1: { value: matrix(damage1a) },
      TextureDamage1Enables2: { value: matrix(damage1b) },
      TextureDamage2Enables1: { value: matrix(damage2a) },
      TextureDamage2Enables2: { value: matrix(damage2b) },
      MatBlood1Enables1: { value: matrix(blood1a) },
      MatBlood1Enables2: { value: matrix(blood1b) },
      MatBlood2Enables1: { value: matrix(blood2a) },
      MatBlood2Enables2: { value: matrix(blood2b) },
      TintColour: { value: lighting.tint.clone() },
      AmbientColour: { value: lighting.ambient.clone() },
      Light0Direction: { value: lighting.lightDirection.clone() },
      Light0Colour: { value: lighting.lightColor.clone() },
    },
  });
}

/** The wheel material: a grey texture under the same lighting. */
export function createWheelMaterial(
  texture: Texture,
  lightingOption?: VehicleLighting,
): ShaderMaterial {
  const lighting = lightingOption ?? defaultVehicleLighting();
  return new ShaderMaterial({
    name: 'vehiclewheel',
    vertexShader: WHEEL_VERTEX,
    fragmentShader: WHEEL_FRAGMENT,
    uniforms: {
      Texture: { value: texture },
      Alpha: { value: 1 },
      TintColour: { value: lighting.tint.clone() },
      AmbientColour: { value: lighting.ambient.clone() },
      Light0Direction: { value: lighting.lightDirection.clone() },
      Light0Colour: { value: lighting.lightColor.clone() },
    },
  });
}
