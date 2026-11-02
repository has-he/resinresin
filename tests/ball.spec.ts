import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {ResinBall,createResinUniforms,resinRotation,type LoopAxis} from '../src/ball';

const settings={seed:42,ballDeformation:1.2,ballFrequency:1,ballTwist:0.5,ballFlattening:0.58,smoothing:0.8,foldLips:0.3,lipRounding:0.45};
test('deformed balls remain closed with outward continuous normals through extreme warps',()=>{
  const ball=new ResinBall(),uniforms=createResinUniforms(),geometry=new THREE.SphereGeometry(1,320,240);
  const original=new Float32Array(geometry.attributes.position.array);
  for(const variant of [settings,{...settings,ballDeformation:2,ballFrequency:2.5,ballTwist:3,ballFlattening:0.3,lipRounding:0},{...settings,seed:871,ballTwist:-3,ballFlattening:1.3},{...settings,seed:901,ballDeformation:2,ballFrequency:2.5,ballTwist:-3,ballFlattening:0.3,smoothing:0,foldLips:1,lipRounding:0}]) {
    ball.update(variant,uniforms);ball.reshape(geometry,original);
    const p=geometry.attributes.position,n=geometry.attributes.normal,index=geometry.index!;
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),cross=new THREE.Vector3(),normal=new THREE.Vector3();
    let minimumFacing=1,maximumField=0;
    for(let i=0;i<p.count;i+=53){a.fromBufferAttribute(p,i);maximumField=Math.max(maximumField,Math.abs(ball.field(a.x,a.y,a.z)));expect(n.getX(i)**2+n.getY(i)**2+n.getZ(i)**2).toBeCloseTo(1,5);}
    for(let i=0;i<index.count;i+=3){
      a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));
      cross.crossVectors(b.sub(a),c.sub(a));if(cross.lengthSq()<1e-12)continue;
      normal.fromBufferAttribute(n,index.getX(i)).add(new THREE.Vector3().fromBufferAttribute(n,index.getX(i+1))).add(new THREE.Vector3().fromBufferAttribute(n,index.getX(i+2))).normalize();
      minimumFacing=Math.min(minimumFacing,cross.normalize().dot(normal));
    }
    expect(maximumField).toBeLessThan(0.0001);expect(minimumFacing).toBeGreaterThan(0);
    // Duplicate UV seam vertices must still meet exactly in object space.
    for(let row=1;row<240;row+=7){a.fromBufferAttribute(p,row*321);b.fromBufferAttribute(p,row*321+320);expect(a.distanceTo(b)).toBeLessThan(0.00001);}
  }
  geometry.dispose();
});

test('ball normals agree with independently differentiated surface tangents',()=>{
  const ball=new ResinBall();ball.update({...settings,ballDeformation:2,ballFrequency:2.5,ballTwist:3},createResinUniforms());
  let maximumError=0;
  for(let i=1;i<180;i++) {
    const d=new THREE.Vector3(Math.sin(i*0.731),Math.cos(i*0.371),Math.sin(i*0.231)).normalize();
    const u=new THREE.Vector3().crossVectors(d,new THREE.Vector3(0,1,0)).normalize(),v=new THREE.Vector3().crossVectors(d,u),e=0.00001;
    const tangent=(axis:THREE.Vector3)=>ball.point(d.clone().addScaledVector(axis,e).normalize()).sub(ball.point(d.clone().addScaledVector(axis,-e).normalize()));
    const expected=tangent(u).cross(tangent(v)).normalize();maximumError=Math.max(maximumError,expected.angleTo(ball.normal(ball.point(d))));
  }
  expect(maximumError).toBeLessThan(0.02);
});

test('absolute resin rotations close exactly after each full turn on all axes',()=>{
  for(const axis of ['x','y','z'] as LoopAxis[]) {
    expect(resinRotation(23,-67,19,axis,1).toArray()).toEqual(resinRotation(23,-67,19,axis,0).toArray());
    for(const phase of [0.125,0.5,0.875])expect(Math.abs(resinRotation(23,-67,19,axis,phase).dot(resinRotation(23,-67,19,axis,phase+1)))).toBeCloseTo(1,12);
    expect(resinRotation(23,-67,19,axis,0.5).angleTo(resinRotation(23,-67,19,axis,0))).toBeCloseTo(Math.PI,10);
  }
});
