import { EffectPage } from "./components/EffectPage";
import { Gallery } from "./components/Gallery";
import { Reticle } from "./components/Reticle";
import { useHashPath } from "./lib/router";

export function App() {
  const path = useHashPath();
  const match = path.match(/^\/fx\/([\w-]+)/);
  return (
    <>
      {match ? <EffectPage slug={match[1]} /> : <Gallery />}
      <Reticle />
    </>
  );
}
