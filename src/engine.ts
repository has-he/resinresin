import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment } from './environment';
import { buildOrganicSpecimen } from './specimen';
import { reshapeResin } from './surface';
import type { QualityRenderer } from './quality';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { organicMaterial, addResinImperfections, setMaterialDetail, type Pattern } from './materials';

export interface RenderState {
  mode: 'preview' | 'quality';
  phase: 'ready' | 'preparing' | 'sampling' | 'paused' | 'complete';
  samples: number; target: number;
}

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
  imperfections: number;
  lightRotation: number;
  keyLight: number;
  reflections: boolean;
  reflectionStrength: number;
}
export const defaults: Settings = {
  ior: 1.48, distortion: 0.72, frequency: 1.0, roughness: 0.018,
  dispersion: 0.045, tint: '#f3eedc', exposure: 1.0,
  detail: 1, seed: 42, preset: 'forest', light: 'studio',
  imperfections: 0.28, lightRotation: 0, keyLight: 2.8,
  reflections: false, reflectionStrength: 0.5,
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
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  readonly controls: OrbitControls;
  readonly layers: Layer[] = [];
  readonly resinMaterial: THREE.MeshPhysicalMaterial;
  readonly resin: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  private environment: THREE.Texture;
  private warmEnvironment: THREE.Texture;
  private specimen = new THREE.Group();
  private originalSurface: Float32Array;
  private resizeObserver: ResizeObserver;
  private sun = new THREE.DirectionalLight('#fff0c9', 2.8);
  private fill = new THREE.DirectionalLight('#a3d8e9', 1.3);
  private lastTime = 0;
  private disposed = false;
  private needsRender = true;
  private comparing = false;
  private quality: QualityRenderer | null = null;
  private preparingQuality = false;
  private qualityGeneration = 0;
  private lastRenderState = '';
  qualityScale = 1;
  qualitySamples = 256;
  onRenderState?: (state: RenderState) => void;
  onRenderError?: (message: string) => void;
  private materialCache = new Map<Pattern, THREE.MeshStandardMaterial>();
  onFrame?: (fps: number) => void;
  onContextLost?: () => void;
  settings = { ...defaults };
  motion = false;
  frameCount = 0;
  renderedFrames = 0;
  get compare() { return this.comparing; }
  set compare(value: boolean) { if (value) this.returnToPreview(); this.comparing = value; this.needsRender = true; }

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = defaults.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#080b09');
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D resin specimen. Drag to orbit; scroll to zoom.');
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.returnToPreview(); this.renderer.setAnimationLoop(null); this.onContextLost?.();
    });
    container.prepend(this.renderer.domElement);
    this.scene.background = new THREE.Color('#080b09');
    this.environment = createEnvironment();
    this.warmEnvironment = createEnvironment(true);
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.8;
    this.sun.position.set(2, 6, -3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -6; this.sun.shadow.camera.right = 6;
    this.sun.shadow.camera.top = 6; this.sun.shadow.camera.bottom = -6;
    this.sun.shadow.camera.near = 0.1; this.sun.shadow.camera.far = 18;
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.fill.position.set(-5, 2, 1);
    this.scene.add(new THREE.HemisphereLight('#e0e4d3', '#161c12', 0.36), this.sun, this.fill);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener('change', () => this.needsRender = true);
    this.controls.addEventListener('start', () => this.returnToPreview());
    this.resetCamera();

    this.resinMaterial = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', metalness: 0, roughness: defaults.roughness,
      transmission: 1, thickness: 2.4, ior: defaults.ior,
      attenuationColor: new THREE.Color(defaults.tint), attenuationDistance: 12,
      clearcoat: 0, clearcoatRoughness: 0.018, specularIntensity: 0, envMapIntensity: 0,
      dispersion: defaults.dispersion, side: THREE.FrontSide,
    });
    addResinImperfections(this.resinMaterial);
    const geometry = new THREE.SphereGeometry(1, 200, 144);
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
    if (this.quality) {
      try {
        if ((!this.quality.paused && !this.quality.complete) || this.needsRender) {
          this.quality.render(); this.renderedFrames++; this.needsRender = false;
        }
        this.emitRenderState();
      } catch (error) {
        this.returnToPreview();
        this.onRenderError?.(error instanceof Error ? error.message : 'Quality rendering stopped. Preview is still available.');
      }
    } else if (this.needsRender || this.motion) {
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
    this.returnToPreview();
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.needsRender = true;
  }

  resetCamera() {
    this.returnToPreview();
    this.camera.position.set(0.15, 6.7, 2.5);
    this.controls.target.set(0.05, -0.1, 0.0);
    this.controls.update();
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.returnToPreview();
    this.needsRender = true;
    this.settings[key] = value;
    const s = this.settings;
    const highlights = s.reflections ? s.reflectionStrength : 0;
    this.resinMaterial.specularIntensity = highlights;
    this.resinMaterial.clearcoat = 0.35 * highlights;
    this.resinMaterial.envMapIntensity = s.reflections ? 1 : 0;
    this.resinMaterial.ior = s.ior;
    this.resinMaterial.roughness = s.roughness;
    this.resinMaterial.clearcoatRoughness = s.roughness * 0.8;
    this.resinMaterial.dispersion = s.dispersion;
    this.resinMaterial.attenuationColor.set(s.tint);
    this.resinMaterial.thickness = 0.65 + s.distortion * 0.95;
    this.resinMaterial.userData.imperfections.value = s.imperfections;
    this.renderer.toneMappingExposure = s.exposure;
    this.sun.color.set(s.light === 'sunset' ? '#ffc079' : '#fff0c9');
    this.sun.intensity = s.keyLight;
    const angle = THREE.MathUtils.degToRad(s.lightRotation);
    this.sun.position.set(2 * Math.cos(angle) - 3 * Math.sin(angle), 6, -3 * Math.cos(angle) - 2 * Math.sin(angle));
    this.scene.environment = s.light === 'sunset' ? this.warmEnvironment : this.environment;
    this.fill.color.set(s.light === 'sunset' ? '#c8a6dc' : '#c9d6f2');
    this.scene.environmentRotation.set(0, angle, 0);
    if (key === 'distortion' || key === 'frequency' || key === 'seed') this.updateSurface();
    if (key === 'seed' || key === 'preset') this.buildSpecimen();
    if (key === 'imperfections') {
      const specks = this.specimen.getObjectByName('resin-inclusions') as THREE.InstancedMesh | undefined;
      if (specks) specks.count = Math.floor(650 * s.imperfections);
    }
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
      forest: { tint: '#f3eedc', distortion: 0.72, frequency: 1.0, ior: 1.48, light: 'studio' as const },
      mineral: { tint: '#ede3ee', distortion: 0.85, frequency: 1.25, ior: 1.52, light: 'studio' as const },
      amber: { tint: '#f3d29e', distortion: 0.62, frequency: 0.80, ior: 1.49, light: 'sunset' as const },
    };
    Object.assign(this.settings, optical[preset]);
    this.set('preset', preset);
    this.updateSurface();
    const layer = this.layers.find(l => l.kind === 'specimen');
    if (layer) layer.name = { forest: 'Forest floor', mineral: 'Mineral bloom', amber: 'Amber tide' }[preset];
  }

  private updateSurface() {
    reshapeResin(this.resin.geometry, this.originalSurface, this.settings);
  }

  private buildSpecimen() {
    for (const child of [...this.specimen.children]) disposeObject(child);
    const generated = buildOrganicSpecimen(this.settings);
    this.specimen.add(...generated.children);
  }

  updateLayer(layer: Layer) {
    this.returnToPreview();
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
    this.returnToPreview();
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
    this.returnToPreview();
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
    this.returnToPreview();
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

  get renderState(): RenderState {
    const q = this.quality;
    return {
      mode: q || this.preparingQuality ? 'quality' : 'preview',
      phase: this.preparingQuality ? 'preparing' : q ? q.complete ? 'complete' : q.paused ? 'paused' : 'sampling' : 'ready',
      samples: q?.samples ?? 0, target: q?.targetSamples ?? this.qualitySamples,
    };
  }

  private emitRenderState() {
    const state = this.renderState;
    const key = `${state.mode}-${state.phase}-${Math.floor(state.samples)}-${state.target}`;
    if (key !== this.lastRenderState) { this.lastRenderState = key; this.onRenderState?.(state); }
  }

  returnToPreview() {
    if (!this.quality && !this.preparingQuality) return;
    this.qualityGeneration++;
    this.quality?.dispose(); this.quality = null;
    this.preparingQuality = false; this.needsRender = true;
    this.emitRenderState();
  }

  async startQuality() {
    this.returnToPreview();
    const generation = ++this.qualityGeneration;
    this.motion = false; this.compare = false;
    this.controls.enableDamping = false; this.controls.update(); this.controls.enableDamping = true;
    this.resin.visible = true;
    this.preparingQuality = true; this.emitRenderState();
    try {
      const { QualityRenderer } = await import('./quality');
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (generation !== this.qualityGeneration || this.disposed) return;
      const quality = new QualityRenderer(this.renderer, this.scene, this.camera, this.qualityScale, this.qualitySamples);
      if (generation !== this.qualityGeneration || this.disposed) { quality.dispose(); return; }
      this.quality = quality; this.preparingQuality = false; this.needsRender = true;
      this.emitRenderState();
    } catch (error) {
      if (generation !== this.qualityGeneration) return;
      this.returnToPreview();
      this.onRenderError?.(error instanceof Error ? error.message : 'Could not start quality rendering.');
    }
  }

  pauseQuality() {
    if (!this.quality) return;
    this.quality.paused = !this.quality.paused; this.needsRender = true; this.emitRenderState();
  }

  setQualityScale(scale: number) {
    this.qualityScale = scale;
    if (this.quality) { this.quality.setScale(scale); this.needsRender = true; this.emitRenderState(); }
  }

  setQualitySamples(samples: number) {
    this.qualitySamples = samples;
    if (this.quality) { this.quality.targetSamples = samples; this.needsRender = true; this.emitRenderState(); }
  }

  overview() {
    this.returnToPreview();
    this.camera.position.set(0, 12.8, 5.2); this.controls.target.set(0, -0.1, 0); this.controls.update();
  }

  async exportImage() {
    if (this.preparingQuality) throw new Error('Wait for the quality renderer to start, or switch to Preview.');
    if (this.quality) {
      if (this.quality.samples < 1) throw new Error('Wait for the first full quality sample before exporting.');
      const { width, height } = this.quality.resolution;
      const copy = document.createElement('canvas'); copy.width = width; copy.height = height;
      const context = copy.getContext('2d');
      if (!context) throw new Error('Image export is unavailable.');
      context.drawImage(this.renderer.domElement, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => copy.toBlob(b => b ? resolve(b) : reject(new Error('Could not encode the render.')), 'image/png'));
      return { blob, width, height, samples: Math.floor(this.quality?.samples ?? 0), quality: true };
    }
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
      return { blob, width, height, quality: false, samples: 0 };
    } finally {
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(size.x, size.y, false);
      this.needsRender = true;
      this.renderer.setAnimationLoop(this.animate);
    }
  }

  dispose() {
    this.returnToPreview();
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect(); this.controls.dispose();
    for (const layer of [...this.layers]) if (layer.kind !== 'specimen') this.removeLayer(layer.id);
    disposeObject(this.specimen); disposeObject(this.resin);
    this.materialCache.forEach(m => m.dispose()); this.environment.dispose(); this.warmEnvironment.dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
