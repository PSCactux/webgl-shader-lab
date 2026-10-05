import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { displayColor } from "../lib/color";
import { useGui, useParams } from "../lib/gui";
import { useShaderMaterial } from "../lib/material";

const MAX_RIPPLES = 4;

/**
 * Rows of line segments laid over the viewport. All the motion happens in the
 * vertex shader: a background swell, a radial push away from the pointer, and
 * expanding rings where you click.
 */
const vertex = /* glsl */ `
attribute float aRow;
uniform float uTime;
uniform vec2 uMouse;
uniform float uRadius;
uniform float uForce;
uniform float uSwell;
uniform vec3 uRipples[${MAX_RIPPLES}]; // xy = centre, z = start time
varying float vRow;

void main() {
  vec3 p = position;
  float rowPhase = aRow * 38.0 * 0.22;

  // Background swell
  p.y += (sin(p.x * 0.7 + uTime * 1.6 + rowPhase) * 0.08 + cos(p.x * 0.26 - uTime) * 0.05) * uSwell;

  // The pointer pushes the mesh outwards
  vec2 d = position.xy - uMouse;
  float dist = length(d);
  if (dist < uRadius) {
    float f = pow(1.0 - dist / uRadius, 2.2) * uForce;
    p.xy += normalize(d + 1e-4) * f;
  }

  // Click ripples: a ring travelling outwards and fading
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec3 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 4.0) continue;
    vec2 rd = position.xy - r.xy;
    float rl = length(rd);
    float front = age * 3.0;
    float ring = exp(-pow((rl - front) * 2.2, 2.0)) * (1.0 - age / 4.0);
    p.xy += normalize(rd + 1e-4) * ring * 0.45;
  }

  vRow = aRow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const fragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
varying float vRow;
void main() {
  vec3 c = mix(uTop, uBottom, vRow);
  gl_FragColor = vec4(c, 0.22 + vRow * 0.55);
}
`;

function Field() {
  const params = useParams({ radius: 2.7, force: 0.9, swell: 1, density: 1 });
  const viewport = useThree((s) => s.viewport);
  const gl = useThree((s) => s.gl);
  const ripples = useRef(0);
  const hovering = useRef(false);
  const time = useRef(0);
  const mouse = useMemo(() => new THREE.Vector2(99, 99), []);

  useGui((gui) => {
    gui.add(params, "radius", 0.5, 6, 0.1);
    gui.add(params, "force", 0, 3, 0.05);
    gui.add(params, "swell", 0, 3, 0.05);
  });

  // Rebuilt only when the viewport size changes: rows ~0.24 units apart.
  const geometry = useMemo(() => {
    const w = viewport.width * 1.15;
    const h = viewport.height * 1.15;
    const rows = Math.max(12, Math.round(h / 0.24));
    const cols = Math.max(60, Math.round(w / 0.07));
    const positions = new Float32Array(rows * cols * 3);
    const row = new Float32Array(rows * cols);
    const index: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        positions[i * 3] = -w / 2 + (c / (cols - 1)) * w;
        positions[i * 3 + 1] = h / 2 - (r / (rows - 1)) * h;
        row[i] = r / (rows - 1);
        if (c < cols - 1) index.push(i, i + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aRow", new THREE.BufferAttribute(row, 1));
    g.setIndex(index);
    return g;
  }, [viewport.width, viewport.height]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(99, 99) },
      uRadius: { value: 2.7 },
      uForce: { value: 0.9 },
      uSwell: { value: 1 },
      uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3(0, 0, -99)) },
      uTop: { value: displayColor("#3ad6aa") },
      uBottom: { value: displayColor("#76aaff") },
    }),
    [],
  );

  const material = useShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, transparent: true, depthWrite: false });

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * viewport.width;
      const y = (0.5 - (e.clientY - rect.top) / rect.height) * viewport.height;
      uniforms.uRipples.value[ripples.current % MAX_RIPPLES].set(x, y, time.current);
      ripples.current++;
    };
    // Leaving the canvas releases the mesh.
    const onMove = () => (hovering.current = true);
    const onLeave = () => (hovering.current = false);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [gl, viewport.width, viewport.height, uniforms, mouse]);

  useFrame((state, dt) => {
    time.current += dt;
    uniforms.uTime.value = time.current;
    uniforms.uRadius.value = params.radius;
    uniforms.uForce.value = params.force;
    uniforms.uSwell.value = params.swell;
    if (hovering.current) {
      mouse.set((state.pointer.x * state.viewport.width) / 2, (state.pointer.y * state.viewport.height) / 2);
    } else {
      mouse.set(99, 99);
    }
    uniforms.uMouse.value.lerp(mouse, 0.25);
  });

  return (
    <lineSegments geometry={geometry} material={material} frustumCulled={false} />
  );
}

export default function WaveField() {
  return (
    <Stage
      background="#04070a"
      camera={{ position: [0, 0, 10], fov: 50 }}
      overlay={<div className="vignette" style={{ background: "radial-gradient(60% 55% at 50% 50%, transparent 35%, #04070a 95%)" }} />}
    >
      <Field />
    </Stage>
  );
}
