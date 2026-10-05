import { useEffect, useState } from "react";
import GUI from "lil-gui";

/** A stable, mutable parameter object. lil-gui writes into it; useFrame reads from it. */
export function useParams<T extends object>(initial: T): T {
  const [params] = useState(() => ({ ...initial }));
  return params;
}

/**
 * Builds a lil-gui panel for the lifetime of the calling component and
 * destroys it on unmount, so panels never leak between effect pages.
 */
export function useGui(build: (gui: GUI) => void, deps: unknown[] = []): void {
  useEffect(() => {
    const gui = new GUI({ title: "Controls", width: 260 });
    build(gui);
    if (window.innerWidth < 700) gui.close();
    return () => gui.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
