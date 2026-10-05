import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { displayColor } from "../lib/color";
import { useGui, useParams } from "../lib/gui";
import { useShaderMaterial } from "../lib/material";
import { prng } from "../lib/random";

const MAX_NODES = 260;
// Every pair could link, plus one line per node to the pointer.
const MAX_SEGMENTS = (MAX_NODES * (MAX_NODES - 1)) / 2 + MAX_NODES;

const STAR = displayColor("#ece7d6"); // ivory: the nodes
const LINK = displayColor("#96a2c4"); // silver blue: links between nodes
const ACCENT = displayColor("#d8a24e"); // gold: anything near the pointer

/**
 * A "technical drawing constellation": nodes drift slowly, link when they are
 * close and reach out to the pointer. Positions live on the CPU (a few hundred
 * nodes), and every frame the line buffer is rewritten and drawn with one call.
 */
const lineVertex = /* glsl */ `
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const lineFragment = /* glsl */ `
varying vec4 vColor;
void main() { gl_FragColor = vColor; }
`;
const pointVertex = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
uniform float uPixelRatio;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const pointFragment = /* glsl */ `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * smoothstep(0.5, 0.3, d));
}
`;

type Node = { x: number; y: number; vx: number; vy: number; u: number; v: number };

function Network() {
  const params = useParams({ density: 1, linkDistance: 1.5, pointerReach: 2.2, drift: 1 });
  const viewport = useThree((s) => s.viewport);
  const gl = useThree((s) => s.gl);
  const hovering = useRef(false);
  const placed = useRef(false);

  useGui((gui) => {
    gui.add(params, "density", 0.3, 2.5, 0.05);
    gui.add(params, "linkDistance", 0.5, 3, 0.05).name("link distance");
    gui.add(params, "pointerReach", 0.5, 4, 0.05).name("pointer reach");
    gui.add(params, "drift", 0, 4, 0.05);
  });

  const nodes = useMemo<Node[]>(() => {
    const rand = prng(9);
    // u, v in [-0.5, 0.5]: spawn positions relative to the viewport, applied on the first frame.
    return Array.from({ length: MAX_NODES }, () => ({
      x: 0,
      y: 0,
      u: rand() - 0.5,
      v: rand() - 0.5,
      vx: (rand() - 0.5) * 0.4,
      vy: (rand() - 0.5) * 0.4,
    }));
  }, []);

  const lines = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * 8), 4).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, []);
  const points = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_NODES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(MAX_NODES * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(MAX_NODES), 1).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, []);
  useEffect(
    () => () => {
      lines.dispose();
      points.dispose();
    },
    [lines, points],
  );
  const pointUniforms = useMemo(() => ({ uPixelRatio: { value: 1 } }), []);
  const lineMaterial = useShaderMaterial({ vertexShader: lineVertex, fragmentShader: lineFragment, transparent: true, depthWrite: false });
  const pointMaterial = useShaderMaterial({
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    uniforms: pointUniforms,
    transparent: true,
    depthWrite: false,
  });

  useEffect(() => {
    const el = gl.domElement;
    const on = () => (hovering.current = true);
    const off = () => (hovering.current = false);
    el.addEventListener("pointermove", on);
    el.addEventListener("pointerleave", off);
    return () => {
      el.removeEventListener("pointermove", on);
      el.removeEventListener("pointerleave", off);
    };
  }, [gl]);

  useFrame((state, dt) => {
    const w = viewport.width / 2;
    const h = viewport.height / 2;
    // Node count follows the screen area, like the original 1 node per 18 000 px².
    const count = Math.min(MAX_NODES, Math.round(((viewport.width * viewport.height) / 2.2) * params.density));
    const px = hovering.current ? (state.pointer.x * viewport.width) / 2 : 1e6;
    const py = hovering.current ? (state.pointer.y * viewport.height) / 2 : 1e6;
    const step = Math.min(dt, 0.05) * params.drift;
    if (!placed.current) {
      nodes.forEach((n) => {
        n.x = n.u * viewport.width;
        n.y = n.v * viewport.height;
      });
      placed.current = true;
    }

    const pos = points.getAttribute("position").array as Float32Array;
    const col = points.getAttribute("aColor").array as Float32Array;
    const size = points.getAttribute("aSize").array as Float32Array;
    const lp = lines.getAttribute("position").array as Float32Array;
    const lc = lines.getAttribute("aColor").array as Float32Array;
    let seg = 0;
    const pushLine = (ax: number, ay: number, bx: number, by: number, c: THREE.Color, a: number) => {
      lp.set([ax, ay, 0, bx, by, 0], seg * 6);
      lc.set([c.r, c.g, c.b, a, c.r, c.g, c.b, a], seg * 8);
      seg++;
    };

    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      n.x += n.vx * step;
      n.y += n.vy * step;
      // Bounce off the viewport edges (nodes outside a shrunk viewport walk back in).
      if (n.x < -w) n.vx = Math.abs(n.vx);
      if (n.x > w) n.vx = -Math.abs(n.vx);
      if (n.y < -h) n.vy = Math.abs(n.vy);
      if (n.y > h) n.vy = -Math.abs(n.vy);
    }

    const link = params.linkDistance;
    for (let i = 0; i < count; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < count; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.abs(dx) > link || Math.abs(dy) > link) continue;
        const d = Math.hypot(dx, dy);
        if (d < link) pushLine(a.x, a.y, b.x, b.y, LINK, (1 - d / link) * 0.5);
      }
    }

    const reach = params.pointerReach;
    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      const dp = Math.hypot(n.x - px, n.y - py);
      const near = dp < reach;
      const c = near ? ACCENT : STAR;
      col.set([c.r, c.g, c.b, near ? 0.55 * (1 - dp / reach) + 0.45 : 0.75], i * 4);
      size[i] = near ? 7 : 5;
      pos.set([n.x, n.y, 0], i * 3);
      if (near) pushLine(n.x, n.y, px, py, ACCENT, (1 - dp / reach) * 0.5);
    }

    points.setDrawRange(0, count);
    lines.setDrawRange(0, seg * 2);
    points.getAttribute("position").needsUpdate = true;
    points.getAttribute("aColor").needsUpdate = true;
    points.getAttribute("aSize").needsUpdate = true;
    // Only upload the part of the (large) line buffers that was written this frame.
    const lpAttr = lines.getAttribute("position") as THREE.BufferAttribute;
    const lcAttr = lines.getAttribute("aColor") as THREE.BufferAttribute;
    lpAttr.clearUpdateRanges();
    lpAttr.addUpdateRange(0, Math.max(1, seg * 6));
    lpAttr.needsUpdate = true;
    lcAttr.clearUpdateRanges();
    lcAttr.addUpdateRange(0, Math.max(1, seg * 8));
    lcAttr.needsUpdate = true;
    pointUniforms.uPixelRatio.value = state.gl.getPixelRatio();
  });

  return (
    <>
      <lineSegments geometry={lines} material={lineMaterial} frustumCulled={false} />
      <points geometry={points} material={pointMaterial} frustumCulled={false} />
    </>
  );
}

export default function Constellation() {
  return (
    <Stage background="#0d1016" camera={{ position: [0, 0, 10], fov: 50 }}>
      <Network />
    </Stage>
  );
}
