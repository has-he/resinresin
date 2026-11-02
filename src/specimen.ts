import * as THREE from 'three';
import { organicMaterial, randomFromSeed } from './materials';

type SpecimenOptions = { seed: number; preset: 'forest' | 'mineral' | 'amber'; detail: number; imperfections: number };

function frondGeometry() {
  const vertices: number[] = [];
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  for (let level = 0; level < 7; level++) {
    const y = 0.13 + level * 0.12;
    const angle = level * 1.7;
    const length = (1 - y * 0.72) * 0.38;
    for (const side of [-1, 1]) {
      const direction = new THREE.Vector3(Math.cos(angle) * side, 0.25, Math.sin(angle) * side).normalize();
      const across = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(0.065 * (1 - y * 0.6));
      const start = new THREE.Vector3(Math.sin(y * 2) * 0.06, y, 0);
      const middle = start.clone().addScaledVector(direction, length * 0.55);
      const tip = start.clone().addScaledVector(direction, length);
      tip.y += 0.08;
      triangle(start, middle.clone().add(across), tip);
      triangle(start, tip, middle.clone().sub(across));
    }
  }
  // A closed, tapered stem.
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, b = (i + 1) / 5 * Math.PI * 2;
    triangle(new THREE.Vector3(Math.cos(a) * 0.018, 0, Math.sin(a) * 0.018), new THREE.Vector3(Math.cos(b) * 0.018, 0, Math.sin(b) * 0.018), new THREE.Vector3(0.05, 1, 0));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildOrganicSpecimen(options: SpecimenOptions) {
  const group = new THREE.Group();
  const random = randomFromSeed(options.seed);
  const { preset, detail } = options;
  const groundMaterial = organicMaterial(preset === 'mineral' ? 'mineral' : 'moss', detail, '#474936');
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4.9, 80), groundMaterial);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.25;
  ground.scale.y = 0.86; ground.receiveShadow = true;
  group.add(ground);

  const rocks: { x: number; z: number; y: number; sx: number; sy: number; sz: number }[] = [];
  const hues = preset === 'forest' ? ['#4b8986', '#81717f', '#79745e', '#464744'] : preset === 'mineral' ? ['#8f6d88', '#8ca2a0', '#ad8d86', '#51505c'] : ['#9a8247', '#6d6350', '#b28a50', '#484333'];
  const placements = [[-1.6,-0.8,1.13,0.57,1.1], [1.5,-0.2,1.0,0.45,1.05], [-0.45,1.45,0.9,0.4,0.85], [0.4,-1.6,0.7,0.46,0.9]];
  for (let i = 0; i < 24; i++) {
    const p = placements[i] ?? [(random() - 0.5) * 8.0, (random() - 0.5) * 6.8, 0.28 + random() * 0.5, 0.2 + random() * 0.3, 0.3 + random() * 0.55];
    const rock = { x: p[0] + (random() - 0.5) * 0.15, z: p[1], y: -0.65, sx: p[2], sy: p[3], sz: p[4] };
    rocks.push(rock);
    const geometry = new THREE.IcosahedronGeometry(1, 3);
    const positions = geometry.attributes.position;
    for (let j = 0; j < positions.count; j++) {
      const x = positions.getX(j), y = positions.getY(j), z = positions.getZ(j);
      const d = 1 + Math.sin(x * 5.1 + i) * Math.cos(z * 4.7 + y * 3.4) * 0.12 + Math.sin(x * 11 + z * 7) * 0.035;
      positions.setXYZ(j, x * d, y * d, z * d);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, organicMaterial('mineral', detail, hues[i % hues.length]));
    mesh.position.set(rock.x, rock.y, rock.z); mesh.scale.set(rock.sx, rock.sy, rock.sz);
    mesh.rotation.y = random() * 6; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  const floorHeight = (x: number, z: number) => {
    let height = -1.22;
    for (const rock of rocks) {
      const q = ((x - rock.x) / rock.sx) ** 2 + ((z - rock.z) / rock.sz) ** 2;
      if (q < 0.92) height = Math.max(height, rock.y + rock.sy * Math.sqrt(1 - q));
    }
    return height;
  };

  const twigMaterial = organicMaterial('bark', detail);
  function branch(points: THREE.Vector3[], radius: number) {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 22, radius, 6, false), twigMaterial);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  for (let i = 0; i < 13; i++) {
    const x = (random() - 0.5) * 7.6, z = (random() - 0.5) * 6.2, angle = random() * Math.PI * 2;
    const points = Array.from({length: 6}, (_, j) => {
      const d = (j - 2.5) * 0.40;
      const px = x + Math.cos(angle) * d, pz = z + Math.sin(angle) * d + Math.sin(j) * 0.1;
      return new THREE.Vector3(px, floorHeight(px, pz) + 0.10 + Math.sin(j * 0.7) * 0.08, pz);
    });
    branch(points, 0.025 + random() * 0.035);
    for (let j = 1; j < 5; j += 2) {
      const start = points[j];
      const end = start.clone().add(new THREE.Vector3(Math.cos(angle + 0.8) * 0.55, 0.06, Math.sin(angle + 0.8) * 0.55));
      branch([start, start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.08, 0)), end], 0.012);
    }
  }

  const mossMaterial = organicMaterial(preset === 'mineral' ? 'mineral' : 'moss', detail, preset === 'amber' ? '#8b8641' : undefined);
  mossMaterial.side = THREE.DoubleSide;
  const moss = new THREE.InstancedMesh(frondGeometry(), mossMaterial, 3600);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const centers = Array.from({length: 23}, () => ({x: (random() - 0.5) * 7.8, z: (random() - 0.5) * 6.8, size: 0.3 + random() * 0.75}));
  for (let i = 0; i < moss.count; i++) {
    const c = centers[i % centers.length];
    const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * c.size;
    const x = c.x + Math.cos(angle) * r, z = c.z + Math.sin(angle) * r;
    dummy.position.set(x, floorHeight(x, z) + 0.01, z);
    const size = 0.08 + random() ** 2 * 0.22;
    dummy.scale.set(size * (1 + random()), size, size * (1 + random()));
    dummy.rotation.set((random() - 0.5) * 0.65, random() * 6.28, (random() - 0.5) * 0.65);
    dummy.updateMatrix(); moss.setMatrixAt(i, dummy.matrix);
    const brightness = 0.72 + random() * 0.65;
    color.setRGB(brightness, brightness, brightness * (0.72 + random() * 0.25));
    moss.setColorAt(i, color);
  }
  moss.castShadow = true; moss.receiveShadow = true; group.add(moss);

  // Lobed, flattened lichen discs on the stones; distinct from upright moss.
  const lichen = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), organicMaterial('moss', detail, '#b3b48b'), 1300);
  for (let i = 0; i < lichen.count; i++) {
    const c = centers[i % 9];
    const x = c.x + (random() - 0.5) * 1.15, z = c.z + (random() - 0.5) * 1.15;
    const size = 0.025 + random() * 0.055;
    dummy.position.set(x, floorHeight(x, z) + 0.018, z);
    dummy.scale.set(size, size * 0.17, size * (0.6 + random()));
    dummy.rotation.set(0, random() * 6, 0); dummy.updateMatrix(); lichen.setMatrixAt(i, dummy.matrix);
  }
  lichen.receiveShadow = true; group.add(lichen);

  const inclusions = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({color:'#c7c5a8',roughness:0.35}), 650);
  inclusions.name = 'resin-inclusions';
  for (let i = 0; i < 650; i++) {
    const c = centers[i % centers.length];
    dummy.position.set(c.x + (random() - 0.5), -0.18 + random() * 0.3, c.z + (random() - 0.5));
    const size = 0.002 + random() ** 3 * 0.018;
    dummy.scale.set(size, size * 0.65, size); dummy.updateMatrix(); inclusions.setMatrixAt(i, dummy.matrix);
    color.set(random() < 0.25 ? '#302d22' : '#c8c3a7'); inclusions.setColorAt(i, color);
  }
  inclusions.count = Math.floor(650 * options.imperfections);
  group.add(inclusions);
  return group;
}
