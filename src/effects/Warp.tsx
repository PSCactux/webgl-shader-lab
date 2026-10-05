import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "../components/Stage";
import { displayColor } from "../lib/color";
import { useGui, useParams } from "../lib/gui";
import { useShaderMaterial } from "../lib/material";
import { prng } from "../lib/random";
import { hash } from "../lib/glsl";

/**
 * Each star is one instance of a tiny quad. The vertex shader does the
 * perspective divide by hand (screen = xy / z), computes where the star was a
 * moment ago and stretches the quad between both points: the streak.
 */
const vertex = /* glsl */ `
attribute vec3 aStar;   // xy in [-1, 1], z = depth offset in [0, 1]
attribute vec3 aColor;
uniform float uTravel;
uniform float uSpeed;
uniform float uStreak;
uniform float uFocus;
uniform vec2 uResolution;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vAlpha;
varying float vSide;
${hash}

void main() {
  float s = aStar.z - uTravel;
  float lap = floor(s);
  float z = mix(0.02, 1.0, s - lap);          // 1 = far away, 0.02 = at the camera
  // A fresh direction on every lap, so the field never repeats.
  vec2 xy = vec2(hash21(aStar.xy + lap), hash21(aStar.yx * 1.7 - lap)) * 2.0 - 1.0;

  float zTail = min(z + uSpeed * uStreak, 1.0);
  float aspect = uResolution.x / uResolution.y;
  vec2 head = xy / z * uFocus;
  vec2 tail = xy / zTail * uFocus;
  head.x /= aspect;
  tail.x /= aspect;

  // Work in pixels to give the streak a width that does not depend on aspect.
  vec2 toPx = uResolution * 0.5;
  vec2 dirPx = (head - tail) * toPx;
  float lenPx = length(dirPx);
  vec2 along = lenPx > 1e-3 ? dirPx / lenPx : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  float width = mix(0.6, 3.2, 1.0 - z) * uPixelRatio;

  vec2 px = mix(tail, head, position.x) * toPx;
  px += along * (position.x * 2.0 - 1.0) * width * 0.5;  // round-ish caps
  px += across * position.y * width * 0.5;

  vColor = aColor;
  vSide = position.y;
  vAlpha = clamp((1.0 - z) * 1.4, 0.0, 1.0);
  gl_Position = vec4(px / toPx, 0.0, 1.0);
}
`;

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSide;
void main() {
  float edge = 1.0 - vSide * vSide;
  gl_FragColor = vec4(vColor * vAlpha * edge, 1.0);
}
`;

const COLORS = ["#ffffff", "#ffffff", "#ffffff", "#5eead4", "#a7f3e4", "#fcae3f"];

function Starfield({ readout }: { readout: React.RefObject<HTMLElement | null> }) {
  const params = useParams({ stars: 3000, streak: 2.5, maxSpeed: 1 });
  const travel = useRef(0);
  const speed = useRef(0.004);

  useGui((gui) => {
    gui.add(params, "streak", 0, 6, 0.1).name("streak length");
    gui.add(params, "maxSpeed", 0.2, 2, 0.05).name("max speed");
  });

  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    // Base quad: x runs tail -> head, y runs across the streak.
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const n = params.stars;
    const rand = prng(42);
    const star = new Float32Array(n * 3);
    const color = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      star[i * 3] = rand() * 100;
      star[i * 3 + 1] = rand() * 100;
      star[i * 3 + 2] = rand();
      c.copy(displayColor(COLORS[i % COLORS.length]));
      color.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("aStar", new THREE.InstancedBufferAttribute(star, 3));
    g.setAttribute("aColor", new THREE.InstancedBufferAttribute(color, 3));
    g.instanceCount = n;
    return g;
  }, [params.stars]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTravel: { value: 0 },
      uSpeed: { value: 0 },
      uStreak: { value: 2.5 },
      uFocus: { value: 0.9 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPixelRatio: { value: 1 },
    }),
    [],
  );

  const material = useShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  useFrame((state, dt) => {
    // The throttle is the pointer height: top = warp, bottom = drift.
    const throttle = (state.pointer.y + 1) / 2;
    const target = (0.0025 + throttle * 0.055) * params.maxSpeed;
    speed.current += (target - speed.current) * 0.06;
    // Speeds were tuned per frame at 60 fps; scale by dt to stay frame-rate independent.
    travel.current += speed.current * dt * 60;
    uniforms.uTravel.value = travel.current;
    uniforms.uSpeed.value = speed.current;
    uniforms.uStreak.value = params.streak;
    const dpr = state.gl.getPixelRatio();
    uniforms.uResolution.value.set(state.size.width * dpr, state.size.height * dpr);
    uniforms.uPixelRatio.value = dpr;
    if (readout.current) readout.current.textContent = String(Math.round((speed.current / (0.0575 * params.maxSpeed)) * 100));
  });

  return (
    <mesh geometry={geometry} material={material} frustumCulled={false} />
  );
}

export default function Warp() {
  const readout = useRef<HTMLElement>(null);
  return (
    <Stage
      background="#030508"
      overlay={
        <>
          <div className="vignette" style={{ background: "radial-gradient(45% 40% at 50% 50%, transparent 30%, #030508 95%)" }} />
          <div className="readout">
            speed
            <strong>
              <span ref={readout}>0</span>
              <small style={{ fontSize: 13, opacity: 0.5 }}> %c</small>
            </strong>
          </div>
        </>
      }
    >
      <Starfield readout={readout} />
    </Stage>
  );
}
