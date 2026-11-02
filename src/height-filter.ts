const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

export function soften(input: Float32Array, width: number, height: number, radius: number) {
  let source=new Float32Array(input);
  if (radius<1) return source;
  // Three box passes approximate a Gaussian, in linear time and float precision.
  for (let pass=0;pass<3;pass++) {
    const horizontal=new Float32Array(source.length), output=new Float32Array(source.length);
    for (let y=0;y<height;y++) {
      let sum=0;
      for(let k=-radius;k<=radius;k++)sum+=source[y*width+clamp(k,0,width-1)];
      for(let x=0;x<width;x++) {
        horizontal[y*width+x]=sum/(radius*2+1);
        sum+=source[y*width+clamp(x+radius+1,0,width-1)]-source[y*width+clamp(x-radius,0,width-1)];
      }
    }
    for (let x=0;x<width;x++) {
      let sum=0;
      for(let k=-radius;k<=radius;k++)sum+=horizontal[clamp(k,0,height-1)*width+x];
      for(let y=0;y<height;y++) {
        output[y*width+x]=sum/(radius*2+1);
        sum+=horizontal[clamp(y+radius+1,0,height-1)*width+x]-horizontal[clamp(y-radius,0,height-1)*width+x];
      }
    }
    source=output;
  }
  return source;
}
