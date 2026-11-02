import {test,expect} from '@playwright/test';
import {randomizePoses,type CompositionLayer} from '../src/composition';

test('composition seeds are repeatable, bounded, and do not accumulate source drift',()=>{
  const originals:CompositionLayer[]=[
    {id:'photo',kind:'image',pose:{x:0.2,z:-0.3,scale:1.1,rotation:175,depth:-0.9,tilt:0}},
    {id:'model',kind:'model',pose:{x:2.8,z:-2.9,scale:2.9,rotation:-175,depth:-0.45,tilt:28}},
  ];
  const copy=JSON.parse(JSON.stringify(originals));
  const first=randomizePoses(1234,originals);
  for(let seed=0;seed<60;seed++) {
    const variant=randomizePoses(seed,originals);
    variant.forEach((layer,i)=>{
      expect(Math.abs(layer.pose.x)).toBeLessThanOrEqual(3);expect(Math.abs(layer.pose.z)).toBeLessThanOrEqual(3);
      expect(layer.pose.scale).toBeGreaterThanOrEqual(0.1);expect(layer.pose.scale).toBeLessThanOrEqual(3);
      expect(Math.abs(layer.pose.rotation)).toBeLessThanOrEqual(180);
      expect(layer.pose.depth).toBe(originals[i].pose.depth);expect(layer.pose.tilt).toBe(originals[i].pose.tilt);
    });
  }
  expect(randomizePoses(1234,originals)).toEqual(first);
  expect(randomizePoses(4321,originals)).not.toEqual(first);
  expect(originals).toEqual(copy);
});
