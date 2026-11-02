import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { organicMaterial, randomFromSeed, setMaterialDetail, type Pattern } from './materials';

export type Preset = 'forest' | 'mineral' | 'amber';
export type LayerMaterial = Pattern | 'original';
export interface Layer {
  id: string;
  name: string;
  kind: 'specimen' | 'image' | 'model';
  object: THREE.Object3D;
  visible: boolean;
  scale: number;
  depth: number;
  x: number;
  z: number;
  rotation: number;
  tilt: number;
  material: LayerMaterial;
}
export interface Settings {
  ior: number;
  distortion: number;
  frequency: number;
  roughness: number;
  dispersion: number;
  tint: string;
  exposure: number;
  detail: number;
  seed: number;
  preset: Preset;
  light: 'studio' | 'sunset';
}
export const defaults: Settings = {
  ior: 1.46, distortion: 0.72, frequency: 1.15, roughness: 0.035,
  dispersion: 0.16, tint: '#e3e9cd', exposure: 1.15,
  detail: 1, seed: 42, preset: 'forest', light: 'studio',
};
const MODEL_EXTENSIONS = new Set(['glb', 'gltf', 'obj', 'stl']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    const original = child.userData.originalMaterial as THREE.Material | THREE.Material[] | undefined;
    for (const material of [child.material, original].flat().filter(Boolean) as THREE.Material[]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  textures.forEach(t => t.dispose());
  object.removeFromParent();
}

export class ResinEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
  readonly controls: OrbitControls;
  readonly layers: Layer[] = [];
  readonly resinMaterial: THREE.MeshPhysicalMaterial;
  readonly resin: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  private environment: THREE.WebGLRenderTarget;
  private specimen = new THREE.Group();
  private originalSurface: Float32Array;
  private resizeObserver: ResizeObserver;
  private sun = new THREE.DirectionalLight('#fff4d7', 2.3);
  private fill = new THREE.DirectionalLight('#c9d6f2', 1.2);
  private lastTime = 0;
  private disposed = false;
  private needsRender = true;
  private comparing = false;
  private materialCache = new Map<Pattern, THREE.MeshStandardMaterial>();
  onFrame?: (fps: number) => void;
  onContextLost?: () => void;
  settings = { ...defaults };
  motion = false;
  frameCount = 0;
  renderedFrames = 0;
  get compare() { return this.comparing; }
  set compare(value: boolean) { this.comparing = value; this.needsRender = true; }

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = defaults.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#171c19');
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D resin specimen. Drag to orbit; scroll to zoom.');
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.onContextLost?.();
    });
    container.prepend(this.renderer.domElement);
    this.scene.background = new THREE.Color('#171c19');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.03);
    room.dispose(); pmrem.dispose();
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.65;
    this.sun.position.set(-3, 6, -2);
    this.fill.position.set(4, 2, 4);
    this.scene.add(new THREE.HemisphereLight('#f4f0d9', '#343a29', 0.8), this.sun, this.fill);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener('change', () => this.needsRender = true);
    this.resetCamera();

    this.resinMaterial = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', metalness: 0, roughness: defaults.roughness,
      transmission: 1, thickness: 2.4, ior: defaults.ior,
      attenuationColor: new THREE.Color(defaults.tint), attenuationDistance: 5,
      clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.15,
      dispersion: defaults.dispersion, side: THREE.FrontSide,
    });
    const geometry = new THREE.SphereGeometry(1, 180, 120);
    this.originalSurface = new Float32Array(geometry.attributes.position.array);
    this.resin = new THREE.Mesh(geometry, this.resinMaterial);
    this.resin.renderOrder = 10;
    this.scene.add(this.resin, this.specimen);
    this.buildSpecimen();
    this.layers.push({
      id: 'specimen', name: 'Forest floor', kind: 'specimen', object: this.specimen,
      visible: true, scale: 1, depth: 0, x: 0, z: 0, rotation: 0, tilt: 0, material: 'moss',
    });
    this.updateSurface();
    this.set('ior', defaults.ior);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.animate);
  }

  private animate = (time: number) => {
    if (this.disposed) return;
    this.controls.autoRotate = this.motion;
    this.controls.update();
    if (this.needsRender || this.motion) {
      this.resin.visible = !this.compare;
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
      this.frameCount++;
      this.renderedFrames++;
    }
    if (time - this.lastTime > 1000) {
      this.onFrame?.(Math.round(this.frameCount * 1000 / (time - this.lastTime)));
      this.frameCount = 0; this.lastTime = time;
    }
  };

  private resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.needsRender = true;
  }

  resetCamera() {
    this.camera.position.set(0, 10.3, 4.0);
    this.controls.target.set(0, -0.15, 0);
    this.controls.update();
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.needsRender = true;
    this.settings[key] = value;
    const s = this.settings;
    this.resinMaterial.ior = s.ior;
    this.resinMaterial.roughness = s.roughness;
    this.resinMaterial.clearcoatRoughness = s.roughness * 0.8;
    this.resinMaterial.dispersion = s.dispersion;
    this.resinMaterial.attenuationColor.set(s.tint);
    this.resinMaterial.thickness = 1.3 + s.distortion * 1.4;
    this.renderer.toneMappingExposure = s.exposure;
    this.sun.color.set(s.light === 'sunset' ? '#ffae68' : '#fff4d7');
    this.fill.color.set(s.light === 'sunset' ? '#c8a6dc' : '#c9d6f2');
    this.scene.environmentRotation.set(0, s.light === 'sunset' ? 1.7 : 0.3, 0);
    if (key === 'distortion' || key === 'frequency' || key === 'seed') this.updateSurface();
    if (key === 'seed' || key === 'preset') this.buildSpecimen();
    if (key === 'detail') {
      this.materialCache.forEach(material => setMaterialDetail(material, s.detail));
      this.scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          for (const m of [object.material].flat()) setMaterialDetail(m, s.detail);
        }
      });
    }
  }

  applyPreset(preset: Preset) {
    const optical = {
      forest: { tint: '#e3e9cd', distortion: 0.72, frequency: 1.15, ior: 1.46, light: 'studio' as const },
      mineral: { tint: '#eddae9', distortion: 0.90, frequency: 1.55, ior: 1.52, light: 'studio' as const },
      amber: { tint: '#ffd08d', distortion: 0.56, frequency: 0.80, ior: 1.49, light: 'sunset' as const },
    };
    Object.assign(this.settings, optical[preset]);
    this.set('preset', preset);
    this.updateSurface();
    const layer = this.layers.find(l => l.kind === 'specimen');
    if (layer) layer.name = { forest: 'Forest floor', mineral: 'Mineral bloom', amber: 'Amber tide' }[preset];
  }

  private updateSurface() {
    const a = this.resin.geometry.attributes.position;
    const s = this.settings;
    const phase = s.seed * 0.17;
    for (let i = 0; i < a.count; i++) {
      const ox = this.originalSurface[i * 3];
      const oy = this.originalSurface[i * 3 + 1];
      const oz = this.originalSurface[i * 3 + 2];
      const x = ox * 4.3;
      const z = oz * 3.65;
      const edge = 1 + 0.035 * Math.sin(Math.atan2(oz, ox) * 7 + phase);
      const wave = Math.sin(x * 1.7 * s.frequency + Math.sin(z * 1.5 + phase) * 1.7 + phase) * 0.38
        + Math.cos(z * 2.2 * s.frequency + Math.sin(x * 1.4 - phase) * 1.2) * 0.29
        + Math.sin(x * 3.8 + z * 1.8 + phase) * 0.09;
      const y = oy >= 0
        ? 0.12 + Math.pow(oy, 0.48) * 0.83 + wave * s.distortion * Math.min(1, oy * 4)
        : 0.12 + oy * 1.54;
      a.setXYZ(i, x * edge, y, z * edge);
    }
    a.needsUpdate = true;
    this.resin.geometry.computeVertexNormals();
    this.resin.geometry.computeBoundingSphere();
  }

  private buildSpecimen() {
    for (const child of [...this.specimen.children]) disposeObject(child);
    const random = randomFromSeed(this.settings.seed);
    const { preset, detail } = this.settings;
    const groundMaterial = organicMaterial(preset === 'forest' ? 'moss' : preset === 'mineral' ? 'mineral' : 'bark', detail);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(3.5, 96), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.08;
    ground.scale.y = 0.86;
    this.specimen.add(ground);

    const rockMaterial = organicMaterial('mineral', detail, preset === 'amber' ? '#927b53' : preset === 'forest' ? '#646560' : '#997783');
    for (let i = 0; i < 18; i++) {
      const geometry = new THREE.IcosahedronGeometry(1, 3);
      const pos = geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
        const d = 1 + Math.sin(x * 5.1 + i) * Math.cos(z * 4.7 + y * 3.4) * 0.13;
        pos.setXYZ(j, x * d, y * d, z * d);
      }
      geometry.computeVertexNormals();
      const rock = new THREE.Mesh(geometry, rockMaterial);
      const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 3.4;
      rock.position.set(Math.cos(angle) * radius, -0.78, Math.sin(angle) * radius * 0.8);
      const size = 0.28 + random() * 0.67;
      rock.scale.set(size * (1.1 + random()), size * 0.65, size);
      rock.rotation.set(random(), random() * 6, random());
      this.specimen.add(rock);
    }

    const stemMaterial = organicMaterial('bark', detail);
    for (let i = 0; i < 7; i++) {
      const points: THREE.Vector3[] = [];
      const x = (random() - 0.5) * 6, z = (random() - 0.5) * 5;
      const direction = random() * Math.PI;
      for (let j = 0; j < 7; j++) {
        const d = (j - 3) * 0.36;
        points.push(new THREE.Vector3(x + Math.cos(direction) * d, -0.43 + Math.sin(j * 0.8 + i) * 0.14, z + Math.sin(direction) * d + Math.sin(j) * 0.08));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const twig = new THREE.Mesh(new THREE.TubeGeometry(curve, 35, 0.045 + random() * 0.035, 7, false), stemMaterial);
      this.specimen.add(twig);
    }

    const mossMaterial = organicMaterial(preset === 'mineral' ? 'mineral' : 'moss', detail, preset === 'amber' ? '#a19754' : undefined);
    const count = 6400;
    const moss = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mossMaterial, count);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const centers = Array.from({ length: 12 }, () => ({ x: (random() - 0.5) * 6.6, z: (random() - 0.5) * 5.3, size: 0.35 + random() * 0.6 }));
    for (let i = 0; i < count; i++) {
      const center = centers[i % centers.length];
      const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * center.size;
      const x = center.x + Math.cos(angle) * r, z = center.z + Math.sin(angle) * r;
      const mound = Math.sqrt(Math.max(0, 1 - (r / center.size) ** 2)) * center.size * 0.5;
      dummy.position.set(x, -0.9 + mound + random() * 0.1, z);
      const size = 0.018 + random() * 0.055;
      dummy.scale.set(size, size * (1.2 + random() * 2), size);
      dummy.rotation.set(random() * 1.2, random() * 6, random() * 1.2);
      dummy.updateMatrix(); moss.setMatrixAt(i, dummy.matrix);
      color.setHSL(preset === 'mineral' ? 0.8 + random() * 0.1 : 0.15 + random() * 0.10, 0.12 + random() * 0.18, 0.5 + random() * 0.3);
      moss.setColorAt(i, color);
    }
    this.specimen.add(moss);
  }

  updateLayer(layer: Layer) {
    layer.object.visible = layer.visible;
    layer.object.scale.setScalar(layer.scale);
    layer.object.position.y = layer.depth;
    layer.object.position.x = layer.x;
    layer.object.position.z = layer.z;
    layer.object.rotation.y = THREE.MathUtils.degToRad(layer.rotation);
    layer.object.rotation.x = THREE.MathUtils.degToRad(layer.tilt);
    this.needsRender = true;
  }

  setLayerMaterial(layer: Layer, material: LayerMaterial) {
    this.needsRender = true;
    layer.material = material;
    if (layer.kind !== 'model') return;
    let procedural = this.materialCache.get(material as Pattern);
    if (material !== 'original' && !procedural) {
      procedural = organicMaterial(material, this.settings.detail);
      this.materialCache.set(material, procedural);
    }
    layer.object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!child.userData.originalMaterial) child.userData.originalMaterial = child.material;
      child.material = material === 'original' ? child.userData.originalMaterial : procedural!;
    });
  }

  removeLayer(id: string) {
    const index = this.layers.findIndex(l => l.id === id);
    if (index < 0 || id === 'specimen') return;
    const layer = this.layers[index];
    // Procedural override materials are shared across imported models.
    layer.object.traverse(child => {
      if (child instanceof THREE.Mesh && child.userData.originalMaterial) child.material = child.userData.originalMaterial;
    });
    disposeObject(layer.object);
    this.layers.splice(index, 1);
    this.needsRender = true;
  }

  async importFiles(files: File[], onLayer: (layer: Layer) => void, onError: (message: string) => void) {
    const urls = new Map<string, string>();
    const companions = new Set<string>();
    const manager = new THREE.LoadingManager();
    let pendingLoads = Promise.resolve();
    let resolveLoads: (() => void) | undefined;
    let resourceError = false;
    manager.onStart = () => { pendingLoads = new Promise<void>(resolve => { resolveLoads = resolve; }); };
    manager.onLoad = () => resolveLoads?.();
    manager.onError = () => { resourceError = true; };
    for (const file of files) urls.set(file.name, URL.createObjectURL(file));
    manager.setURLModifier(url => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return url;
      const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '');
      const mapped = urls.get(name);
      if (mapped) return mapped;
      throw new Error(`Missing companion file “${name}”. Add it with the model, or export a self-contained GLB.`);
    });
    // Do not also place a model's external texture files onto image planes.
    for (const file of files) {
      try {
        if (ext(file.name) === 'gltf') {
          const json = JSON.parse(await file.text());
          for (const image of json.images ?? []) if (image.uri) companions.add(decodeURIComponent(image.uri.split('/').pop()));
        } else if (ext(file.name) === 'mtl') {
          for (const line of (await file.text()).split('\n')) {
            if (/^\s*(map_|bump\s)/i.test(line)) companions.add(line.trim().split(/\s+/).pop()!);
          }
        }
      } catch { /* The model parser reports malformed files below. */ }
    }
    try {
      for (const file of files) {
        const extension = ext(file.name);
        if (companions.has(file.name) || ['bin', 'mtl'].includes(extension)) continue;
        try {
          resourceError = false;
          if (file.size > 120 * 1024 * 1024) throw new Error('This file exceeds the 120 MB import limit. Try a smaller asset.');
          let object: THREE.Object3D;
          let kind: Layer['kind'];
          if (IMAGE_EXTENSIONS.has(extension)) {
            kind = 'image';
            const texture = await new THREE.TextureLoader().loadAsync(urls.get(file.name)!);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            const ratio = texture.image.width / texture.image.height;
            const w = ratio >= 1 ? 7.8 : 7.0 * ratio, h = w / ratio;
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
              map: texture, roughness: 0.86, side: THREE.DoubleSide, transparent: false, alphaTest: 0.05,
            }));
            plane.rotation.x = -Math.PI / 2;
            object = new THREE.Group(); object.add(plane);
          } else if (MODEL_EXTENSIONS.has(extension)) {
            kind = 'model';
            let model: THREE.Object3D;
            if (extension === 'glb' || extension === 'gltf') {
              const loader = new GLTFLoader(manager);
              loader.setMeshoptDecoder(MeshoptDecoder);
              const data = extension === 'gltf' ? await file.text() : await file.arrayBuffer();
              model = (await loader.parseAsync(data, '')).scene;
            } else if (extension === 'obj') {
              const loader = new OBJLoader(manager);
              const mtl = files.find(f => ext(f.name) === 'mtl');
              if (mtl) {
                const materials = new MTLLoader(manager).parse(await mtl.text(), '');
                materials.preload(); loader.setMaterials(materials);
              }
              model = loader.parse(await file.text());
            } else {
              const geometry = new STLLoader(manager).parse(await file.arrayBuffer());
              geometry.computeVertexNormals();
              model = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#c6bca5', roughness: 0.7 }));
            }
            model.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(model);
            if (box.isEmpty()) { disposeObject(model); throw new Error('No visible mesh found in this model.'); }
            const size = box.getSize(new THREE.Vector3());
            if (![size.x, size.y, size.z].every(Number.isFinite) || size.length() < 1e-8) {
              disposeObject(model); throw new Error('This model has invalid or zero-size geometry.');
            }
            const center = box.getCenter(new THREE.Vector3());
            const fit = Math.min(4.0 / Math.max(size.x, size.z, 0.01), 1.15 / Math.max(size.y, 0.01));
            const centered = new THREE.Group();
            model.position.sub(center); centered.add(model); centered.scale.setScalar(fit);
            object = new THREE.Group(); object.add(centered);
          } else throw new Error('Use PNG, JPG, WebP, AVIF, GLB, glTF, OBJ or STL files.');
          await pendingLoads;
          if (resourceError) { disposeObject(object); throw new Error('A companion texture or buffer could not be read. Check the model’s supporting files.'); }
          const layer: Layer = {
            id: crypto.randomUUID(), name: file.name, kind, object, visible: true,
            scale: 1, depth: kind === 'image' ? -0.98 : -0.35,
            x: 0, z: 0, rotation: 0, tilt: 0, material: 'original',
          };
          if (kind === 'model' && (extension === 'stl' || extension === 'obj' && !files.some(f => ext(f.name) === 'mtl'))) {
            this.setLayerMaterial(layer, 'moss');
          }
          this.updateLayer(layer);
          this.scene.add(object);
          // Replace the demo once; keep all of the user's image and model layers together.
          if (!this.layers.some(l => l.kind !== 'specimen')) {
            const demo = this.layers[0]; demo.visible = false; this.updateLayer(demo);
          }
          this.layers.push(layer);
          onLayer(layer);
        } catch (error) {
          onError(`${file.name}: ${error instanceof Error ? error.message : 'Could not import this file.'}`);
        }
      }
    } finally {
      await pendingLoads;
      urls.forEach(url => URL.revokeObjectURL(url));
    }
  }

  async exportImage() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const ratio = this.renderer.getPixelRatio();
    const max = 4096;
    const scale = Math.min(2, max / Math.max(size.x, size.y));
    const width = Math.round(size.x * scale), height = Math.round(size.y * scale);
    this.renderer.setAnimationLoop(null);
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.resin.visible = !this.compare;
      this.renderer.render(this.scene, this.camera);
      const blob = await new Promise<Blob>((resolve, reject) => {
        this.renderer.domElement.toBlob(b => b ? resolve(b) : reject(new Error('Could not encode the image.')), 'image/png');
      });
      return { blob, width, height };
    } finally {
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(size.x, size.y, false);
      this.needsRender = true;
      this.renderer.setAnimationLoop(this.animate);
    }
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect(); this.controls.dispose();
    for (const layer of [...this.layers]) if (layer.kind !== 'specimen') this.removeLayer(layer.id);
    disposeObject(this.specimen); disposeObject(this.resin);
    this.materialCache.forEach(m => m.dispose()); this.environment.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
