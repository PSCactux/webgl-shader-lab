import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GPUComputationRenderer, type Variable } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { Stage } from "../components/Stage";
import { displayColor } from "../lib/color";
import { useGui, useParams } from "../lib/gui";
import { useShaderMaterial } from "../lib/material";
import { prng } from "../lib/random";

/**
 * GPGPU: particle state lives in two float textures (position and velocity),
 * one texel per particle. Every frame two fragment shaders read last frame's
 * textures and write the next ones (ping-pong). The CPU only sets a few
 * uniforms, so the CPU cost does not grow with the particle count.
 */

// Simplex noise 3D (Ashima Arts / Stefan Gustavson, MIT), used to build curl noise.
const simplex = /* glsl */ `
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Three decorrelated noise fields form a vector potential; its curl is divergence-free,
// so particles swirl and fold without clumping into sinks.
vec3 potential(vec3 p) {
  return vec3(snoise(p), snoise(p + vec3(31.4, 17.2, -9.7)), snoise(p + vec3(-23.1, 41.9, 7.3)));
}
vec3 curlNoise(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
  vec3 px0 = potential(p - dx), px1 = potential(p + dx);
  vec3 py0 = potential(p - dy), py1 = potential(p + dy);
  vec3 pz0 = potential(p - dz), pz1 = potential(p + dz);
  return vec3(
    (py1.z - py0.z) - (pz1.y - pz0.y),
    (pz1.x - pz0.x) - (px1.z - px0.z),
    (px1.y - px0.y) - (py1.x - py0.x)
  ) / (2.0 * e);
}
`;

const velocityShader = /* glsl */ `
uniform float uTime;
uniform float uDelta;
uniform float uCurlScale;
uniform float uCurlStrength;
uniform float uAttract;
uniform vec3 uPointer;
${simplex}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 p = texture2D(texturePosition, uv).xyz;
  vec3 v = texture2D(textureVelocity, uv).xyz;

  vec3 target = curlNoise(p * uCurlScale + vec3(0.0, 0.0, uTime * 0.05)) * uCurlStrength;
  // A soft spherical wall keeps the swarm on screen.
  float r = length(p);
  target -= p * smoothstep(2.2, 4.2, r) * 1.6;
  // Pointer attractor (only while pressed)
  vec3 toP = uPointer - p;
  float dp = length(toP);
  target += toP / (dp + 0.15) * uAttract * 2.5;

  v = mix(v, target, 1.0 - exp(-uDelta * 3.0));
  gl_FragColor = vec4(v, 1.0);
}
`;

const positionShader = /* glsl */ `
uniform float uDelta;
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 p = texture2D(texturePosition, uv).xyz;
  vec3 v = texture2D(textureVelocity, uv).xyz;
  gl_FragColor = vec4(p + v * uDelta, 1.0);
}
`;

const renderVertex = /* glsl */ `
attribute vec2 aRef;
uniform sampler2D uPositions;
uniform sampler2D uVelocities;
uniform float uPixelRatio;
uniform float uSize;
varying float vSpeed;
void main() {
  vec3 p = texture2D(uPositions, aRef).xyz;
  vSpeed = length(texture2D(uVelocities, aRef).xyz);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * uPixelRatio * (12.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const renderFragment = /* glsl */ `
