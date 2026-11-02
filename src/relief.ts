import * as THREE from 'three';
import { soften } from './height-filter';

interface Pixels { width: number; height: number; data: Uint8ClampedArray }
export interface ReliefSettings { enabled: boolean; amount: number; smoothing: number; invert: boolean }
const clamp = THREE.MathUtils.clamp;
const smooth = (v: number) => { const t=clamp(v,0,1); return t*t*(3-2*t); };

function readPixels(image: CanvasImageSource, width: number, height: number): Pixels {
  const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if (!context) throw new Error('Depth-map processing is unavailable.');
  context.drawImage(image,0,0,width,height);
  return {width,height,data:context.getImageData(0,0,width,height).data};
}


export class ImageRelief {
  readonly group=new THREE.Group();
  readonly top: THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
  readonly settings: ReliefSettings={enabled:false,amount:0.8,smoothing:0.65,invert:false};
  sourceName='No depth map';
  sourceKind: 'none'|'emboss'|'depth'='none';
  private source: Pixels;
  private raw: Float32Array | null=null;
  private filtered: Float32Array | null=null;
  private backing: THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;

  constructor(texture: THREE.Texture, readonly width: number, readonly height: number, anisotropy: number) {
    const image=texture.image as HTMLImageElement;
    const ratio=image.width/image.height;
    const w=Math.max(2,Math.round(ratio>=1?256:256*ratio)), h=Math.max(2,Math.round(ratio>=1?256/ratio:256));
    this.source=readPixels(image,w,h);
    texture.anisotropy=anisotropy;
    this.top=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:texture,roughness:0.86,side:THREE.DoubleSide,alphaTest:0.05}));
    this.top.rotation.x=-Math.PI/2;
    this.backing=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({map:texture,color:'#514c3e',roughness:0.88,side:THREE.DoubleSide,alphaTest:0.05}));
    this.backing.visible=false;
    this.top.castShadow=true; this.top.receiveShadow=true; this.backing.castShadow=true;
    this.group.add(this.top,this.backing);
  }

  get hasMap() { return this.raw!==null; }
  generateEmboss() {
    this.raw=this.greyscale(this.source,true);
    this.sourceName='Quick emboss · image brightness'; this.sourceKind='emboss';
    this.settings.enabled=true; this.rebuild();
  }

  async loadDepth(file: File) {
    if(file.size>120*1024*1024)throw new Error('The depth map exceeds the 120 MB file limit.');
    const bitmap=await createImageBitmap(file);
    try { this.raw=this.greyscale(readPixels(bitmap,this.source.width,this.source.height),false); }
    finally { bitmap.close(); }
    this.sourceName=file.name; this.sourceKind='depth'; this.settings.enabled=true; this.rebuild();
  }

  private greyscale(image: Pixels, normalize: boolean) {
    const result=new Float32Array(image.width*image.height); let min=1,max=0;
    for(let i=0;i<result.length;i++) {
      const value=(image.data[i*4]*0.2126+image.data[i*4+1]*0.7152+image.data[i*4+2]*0.0722)/255;
      result[i]=value; min=Math.min(min,value); max=Math.max(max,value);
    }
    if(normalize) for(let i=0;i<result.length;i++)result[i]=max-min>1/255?(result[i]-min)/(max-min):0;
    return result;
  }

  private map(u: number,v: number, values=this.filtered) {
    if(!values)return 0;
    const w=this.source.width,h=this.source.height;
    const x=clamp(u,0,1)*(w-1), y=(1-clamp(v,0,1))*(h-1);
    const x0=Math.floor(x), y0=Math.floor(y), fx=x-x0,fy=y-y0;
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(values[y0*w+x0],values[y0*w+Math.min(w-1,x0+1)],fx),THREE.MathUtils.lerp(values[Math.min(h-1,y0+1)*w+x0],values[Math.min(h-1,y0+1)*w+Math.min(w-1,x0+1)],fx),fy);
  }

  heightAt(x: number,z: number) {
    if(!this.settings.enabled||!this.hasMap)return 0;
    const h=this.map(x/this.width+0.5,0.5-z/this.height);
    return (this.settings.invert?1-h:h)*this.settings.amount;
  }

  /** Sample only enabled reliefs; the caller applies the layer's world transform. */
  coverageAt(x: number,z: number) {
    const u=x/this.width+0.5,v=0.5-z/this.height;
    if(u<0||u>1||v<0||v>1||!this.settings.enabled)return 0;
    const px=clamp(Math.round(u*(this.source.width-1)),0,this.source.width-1);
    const py=clamp(Math.round((1-v)*(this.source.height-1)),0,this.source.height-1);
    const alpha=this.source.data[(py*this.source.width+px)*4+3]/255;
    return alpha*smooth(Math.min(u,1-u,v,1-v)/0.08);
  }

  set<K extends keyof ReliefSettings>(key: K,value: ReliefSettings[K]) { this.settings[key]=value; this.rebuild(); }

  rebuild() {
    this.top.geometry.dispose(); this.backing.geometry.dispose();
    if(!this.settings.enabled||!this.raw) {
      this.top.geometry=new THREE.PlaneGeometry(this.width,this.height);this.top.rotation.x=-Math.PI/2;this.backing.geometry=new THREE.BufferGeometry();this.backing.visible=false;return;
    }
    this.filtered=soften(this.raw,this.source.width,this.source.height,Math.round(this.settings.smoothing*8));
    const sx=Math.max(16,Math.round(160*Math.min(1,this.width/this.height))), sz=Math.max(16,Math.round(160*Math.min(1,this.height/this.width)));
    const positions:number[]=[],uv:number[]=[],indices:number[]=[];
    for(let z=0;z<=sz;z++)for(let x=0;x<=sx;x++) {
      const px=(x/sx-0.5)*this.width,pz=(z/sz-0.5)*this.height;
      positions.push(px,this.heightAt(px,pz),pz);uv.push(x/sx,1-z/sz);
    }
    for(let z=0;z<sz;z++)for(let x=0;x<sx;x++) {
      const a=z*(sx+1)+x,b=a+1,c=a+sx+1,d=c+1;indices.push(a,c,b,b,c,d);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();
    this.top.rotation.x=0; this.top.geometry=geometry;
    const border:number[]=[];
    for(let x=0;x<sx;x++)border.push(x);
    for(let z=0;z<sz;z++)border.push(z*(sx+1)+sx);
    for(let x=sx;x>0;x--)border.push(sz*(sx+1)+x);
    for(let z=sz;z>0;z--)border.push(z*(sx+1));
    const walls:number[]=[];
    for(let i=0;i<border.length;i++) {
      const a=border[i]*3,b=border[(i+1)%border.length]*3;
      const pa=positions.slice(a,a+3),pb=positions.slice(b,b+3),qa=[pa[0],-0.06,pa[2]],qb=[pb[0],-0.06,pb[2]];
      walls.push(...pa,...qa,...pb,...pb,...qa,...qb);
    }
    const x=this.width/2,z=this.height/2,y=-0.06;
    walls.push(-x,y,-z,x,y,-z,-x,y,z,x,y,-z,x,y,z,-x,y,z);
    const body=new THREE.BufferGeometry();body.setAttribute('position',new THREE.Float32BufferAttribute(walls,3));
    const bodyUV:number[]=[];for(let i=0;i<walls.length;i+=3)bodyUV.push(walls[i]/this.width+0.5,0.5-walls[i+2]/this.height);
    body.setAttribute('uv',new THREE.Float32BufferAttribute(bodyUV,2));body.computeVertexNormals();
    this.backing.geometry=body; this.backing.visible=true;
  }
}
