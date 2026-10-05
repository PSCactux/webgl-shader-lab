import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, Float, Lightformer, MeshTransmissionMaterial, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { displayColor } from "../lib/color";
import { useGui, useParams } from "../lib/gui";

type GlassSettings = {
  ior: number;
  thickness: number;
  roughness: number;
  chromaticAberration: number;
  distortion: number;
};

type Shape = "knot" | "icosahedron" | "torus";

function Piece({ position, scale, speed, shape, settings }: {
  position: [number, number, number];
  scale: number;
  speed: number;
  shape: Shape;
  settings: GlassSettings;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const background = useMemo(() => new THREE.Color("#0a2b24"), []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.x += dt * speed;
    ref.current.rotation.y += dt * speed * 0.7;
  });
  return (
    <Float speed={1.4} rotationIntensity={0.3} floatIntensity={0.9}>
      <mesh ref={ref} position={position} scale={scale}>
        {shape === "knot" && <torusKnotGeometry args={[1, 0.34, 220, 40]} />}
        {shape === "icosahedron" && <icosahedronGeometry args={[1.2, 0]} />}
        {shape === "torus" && <torusGeometry args={[1.1, 0.4, 32, 90]} />}
        <MeshTransmissionMaterial
          samples={4}
          resolution={384}
          anisotropy={0.4}
          distortionScale={0.4}
          temporalDistortion={0.15}
          color="#eafff8"
          background={background}
          {...settings}
        />
      </mesh>
    </Float>
  );
}

/**
 * Without something behind it, glass has nothing to refract and just looks
 * dark. A faint grid makes the refraction obvious: it bends through the glass.
 */
function Backdrop() {
  const uniforms = useMemo(
    () => ({
      uA: { value: displayColor("#0d3b2f") },
      uB: { value: displayColor("#08132e") },
      uC: { value: displayColor("#5eead4") },
    }),
    [],
  );
  return (
    <mesh position={[0, 0, -9]}>
      <planeGeometry args={[46, 26]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`
          uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; varying vec2 vUv;
          void main() {
            vec3 c = mix(uB, uA, vUv.y);
            float g = step(0.97, fract(vUv.x * 28.0)) + step(0.97, fract(vUv.y * 16.0));
            c += uC * g * 0.30;
            float halo = 1.0 - distance(vUv, vec2(0.5)) * 1.4;
            c += uC * max(halo, 0.0) * 0.16;
            gl_FragColor = vec4(c, 1.0);
          }`}
      />
    </mesh>
  );
}

function Scene() {
  const params = useParams<GlassSettings>({
    ior: 1.45,
    thickness: 0.55,
    roughness: 0.06,
    chromaticAberration: 0.35,
    distortion: 0.3,
  });
  // Material props are React props, so a change in the panel triggers a re-render.
  const [settings, setSettings] = useState<GlassSettings>({ ...params });

  useGui((gui) => {
    const sync = () => setSettings({ ...params });
    gui.add(params, "ior", 1, 2.4, 0.01).onChange(sync);
    gui.add(params, "thickness", 0, 3, 0.01).onChange(sync);
    gui.add(params, "roughness", 0, 0.6, 0.01).onChange(sync);
    gui.add(params, "chromaticAberration", 0, 1.5, 0.01).name("dispersion").onChange(sync);
    gui.add(params, "distortion", 0, 1, 0.01).onChange(sync);
  });

  return (
    <>
      <Backdrop />
      <ambientLight intensity={0.9} />
      <spotLight position={[8, 10, 6]} angle={0.4} penumbra={1} intensity={140} color="#5eead4" />
      <spotLight position={[-8, -6, 4]} angle={0.5} penumbra={1} intensity={90} color="#3b5bfd" />

      <Piece position={[-2.6, 0.4, 0]} scale={1} speed={0.25} shape="knot" settings={settings} />
      <Piece position={[2.4, -0.6, -1]} scale={1.1} speed={-0.2} shape="icosahedron" settings={settings} />
      <Piece position={[0.2, 1.6, -3]} scale={0.8} speed={0.35} shape="torus" settings={settings} />

      {/* Hand-built environment: these are the lights reflected in the glass. No HDR download. */}
      <Environment resolution={256} environmentIntensity={1.6}>
        <Lightformer form="rect" intensity={6} color="#5eead4" position={[0, 5, -8]} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={4} color="#a7f3e4" position={[-8, 2, 2]} scale={[6, 10, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="circle" intensity={5} color="#ffffff" position={[6, -3, 4]} scale={5} />
        <Lightformer form="ring" intensity={3} color="#3b5bfd" position={[3, 6, -4]} scale={6} />
      </Environment>

      <OrbitControls enablePan={false} enableZoom={false} enableDamping rotateSpeed={0.6} />
    </>
  );
}

export default function Glass() {
  return (
    <Stage background="#04120e" camera={{ position: [0, 0, 8], fov: 55 }}>
      <Scene />
    </Stage>
  );
}
