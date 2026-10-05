import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { displayColor, setDisplayColor } from "../lib/color";
import { useGui, useParams } from "../lib/gui";
import { useShaderMaterial } from "../lib/material";

/**
 * Endless flight through a tube built around a closed spline. The camera
 * rides the curve and the shader paints rings and ribs that scroll past: the
 * feeling of speed comes from the shader, not from moving geometry.
 */
const vertex = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
uniform float uTime;
uniform float uRings;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uFog;
varying vec2 vUv;
varying float vDepth;

void main() {
  // Rings running backwards: this is what sells the speed
  float rings = fract(vUv.x * uRings - uTime * 1.6);
  float line = smoothstep(0.94, 1.0, rings);

  // Longitudinal ribs
  float ribs = smoothstep(0.92, 1.0, fract(vUv.y * 24.0));

  // A pulse travelling along the tube
  float pulse = 1.0 - smoothstep(0.0, 0.15, fract(vUv.x * 12.0 - uTime * 0.28));

  vec3 color = mix(uB * 0.10, uA * 0.35, 0.5 + 0.5 * sin(vUv.y * 6.2832));
  color += uA * line * (0.55 + pulse * 1.6);
  color += uA * ribs * 0.18;

  // Darken with distance for depth
  float fog = smoothstep(4.0, 38.0, vDepth);
  gl_FragColor = vec4(mix(color, uFog, fog), 1.0);
}
`;

const PALETTES: Record<string, [string, string]> = {
  "teal / blue": ["#3ad6aa", "#2243e2"],
  neon: ["#ff3cac", "#784ba0"],
  amber: ["#ffb347", "#6a1b00"],
};

function Tube() {
  const params = useParams({ speed: 1, tilt: 1, palette: "teal / blue" });

  const curve = useMemo(() => {
    // A closed loop, so the flight never has to jump back to the start.
    const points: THREE.Vector3[] = [];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 80 + Math.sin(a * 3) * 14;
      points.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 4) * 9, Math.sin(a) * r));
    }
    return new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5);
  }, []);

  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 900, 3.4, 42, true), [curve]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRings: { value: Math.round(curve.getLength() / 2.2) },
      uA: { value: displayColor("#3ad6aa") },
      uB: { value: displayColor("#2243e2") },
      uFog: { value: displayColor("#01040a") },
    }),
    [curve],
  );

  const material = useShaderMaterial({ side: THREE.BackSide, vertexShader: vertex, fragmentShader: fragment, uniforms });

  useGui((gui) => {
    gui.add(params, "speed", 0, 3, 0.05);
    gui.add(params, "tilt", 0, 2, 0.05);
    gui.add(params, "palette", Object.keys(PALETTES)).onChange((name: string) => {
      setDisplayColor(uniforms.uA.value, PALETTES[name][0]);
      setDisplayColor(uniforms.uB.value, PALETTES[name][1]);
    });
  });

  const state = useMemo(() => ({ progress: 0, tilt: new THREE.Vector2(), pos: new THREE.Vector3(), ahead: new THREE.Vector3() }), []);

  useFrame(({ camera, pointer }, dt) => {
    uniforms.uTime.value += dt * params.speed;
    state.progress = (state.progress + dt * 0.018 * params.speed) % 1;
    curve.getPointAt(state.progress, state.pos);
    curve.getPointAt((state.progress + 0.01) % 1, state.ahead);
    camera.position.copy(state.pos);
    camera.lookAt(state.ahead);
    // The pointer tilts the head, not the trajectory
    state.tilt.lerp(pointer, 0.05);
    camera.rotateZ(-state.tilt.x * 0.35 * params.tilt);
    camera.rotateX(state.tilt.y * 0.15 * params.tilt);
  });

  return (
    <mesh geometry={geometry} material={material} />
  );
}

export default function Tunnel() {
  return (
    <Stage background="#01040a" camera={{ position: [0, 0, 0], fov: 70, near: 0.1, far: 120 }}>
      <Tube />
    </Stage>
  );
}
