import * as THREE from 'three';
import { randomFromSeed } from './random';
import { soften } from './height-filter';

export const RESIN_WIDTH = 10.8;
export const RESIN_DEPTH = 9.4;
const GRID = 257;
const smooth = (a: number, b: number, v: number) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export interface SurfaceSettings { seed: number; distortion: number; frequency: number; smoothing: number; wrap: number; coatThickness: number; foldLips?: number; lipRounding?: number }
export interface CoatingSample { height: number; coverage: number }
export type CoatingSource = (x: number, z: number) => CoatingSample;

// Cubic B-spline filtering is C2 continuous. Interpolate height AND its gradient,
// rather than feeding triangle-averaged normals into a very strong lens.
export const surfaceGLSL = /* glsl */ `
uniform sampler2D resinHeightField;
vec4 resinCubicWeights(float f) {
  float f2 = f * f, f3 = f2 * f;
  return vec4(1.0 - 3.0*f + 3.0*f2 - f3, 4.0 - 6.0*f2 + 3.0*f3,
    1.0 + 3.0*f + 3.0*f2 - 3.0*f3, f3) / 6.0;
}
vec3 resinFieldAt(vec2 worldXZ) {
  vec2 size = vec2(textureSize(resinHeightField, 0));
  vec2 uv = clamp(worldXZ / vec2(10.8, 9.4) + 0.5, 0.0, 1.0);
  vec2 p = uv * (size - 1.0);
  vec2 base = floor(p), f = fract(p);
  vec4 wx = resinCubicWeights(f.x), wy = resinCubicWeights(f.y);
  vec2 gx = vec2(wx.x + wx.y, wx.z + wx.w);
  vec2 gy = vec2(wy.x + wy.y, wy.z + wy.w);
  vec2 hx = vec2(-1.0 + wx.y/gx.x, 1.0 + wx.w/gx.y);
  vec2 hy = vec2(-1.0 + wy.y/gy.x, 1.0 + wy.w/gy.y);
  vec2 a = (base + vec2(hx.x, hy.x) + 0.5) / size;
  vec2 b = (base + vec2(hx.y, hy.x) + 0.5) / size;
  vec2 c = (base + vec2(hx.x, hy.y) + 0.5) / size;
  vec2 d = (base + vec2(hx.y, hy.y) + 0.5) / size;
  return (texture(resinHeightField,a).rgb * gx.x + texture(resinHeightField,b).rgb * gx.y) * gy.x
    + (texture(resinHeightField,c).rgb * gx.x + texture(resinHeightField,d).rgb * gx.y) * gy.y;
}
float resinNormalBlend(vec3 point, float height) {
  float radius = dot(point.xz / vec2(5.4,4.7), point.xz / vec2(5.4,4.7));
  return (1.0 - smoothstep(0.86,0.94,radius)) * (1.0 - smoothstep(0.025,0.08,abs(point.y-height)));
}
`;

