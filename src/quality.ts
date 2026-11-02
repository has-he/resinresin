import * as THREE from 'three';
import { surfaceGLSL } from './surface';
import type { ResinUniforms } from './ball';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { organicGLSL, patternIds, type OrganicUniforms, type Pattern } from './materials';

// The version is pinned: its internal material hook is the one place we extend
// the integrator. Fail explicitly if an upgrade changes that contract.
interface TracerInternals {
  _materials: THREE.Material[];
  _pathTracer: { material: THREE.ShaderMaterial };
  _lowResPathTracer: { dispose(): void };
  _generator: { geometry: THREE.BufferGeometry };
}

function expandInstances(mesh: THREE.InstancedMesh) {
  const source = mesh.geometry;
  const p = source.getAttribute('position'), n = source.getAttribute('normal');
  const uv = source.getAttribute('uv'), c = source.getAttribute('color');
  const count = mesh.count, size = p.count;
  const positions = new Float32Array(size * count * 3);
  const normals = new Float32Array(size * count * 3);
  const colors = new Float32Array(size * count * 3);
  const uvs = uv ? new Float32Array(size * count * 2) : undefined;
  const indices = source.index ? new Uint32Array(source.index.count * count) : undefined;
  const geometry = new THREE.BufferGeometry();
  const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3();
  const position = new THREE.Vector3(), normal = new THREE.Vector3(), color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld);
    normalMatrix.getNormalMatrix(matrix);
    if (mesh.instanceColor) mesh.getColorAt(i, color); else color.set('white');
    for (let j = 0; j < size; j++) {
      const v = i * size + j;
      position.fromBufferAttribute(p, j).applyMatrix4(matrix).toArray(positions, v * 3);
      if (n) normal.fromBufferAttribute(n, j).applyMatrix3(normalMatrix).normalize().toArray(normals, v * 3);
      colors[v * 3] = color.r * (c ? c.getX(j) : 1);
      colors[v * 3 + 1] = color.g * (c ? c.getY(j) : 1);
      colors[v * 3 + 2] = color.b * (c ? c.getZ(j) : 1);
      if (uvs && uv) { uvs[v * 2] = uv.getX(j); uvs[v * 2 + 1] = uv.getY(j); }
    }
    if (indices && source.index) {
      for (let j = 0; j < source.index.count; j++) indices[i * source.index.count + j] = source.index.getX(j) + i * size;
    }
    for (const group of source.groups) geometry.addGroup(i * (source.index?.count ?? size) + group.start, group.count, group.materialIndex);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (indices) geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  if (!n) geometry.computeVertexNormals();
  const materials = [mesh.material].flat().map(original => {
    const material = original.clone();
    material.userData = original.userData;
    if (material instanceof THREE.MeshStandardMaterial) material.vertexColors = true;
    return material;
  });
  const expanded = new THREE.Mesh(geometry, Array.isArray(mesh.material) ? materials : materials[0]);
  return { mesh: expanded, geometry, materials };
}

