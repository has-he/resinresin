import * as THREE from 'three';

/** A locally generated HDR room, shared by both renderers. No runtime asset fetch. */
export function createEnvironment(warm = false) {
  const width = 768, height = 384;
  const data = new Float32Array(width * height * 4);
  const wrap = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
  for (let y = 0; y < height; y++) {
    const v = 1 - y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const sky = Math.pow(Math.max(0, 1 - v), 2);
      // One long, asymmetric overhead strip; a broad cool window; a warm bounce.
      const strip = Math.exp(-Math.pow(wrap(u, 0.40 + (v - 0.24) * 0.18) / 0.025, 4) - Math.pow((v - 0.24) / 0.19, 8)) * 24;
      const window = Math.exp(-Math.pow(wrap(u, 0.15) / 0.14, 4) - Math.pow((v - 0.44) / 0.24, 4)) * 1.6;
      const bounce = Math.exp(-Math.pow(wrap(u, 0.86) / 0.16, 2) - Math.pow((v - 0.58) / 0.18, 2)) * 0.75;
      const skylight = Math.exp(-Math.pow(wrap(u, 0.25) / 0.11, 4) - Math.pow((v - 0.12) / 0.09, 4)) * 0.55;
      const ceiling = Math.exp(-Math.pow((v - 0.12) / 0.14, 2)) * 0.28;
      const i = (y * width + x) * 4;
      data[i] = 0.016 + sky * 0.11 + strip * 1.0 + window * (warm ? 0.65 : 0.40) + bounce * 1.0 + ceiling + skylight;
      data[i + 1] = 0.021 + sky * 0.13 + strip * (warm ? 0.79 : 0.95) + window * 0.73 + bounce * 0.55 + ceiling * 0.9 + skylight * 0.95;
      data[i + 2] = 0.019 + sky * 0.15 + strip * (warm ? 0.54 : 0.81) + window * 1.0 + bounce * 0.29 + ceiling * 0.7 + skylight * 0.8;
      data[i + 3] = 1;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
