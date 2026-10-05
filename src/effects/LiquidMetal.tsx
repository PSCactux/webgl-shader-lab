import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { ScreenQuad } from "../components/ScreenQuad";
import { displayColor, setDisplayColor } from "../lib/color";
import { useGui, useParams } from "../lib/gui";

const PALETTES: Record<string, [string, string, string]> = {
  // [shadow, lit body, fresnel rim]
  mint: ["#05241c", "#3ad6aa", "#2243e2"],
  chrome: ["#101318", "#c9d3dc", "#7aa2ff"],
  gold: ["#2a1604", "#f2b544", "#ff5e3a"],
  magenta: ["#1f0420", "#f05bd8", "#4cc9f0"],
};

/**
 * Full-screen raymarching: there is no geometry, just a quad and a shader that
 * finds the surface by marching rays. The drops melt into each other because
 * their distances are blended with a smooth minimum (smin).
 */
const fragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uMouse;
uniform float uAspect;
uniform float uSmooth;
uniform int uBlobs;
uniform vec3 uDark, uLit, uRim;
varying vec2 vUv;

// Polynomial smooth minimum: this is what makes two drops merge instead of intersecting.
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float map(vec3 p) {
  float t = uTime * 0.5;
  float d = length(p - vec3(sin(t) * 1.1, cos(t * 0.9) * 0.7, 0.0)) - 0.85;
  for (int i = 1; i < 6; i++) {
    if (i >= uBlobs) break;
    float fi = float(i);
    vec3 c = vec3(sin(t * (0.6 + fi * 0.17) + fi * 1.7) * 1.4,
                  cos(t * (0.7 + fi * 0.11) + fi * 2.3) * 1.1,
                  sin(t * (0.5 + fi * 0.13) + fi) * 0.6);
    d = smin(d, length(p - c) - (0.62 - fi * 0.05), uSmooth);
  }
  // One drop chases the pointer
  d = smin(d, length(p - vec3(uMouse.x * 2.6 * uAspect, uMouse.y * 2.6, 0.3)) - 0.55, uSmooth + 0.1);
  return d;
}

// Tetrahedral normal: four map() calls instead of six.
vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.001;
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) +
                   k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

// A fake studio: what the metal reflects. Bright softbox on top, dark floor.
vec3 studio(vec3 r) {
  vec3 c = mix(uDark * 0.6, uLit * 0.35, smoothstep(-0.4, 0.6, r.y));
  c += vec3(1.0) * smoothstep(0.75, 0.95, r.y) * 0.9;
  c += uRim * smoothstep(0.6, 1.0, r.x) * 0.5;
  return c;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.4;
  vec3 ro = vec3(0.0, 0.0, 5.0);
  vec3 rd = normalize(vec3(uv, -1.6));

  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    float d = map(ro + rd * t);
    if (d < 0.001) { hit = true; break; }
    if (t > 12.0) break;
    t += d * 0.9;
  }

  vec3 color = mix(vec3(0.01, 0.02, 0.035), uDark * 0.5, vUv.y);

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 light = normalize(vec3(1.0, 1.4, 1.2));
    float dif = max(dot(n, light), 0.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    // Hard specular highlight: the metallic look
    float spec = pow(max(dot(reflect(-light, n), -rd), 0.0), 48.0);
    vec3 metal = mix(uDark, uLit, dif);
    metal = mix(metal, studio(reflect(rd, n)), 0.35);
    metal += uRim * fres * 0.9;
    metal += vec3(1.0) * spec * 0.8;
    color = metal;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

function Metaballs() {
  const params = useParams({ speed: 1, smoothness: 0.75, blobs: 4, palette: "mint" });
  const time = useRef(0);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
      uAspect: { value: 1 },
      uSmooth: { value: 0.75 },
      uBlobs: { value: 4 },
      uDark: { value: displayColor(PALETTES.mint[0]) },
      uLit: { value: displayColor(PALETTES.mint[1]) },
      uRim: { value: displayColor(PALETTES.mint[2]) },
    }),
    [],
  );

  useGui((gui) => {
    gui.add(params, "speed", 0, 3, 0.05);
    gui.add(params, "smoothness", 0.05, 1.5, 0.01);
    gui.add(params, "blobs", 1, 6, 1);
    gui.add(params, "palette", Object.keys(PALETTES)).onChange((name: string) => {
      const [a, b, c] = PALETTES[name];
      setDisplayColor(uniforms.uDark.value, a);
      setDisplayColor(uniforms.uLit.value, b);
      setDisplayColor(uniforms.uRim.value, c);
    });
  });

  useFrame((state, dt) => {
    time.current += dt * params.speed;
    uniforms.uTime.value = time.current;
    uniforms.uMouse.value.lerp(state.pointer, 0.05);
    uniforms.uAspect.value = state.size.width / state.size.height;
    uniforms.uSmooth.value = params.smoothness;
    uniforms.uBlobs.value = params.blobs;
  });

  return <ScreenQuad fragmentShader={fragment} uniforms={uniforms} />;
}

export default function LiquidMetal() {
  return (
    <Stage background="#01050a" dpr={[1, 1.25]}>
      <Metaballs />
    </Stage>
  );
}