export class ResinSurface {
  readonly texture: THREE.DataTexture;
  private data = new Float32Array(GRID * GRID * 4);
  constructor() {
    this.texture = new THREE.DataTexture(this.data, GRID, GRID, THREE.RGBAFormat, THREE.FloatType);
    this.texture.internalFormat = 'RGBA16F';
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  update(settings: SurfaceSettings, source?: CoatingSource) {
    let coverageField: Float32Array | undefined, weightedHeight: Float32Array | undefined;
    if (source && settings.wrap > 0) {
      const coverage=new Float32Array(GRID*GRID), height=new Float32Array(GRID*GRID);
      for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++) {
        const value=source((x/(GRID-1)-0.5)*RESIN_WIDTH,(z/(GRID-1)-0.5)*RESIN_DEPTH), index=z*GRID+x;
        coverage[index]=value.coverage; height[index]=value.height*value.coverage;
      }
      // Feather silhouette masks before conformation; alpha cutouts must not
      // introduce new cliffs into an otherwise smooth resin surface.
      const radius=Math.round(2+settings.smoothing*4);
      coverageField=soften(coverage,GRID,GRID,radius);
      weightedHeight=soften(height,GRID,GRID,radius);
    }
    const random = randomFromSeed(settings.seed + 781);
    const softness = settings.smoothing;
    const lenses = Array.from({length: 12}, (_, i) => ({
      x: (random() - 0.5) * 9, z: (random() - 0.5) * 7.5,
      sx: (0.65 + random() * 1.25) / settings.frequency * (1 + softness * 0.1),
      sz: (0.8 + random() * 1.55) / settings.frequency * (1 + softness * 0.1),
      angle: random() * Math.PI, height: (i % 3 === 0 ? 1.0 : 0.45) + random() * 0.6,
    }));
    const curves=Array.from({length:2},(_,i)=>{
      const angle=(i===0?-0.45:0.9)+random()*0.65;
      return {x:(random()-0.5)*(i===0?1.5:3),z:(random()-0.5)*2,
        cos:Math.cos(angle),sin:Math.sin(angle),bend:0.25+random()*0.45,
        phase:random()*Math.PI*2,length:2.6+random()*0.7,width:0.32+random()*0.08};
    });
    const lipStrength=(settings.foldLips??0)*settings.distortion*0.6;
    // A small positive fillet radius gives a crisp lip with continuous normals.
    // It never returns to the discontinuous, faceted ridges of the first mesh.
    const tipRadius=0.14+(settings.lipRounding??0.45)*0.32;
    const bases=lenses.map(lens=>({cos:Math.cos(lens.angle),sin:Math.sin(lens.angle)}));
    for (let iz = 0; iz < GRID; iz++) {
      const z = (iz / (GRID - 1) - 0.5) * RESIN_DEPTH;
      const warps=lenses.map(lens=>Math.sin(z*1.05+lens.angle)*0.18);
      for (let ix = 0; ix < GRID; ix++) {
        const x = (ix / (GRID - 1) - 0.5) * RESIN_WIDTH;
        let h = 0;
        for (let l=0;l<lenses.length;l++) {
          const lens=lenses[l], basis=bases[l];
          const dx = x - lens.x + warps[l], dz = z - lens.z;
          const u = (dx * basis.cos + dz * basis.sin) / lens.sx;
          const v = (-dx * basis.sin + dz * basis.cos) / lens.sz;
          const q = u * u + v * v;
          h += Math.exp(-q * 1.7) * lens.height;
          h += Math.exp(-((q - 0.95) ** 2) * (24 - softness * 15)) * 0.10 * (1 - softness) ** 2;
        }
        const width = 0.22 + softness * 0.4;
        const channel = Math.exp(-(((x - Math.sin(z * 1.15 + 0.6) * 0.65) / width) ** 2)) * 0.22 * (1 - softness * 0.5);
        let height = 0.40 + settings.distortion * (Math.tanh(h * 0.85) * 1.35 - channel);
        const poolHeight=height;
        if(lipStrength>0)for(const curve of curves) {
          const dx=x-curve.x,dz=z-curve.z;
          const u=dx*curve.cos+dz*curve.sin,v=-dx*curve.sin+dz*curve.cos;
          const phase=v*0.85+curve.phase;
          const derivative=curve.bend*0.85*Math.cos(phase);
          const distance=(u-curve.bend*Math.sin(phase))/Math.sqrt(1+derivative*derivative);
          const ridge=Math.exp(-(Math.sqrt(distance*distance+tipRadius*tipRadius)-tipRadius)/curve.width);
          const recess=0.55*Math.exp(-(((distance+0.45)/0.22)**2));
          const fade=Math.exp(-((v/curve.length)**6));
          height+=(ridge-recess)*fade*lipStrength;
        }
        if (coverageField && weightedHeight) {
          const index=iz*GRID+ix, coverage=coverageField[index];
          const coat = {height:coverage>0.0001?weightedHeight[index]/coverage:-1.4,coverage:coverage>0.0001?coverage:0};
          if (coat.coverage > 0) {
            const target = coat.height + settings.coatThickness + (poolHeight - 0.4) * 0.18;
            height = THREE.MathUtils.lerp(poolHeight, target, coat.coverage * settings.wrap)+(height-poolHeight);
            // Keep a minimum cover over the central part of the relief.
            height = THREE.MathUtils.lerp(height, Math.max(height, coat.height + 0.08), smooth(0.2,0.7,coat.coverage));
          }
        }
        this.data[(iz * GRID + ix) * 4] = Math.max(-1.22, height);
      }
    }
    const dx = RESIN_WIDTH / (GRID - 1), dz = RESIN_DEPTH / (GRID - 1);
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      const i = (z * GRID + x) * 4;
      const x0 = Math.max(0,x-1), x1 = Math.min(GRID-1,x+1), z0 = Math.max(0,z-1), z1 = Math.min(GRID-1,z+1);
      this.data[i+1] = (this.data[(z*GRID+x1)*4] - this.data[(z*GRID+x0)*4]) / ((x1-x0)*dx);
      this.data[i+2] = (this.data[(z1*GRID+x)*4] - this.data[(z0*GRID+x)*4]) / ((z1-z0)*dz);
      this.data[i+3] = 1;
    }
    this.texture.needsUpdate = true;
  }

  sample(x: number, z: number, out = new THREE.Vector3()) {
    const px = THREE.MathUtils.clamp(x / RESIN_WIDTH + 0.5,0,1) * (GRID-1);
    const pz = THREE.MathUtils.clamp(z / RESIN_DEPTH + 0.5,0,1) * (GRID-1);
    const bx = Math.floor(px), bz = Math.floor(pz);
    const weights = (f: number) => [(1-f)**3/6,(4-6*f*f+3*f*f*f)/6,(1+3*f+3*f*f-3*f*f*f)/6,f*f*f/6];
    const wx = weights(px-bx), wz = weights(pz-bz);
    out.set(0,0,0);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const index = (THREE.MathUtils.clamp(bz+j-1,0,GRID-1)*GRID + THREE.MathUtils.clamp(bx+i-1,0,GRID-1))*4;
      const w = wx[i]*wz[j]; out.x += this.data[index]*w; out.y += this.data[index+1]*w; out.z += this.data[index+2]*w;
    }
    return out;
  }

  reshape(geometry: THREE.SphereGeometry, original: Float32Array, seed: number) {
    const positions = geometry.attributes.position;
    const sample = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      const ox = original[i*3], oy = original[i*3+1], oz = original[i*3+2];
      const angle = Math.atan2(oz,ox);
      const edge = 1 + Math.sin(angle*5+seed)*0.025 + Math.cos(angle*9)*0.012;
      const x = ox * 5.4 * edge, z = oz * 4.7 * edge;
      const top = this.sample(x,z,sample).x;
      positions.setXYZ(i,x,oy>=0 ? 0.05+smooth(0,0.28,oy)*(top-0.05) : 0.05-smooth(0,0.32,-oy)*1.5,z);
    }
    positions.needsUpdate = true; geometry.computeVertexNormals();
    const normals = geometry.attributes.normal;
    const normal = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      const oy = original[i*3+1];
      if (oy >= 0.28) {
        this.sample(positions.getX(i),positions.getZ(i),sample);
        normal.set(-sample.y,1,-sample.z).normalize(); normals.setXYZ(i,normal.x,normal.y,normal.z);
      } else if (oy <= -0.32) normals.setXYZ(i,0,-1,0);
    }
    normals.needsUpdate = true; geometry.computeBoundingSphere();
  }
  dispose() { this.texture.dispose(); }
}
