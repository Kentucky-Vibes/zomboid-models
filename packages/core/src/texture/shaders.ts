/**
 * GLSL for the compositing passes, ported from the game's texture combiner shaders. All maths
 * runs on raw 8-bit values, as in the game; the encode pass converts the finished texture for
 * sampling as an sRGB image.
 */

export const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const MATH = /* glsl */ `
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
vec3 hueShift(vec3 col, float amount) {
  vec3 hsv = rgb2hsv(col);
  hsv.r += amount;
  for (int i = 0; i < 4; i++) {
    if (hsv.r > 1.0) hsv.r -= 2.0;
    if (hsv.r < -1.0) hsv.r += 2.0;
  }
  return hsv2rgb(hsv);
}
`;

const PADDED_MASK = /* glsl */ `
float sampleMaskAlpha(sampler2D mask, vec2 uv) {
  return texture2D(mask, uv).a;
}
float samplePaddedMaskAlpha(sampler2D mask, vec2 uv, float padRadius) {
  float maskAlpha = sampleMaskAlpha(mask, uv);
  if (maskAlpha >= 0.99 || padRadius <= 0.00001) return maskAlpha;
  vec2 offsets[8];
  offsets[0] = vec2(-1.0, 1.0);
  offsets[1] = vec2(0.0, 1.0);
  offsets[2] = vec2(1.0, 1.0);
  offsets[3] = vec2(-1.0, 0.0);
  offsets[4] = vec2(1.0, 0.0);
  offsets[5] = vec2(-1.0, -1.0);
  offsets[6] = vec2(0.0, -1.0);
  offsets[7] = vec2(1.0, -1.0);
  for (int i = 0; i < 8; i++) {
    vec2 offsetUv = clamp(uv + offsets[i] * padRadius, 0.0, 1.0);
    maskAlpha = max(maskAlpha, sampleMaskAlpha(mask, offsetUv));
  }
  return maskAlpha;
}
`;

const HEADER = /* glsl */ `
uniform sampler2D diffuse;
uniform sampler2D mask;
uniform float intensity;
uniform float bloodDark;
uniform float cutoffMin;
uniform float cutoffMax;
uniform float maskPaddingRadius;
uniform float hue;
uniform vec3 tint;
varying vec2 vUv;
`;

/** Shared by the blood and dirt overlays; the blood variant darkens the red channel first. */
function overlay(blood: boolean): string {
  return /* glsl */ `
${HEADER}
void main() {
  vec4 col4 = texture2D(diffuse, vUv);
  vec4 colmask = texture2D(mask, vUv);
  vec3 col = col4.xyz;
  ${blood ? 'col.r = bloodDark;' : ''}
  float a = 1.0 - pow(1.0 - col4.a, 3.0);
  float m = 1.0 - pow(1.0 - colmask.a, 3.0);
  float fa = a * m;
  float intens = clamp(intensity, 0.0, 1.0);
  float intensity2 = clamp(intensity - 1.0, 0.0, 0.6);
  fa += m * intensity2;
  fa = clamp(fa, 0.0, 1.0);
  fa = clamp(fa - (1.0 - intens), 0.0, 1.0) / max(intens, 0.0001);
  col *= fa;
  gl_FragColor = vec4(col, fa);
}
`;
}

export const FRAGMENT_SHADERS: Record<
  | 'blit'
  | 'bodyMask'
  | 'overlayMask'
  | 'dirtMask'
  | 'addHole'
  | 'removeHole'
  | 'hueChange'
  | 'encode',
  string
> = {
  blit: /* glsl */ `
${HEADER}
void main() {
  gl_FragColor = texture2D(diffuse, vUv);
}
`,
  bodyMask: /* glsl */ `
${HEADER}
${PADDED_MASK}
void main() {
  vec4 col = texture2D(diffuse, vUv);
  float maskAlpha = samplePaddedMaskAlpha(mask, vUv, maskPaddingRadius);
  gl_FragColor = vec4(col.xyz, col.a * maskAlpha);
}
`,
  overlayMask: overlay(true),
  dirtMask: overlay(false),
  addHole: /* glsl */ `
${HEADER}
void main() {
  vec4 col4 = texture2D(diffuse, vUv);
  float maska = (texture2D(mask, vUv).a - cutoffMin) / (cutoffMax - cutoffMin);
  maska = 1.0 - clamp(maska, 0.0, 1.0);
  gl_FragColor = vec4(col4.xyz, col4.a * maska);
}
`,
  removeHole: /* glsl */ `
${HEADER}
${PADDED_MASK}
void main() {
  vec4 col4 = texture2D(diffuse, vUv);
  float colmask = samplePaddedMaskAlpha(mask, vUv, maskPaddingRadius);
  float maska = clamp((colmask - cutoffMin) / (cutoffMax - cutoffMin), 0.0, 1.0);
  gl_FragColor = vec4(col4.xyz, col4.a * maska);
}
`,
  hueChange: /* glsl */ `
${HEADER}
${MATH}
void main() {
  vec4 col4 = texture2D(diffuse, vUv);
  vec3 col = col4.xyz * tint;
  col = hueShift(col, hue);
  gl_FragColor = vec4(col, col4.a);
}
`,
  encode: /* glsl */ `
${HEADER}
vec3 srgbToLinear(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, lessThanEqual(c, vec3(0.04045)));
}
void main() {
  vec4 col4 = texture2D(diffuse, vUv);
  gl_FragColor = vec4(srgbToLinear(col4.rgb), col4.a);
}
`,
};
