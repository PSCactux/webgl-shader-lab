import * as THREE from "three";
import { screenVertex } from "../lib/glsl";
import { useShaderMaterial } from "../lib/material";

type Props = {
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
};

/** A 2x2 plane covering the viewport, for effects that live entirely in a fragment shader. */
export function ScreenQuad({ fragmentShader, uniforms }: Props) {
  const material = useShaderMaterial({
    vertexShader: screenVertex,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  return (
    <mesh frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
