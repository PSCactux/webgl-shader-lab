import { useSyncExternalStore } from "react";

/**
 * Minimal hash router. Hash URLs (#/fx/tunnel) work on GitHub Pages without
 * any server-side rewrite, so deep links survive a page reload.
 */
const subscribe = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};

const read = () => window.location.hash.replace(/^#/, "") || "/";

export function useHashPath(): string {
  return useSyncExternalStore(subscribe, read, () => "/");
}

export const effectHref = (slug: string) => `#/fx/${slug}`;
export const galleryHref = "#/";
