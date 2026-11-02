import * as THREE from 'three';
import { surfaceGLSL } from './surface';
import type { ResinUniforms } from './ball';

export type Pattern = 'moss' | 'mineral' | 'bark';
export interface OrganicUniforms {
  organicDark: { value: THREE.Color };
  organicMid: { value: THREE.Color };
  organicLight: { value: THREE.Color };
  organicDetail: { value: number };
}
export const patternIds: Record<Pattern, number> = { moss: 1, mineral: 2, bark: 3 };

// Shared by raster preview AND the path tracer: detail is evaluated at the actual
// world-space ray hit, rather than baked to an image or sampled from the screen.
export const organicGLSL = /* glsl */ `
float organicHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.13, 0.27, 0.43));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float organicNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(organicHash(i), organicHash(i+vec3(1,0,0)), f.x),
    mix(organicHash(i+vec3(0,1,0)), organicHash(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(organicHash(i+vec3(0,0,1)), organicHash(i+vec3(1,0,1)), f.x),
    mix(organicHash(i+vec3(0,1,1)), organicHash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float organicFbm(vec3 p) {
  return organicNoise(p) * 0.57 + organicNoise(p*2.07+3.1) * 0.28 + organicNoise(p*4.19+7.3) * 0.15;
}
vec3 organicColorAt(vec3 p, float pattern, vec3 dark, vec3 mid, vec3 light) {
  vec3 q = p;
  if (pattern > 2.5) q *= vec3(2.0, 1.0, 12.0);
  float broad = organicFbm(q * 3.6);
  float grain = organicFbm(q * 43.0);
  float fleck = organicNoise(q * 138.0);
  vec3 color = mix(dark, mid, smoothstep(0.25, 0.73, broad));
  color = mix(color, light, smoothstep(0.61, 0.82, grain) * 0.65);
  if (pattern > 1.5 && pattern < 2.5) {
    float vein = abs(sin(p.x * 5.0 + p.z * 8.0 + broad * 15.0));
    color = mix(color, light, pow(vein, 38.0) * 0.12);
    float mica = smoothstep(0.88, 0.96, fleck);
    color += light * mica * 0.25;
  }
  return color * (0.75 + fleck * 0.34);
}
float resinCloud(vec3 p) {
  float cloudPatch = smoothstep(0.54, 0.76, organicFbm(p * 2.4 + 13.0));
  return cloudPatch * (0.35 + organicNoise(p * 85.0) * 0.65);
}
`;

const palettes: Record<Pattern, [string, string, string]> = {
  moss: ['#172113', '#62783a', '#adb66c'],
  mineral: ['#272a2d', '#87767f', '#c4beb0'],
  bark: ['#191713', '#57442d', '#a48d66'],
};

export function organicMaterial(pattern: Pattern, detail = 1, hue?: string) {
  const colors = palettes[pattern];
  const material = new THREE.MeshStandardMaterial({
    color: 'white', roughness: pattern === 'mineral' ? 0.66 : 0.88,
    metalness: 0,
  });
  const uniforms: OrganicUniforms = {
    organicDark: { value: new THREE.Color(colors[0]) },
    organicMid: { value: new THREE.Color(hue ?? colors[1]) },
    organicLight: { value: new THREE.Color(colors[2]) },
    organicDetail: { value: detail },
  };
  material.userData.organic = uniforms;
  material.userData.pattern = pattern;
  material.customProgramCacheKey = () => `organic-v2-${pattern}`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOrganicPosition;')
      .replace('#include <project_vertex>', /* glsl */ `
        vec4 organicLocal = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          organicLocal = instanceMatrix * organicLocal;
        #endif
        vOrganicPosition = (modelMatrix * organicLocal).xyz;
        #include <project_vertex>
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        varying vec3 vOrganicPosition;
        uniform vec3 organicDark, organicMid, organicLight;
        uniform float organicDetail;
        ${organicGLSL}
      `)
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        diffuseColor.rgb *= organicColorAt(vOrganicPosition * organicDetail, ${patternIds[pattern]}.0,
          organicDark, organicMid, organicLight);
      `)
      .replace('#include <normal_fragment_begin>', /* glsl */ `
        #include <normal_fragment_begin>
        float relief = organicFbm(vOrganicPosition * 78.0 * organicDetail);
        normal = normalize(normal + vec3(-dFdx(relief), -dFdy(relief), 0.0) * 0.45);
      `);
  };
  return material;
}

export function addResinImperfections(material: THREE.MeshPhysicalMaterial, field: THREE.Texture, uniforms:ResinUniforms) {
  material.userData.resinHeightField = field;
  material.userData.resinUniforms = uniforms;
  const amount = { value: 0.25 };
  material.userData.imperfections = amount;
  material.customProgramCacheKey = () => 'resin-patches-v3';
  material.onBeforeCompile = shader => {
    shader.uniforms.imperfections = amount;
    shader.uniforms.resinHeightField = { value: field };
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vResinPosition;')
      .replace('#include <project_vertex>', 'vResinPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vResinPosition;\nuniform float imperfections;\n${organicGLSL}\n${surfaceGLSL}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\nvec3 resinFallback = inverseTransformDirection(normal, viewMatrix);\nnormal = normalize(mat3(viewMatrix) * resinSurfaceNormal(vResinPosition, resinFallback));\nnonPerturbedNormal = normal;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor += resinCloud(resinLocalPoint(vResinPosition)) * imperfections * 0.32;');
  };
}

export function setMaterialDetail(material: THREE.Material, detail: number) {
  if (material.userData.organic) material.userData.organic.organicDetail.value = detail;
}

export { randomFromSeed } from './random';
