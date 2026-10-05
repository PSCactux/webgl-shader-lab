/** Shared GLSL snippets. Kept as plain strings and concatenated into shaders. */

/** Cheap 2D hash without sin(), stable across GPUs. */
export const hash = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
`;

/** Value noise: cheap and good enough for believable terrain. */
export const valueNoise = /* glsl */ `
${hash}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/**
 * Fractal Brownian motion: several octaves of noise, each at double the
 * frequency and half the amplitude. The small rotation per octave hides the
 * grid alignment of value noise.
 */
export const fbm = /* glsl */ `
${valueNoise}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = r * p * 2.02;
    a *= 0.5;
  }
  return v;
}
`;

/** Vertex shader for a full-screen quad: a 2x2 plane written straight to clip space. */
export const screenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
