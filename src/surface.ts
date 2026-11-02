import * as THREE from 'three';
import { randomFromSeed } from './materials';

interface SurfaceSettings { seed: number; distortion: number; frequency: number }
const smooth = (a: number, b: number, v: number) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Broad clear pools, asymmetric lens bulges and one meandering drainage fold. */
export function reshapeResin(geometry: THREE.SphereGeometry, original: Float32Array, settings: SurfaceSettings) {
  const random = randomFromSeed(settings.seed + 781);
  const lenses = Array.from({length: 12}, (_, i) => ({
    x: (random() - 0.5) * 9, z: (random() - 0.5) * 7.5,
    sx: (0.65 + random() * 1.25) / settings.frequency,
    sz: (0.8 + random() * 1.55) / settings.frequency,
    angle: random() * Math.PI, height: (i % 3 === 0 ? 1.0 : 0.45) + random() * 0.6,
  }));
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const ox = original[i * 3], oy = original[i * 3 + 1], oz = original[i * 3 + 2];
    const angle = Math.atan2(oz, ox);
    const edge = 1 + Math.sin(angle * 5 + settings.seed) * 0.025 + Math.cos(angle * 9) * 0.012;
    const x = ox * 5.4 * edge, z = oz * 4.7 * edge;
    let height = 0;
    for (const lens of lenses) {
      const dx = x - lens.x + Math.sin(z * 1.05 + lens.angle) * 0.18;
      const dz = z - lens.z;
      const u = (dx * Math.cos(lens.angle) + dz * Math.sin(lens.angle)) / lens.sx;
      const v = (-dx * Math.sin(lens.angle) + dz * Math.cos(lens.angle)) / lens.sz;
      const q = u * u + v * v;
      height += Math.exp(-q * 1.7) * lens.height;
      height += Math.exp(-((q - 0.95) ** 2) * 24) * 0.10;
    }
    const channel = Math.exp(-(((x - Math.sin(z * 1.15 + 0.6) * 0.65) / 0.22) ** 2)) * 0.22;
    const top = 0.40 + settings.distortion * (Math.tanh(height * 0.85) * 1.35 - channel);
    const y = oy >= 0 ? 0.05 + smooth(0, 0.28, oy) * top : 0.05 - smooth(0, 0.32, -oy) * 1.5;
    positions.setXYZ(i, x, y, z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
}
