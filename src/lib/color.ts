import * as THREE from "three";

/**
 * A Color whose components are the raw hex values, with no sRGB -> linear
 * conversion. Our ShaderMaterials write gl_FragColor straight to the screen,
 * so the colour on screen then matches the hex code we wrote.
 */
export function displayColor(hex: string): THREE.Color {
  return new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
}

export function setDisplayColor(target: THREE.Color, hex: string): void {
  target.setStyle(hex, THREE.LinearSRGBColorSpace);
}
