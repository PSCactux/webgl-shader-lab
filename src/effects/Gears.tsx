import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { useGui, useParams } from "../lib/gui";

/** Gear module: pitch diameter / tooth count. Meshing gears must share it. */
const MODULE = 0.12;

/**
 * 2D gear outline extruded into a solid. Teeth are trapezoids between the
 * root circle and the addendum circle; tooth 0 is centred on angle 0.
 */
function gearGeometry(teeth: number): THREE.ExtrudeGeometry {
  const rp = (MODULE * teeth) / 2; // pitch radius
  const ra = rp + MODULE; // tip
  const rd = rp - 1.25 * MODULE; // root
  const step = (Math.PI * 2) / teeth;
  const shape = new THREE.Shape();
  const at = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
  for (let i = 0; i < teeth; i++) {
    const c = i * step;
    const pts: [number, number][] = [
      at(c - 0.5 * step, rd),
      at(c - 0.36 * step, rd),
      at(c - 0.17 * step, ra),
      at(c + 0.17 * step, ra),
      at(c + 0.36 * step, rd),
    ];
    pts.forEach(([x, y], k) => (i === 0 && k === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  }
  shape.closePath();

  // Axle hole, plus lightening holes on the larger wheels
  const axle = new THREE.Path();
  axle.absarc(0, 0, Math.max(0.12, rp * 0.16), 0, Math.PI * 2, true);
  shape.holes.push(axle);
  if (teeth >= 18) {
    const holes = teeth >= 28 ? 6 : 5;
    for (let i = 0; i < holes; i++) {
      const a = (i / holes) * Math.PI * 2 + 0.3;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * rp * 0.55, Math.sin(a) * rp * 0.55, rp * 0.2, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
  }

  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.32,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
    curveSegments: 18,
  });
  g.translate(0, 0, -0.16);
  return g;
}

type GearSpec = { teeth: number; parent: number; angle: number; color: string };

/** The train: each gear meshes with its parent at the given angle (degrees). */
const TRAIN: GearSpec[] = [
  { teeth: 24, parent: -1, angle: 0, color: "#c9a25a" },
  { teeth: 14, parent: 0, angle: 0, color: "#b8c2cc" },
  { teeth: 32, parent: 1, angle: -60, color: "#b87333" },
  { teeth: 18, parent: 0, angle: 150, color: "#8b96a3" },
  { teeth: 10, parent: 3, angle: 100, color: "#5eead4" },
  { teeth: 20, parent: 2, angle: 70, color: "#c9a25a" },
];

type Solved = GearSpec & { x: number; y: number; ratio: number; offset: number };

/**
 * Places every gear and works out how it turns relative to the driver:
 * rotation = ratio * driverRotation + offset.
 * Rolling without slipping gives ratio_child = -ratio_parent * n_parent / n_child.
 * The offset puts a gap of the child in front of the parent's tooth at the
 * contact point, so the teeth interlock instead of overlapping.
 */
function solveTrain(train: GearSpec[]): Solved[] {
  const out: Solved[] = [];
  for (const g of train) {
    if (g.parent < 0) {
      out.push({ ...g, x: 0, y: 0, ratio: 1, offset: 0 });
      continue;
    }
    const p = out[g.parent];
    const theta = (g.angle * Math.PI) / 180;
    const dist = (MODULE * (p.teeth + g.teeth)) / 2;
    const k = p.teeth / g.teeth;
    const ratio = -p.ratio * k;
    // Parent tooth phase at the contact point is (theta - rotP). Matching that to a
    // child gap (phase pi / n_child at theta + pi) gives this constant.
    const offset = theta + Math.PI + k * (theta - p.offset) - Math.PI / g.teeth;
    out.push({ ...g, x: p.x + Math.cos(theta) * dist, y: p.y + Math.sin(theta) * dist, ratio, offset });
  }
  // Centre the whole train (including tooth tips) on the origin
  const tip = (g: Solved) => (MODULE * g.teeth) / 2 + MODULE;
  const cx = (Math.min(...out.map((g) => g.x - tip(g))) + Math.max(...out.map((g) => g.x + tip(g)))) / 2;
  const cy = (Math.min(...out.map((g) => g.y - tip(g))) + Math.max(...out.map((g) => g.y + tip(g)))) / 2;
  return out.map((g) => ({ ...g, x: g.x - cx, y: g.y - cy }));
}

function Train() {
  const params = useParams({ idleSpeed: 0.35, roughness: 0.28 });
  const gl = useThree((s) => s.gl);
  const gears = useMemo(() => solveTrain(TRAIN), []);
  const geometries = useMemo(() => gears.map((g) => gearGeometry(g.teeth)), [gears]);
  const materials = useMemo(
    () => gears.map((g) => new THREE.MeshStandardMaterial({ color: g.color, metalness: 0.85, roughness: 0.28 })),
    [gears],
  );
  useEffect(
    () => () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
    [geometries, materials],
  );

  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const group = useRef<THREE.Group>(null);
  const drive = useRef({ angle: 0, velocity: 0, dragging: false, lastX: 0 });

  useGui((gui) => {
    gui.add(params, "idleSpeed", -2, 2, 0.01).name("idle speed");
    gui.add(params, "roughness", 0, 1, 0.01).onChange((v: number) => materials.forEach((m) => (m.roughness = v)));
  });

  useEffect(() => {
    const el = gl.domElement;
    const d = drive.current;
    const down = (e: PointerEvent) => {
      d.dragging = true;
      d.lastX = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!d.dragging) return;
      d.velocity += (e.clientX - d.lastX) * 0.02;
      d.lastX = e.clientX;
    };
    const up = () => (d.dragging = false);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      d.velocity += e.deltaY * 0.004;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl]);

  useFrame((state, dt) => {
    const d = drive.current;
    // Inertia: the extra velocity decays back to the idle speed.
    d.velocity *= Math.exp(-dt * 1.5);
    d.angle += (params.idleSpeed + d.velocity) * dt;
    gears.forEach((g, i) => {
      const m = meshes.current[i];
      if (m) m.rotation.z = g.ratio * d.angle + g.offset;
    });
    if (group.current) {
      group.current.rotation.x += (-0.45 + state.pointer.y * 0.15 - group.current.rotation.x) * 0.05;
      group.current.rotation.y += (state.pointer.x * 0.25 - group.current.rotation.y) * 0.05;
    }
  });

  return (
    <group ref={group}>
      {gears.map((g, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={geometries[i]}
          material={materials[i]}
          position={[g.x, g.y, 0]}
        />
      ))}
    </group>
  );
}

export default function Gears() {
  return (
    <Stage background="#0a0906" camera={{ position: [0, 0, 14], fov: 45 }} dpr={[1, 2]}>
      <ambientLight intensity={0.2} />
      <directionalLight position={[4, 6, 8]} intensity={2.2} />
      <directionalLight position={[-6, -2, 4]} intensity={0.6} color="#7aa2ff" />
      {/* Studio built from lightformers: metal needs something to reflect. */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={4} position={[0, 6, 6]} scale={[14, 4, 1]} />
        <Lightformer form="rect" intensity={2} color="#ffd9a0" position={[-8, 0, 4]} scale={[4, 12, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={1.5} color="#9ec5ff" position={[8, -2, 4]} scale={[4, 12, 1]} rotation-y={-Math.PI / 2} />
      </Environment>
      <Train />
    </Stage>
  );
}
