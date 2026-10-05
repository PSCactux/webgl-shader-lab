import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { displayColor } from "../lib/color";
import { useGui, useParams } from "../lib/gui";
import { useShaderMaterial } from "../lib/material";
import { prng } from "../lib/random";

const SHAPE_WIDTH = 8; // world units

/**
 * Turns a word into target positions by drawing it on a 2D canvas and reading
 * the lit pixels back. No fonts or 3D models are loaded.
 */
function sampleText(text: string, count: number): Float32Array {
  const W = 640;
  const H = 220;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const word = text.trim() || "·";
  ctx.font = "900 100px system-ui, sans-serif";
  const size = Math.min(170, (100 * W * 0.92) / Math.max(1, ctx.measureText(word).width));
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(word, W / 2, H / 2);
  const data = ctx.getImageData(0, 0, W, H).data;

  const lit: number[] = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (data[(y * W + x) * 4 + 3] > 128) lit.push(x, y);
    }
  }
  const out = new Float32Array(count * 3);
  const rand = prng(7312026);
  const scale = SHAPE_WIDTH / W;
  const pixels = lit.length / 2;
  for (let p = 0; p < count; p++) {
    if (pixels === 0) break;
    const k = Math.floor(rand() * pixels) * 2;
    out[p * 3] = (lit[k] - W / 2 + rand() - 0.5) * scale;
    out[p * 3 + 1] = -(lit[k + 1] - H / 2 + rand() - 0.5) * scale;
    out[p * 3 + 2] = (rand() - 0.5) * 0.12;
  }
  return out;
}

const vertex = /* glsl */ `
uniform float uTime;
uniform float uMix;
uniform vec2 uMouse;
uniform float uPixelRatio;
attribute vec3 aTarget;
attribute float aSeed;
varying float vMix;
varying float vSeed;

void main() {
  // Each particle arrives with its own delay: the word draws itself.
  float delay = aSeed * 0.35;
  float m = clamp((uMix - delay) / (1.0 - delay), 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);

  vec3 pos = mix(position, aTarget, m);

  // Constant breathing so it never freezes completely
  float wave = sin(uTime * 1.2 + aSeed * 30.0) * 0.05;
  pos += vec3(wave, wave * 0.7, wave * 0.4) * (1.0 - m * 0.7);

  // The pointer pushes nearby particles away
  vec2 d = pos.xy - uMouse;
  float dist = length(d);
  if (dist < 1.1) {
    float f = (1.1 - dist) / 1.1;
    pos.xy += normalize(d + 1e-4) * f * 0.55;
    pos.z += f * 0.3;
  }

  vMix = m;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = (1.0 + aSeed * 1.6) * uPixelRatio * (12.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
varying float vMix;
varying float vSeed;
void main() {
  // Round particle with a soft edge
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.05, d);
  vec3 color = mix(uColorC, uColorA, vMix);
  color = mix(color, uColorB, vSeed * 0.3);
  gl_FragColor = vec4(color, alpha * (0.25 + vMix * 0.75));
}
`;

function Swarm() {
  const params = useParams({ text: "WebGL", count: 90000, cycle: true });
  const [text, setText] = useState(params.text);
  const [count, setCount] = useState(() => (window.innerWidth < 768 ? 40000 : 90000));
  const points = useRef<THREE.Points>(null);
  const mouse = useMemo(() => new THREE.Vector2(99, 99), []);
  const gl = useThree((s) => s.gl);
  const hovering = useRef(false);

  // Only repel while a pointer is actually over the canvas (a lifted finger does not count).
  useEffect(() => {
    const el = gl.domElement;
    const on = () => (hovering.current = true);
    const off = (e: PointerEvent) => {
      if (e.type === "pointerleave" || e.pointerType !== "mouse") hovering.current = false;
    };
    el.addEventListener("pointermove", on);
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerleave", off);
    el.addEventListener("pointerup", off);
    return () => {
      el.removeEventListener("pointermove", on);
      el.removeEventListener("pointerdown", on);
      el.removeEventListener("pointerleave", off);
      el.removeEventListener("pointerup", off);
    };
  }, [gl]);

  useGui((gui) => {
    params.count = count;
    gui.add(params, "text").name("word").onFinishChange((v: string) => setText(v.slice(0, 14)));
    gui.add(params, "count", { "30k": 30000, "60k": 60000, "90k": 90000, "150k": 150000 }).onChange((v: number) => setCount(Number(v)));
    gui.add(params, "cycle").name("dissolve loop");
  });

  // The "chaos" layout: a hollow sphere, so the scattered state is a round cloud.
  const geometry = useMemo(() => {
    const rand = prng(20260825);
    const chaos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 3.2 + rand() * 1.8;
      const t = rand() * Math.PI * 2;
      const f = Math.acos(2 * rand() - 1);
      chaos[i * 3] = r * Math.sin(f) * Math.cos(t);
      chaos[i * 3 + 1] = r * Math.sin(f) * Math.sin(t);
      chaos[i * 3 + 2] = r * Math.cos(f) * 0.6;
      seeds[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(chaos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    g.setAttribute("aTarget", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMix: { value: 0 },
      uMouse: { value: new THREE.Vector2(99, 99) },
      uPixelRatio: { value: 1 },
      uColorA: { value: displayColor("#3ad6aa") },
      uColorB: { value: displayColor("#a7f3e4") },
      uColorC: { value: displayColor("#2243e2") },
    }),
    [],
  );

  const material = useShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const clock = useMemo(() => ({ start: performance.now() }), []);

  // New word or new particle count: resample and replay the assembly.
  useEffect(() => {
    const attr = geometry.getAttribute("aTarget") as THREE.BufferAttribute;
    (attr.array as Float32Array).set(sampleText(text, count));
    attr.needsUpdate = true;
    uniforms.uMix.value = 0;
    clock.start = performance.now();
  }, [text, count, geometry, uniforms, clock]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    uniforms.uTime.value = t;
    uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    // Cycle: about 5.5 s formed, 3.5 s scattered.
    const since = (performance.now() - clock.start) / 1000;
    const formed = !params.cycle || since % 9 < 5.6;
    uniforms.uMix.value += ((formed ? 1 : 0) - uniforms.uMix.value) * 0.035;
    // On narrow screens the word is scaled down to fit the viewport.
    const scale = Math.min(1, (state.viewport.width * 0.9) / SHAPE_WIDTH);
    // Pointer on the z = 0 plane, in world units, then into the scaled local space.
    if (hovering.current) {
      mouse.set(
        (state.pointer.x * state.viewport.width) / 2 / scale,
        (state.pointer.y * state.viewport.height) / 2 / scale,
      );
    } else {
      mouse.set(99, 99);
    }
    uniforms.uMouse.value.lerp(mouse, 0.12);
    if (points.current) {
      points.current.rotation.y = Math.sin(t * 0.15) * 0.25;
      points.current.scale.setScalar(scale);
    }
  });

  return (
    <points ref={points} geometry={geometry} material={material} frustumCulled={false} />
  );
}

export default function ParticleMorph() {
  return (
    <Stage background="#04060a" camera={{ position: [0, 0, 7], fov: 55 }}>
      <Swarm />
    </Stage>
  );
}
