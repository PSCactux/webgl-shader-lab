import { Suspense, useRef, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

type StageProps = {
  children: ReactNode;
  camera?: { position: [number, number, number]; fov?: number; near?: number; far?: number };
  /** Device-pixel-ratio range. Full-screen fragment shaders get a lower cap. */
  dpr?: [number, number];
  background?: string;
  /** DOM layered over the canvas (vignettes, readouts). */
  overlay?: ReactNode;
};

/** Writes the frame rate into a DOM node twice a second, without React re-renders. */
function FpsMeter({ target }: { target: RefObject<HTMLSpanElement | null> }) {
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames++;
    a.time += dt;
    if (a.time >= 0.5) {
      if (target.current) target.current.textContent = `${Math.round(a.frames / a.time)} fps`;
      a.frames = 0;
      a.time = 0;
    }
  });
  return null;
}

/**
 * Common full-screen canvas for every effect. When an effect page unmounts,
 * React Three Fiber disposes the scene graph and forces a WebGL context loss,
 * so navigating between pages never piles up GPU contexts.
 */
export function Stage({
  children,
  camera = { position: [0, 0, 6], fov: 55 },
  dpr = [1, 1.5],
  background = "#05070a",
  overlay,
}: StageProps) {
  const fps = useRef<HTMLSpanElement>(null);
  return (
    <div className="stage" style={{ background }}>
      <Canvas
        camera={camera}
        dpr={dpr}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ touchAction: "none" }}
      >
        <color attach="background" args={[background]} />
        <Suspense fallback={null}>{children}</Suspense>
        <FpsMeter target={fps} />
      </Canvas>
      {overlay}
      <span ref={fps} className="fps" aria-hidden="true" />
    </div>
  );
}
