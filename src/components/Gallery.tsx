import { useEffect } from "react";
import { EFFECTS } from "../effects/registry";
import { effectHref } from "../lib/router";

const thumb = (slug: string) => `${import.meta.env.BASE_URL}thumbs/${slug}.jpg`;

export function Gallery() {
  useEffect(() => {
    document.title = "WebGL Shader Lab";
  }, []);

  return (
    <main className="gallery">
      <header className="gallery-head">
        <p className="kicker">three.js · React Three Fiber · GLSL</p>
        <h1>WebGL Shader Lab</h1>
        <p className="lead">
          {EFFECTS.length} real-time shader and 3D experiments. Each one runs on its own page, reacts to the
          pointer and has a small control panel.
        </p>
      </header>

      <ul className="grid">
        {EFFECTS.map((fx, i) => (
          <li key={fx.slug}>
            <a className="card" href={effectHref(fx.slug)}>
              <div className="thumb">
                <img src={thumb(fx.slug)} alt="" loading="lazy" width={640} height={400} />
              </div>
              <div className="card-body">
                <span className="index">{String(i + 1).padStart(2, "0")}</span>
                <h2>{fx.title}</h2>
                <p>{fx.summary}</p>
                <div className="tags">
                  {fx.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>

      <footer className="gallery-foot">
        <p>MIT licensed</p>
      </footer>
    </main>
  );
}
