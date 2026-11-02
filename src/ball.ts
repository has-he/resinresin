import * as THREE from 'three';
import {randomFromSeed} from './random';

export interface BallSettings {
  seed:number; ballDeformation:number; ballFrequency:number; ballTwist:number; ballFlattening:number;
  smoothing:number; foldLips:number; lipRounding:number;
}
export type LoopAxis='x'|'y'|'z';
export const BALL_RADIUS=5.4;
export const createResinUniforms=()=>({
  resinShape:{value:0},
  resinWorldToLocal:{value:new THREE.Matrix4()},
  resinNormalToWorld:{value:new THREE.Matrix3()},
  resinBallForm:{value:new THREE.Vector4()},
  resinBallDetail:{value:new THREE.Vector3()},
  resinBallPhases:{value:new THREE.Vector3()},
});
export type ResinUniforms=ReturnType<typeof createResinUniforms>;

const turn=(n:number)=>((n%1)+1)%1;
/** Absolute phase, rather than incremental rotations, closes every full turn. */
export function resinRotation(x:number,y:number,z:number,axis:LoopAxis,phase:number,out=new THREE.Quaternion()) {
  const base=new THREE.Euler(turn(x/360)*Math.PI*2,turn(y/360)*Math.PI*2,turn(z/360)*Math.PI*2,'XYZ');
  const direction=new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0);
  return out.setFromEuler(base).multiply(new THREE.Quaternion().setFromAxisAngle(direction,turn(phase)*Math.PI*2));
}

// The CPU shell and the fragment normal use the same smooth radial field.
// A positive radius and an invertible twist keep the shell closed, even at
// strong deformation. The field stays continuous across the UV seam and poles.
export const ballGLSL=/* glsl */`
uniform int resinShape;
uniform mat4 resinWorldToLocal;
uniform mat3 resinNormalToWorld;
uniform vec4 resinBallForm;
uniform vec3 resinBallDetail;
uniform vec3 resinBallPhases;
float resinBallRadius(vec3 d) {
  float f=3.4*resinBallForm.y/(1.0+resinBallDetail.z*0.2+abs(resinBallForm.z)*0.85);
  float a=dot(d,vec3(0.9,0.55,0.4))*f+resinBallPhases.x;
  float b=dot(d,vec3(-0.3,0.8,0.9))*f+resinBallPhases.y;
  float c=dot(d,vec3(0.7,-0.6,0.85))*f*1.7+resinBallPhases.z;
  float n=0.58*sin(a)*sin(b)+0.26*sin(c)+0.16*cos((d.x-d.z)*f*1.9+resinBallPhases.y);
  float distance=d.x+0.17*sin(d.z*3.0+resinBallPhases.y)-0.14;
  float tip=0.025+resinBallDetail.y*0.09;
  float ridge=exp(-(sqrt(distance*distance+tip*tip)-tip)/0.1);
  float recess=0.5*exp(-pow((distance+0.12)/0.075,2.0));
  return 5.4*exp(resinBallForm.x*0.38*n+0.08*resinBallDetail.x*(ridge-recess));
}
float resinBallField(vec3 p) {
  p.y/=resinBallForm.w;
  float lengthP=max(length(p),0.0001);
  float a=resinBallForm.z*p.y/lengthP;
  float c=cos(a),s=sin(a);
  p.xz=mat2(c,s,-s,c)*p.xz;
  return lengthP-resinBallRadius(p/lengthP);
}
vec3 resinBallNormal(vec3 p) {
  vec3 e=vec3(0.004,0.0,0.0);
  return normalize(vec3(
    resinBallField(p+e.xyy)-resinBallField(p-e.xyy),
    resinBallField(p+e.yxy)-resinBallField(p-e.yxy),
    resinBallField(p+e.yyx)-resinBallField(p-e.yyx)));
}
vec3 resinLocalPoint(vec3 point) { return (resinWorldToLocal*vec4(point,1.0)).xyz; }
`;

export class ResinBall {
  private settings!:BallSettings;
  private phases=new THREE.Vector3();
  update(settings:BallSettings,uniforms:ResinUniforms) {
    this.settings={...settings};const random=randomFromSeed(settings.seed+1493);
    this.phases.set(random()*Math.PI*2,random()*Math.PI*2,random()*Math.PI*2);
    uniforms.resinBallPhases.value.copy(this.phases);
    uniforms.resinBallForm.value.set(settings.ballDeformation,settings.ballFrequency,settings.ballTwist,settings.ballFlattening);
    uniforms.resinBallDetail.value.set(settings.foldLips,settings.lipRounding,settings.smoothing);
  }
  radius(x:number,y:number,z:number) {
    const s=this.settings,p=this.phases,f=3.4*s.ballFrequency/(1+s.smoothing*0.2+Math.abs(s.ballTwist)*0.85);
    const a=(x*0.9+y*0.55+z*0.4)*f+p.x,b=(-x*0.3+y*0.8+z*0.9)*f+p.y,c=(x*0.7-y*0.6+z*0.85)*f*1.7+p.z;
    const n=0.58*Math.sin(a)*Math.sin(b)+0.26*Math.sin(c)+0.16*Math.cos((x-z)*f*1.9+p.y);
    const distance=x+0.17*Math.sin(z*3+p.y)-0.14,tip=0.025+s.lipRounding*0.09;
    const ridge=Math.exp(-(Math.sqrt(distance*distance+tip*tip)-tip)/0.1),recess=0.5*Math.exp(-(((distance+0.12)/0.075)**2));
    return BALL_RADIUS*Math.exp(s.ballDeformation*0.38*n+0.08*s.foldLips*(ridge-recess));
  }
  point(direction:THREE.Vector3,out=new THREE.Vector3()) {
    // Sample the twisted radius on an evenly spaced sphere. Twisting vertex
    // positions themselves shears the tessellation at extreme settings.
    const a=this.settings.ballTwist*direction.y,c=Math.cos(a),s=Math.sin(a);
    const r=this.radius(c*direction.x-s*direction.z,direction.y,s*direction.x+c*direction.z);
    return out.set(direction.x*r,direction.y*r*this.settings.ballFlattening,direction.z*r);
  }
  field(x:number,y:number,z:number) {
    y/=this.settings.ballFlattening;const length=Math.max(0.0001,Math.hypot(x,y,z)),a=this.settings.ballTwist*y/length,c=Math.cos(a),s=Math.sin(a);
    const qx=c*x-s*z,qz=s*x+c*z;
    return length-this.radius(qx/length,y/length,qz/length);
  }
  normal(p:THREE.Vector3,out=new THREE.Vector3()) {
    const e=0.004,x=p.x,y=p.y,z=p.z;
    return out.set(this.field(x+e,y,z)-this.field(x-e,y,z),this.field(x,y+e,z)-this.field(x,y-e,z),this.field(x,y,z+e)-this.field(x,y,z-e)).normalize();
  }
  reshape(geometry:THREE.SphereGeometry,original:Float32Array) {
    const position=geometry.attributes.position,normal=geometry.attributes.normal,d=new THREE.Vector3(),p=new THREE.Vector3(),n=new THREE.Vector3();
    for(let i=0;i<position.count;i++) {
      d.fromArray(original,i*3).normalize();this.point(d,p);this.normal(p,n);
      position.setXYZ(i,p.x,p.y,p.z);normal.setXYZ(i,n.x,n.y,n.z);
    }
    position.needsUpdate=true;normal.needsUpdate=true;geometry.computeBoundingSphere();geometry.computeBoundingBox();
  }
}
