import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { ScreenQuad } from "../components/ScreenQuad";
import { setDisplayColor, displayColor } from "../lib/color";
import { fbm } from "../lib/glsl";
import { useGui, useParams } from "../lib/gui";

/**
 * A topographic map drawn entirely in a fragment shader. Each pixel evaluates
 * a height field; contour lines are where height * levels crosses an integer.
 * fwidth() measures how fast that value changes per pixel, so every line ends
 * up the same thickness on screen, anti-aliased, at any zoom.
 */
const fragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAspect;
uniform float uLevels;
uniform float uFill;
uniform vec2 uMouse;
uniform vec2 uParallax;
uniform float uHill;
uniform vec3 uBg, uMinor, uMajor, uTint;
varying vec2 vUv;
${fbm}

float heightAt(vec2 p) {
  vec2 q = p + vec2(uTime * 0.02, uTime * 0.012);
  float h = fbm(q * 0.9);
  h += 0.35 * fbm(q * 2.3 + 7.1);
  // A hill that follows the pointer: contours flow around it.
  vec2 d = p - uMouse;
  h += uHill * exp(-dot(d, d) * 2.5);
  return h;
}

float contour(float v, float thickness) {
  float f = abs(fract(v - 0.5) - 0.5);       // distance to the nearest integer
  float w = fwidth(v) * thickness;
  return 1.0 - smoothstep(0.0, w, f);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 3.0;
  float h = heightAt(p + uParallax);
  float v = h * uLevels;

  float minor = contour(v, 1.0);
  float major = contour(v / 5.0, 1.6);     // every fifth line is an index contour

  vec3 color = uBg;
  // Hypsometric tint: quantised bands, darker low, lighter high.
  float band = floor(v) / uLevels;
  color = mix(color, uTint, uFill * clamp(band * 0.9 - 0.15, 0.0, 1.0) * 0.45);
  color = mix(color, uMinor, minor * 0.55);
  color = mix(color, uMajor, major * 0.9);

  // A soft glow near the summit under the pointer
  vec2 d = p + uParallax - uMouse;
  color += uMajor * exp(-dot(d, d) * 6.0) * 0.06;
  gl_FragColor = vec4(color, 1.0);
}
`;

const PALETTES: Record<string, { bg: string; minor: string; major: string; tint: string }> = {
  night: { bg: "#08100d", minor: "#2a8f73", major: "#74f5dd", tint: "#3ad6aa" },
  blueprint: { bg: "#14324a", minor: "#7d9fb5", major: "#dceaf0", tint: "#2b5878" },
  paper: { bg: "#faf9f5", minor: "#9fb2a9", major: "#4f655c", tint: "#cfe3d8" },
};

function TopoMap() {
  const params = useParams({ levels: 14, fill: true, speed: 1, palette: "night" });
  const gl = useThree((s) => s.gl);
  const pressed = useRef(false);
  const time = useRef(0);
  const mouse = useMemo(() => new THREE.Vector2(), []);
  const parallax = useMemo(() => new THREE.Vector2(), []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uLevels: { value: 14 },
      uFill: { value: 1 },
      uMouse: { value: new THREE.Vector2() },
      uParallax: { value: new THREE.Vector2() },
      uHill: { value: 0.25 },
      uBg: { value: displayColor(PALETTES.night.bg) },
      uMinor: { value: displayColor(PALETTES.night.minor) },
      uMajor: { value: displayColor(PALETTES.night.major) },
      uTint: { value: displayColor(PALETTES.night.tint) },
    }),
    [],
  );

  useGui((gui) => {
    gui.add(params, "levels", 4, 40, 1);
    gui.add(params, "fill").name("altitude tint");
    gui.add(params, "speed", 0, 5, 0.05);
    gui.add(params, "palette", Object.keys(PALETTES)).onChange((name: string) => {
      const p = PALETTES[name];
      setDisplayColor(uniforms.uBg.value, p.bg);
      setDisplayColor(uniforms.uMinor.value, p.minor);
      setDisplayColor(uniforms.uMajor.value, p.major);
      setDisplayColor(uniforms.uTint.value, p.tint);
    });
  });

  useEffect(() => {
    const el = gl.domElement;
    const down = () => (pressed.current = true);
    const up = () => (pressed.current = false);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, [gl]);

  useFrame((state, dt) => {
    time.current += dt * params.speed;
    const aspect = state.size.width / state.size.height;
    uniforms.uTime.value = time.current;
    uniforms.uAspect.value = aspect;
    uniforms.uLevels.value = params.levels;
    uniforms.uFill.value = params.fill ? 1 : 0;
    // Pointer in the same space as p in the shader (p spans 3 units vertically).
    mouse.set(state.pointer.x * 1.5 * aspect, state.pointer.y * 1.5);
    // The map drifts slightly against the pointer: a cheap sense of depth.
    parallax.set(-state.pointer.x * 0.08, -state.pointer.y * 0.06);
    uniforms.uParallax.value.lerp(parallax, 0.03);
    uniforms.uMouse.value.lerp(mouse.add(uniforms.uParallax.value), 0.06);
    // Holding the pointer down raises the hill.
    uniforms.uHill.value += ((pressed.current ? 0.7 : 0.25) - uniforms.uHill.value) * 0.04;
  });

  return <ScreenQuad fragmentShader={fragment} uniforms={uniforms} />;
}

export default function Contours() {
  return (
    <Stage background="#08100d" dpr={[1, 1.5]}>
      <TopoMap />
    </Stage>
  );
}
