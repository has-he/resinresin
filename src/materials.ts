import * as THREE from 'three';

export type Pattern = 'moss' | 'mineral' | 'bark';

const noise = /* glsl */ `
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
`;

const palettes: Record<Pattern, [string, string, string]> = {
  moss: ['#242c1f', '#71814d', '#cfca83'],
  mineral: ['#25282c', '#8d747d', '#d4b4ab'],
  bark: ['#211c18', '#6a4932', '#b99564'],
};

/** Analytic world-space texture: no bitmap is enlarged when the resin magnifies it. */
export function organicMaterial(pattern: Pattern, detail = 1, hue?: string) {
  const colors = palettes[pattern];
  const material = new THREE.MeshStandardMaterial({
    color: 'white', roughness: pattern === 'mineral' ? 0.77 : 0.94,
    metalness: pattern === 'mineral' ? 0.08 : 0,
  });
  const uniforms = {
    organicDark: { value: new THREE.Color(colors[0]) },
    organicMid: { value: new THREE.Color(hue ?? colors[1]) },
    organicLight: { value: new THREE.Color(colors[2]) },
    organicDetail: { value: detail },
  };
  material.userData.organic = uniforms;
  material.customProgramCacheKey = () => `organic-${pattern}`;
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
        ${noise}
      `)
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        vec3 op = vOrganicPosition * organicDetail;
        float broad = organicFbm(op * ${pattern === 'bark' ? 'vec3(3.0, 2.0, 24.0)' : '3.6'});
        float fleck = organicNoise(op * 96.0);
        float grain = organicFbm(op * 32.0);
        float patches = smoothstep(0.27, 0.76, broad);
        vec3 organicColor = mix(organicDark, organicMid, patches);
        organicColor = mix(organicColor, organicLight, smoothstep(0.56, 0.81, grain) * 0.75);
        ${pattern === 'mineral' ? `
          float vein = abs(sin(op.x * 7.0 + op.z * 9.0 + broad * 15.0));
          organicColor = mix(organicColor, organicLight, pow(vein, 24.0)*0.55);
        ` : ''}
        organicColor *= 0.65 + fleck * 0.48;
        diffuseColor.rgb *= organicColor;
      `)
      .replace('#include <normal_fragment_begin>', /* glsl */ `
        #include <normal_fragment_begin>
        float relief = organicFbm(vOrganicPosition * 65.0 * organicDetail);
        normal = normalize(normal + vec3(-dFdx(relief), -dFdy(relief), 0.0) * 1.8);
      `);
  };
  return material;
}

export function setMaterialDetail(material: THREE.Material, detail: number) {
  if (material.userData.organic) material.userData.organic.organicDetail.value = detail;
}

export function randomFromSeed(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
