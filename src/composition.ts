import {randomFromSeed} from './random';

export interface LayerPose {x:number;z:number;depth:number;scale:number;rotation:number;tilt:number}
export interface CompositionLayer {id:string;kind:'image'|'model';pose:LayerPose}
export interface CompositionSnapshot {seed:number;poses:{id:string;pose:LayerPose}[]}
export function capturePose(layer:LayerPose):LayerPose {
  return {x:layer.x,z:layer.z,depth:layer.depth,scale:layer.scale,rotation:layer.rotation,tilt:layer.tilt};
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const degrees=(v:number)=>((v+180)%360+360)%360-180;

/** Start from a stable user arrangement, so repeated clicks cannot accumulate drift. */
export function randomizePoses(seed:number,layers:CompositionLayer[]) {
  const random=randomFromSeed(seed^0x2d863b);
  return layers.map(layer=>{
    const p=layer.pose, image=layer.kind==='image';
    return {id:layer.id,pose:{
      x:clamp(p.x+(random()-0.5)*(image?1.2:1.8),-3,3),
      z:clamp(p.z+(random()-0.5)*(image?1.0:1.6),-3,3),
      scale:clamp(p.scale*(0.88+random()*0.24),0.1,3),
      rotation:degrees(p.rotation+(random()-0.5)*(image?36:120)),
      // Preserve the chosen vertical fit and upright orientation inside the resin.
      depth:p.depth,tilt:p.tilt,
    }};
  });
}
