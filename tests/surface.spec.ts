import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {ResinSurface} from '../src/surface';

const settings={seed:42,distortion:0.72,frequency:1.4,smoothing:0.8,wrap:0,coatThickness:0.3};
test('continuous resin normals agree with independent height differences and smoothing reduces curvature',()=>{
  const surface=new ResinSurface();surface.update(settings);
  let maximumError=0;
  for(let x=-2.5;x<2.5;x+=0.33)for(let z=-2;z<2;z+=0.41){
    const e=0.002;
    const dx=(surface.sample(x+e,z).x-surface.sample(x-e,z).x)/(2*e);
    const dz=(surface.sample(x,z+e).x-surface.sample(x,z-e).x)/(2*e);
    const field=surface.sample(x,z);
    const expected=new THREE.Vector3(-dx,1,-dz).normalize();
    const normal=new THREE.Vector3(-field.y,1,-field.z).normalize();
    maximumError=Math.max(maximumError,expected.angleTo(normal));
  }
  expect(maximumError).toBeLessThan(0.025);
  const variation=()=>{
    let result=0,previous:THREE.Vector3|undefined;
    for(let x=-3;x<=3;x+=0.02){const p=surface.sample(x,0.7);const n=new THREE.Vector3(-p.y,1,-p.z).normalize();if(previous)result+=previous.angleTo(n);previous=n;}
    return result;
  };
  surface.update({...settings,smoothing:0});const sharp=variation();
  surface.update({...settings,smoothing:1});const soft=variation();
  expect(soft).toBeLessThan(sharp*0.85);
  surface.dispose();
});