export class QualityRenderer {
  private tracer: WebGLPathTracer;
  private geometry: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private data: THREE.DataTexture | null = null;
  private borrowedTextures = new Set<THREE.Texture>();
  private previousShaderError: THREE.WebGLRenderer['debug']['onShaderError'];
  private shaderError = false;
  private traceScene = new THREE.Scene();
  targetSamples: number;
  paused = false;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, scale = 1, targetSamples = 256) {
    this.targetSamples = targetSamples;
    if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('Quality rendering needs floating-point WebGL buffers. Preview is still available.');
    scene.updateMatrixWorld(true);
    this.traceScene.environment = scene.environment;
    this.traceScene.background = scene.background;
    this.traceScene.environmentIntensity = scene.environmentIntensity;
    this.traceScene.environmentRotation.copy(scene.environmentRotation);
    scene.traverseVisible(object => {
      if (object instanceof THREE.InstancedMesh && object.count > 0) {
        const expanded = expandInstances(object);
        this.geometry.push(expanded.geometry); this.materials.push(...expanded.materials);
        this.traceScene.add(expanded.mesh);
      } else if (object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh)) {
        const copy = object.clone(false);
        copy.matrixAutoUpdate = false; copy.matrix.copy(object.matrixWorld);
        this.traceScene.add(copy);
      } else if (object instanceof THREE.Light && !(object instanceof THREE.HemisphereLight) && !(object instanceof THREE.AmbientLight)) {
        const copy = object.clone();
        copy.position.copy(object.getWorldPosition(new THREE.Vector3()));
        if (copy instanceof THREE.DirectionalLight || copy instanceof THREE.SpotLight) {
          const original = object as THREE.DirectionalLight;
          copy.target.position.copy(original.target.getWorldPosition(new THREE.Vector3()));
          this.traceScene.add(copy.target);
        }
        this.traceScene.add(copy);
      }
    });
    this.tracer = new WebGLPathTracer(renderer);
    this.tracer.rasterizeSceneCallback = () => renderer.render(scene, camera);
    this.tracer.renderDelay = 0; this.tracer.minSamples = 1; this.tracer.fadeDuration = 0;
    this.tracer.bounces = 7; this.tracer.transmissiveBounces = 12;
    this.tracer.filterGlossyFactor = 0.12;
    this.tracer.renderScale = scale;
    this.tracer.textureSize.set(2048, 2048);
    this.tracer.tiles.set(3, 3);
    this.previousShaderError = renderer.debug.onShaderError;
    renderer.debug.onShaderError = (gl, program) => {
      this.shaderError = true;
      console.error('Quality renderer could not compile:', gl.getProgramInfoLog(program));
    };
    try {
      this.tracer.setScene(this.traceScene, camera);
      this.installProceduralMaterials();
    } catch (error) {
      this.dispose(); throw error;
    }
  }

  private installProceduralMaterials() {
    const internal = this.tracer as unknown as TracerInternals;
    const materials = internal._materials;
    const resin=materials.find(m => m.userData.resinHeightField);
    const field = resin?.userData.resinHeightField as THREE.Texture;
    if (!field) throw new Error('The resin height field is unavailable.');
    this.borrowedTextures.add(field);
    const data = new Float32Array(Math.max(1, materials.length) * 4 * 4);
    materials.forEach((material, index) => {
      const uniforms = material.userData.organic as OrganicUniforms | undefined;
      const offset = index * 16;
      if (uniforms) {
        uniforms.organicDark.value.toArray(data, offset);
        data[offset + 3] = patternIds[material.userData.pattern as Pattern];
        uniforms.organicMid.value.toArray(data, offset + 4);
        data[offset + 7] = uniforms.organicDetail.value;
        uniforms.organicLight.value.toArray(data, offset + 8);
      } else if (material.userData.imperfections) {
        data[offset + 3] = 4;
        data[offset + 7] = material.userData.imperfections.value;
      }
    });
    const texture = new THREE.DataTexture(data, 4, Math.max(1, materials.length), THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true; this.data = texture;
    const material = internal._pathTracer.material;
    const marker = 'Material material = readMaterialInfo( materials, materialIndex );';
    if (!material.fragmentShader.includes(marker)) throw new Error('The quality-renderer material extension is incompatible. Preview is still available.');
    const injection = `${marker}
      vec4 organic0 = texelFetch(organicMaterials, ivec2(0, int(materialIndex)), 0);
      vec4 organic1 = texelFetch(organicMaterials, ivec2(1, int(materialIndex)), 0);
      vec3 organicHit = ray.origin + ray.direction * surfaceHit.dist;
      if (organic0.a > 0.5 && organic0.a < 3.5) {
        vec3 organicLight = texelFetch(organicMaterials, ivec2(2, int(materialIndex)), 0).rgb;
        material.color *= organicColorAt(organicHit * organic1.a, organic0.a, organic0.rgb, organic1.rgb, organicLight);
      } else if (organic0.a > 3.5) {
        material.roughness += resinCloud(resinLocalPoint(organicHit)) * organic1.a * 0.32;
      }
    `;
    const offset = material.fragmentShader.lastIndexOf(marker);
    material.fragmentShader = `uniform sampler2D organicMaterials;\n${organicGLSL}\n${surfaceGLSL}\n` + material.fragmentShader.slice(0, offset) + injection + material.fragmentShader.slice(offset + marker.length);
    const scatter = 'scatterRec = bsdfSample( - ray.direction, surf );';
    if (!material.fragmentShader.includes(scatter)) throw new Error('The quality renderer normal extension is incompatible.');
    material.fragmentShader = material.fragmentShader.replace(scatter, `
      if (organic0.a > 3.5) {
        surf.normal = resinSurfaceNormal(organicHit,surf.normal*surfaceHit.side)*surfaceHit.side;
        surf.clearcoatNormal = surf.normal;
        surf.normalBasis = getBasisFromNormal(surf.normal); surf.normalInvBasis = inverse(surf.normalBasis);
        surf.clearcoatBasis = surf.normalBasis; surf.clearcoatInvBasis = surf.normalInvBasis;
      }
      ${scatter}
    `);
    material.uniforms.organicMaterials = { value: texture };
    material.uniforms.resinHeightField = { value: field };
    Object.assign(material.uniforms,resin!.userData.resinUniforms as ResinUniforms);
    material.needsUpdate = true;
  }

  setScale(scale: number) { this.tracer.renderScale = scale; this.tracer.reset(); this.paused = false; }

  get samples() { return this.tracer.samples; }
  get complete() { return this.samples >= this.targetSamples; }
  get resolution() { return { width: this.tracer.target.width, height: this.tracer.target.height }; }
  render() {
    if (this.shaderError) throw new Error('The quality shader is unsupported on this graphics device. Preview is still available.');
    this.tracer.pausePathTracing = this.paused || this.complete;
    this.tracer.renderSample();
  }

  dispose() {
    this.renderer.debug.onShaderError = this.previousShaderError ?? null;
    if (this.tracer) {
      const internal = this.tracer as unknown as TracerInternals;
      this.tracer.dispose();
      internal._lowResPathTracer.dispose();
      internal._generator.geometry.dispose();
      const material = internal._pathTracer.material;
      const resources = new Set<unknown>();
      for (const uniform of Object.values(material.uniforms)) {
        const value = uniform.value;
        if (value && typeof value.dispose === 'function' && value !== this.traceScene.environment && value !== this.traceScene.background && !this.borrowedTextures.has(value)) resources.add(value);
      }
      for (const resource of resources) (resource as {dispose(): void}).dispose();
      material.dispose();
    }
    this.data?.dispose();
    this.geometry.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose());
    this.traceScene.clear();
  }
}
