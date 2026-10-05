import { Suspense, useEffect } from "react";
import { EFFECTS } from "../effects/registry";
import { effectHref, galleryHref } from "../lib/router";

export function EffectPage({ slug }: { slug: string }) {
  const i = EFFECTS.findIndex((e) => e.slug === slug);
  const fx = EFFECTS[i];
  const prev = EFFECTS[(i - 1 + EFFECTS.length) % EFFECTS.length];
  const next = EFFECTS[(i + 1) % EFFECTS.length];

  useEffect(() => {
    if (!fx) return;
    document.title = `${fx.title} · WebGL Shader Lab`;
    // Keyboard navigation: arrows move between effects, Escape goes back.
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") window.location.hash = effectHref(next.slug);
      else if (e.key === "ArrowLeft") window.location.hash = effectHref(prev.slug);
      else if (e.key === "Escape") window.location.hash = galleryHref;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fx, prev, next]);

  if (!fx) {
    return (
      <main className="not-found">
        <p>Unknown effect “{slug}”.</p>
        <a href={galleryHref}>Back to the gallery</a>
      </main>
    );
  }

  const Effect = fx.component;
  return (
    <div className="effect-page">
      <Suspense fallback={<div className="loading">loading…</div>}>
        {/* Keyed by slug: switching effects fully unmounts the previous canvas. */}
        <Effect key={fx.slug} />
      </Suspense>

      <header className="hud">
        <a className="back" href={galleryHref}>
          ← Gallery
        </a>
        <div className="hud-title">
          <p className="hud-name">{fx.title}</p>
          <p className="hud-hint">{fx.hint}</p>
        </div>
      </header>

      <nav className="pager" aria-label="Effects">
        <a href={effectHref(prev.slug)} aria-label={`Previous: ${prev.title}`}>
          ‹
        </a>
        <span>
          {String(i + 1).padStart(2, "0")} / {String(EFFECTS.length).padStart(2, "0")}
        </span>
        <a href={effectHref(next.slug)} aria-label={`Next: ${next.title}`}>
          ›
        </a>
      </nav>
    </div>
  );
}
