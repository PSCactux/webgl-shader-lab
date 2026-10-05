import { useEffect, useMemo } from "react";
import * as THREE from "three";

/**
 * Creates a ShaderMaterial once and disposes it on unmount.
 *
 * Why not <shaderMaterial uniforms={...} />? React Three Fiber copies each
 * { value } wrapper of a `uniforms` prop into the material, so later writes like
 * `uniforms.uTime.value = t` would land on our object and never reach the GPU.
 * Building the material ourselves keeps one shared uniforms object.
 */
export function useShaderMaterial(params: THREE.ShaderMaterialParameters): THREE.ShaderMaterial {
  // Parameters are read once on purpose: shaders and uniform objects are static per mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const material = useMemo(() => new THREE.ShaderMaterial(params), []);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}
