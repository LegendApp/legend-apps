import { gpuImage, gpuNumber, gpuProgram, gpuQuad } from "./GPU";
import type { ImageShatterGeometry } from "./ImageShatter";

export function createImageShatterGPU(geometry: ImageShatterGeometry, width: number, height: number, revealAtStep: number) {
  const { imageWidth, imageHeight, centerX, centerY, scale = 1.18, radius = 18 } = geometry;
  if (imageWidth <= 0 || imageHeight <= 0 || scale <= 0 || radius < 0 || width <= 0 || height <= 0) throw new Error("Invalid image shatter geometry");
  const n = gpuNumber;
  return gpuProgram(`${gpuImage}${gpuQuad}
const halfSize=vec2f(${n(imageWidth/2)},${n(imageHeight/2)});
const center=vec2f(${n(centerX)},${n(centerY)});
const camera=${n(scale)};
const resolution=vec2f(${n(width)},${n(height)});
const reveal=${n(revealAtStep)};
fn screenshot(p:vec2f)->vec4f {
  let mask=1.0-smoothstep(-1.0,1.0,roundedBox(p,halfSize,${n(radius)}));
  return textureSampleLevel(imageTexture,imageSampler,(p+halfSize)/(halfSize*2.0),0.0)*mask;
}
@fragment fn fragmentMain(in:Surface)->@location(0) vec4f {
  let p=(in.uv*resolution-center)/camera;
  if(clock.step==reveal) {
    let entrance=smoothstep(0.0,0.65,clock.time);
    return screenshot((p-vec2f(0,48.0*(1.0-entrance)))/mix(0.9,1.0,entrance))*entrance;
  }
  if(clock.step!=reveal+1.0 || clock.time>3.2) { return vec4f(0); }
  let flash=exp(-clock.time*14.0)*exp(-length(p)/430.0)*min(clock.time*50.0,1.0);
  return vec4f(vec3f(0.5,0.85,1)*flash,flash);
}
struct Shard { @builtin(position) position:vec4f, @location(0) cell:vec2f,
 @location(1) @interpolate(flat) id:u32 }
@vertex fn particleVertex(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->Shard {
  let cell=id/2u; let x=f32(cell%5u); let y=f32(cell/5u);
  let halfCell=halfSize/vec2f(5,4);
  let side=select(-1.0,1.0,id%2u==1u);
  let diagonal=select(-1.0,1.0,(cell%5u+cell/5u)%2u==1u);
  let offset=vec2f(side*diagonal*halfCell.x/3.0,-side*halfCell.y/3.0);
  let home=-halfSize+halfCell+vec2f(x,y)*halfCell*2.0+offset;
  let seed=fract(sin(f32(id)*78.23+1.0)*43758.54);
  let t=clock.time;
  let destination=home+vec2f(home.x*(0.6+seed),-240.0-seed*420.0)*t+vec2f(0,720.0*t*t);
  let point=corner(vertex)*(halfCell+2.0);
  var screen=center+camera*(destination+rotate(point-offset,(seed-0.5)*t*11.0));
  if(clock.step!=reveal+1.0 || t>3.2) {screen=vec2f(-100000);}
  return Shard(vec4f(screen/resolution*vec2f(2,-2)+vec2f(-1,1),0,1),point,id);
}
@fragment fn particleFragment(in:Shard)->@location(0) vec4f {
  let cell=in.id/2u; let halfCell=halfSize/vec2f(5,4);
  let side=select(-1.0,1.0,in.id%2u==1u);
  let diagonal=select(-1.0,1.0,(cell%5u+cell/5u)%2u==1u);
  let cut=side*dot(in.cell,normalize(vec2f(-halfCell.y*diagonal,halfCell.x)));
  let distance=max(roundedBox(in.cell,halfCell,0.0),cut);
  let mask=1.0-smoothstep(-1.0,1.0,distance);
  let home=-halfSize+halfCell+vec2f(f32(cell%5u),f32(cell/5u))*halfCell*2.0;
  let piece=screenshot(in.cell+home)*mask;
  let glint=exp(-abs(distance)*1.3)*piece.a*(0.5+0.5*sin(clock.time*17.0+f32(in.id)))*min(clock.time*8.0,1.0);
  return vec4f(min(piece.rgb+vec3f(0.45,0.85,1)*glint,vec3f(piece.a)),piece.a);
}
`);
}
