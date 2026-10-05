import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { displayColor } from "../lib/color";
import { useGui, useParams } from "../lib/gui";
import { useShaderMaterial } from "../lib/material";
import { prng } from "../lib/random";

const A = "#3ad6aa";
const B = "#2243e2";

/** The swirl inside the portal: the whole vortex is a shader on a disc, in polar coordinates. */
const vortexFragment = /* glsl */ `
uniform float uTime;
uniform float uInside;
uniform vec3 uA;
uniform vec3 uB;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);

  // Arms that spin and stretch towards the centre: 1/r winds them tighter inside.
  float arms = sin(a * 4.0 + 1.0 / max(r, 0.06) * 2.2 - uTime * 1.6);
  float spiral = smoothstep(0.1, 0.9, arms);

  // The core opens up when you go in
  float core = smoothstep(0.55 - uInside * 0.5, 0.0, r);

  vec3 color = mix(uB * 0.35, uA, spiral * (1.0 - r));
  color += uA * core * (0.6 + uInside * 2.2);
  color *= smoothstep(1.0, 0.25, r);
  gl_FragColor = vec4(color, smoothstep(1.0, 0.6, r));
}
`;

/** A soft additive halo around the ring, standing in for a bloom pass. */
const haloFragment = /* glsl */ `
uniform vec3 uA;
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 8.0; // plane is 8 units wide
  float d = (r - 2.6) / 0.35;
  float glow = exp(-d * d) * (0.55 + 0.1 * sin(uTime * 3.0));
  gl_FragColor = vec4(uA * glow, glow);
}
`;

const localVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/**
 * Particles orbiting and falling into the centre. Each one only stores a
 * phase; its position is a closed-form function of time evaluated in the
 * vertex shader, so the CPU never touches them.
 */
const particleVertex = /* glsl */ `
attribute float aPhase;
attribute float aAngle;
uniform float uTime;
uniform float uPixelRatio;
varying float vAlpha;
void main() {
  float cycle = fract(aPhase + uTime * 0.09);
  float r = 5.2 * (1.0 - cycle) + 0.2;
  float ang = aAngle + cycle * 16.0;  // random start angle, winding faster as it falls in
  vec3 p = vec3(cos(ang) * r, sin(ang) * r * 0.92, (aPhase - 0.5) * 3.2 * (1.0 - cycle) - cycle * 0.6);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (2.0 + cycle * 2.0) * uPixelRatio * (8.0 / -mv.z);
  vAlpha = smoothstep(0.0, 0.1, cycle) * smoothstep(1.0, 0.85, cycle);
  gl_Position = projectionMatrix * mv;
}
`;

const particleFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vAlpha * 0.9);
}
`;

function Particles({ count }: { count: number }) {
  const geometry = useMemo(() => {
    const rand = prng(77);
    const phase = new Float32Array(count);
    const angle = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      phase[i] = rand();
      angle[i] = rand() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    g.setAttribute("aAngle", new THREE.BufferAttribute(angle, 1));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 }, uColor: { value: displayColor("#74f5dd") } }),
    [],
  );
  const material = useShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uPixelRatio.value = state.gl.getPixelRatio();
  });

  return (
    <points geometry={geometry} material={material} frustumCulled={false} />
  );
}

function Scene() {
  const params = useParams({ particles: 12000, spin: 1 });
  const [count, setCount] = useState(params.particles);
  const [inside, setInside] = useState(false);
  const ring = useRef<THREE.Mesh>(null);

  useGui((gui) => {
    gui.add(params, "particles", 2000, 40000, 1000).onFinishChange((v: number) => setCount(v));
    gui.add(params, "spin", 0, 3, 0.05);
  });

  const vortex = useMemo(
    () => ({ uTime: { value: 0 }, uInside: { value: 0 }, uA: { value: displayColor(A) }, uB: { value: displayColor(B) } }),
    [],
  );
  const halo = useMemo(() => ({ uTime: { value: 0 }, uA: { value: displayColor(A) } }), []);
  const vortexMaterial = useShaderMaterial({ vertexShader: localVertex, fragmentShader: vortexFragment, uniforms: vortex, transparent: true });
  const haloMaterial = useShaderMaterial({
    vertexShader: localVertex,
    fragmentShader: haloFragment,
    uniforms: halo,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  useEffect(() => {
    // Click anywhere on the page toggles going through the portal.
    const toggle = (e: PointerEvent) => {
      if ((e.target as HTMLElement).tagName === "CANVAS") setInside((v) => !v);
    };
    window.addEventListener("pointerdown", toggle);
    return () => window.removeEventListener("pointerdown", toggle);
  }, []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    vortex.uTime.value += dt * params.spin;
    halo.uTime.value = t;
    vortex.uInside.value += ((inside ? 1 : 0) - vortex.uInside.value) * 0.04;
    if (ring.current) ring.current.rotation.z += dt * 0.12;
    // Going in, the camera moves forward until it passes through the ring.
    const cam = state.camera;
    cam.position.z += ((inside ? 0.4 : 7) - cam.position.z) * 0.03;
    cam.position.x += (state.pointer.x * 0.6 - cam.position.x) * 0.05;
    cam.position.y += (state.pointer.y * 0.4 - cam.position.y) * 0.05;
    cam.lookAt(0, 0, 0);
  });

  return (
    <group>
      <mesh ref={ring}>
        <torusGeometry args={[2.6, 0.12, 24, 140]} />
        <meshStandardMaterial color={A} emissive={A} emissiveIntensity={2.6} roughness={0.2} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0, -0.1]} material={vortexMaterial}>
        <circleGeometry args={[2.55, 96]} />
      </mesh>
      <mesh position={[0, 0, 0.05]} material={haloMaterial}>
        <planeGeometry args={[8, 8]} />
      </mesh>
      <Particles count={count} />
      <pointLight position={[0, 0, 2]} intensity={22} color={A} distance={14} />
      <ambientLight intensity={0.25} />
    </group>
  );
}

export default function Portal() {
  return (
    <Stage background="#01030a" camera={{ position: [0, 0, 7], fov: 55, near: 0.05 }}>
      <Scene />
    </Stage>
  );
}
