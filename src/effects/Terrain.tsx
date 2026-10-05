import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { displayColor, setDisplayColor } from "../lib/color";
import { fbm } from "../lib/glsl";
import { useGui, useParams } from "../lib/gui";
import { useShaderMaterial } from "../lib/material";

/**
 * A landscape generated in the vertex shader: the geometry is a flat plane and
 * all the relief is computed on the GPU every frame. No model is loaded.
 */
const vertex = /* glsl */ `
uniform float uTime;
uniform float uHeight;
varying float vHeight;
varying vec2 vUv;
${fbm}

void main() {
  vUv = uv;
  vec3 pos = position;
  // The noise scrolls towards the camera: that is the feeling of flight.
  vec2 p = vec2(pos.x * 0.06, pos.y * 0.06 + uTime * 0.16);
  float h = fbm(p) * 6.0 + fbm(p * 3.1) * 1.4;
  // A valley down the middle so the view can breathe
  h *= smoothstep(0.0, 7.0, abs(pos.x));
  h *= uHeight;
  pos.z += h;
  vHeight = h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const fragment = /* glsl */ `
uniform vec3 uLow;
uniform vec3 uHigh;
uniform float uHeight;
varying float vHeight;
varying vec2 vUv;
void main() {
  float h = clamp(vHeight / (7.0 * max(uHeight, 0.05)), 0.0, 1.0);
  vec3 color = mix(uLow, uHigh, h);
  // Fade out towards the horizon (uv.y = 1 is the far edge)
  float near = smoothstep(1.0, 0.55, vUv.y);
  float back = smoothstep(0.0, 0.08, vUv.y);
  gl_FragColor = vec4(color, (0.18 + h * 0.85) * near * back);
}
`;

const PALETTES: Record<string, [string, string]> = {
  "teal / blue": ["#2243e2", "#3ad6aa"],
  synthwave: ["#7b2ff7", "#ff3cac"],
  ember: ["#5a1a00", "#ffb347"],
  mono: ["#334155", "#e2e8f0"],
};

function Landscape() {
  const params = useParams({ speed: 1, height: 1, wireframe: true, palette: "teal / blue" });
  const time = useRef(0);
  const look = useMemo(() => new THREE.Vector3(0, 0, -40), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(60, 90, 200, 300), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHeight: { value: 1 },
      uLow: { value: displayColor(PALETTES["teal / blue"][0]) },
      uHigh: { value: displayColor(PALETTES["teal / blue"][1]) },
    }),
    [],
  );

  const material = useShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms,
    wireframe: true,
    transparent: true,
    depthWrite: false,
  });

  useGui((gui) => {
    gui.add(params, "speed", 0, 4, 0.05);
    gui.add(params, "height", 0, 2, 0.01);
    gui.add(params, "wireframe").onChange((v: boolean) => {
      material.wireframe = v;
    });
    gui.add(params, "palette", Object.keys(PALETTES)).onChange((name: string) => {
      setDisplayColor(uniforms.uLow.value, PALETTES[name][0]);
      setDisplayColor(uniforms.uHigh.value, PALETTES[name][1]);
    });
  });

  useFrame((state, dt) => {
    time.current += dt * params.speed;
    uniforms.uTime.value = time.current;
    uniforms.uHeight.value = params.height;
    // The pointer steers the camera: height on Y, a gentle bank on X.
    const cam = state.camera;
    cam.position.y += (6 + state.pointer.y * 3 - cam.position.y) * 0.04;
    cam.position.x += (state.pointer.x * 5 - cam.position.x) * 0.04;
    cam.lookAt(look);
  });

  return (
    <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -30]} />
  );
}

export default function Terrain() {
  return (
    <Stage background="#02050c" camera={{ position: [0, 6, 16], fov: 55, far: 200 }}>
      <Landscape />
    </Stage>
  );
}
