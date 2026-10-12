import { gpuImage, gpuNumber, gpuProgram, gpuQuad } from "./GPU";

export function createFallingSpritesGPU(width: number, barHeight: number, floorY: number, spriteScale = 1) {
  if (width <= 0 || barHeight < 0 || floorY <= 0 || !Number.isFinite(spriteScale) || spriteScale <= 0) throw new Error("Invalid falling sprite geometry");
  const lanes = Math.ceil(width / 92), rows = Math.ceil((floorY + 110) / 20);
  const n = gpuNumber;
  return { particleCount: lanes * (1 + rows * 6), code: gpuProgram(`${gpuImage}${gpuQuad}
const fireWidth=${n(width)};
const sourceY=${n(184+barHeight*.5)};
const floorY=${n(floorY)};
const resolution=vec2f(${n(width+256)},${n(floorY+24)});
const perLane=${1+rows*6}u;
@fragment fn fragmentMain(in:Surface)->@location(0) vec4f { return vec4f(0); }
struct Sprite { @builtin(position) position:vec4f, @location(0) uv:vec2f, @location(1) y:f32 }
@vertex fn particleVertex(@builtin(vertex_index) vertex:u32,@builtin(instance_index) instance:u32)->Sprite {
  let id=f32(instance/perLane); let item=instance%perLane;
  let seed=hash2(vec2f(id,83)); let release=0.55+seed*0.25;
  let period=release+sqrt(max(1.0,floorY-sourceY-24.0)/510.0)+0.85;
  let local=clock.time-0.6-fract(id*0.381966)*period;
  let cycle=floor(max(local,0.0)/period); let age=local-cycle*period;
  let origin=(id+0.25+seed*0.5)*92.0;
  var center=vec2f(-100000); var size=vec2f(0); var angle=0.0;
  let generation=select(f32((item-1u)/6u),cycle,item==0u);
  let variation=hash2(vec2f(id,generation+57.0)); let bigSize=(42.0+63.0*variation*variation)*${n(spriteScale)};
  let ground=floorY-generation*20.0;
  let impact=release+sqrt(max(1.0,ground-bigSize*0.4-sourceY)/510.0);
  if(local>=0.0 && origin>=8.0 && origin<=fireWidth-8.0) {
    if(item==0u) {
      if(age<impact) {
        let detached=max(age-release,0.0);
        let stretch=smoothstep(release*0.6,release,age)*(1.0-smoothstep(0.0,0.2,detached));
        size=bigSize*max(0.15,smoothstep(0.0,release,age))*vec2f(1.0-stretch*0.15,1.0+stretch*0.18);
        center=vec2f(origin,sourceY+510.0*detached*detached);
        angle=sin(detached*4.0+seed*8.0)*detached*0.22;
      }
    } else if(generation<=cycle) {
      let hit=local-generation*period-impact;
      let bead=f32((item-1u)%6u); let beadSeed=hash2(vec2f(id+bead*13.0,generation+91.0));
      let smallSize=10.0+bigSize*(0.133333+beadSeed*0.20);
      let vx=(bead-2.5)*46.0*(0.65+beadSeed*0.6); let vy=110.0+beadSeed*155.0;
      let landing=vy/420.0; let flying=min(hit,landing);
      if(hit>=0.0) {
        center=vec2f(origin+vx*flying,ground-smallSize*0.4-select(vy*hit-420.0*hit*hit,0.0,hit>=landing));
        size=vec2f(smallSize); angle=flying*(beadSeed-0.5)*7.0;
      }
    }
  }
  let screen=center+rotate(corner(vertex)*size*0.5,angle)+vec2f(128,0);
  return Sprite(vec4f(screen/resolution*vec2f(2,-2)+vec2f(-1,1),0,1),corner(vertex)*0.5+0.5,screen.y);
}
@fragment fn particleFragment(in:Sprite)->@location(0) vec4f {
  return textureSample(imageTexture,imageSampler,in.uv)*smoothstep(0.0,14.0,in.y);
}
`) };
}
