import { useEffect, useRef } from "react";

/**
 * A drafting-style reticle that follows the pointer and grows over interactive
 * elements. Only on fine pointers (not touch) and off with reduced motion.
 */
export function Reticle() {
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return;

    document.body.classList.add("has-reticle");
    let x = -100;
    let y = -100;
    let raf = 0;

    const render = () => {
      raf = 0;
      if (dot.current) dot.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(render);
      const target = e.target as HTMLElement | null;
      const interactive = !!target?.closest("a, button, input, select, textarea, .lil-gui");
      dot.current?.classList.toggle("is-active", interactive);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.body.classList.remove("has-reticle");
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={dot} className="reticle" aria-hidden="true" />;
}
