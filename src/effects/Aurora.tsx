import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { ScreenQuad } from "../components/ScreenQuad";
import { displayColor, setDisplayColor } from "../lib/color";
import { fbm } from "../lib/glsl";
import { useGui, useParams } from "../lib/gui";

/**
 * Domain warping: instead of sampling noise at p, sample it at p displaced by
 * another noise, which was itself displaced by a third. The result folds like
 * smoke or silk. The intermediate vectors q and r are reused to mix colours.
 */
const fragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAspect;
uniform float uWarp;
uniform float uGrain;
uniform vec2 uMouse;
uniform vec3 uC1, uC2, uC3, uC4;
varying vec2 vUv;
${fbm}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.2;

  // The pointer bends the flow around itself
  vec2 m = p - uMouse;
  p += m * 0.35 * exp(-dot(m, m) * 2.0);

  float t = uTime * 0.12;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.6));
  vec2 r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2) + t * 1.2),
                fbm(p + uWarp * q + vec2(8.3, 2.8) + t));
  float f = fbm(p + uWarp * r);

  vec3 col = mix(uC1, uC2, clamp(f * f * 3.0, 0.0, 1.0));
  col = mix(col, uC3, clamp(length(q) * 0.9, 0.0, 1.0) * 0.6);
  col = mix(col, uC4, clamp(r.x * r.x * 1.4, 0.0, 1.0));
  col *= 0.35 + 1.1 * f;

  // Vignette and film grain; the grain also hides banding in the dark gradients.
  col *= smoothstep(1.25, 0.25, length(vUv - 0.5) * 1.4);
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}
`;

const PALETTES: Record<string, [string, string, string, string]> = {
  aurora: ["#020a12", "#1f9e7d", "#2243e2", "#b6fff0"],
  sunset: ["#12030c", "#ff5e3a", "#7b2ff7", "#ffd27a"],
  ocean: ["#010814", "#0a6c9c", "#0b2a6b", "#8ee9ff"],
  mono: ["#050505", "#5a5a5a", "#1c1c1c", "#f0f0f0"],
};

function Flow() {
  const params = useParams({ speed: 1, warp: 4, grain: 0.04, palette: "aurora" });
  const time = useRef(0);
  const target = useMemo(() => new THREE.Vector2(), []);
  const uniforms = useMemo(() => {
    const [a, b, c, d] = PALETTES.aurora;
    return {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uWarp: { value: 4 },
      uGrain: { value: 0.04 },
      uMouse: { value: new THREE.Vector2() },
      uC1: { value: displayColor(a) },
      uC2: { value: displayColor(b) },
      uC3: { value: displayColor(c) },
      uC4: { value: displayColor(d) },
    };
  }, []);

  useGui((gui) => {
    gui.add(params, "speed", 0, 4, 0.05);
    gui.add(params, "warp", 0, 8, 0.05);
    gui.add(params, "grain", 0, 0.15, 0.005);
    gui.add(params, "palette", Object.keys(PALETTES)).onChange((name: string) => {
      const [a, b, c, d] = PALETTES[name];
      setDisplayColor(uniforms.uC1.value, a);
      setDisplayColor(uniforms.uC2.value, b);
      setDisplayColor(uniforms.uC3.value, c);
      setDisplayColor(uniforms.uC4.value, d);
    });
  });

  useFrame((state, dt) => {
    time.current += dt * params.speed;
    const aspect = state.size.width / state.size.height;
    uniforms.uTime.value = time.current;
    uniforms.uAspect.value = aspect;
    uniforms.uWarp.value = params.warp;
    uniforms.uGrain.value = params.grain;
    target.set(state.pointer.x * 1.1 * aspect, state.pointer.y * 1.1);
    uniforms.uMouse.value.lerp(target, 0.04);
  });

  return <ScreenQuad fragmentShader={fragment} uniforms={uniforms} />;
}

export default function Aurora() {
  return (
    <Stage background="#020a12" dpr={[1, 1.25]}>
      <Flow />
    </Stage>
  );
}