uniform vec3 uSlow;
uniform vec3 uFast;
varying float vSpeed;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  vec3 c = mix(uSlow, uFast, smoothstep(0.2, 1.2, vSpeed));
  gl_FragColor = vec4(c, smoothstep(0.5, 0.0, d) * 0.6);
}
`;

type Sim = {
  gpu: GPUComputationRenderer;
  position: Variable;
  velocity: Variable;
};

const SIZES: Record<string, number> = { "16k": 128, "65k": 256, "262k": 512 };

function Swarm({ size, onSize }: { size: number; onSize: (size: number) => void }) {
  const params = useParams({
    particles: Object.keys(SIZES).find((k) => SIZES[k] === size) ?? "65k",
    curlScale: 0.45,
    curlStrength: 1.2,
    pointSize: 1.6,
  });
  const gl = useThree((s) => s.gl);
  const sim = useRef<Sim | null>(null);
  const group = useRef<THREE.Group>(null);
  const pressed = useRef(false);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  useGui((gui) => {
    gui.add(params, "particles", Object.keys(SIZES)).onChange((v: string) => onSize(SIZES[v]));
    gui.add(params, "curlScale", 0.1, 1.5, 0.01).name("noise scale");
    gui.add(params, "curlStrength", 0, 3, 0.01).name("flow strength");
    gui.add(params, "pointSize", 0.5, 4, 0.1).name("point size");
  });

  // Particle reference coordinates: which texel each point reads its state from.
  const geometry = useMemo(() => {
    const n = size * size;
    const ref = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      ref[i * 2] = ((i % size) + 0.5) / size;
      ref[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aRef", new THREE.BufferAttribute(ref, 2));
    return g;
  }, [size]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uPositions: { value: null as THREE.Texture | null },
      uVelocities: { value: null as THREE.Texture | null },
      uPixelRatio: { value: 1 },
      uSize: { value: 1.6 },
      uSlow: { value: displayColor("#4f7bff") },
      uFast: { value: displayColor("#7ef9de") },
    }),
    [],
  );

  const material = useShaderMaterial({
    vertexShader: renderVertex,
    fragmentShader: renderFragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // The simulation is created in an effect (not during render) and disposed with it.
  useEffect(() => {
    const gpu = new GPUComputationRenderer(size, size, gl);
    // Float render targets need EXT_color_buffer_float; fall back to half floats.
    if (!gl.extensions.has("EXT_color_buffer_float")) gpu.setDataType(THREE.HalfFloatType);
    const pos0 = gpu.createTexture();
    const vel0 = gpu.createTexture();
    const data = pos0.image.data as Float32Array;
    const rand = prng(1234);
    for (let i = 0; i < size * size; i++) {
      // Uniform points inside a sphere of radius 2.5
      const r = 2.5 * Math.cbrt(rand());
      const t = rand() * Math.PI * 2;
      const f = Math.acos(2 * rand() - 1);
      data.set([r * Math.sin(f) * Math.cos(t), r * Math.sin(f) * Math.sin(t), r * Math.cos(f), 1], i * 4);
    }
    const position = gpu.addVariable("texturePosition", positionShader, pos0);
    const velocity = gpu.addVariable("textureVelocity", velocityShader, vel0);
    gpu.setVariableDependencies(position, [position, velocity]);
    gpu.setVariableDependencies(velocity, [position, velocity]);
    position.material.uniforms.uDelta = { value: 0 };
    Object.assign(velocity.material.uniforms, {
      uTime: { value: 0 },
      uDelta: { value: 0 },
      uCurlScale: { value: 0.45 },
      uCurlStrength: { value: 1.2 },
      uAttract: { value: 0 },
      uPointer: { value: new THREE.Vector3() },
    });
    const error = gpu.init();
    if (error) console.error("GPGPU init failed:", error);
    sim.current = { gpu, position, velocity };
    return () => {
      sim.current = null;
      gpu.dispose();
      pos0.dispose();
      vel0.dispose();
    };
  }, [gl, size]);

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
    const s = sim.current;
    if (!s || !group.current) return;
    const delta = Math.min(dt, 1 / 30); // clamp so a stalled tab does not explode the swarm
    group.current.rotation.y += delta * 0.08;

    // Pointer on the z = 0 plane, then into the slowly rotating group's local space.
    ray.setFromCamera(state.pointer, state.camera);
    if (ray.ray.intersectPlane(plane, hit)) group.current.worldToLocal(hit);

    const vu = s.velocity.material.uniforms;
    vu.uTime.value += delta;
    vu.uDelta.value = delta;
    vu.uCurlScale.value = params.curlScale;
    vu.uCurlStrength.value = params.curlStrength;
    vu.uAttract.value += ((pressed.current ? 1 : 0) - vu.uAttract.value) * 0.1;
    vu.uPointer.value.copy(hit);
    s.position.material.uniforms.uDelta.value = delta;
    s.gpu.compute();

    uniforms.uPositions.value = s.gpu.getCurrentRenderTarget(s.position).texture;
    uniforms.uVelocities.value = s.gpu.getCurrentRenderTarget(s.velocity).texture;
    uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    uniforms.uSize.value = params.pointSize;
  });

  return (
    <group ref={group}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}

/** Changing the particle count rebuilds the whole simulation (new texture size). */
function SwarmWithSize() {
  const [size, setSize] = useState(() => (window.innerWidth < 768 ? 128 : 256));
  return <Swarm key={size} size={size} onSize={setSize} />;
}

export default function CurlSwarm() {
  return (
    <Stage background="#03040a" camera={{ position: [0, 0, 8], fov: 50 }}>
      <SwarmWithSize />
    </Stage>
  );
}
