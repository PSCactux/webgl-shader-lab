import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { ScreenQuad } from "../components/ScreenQuad";
import { fbm } from "../lib/glsl";
import { useGui, useParams } from "../lib/gui";

/**
 * A procedural retro scene (sun, mountains, scrolling grid) pushed through a
 * VHS/CRT pass in the same shader: barrel curvature, per-line tracking jitter,
 * a rolling noise band, RGB channel offset, scanlines, grain and vignette.
 * Because the scene is a function, each colour channel can simply be evaluated
 * at its own shifted coordinate instead of sampling a render target.
 */
const fragment = /* glsl */ `
precision highp float;
uniform float uTime;        // wall-clock time, drives the noise
uniform float uSceneTime;   // tape time, runs backwards while rewinding
uniform float uAspect;
uniform float uRewind;
uniform float uCurvature;
uniform float uChroma;
uniform float uTracking;
uniform float uNoise;
uniform vec2 uResolution;
uniform sampler2D uOsd;
varying vec2 vUv;
${fbm}

vec3 scene(vec2 uv) {
  vec2 p = uv * 2.0 - 1.0;
  p.x *= uAspect;
  float horizon = -0.08;
  vec3 col;
  if (p.y > horizon) {
    // Sky
    col = mix(vec3(0.98, 0.38, 0.45), vec3(0.10, 0.02, 0.22), smoothstep(horizon, 0.9, p.y));
    // Sun, sliced by horizontal bands that scroll down
    vec2 sp = p - vec2(0.0, 0.34);
    float sun = smoothstep(0.43, 0.42, length(sp));
    float gap = smoothstep(0.02, -0.4, sp.y) * 0.55;          // gaps widen towards the bottom
    float slice = 1.0 - step(fract(sp.y * 9.0 - uSceneTime * 0.35), gap);
    vec3 sunCol = mix(vec3(1.0, 0.25, 0.55), vec3(1.0, 0.86, 0.35), smoothstep(-0.4, 0.4, sp.y));
    col = mix(col, sunCol, sun * clamp(slice, 0.0, 1.0));
    // Mountains: two noise ridges in front of the sun
    float ridge = horizon + 0.01 + 0.16 * fbm(vec2(p.x * 1.3 + 3.0, 1.0));
    col = mix(col, vec3(0.16, 0.04, 0.25), step(p.y, ridge));
    float ridge2 = horizon + 0.0 + 0.08 * fbm(vec2(p.x * 2.4 - 5.0, 4.0));
    col = mix(col, vec3(0.07, 0.01, 0.12), step(p.y, ridge2));
  } else {
    // Floor: a perspective grid that scrolls towards the viewer
    float depth = horizon - p.y + 0.001;
    vec2 g = vec2(p.x / depth, 1.0 / depth + uSceneTime * 2.0);
    vec2 cell = abs(fract(g * vec2(0.6, 0.35)) - 0.5);
    vec2 w = fwidth(g * vec2(0.6, 0.35)) * 1.5;
    float line = max(1.0 - smoothstep(0.0, w.x, cell.x), 1.0 - smoothstep(0.0, w.y, cell.y));
    col = mix(vec3(0.05, 0.0, 0.10), vec3(0.95, 0.25, 0.85), line * smoothstep(0.0, 0.25, depth + 0.05));
    col += vec3(0.6, 0.15, 0.4) * exp(-depth * 18.0) * 0.6; // horizon glow
  }
  return col;
}

// Barrel distortion of a CRT tube
vec2 curve(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 o = abs(uv.yx) / vec2(5.5, 4.5);
  uv += uv * o * o * uCurvature * 4.0;
  return uv * 0.5 + 0.5;
}

void main() {
  vec2 uv = curve(vUv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  float lines = uResolution.y;
  float row = floor(uv.y * lines * 0.5);

  // Tracking: every line wobbles a bit; inside the rolling band it tears.
  float bandPos = fract(uTime * (0.08 + uRewind * 1.2));
  float band = smoothstep(0.08, 0.0, abs(uv.y - (1.0 - bandPos)));
  float jitter = (hash21(vec2(row, floor(uTime * 30.0))) - 0.5);
  uv.x += jitter * (0.0015 * uTracking + band * 0.03 * uTracking + uRewind * 0.012);
  uv.x += sin(uv.y * 40.0 + uTime * 3.0) * 0.0015 * uTracking; // slow horizontal wave

  // Chroma bleed: red and blue sampled at shifted coordinates
  float shift = uChroma * (0.004 + band * 0.01);
  vec3 col;
  col.r = scene(uv + vec2(shift, 0.0)).r;
  col.g = scene(uv).g;
  col.b = scene(uv - vec2(shift, 0.0)).b;

  // On-screen display, with the same colour fringing
  vec4 osdR = texture2D(uOsd, uv + vec2(shift * 0.6, 0.0));
  vec4 osdC = texture2D(uOsd, uv);
  col = mix(col, vec3(osdR.a, osdC.a, osdC.a) * 0.95, max(osdR.a, osdC.a) * 0.9);

  // Noise band, rewind streaks and grain
  float n = hash21(uv * uResolution + fract(uTime * 7.0) * 100.0);
  col += band * n * 0.35 * uTracking;
  col += step(0.985 - uRewind * 0.05, hash21(vec2(row * 0.37, floor(uTime * 24.0)))) * (0.25 + uRewind * 0.5);
  col += (n - 0.5) * uNoise;

  // Scanlines and vignette
  col *= 0.82 + 0.18 * sin(uv.y * lines * 3.14159);
  vec2 v = uv * (1.0 - uv.yx);
  col *= pow(v.x * v.y * 18.0, 0.25);
  col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), 0.12); // slight tape desaturation
  gl_FragColor = vec4(col, 1.0);
}
`;

/** The OSD lives in a small 2D canvas that is redrawn once per second. */
function drawOsd(ctx: CanvasRenderingContext2D, seconds: number, rewinding: boolean) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 40px ui-monospace, Menlo, Consolas, monospace";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 4;
  ctx.fillText(rewinding ? "◀◀ REW" : "PLAY ▶", 60, 50);
  const s = Math.max(0, seconds);
  const tc = `${String(Math.floor(s / 3600)).padStart(1, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  ctx.textAlign = "right";
  ctx.fillText(`SP ${tc}`, W - 60, 50);
  ctx.textBaseline = "bottom";
  ctx.font = "bold 30px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText("CH 03", W - 60, H - 50);
  ctx.textAlign = "left";
  ctx.fillText("TRACKING AUTO", 60, H - 50);
}

function Tape() {
  const params = useParams({ curvature: 1, chroma: 1, tracking: 1, noise: 0.08 });
  const gl = useThree((s) => s.gl);
  const rewind = useRef(0);
  const rewindUntil = useRef(0);
  const tape = useRef(0);

  const osd = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 576;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return { ctx: canvas.getContext("2d")!, texture };
  }, []);
  useEffect(() => () => osd.texture.dispose(), [osd]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSceneTime: { value: 0 },
      uAspect: { value: 1 },
      uRewind: { value: 0 },
      uCurvature: { value: 1 },
      uChroma: { value: 1 },
      uTracking: { value: 1 },
      uNoise: { value: 0.08 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uOsd: { value: osd.texture },
    }),
    [osd],
  );

  useGui((gui) => {
    gui.add(params, "curvature", 0, 2, 0.01);
    gui.add(params, "chroma", 0, 4, 0.05).name("chroma bleed");
    gui.add(params, "tracking", 0, 3, 0.05);
    gui.add(params, "noise", 0, 0.4, 0.01);
  });

  useEffect(() => {
    // Click: rewind the tape for a moment.
    const onDown = () => (rewindUntil.current = performance.now() + 1600);
    const el = gl.domElement;
    el.addEventListener("pointerdown", onDown);
    return () => el.removeEventListener("pointerdown", onDown);
  }, [gl]);

  const lastOsd = useRef({ second: -1, rewinding: false });

  useFrame((state, dt) => {
    const rewinding = performance.now() < rewindUntil.current;
    rewind.current += ((rewinding ? 1 : 0) - rewind.current) * 0.12;
    // Tape time runs backwards (fast) while rewinding.
    tape.current += dt * (1 - rewind.current * 9);
    tape.current = Math.max(tape.current, 0);
    const second = Math.floor(tape.current);
    if (second !== lastOsd.current.second || rewinding !== lastOsd.current.rewinding) {
      drawOsd(osd.ctx, second, rewinding);
      osd.texture.needsUpdate = true;
      lastOsd.current = { second, rewinding };
    }
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uSceneTime.value = tape.current;
    uniforms.uRewind.value = rewind.current;
    uniforms.uAspect.value = state.size.width / state.size.height;
    // Scanline count is tied to the CSS height so it reads as a TV, not as pixels.
    uniforms.uResolution.value.set(state.size.width, Math.min(state.size.height, 540));
    uniforms.uCurvature.value = params.curvature;
    uniforms.uChroma.value = params.chroma;
    uniforms.uTracking.value = params.tracking;
    uniforms.uNoise.value = params.noise;
  });

  return <ScreenQuad fragmentShader={fragment} uniforms={uniforms} />;
}

export default function Vhs() {
  return (
    <Stage background="#000000" dpr={[1, 1.5]}>
      <Tape />
    </Stage>
  );
}
