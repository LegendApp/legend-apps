import { gpuNumber, gpuProgram, gpuQuad } from "./GPU";
import type { GlassStrikeGeometry } from "./GlassStrike";

export const glassStrikeData = ["time", "slideTime", "stepIndex", "stepTime", "broken", "resolveToCheck", "settled", "phase", "centerX", "panelHalfHeight", "unused", "unused"] as const;
export const glassStrikeParticleCount = 55;

export function createGlassStrikeGPU(width: number, height: number, geometry: GlassStrikeGeometry = {}) {
  const { centerY = 300, halfWidth = 251, radius = 40, scale = 1,
    strikeTint = [1,0.045,0.025], checkTint = [0.12,0.95,0.38],
    strokePoints = [[-302,-240],[306,238],[298,-245],[-309,246]] } = geometry;
  const n = gpuNumber;
  if (strokePoints.length !== 4 || ![width,height,centerY,halfWidth,radius,scale,...strokePoints.flat()].every(Number.isFinite) ||
      width <= 0 || height <= 0 || halfWidth <= 0 || radius < 0 || scale <= 0 ||
      [...strikeTint,...checkTint].some(v=>!Number.isFinite(v) || v<0 || v>1)) throw new Error("Invalid glass strike geometry");
  return gpuProgram(`${gpuQuad}
@group(0) @binding(5) var<storage,read> data:array<vec4f>;
const resolution=vec2f(${n(width)},${n(height)});
const halfWidth=${n(halfWidth)}; const radius=${n(radius)}; const scale=${n(scale)};
const strikeTint=vec3f(${strikeTint.map(n).join(",")}); const checkTint=vec3f(${checkTint.map(n).join(",")});
const strokes=array<vec2f,4>(${strokePoints.map(p=>`vec2f(${p.map(n).join(",")})`).join(",")});
fn elapsed()->f32 { return min(mix(data[0].x,6.0,data[1].z),6.0); }
fn flight()->f32 { return max(elapsed()-0.38,0.0); }
fn resolve()->f32 { return data[1].y*data[1].x*smoothstep(1.2,2.2,elapsed()); }
fn hash(n:f32)->f32 { return fract(sin(n*127.1+311.7)*43758.5453); }
fn size()->vec2f { return vec2f(halfWidth,data[2].y+radius); }
fn origin()->vec2f { return vec2f(data[2].x,${n(centerY)}); }
fn glass(p:vec2f,clock:f32)->vec4f {
  let dimensions=size(); let d=roundedBox(p,dimensions,radius);
  let mask=1.0-smoothstep(-0.8,0.8,d); let uv=p/dimensions;
  let top=exp(-pow((uv.y+0.92)/0.40,2.0)); let bottom=exp(-pow((uv.y-0.92)/0.28,2.0));
  let axis=(uv.y+uv.x*0.42+0.35*sin(clock*0.23))/0.65; let sweep=exp(-axis*axis);
  let body=vec3f(0.96,0.97,0.98)*(0.085+0.035*top+0.018*sweep)*0.75;
  let angle=atan2(p.y,p.x); let lightAngle=2.3+clock*0.130899694;
  let direction=pow(0.5+0.5*cos(angle-lightAngle),4.0); let counter=pow(0.5+0.5*cos(angle-lightAngle+3.1),6.0);
  let edge=exp(-abs(d+0.7)*1.8); let bevel=exp(-abs(d+3.0)*0.48)*mask;
  let caustic=exp(-abs(d+8.0)*0.30)*mask; let outside=exp(-max(d,0.0)*0.18)*(1.0-mask);
  let reflection=edge*(0.22+0.58*direction+0.28*counter)+bevel*(0.04+0.13*direction)+caustic*(0.018+0.07*counter);
  let rgb=body*mask+vec3f(1,0.985,0.96)*reflection+vec3f(0.90,0.95,1)*bottom*mask*0.025+vec3f(0.95,0.97,1)*outside*0.025;
  let alpha=clamp(mask*(0.32+0.06*top+0.025*sweep)+reflection+outside*0.055,0.0,1.0);
  return vec4f(min(rgb,vec3f(alpha)),alpha);
}
fn stroke(p:vec2f,a:vec2f,b:vec2f,progress:f32)->f32 {
  let v=(b-a)*max(progress,0.001); return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
fn endpoints()->mat4x2f {
  let r=resolve(); return mat4x2f(mix(strokes[0],vec2f(-92,108),r),mix(strokes[1],vec2f(-25,178),r),
    mix(strokes[2],vec2f(104,66),r),mix(strokes[3],vec2f(-25,178),r));
}
@fragment fn fragmentMain(in:Surface)->@location(0) vec4f { return vec4f(0); }
struct Piece { @builtin(position) position:vec4f, @location(0) local:vec2f,
 @location(1) @interpolate(flat) id:u32, @location(2) parameters:vec4f }
@vertex fn particleVertex(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->Piece {
  let c=corner(vertex); let f=flight(); let t=1.0-exp(-f*3.8);
  let impact=data[1].x*step(0.38,elapsed()); var position=vec2f(0); var local=vec2f(0); var parameters=vec4f(0);
  var visible=true;
  if(id<18u) {
    let i=f32(id); let start=i+select((hash(i+7.0)-0.5)*0.55,0.0,id==0u);
    let end=i+1.0+select((hash(i+8.0)-0.5)*0.55,0.0,id==17u);
    let a=start/18.0*6.283185-3.141593; let wedge=(end-start)*6.283185/18.0;
    let random=hash(i+data[1].w); let extent=length(size())+1.0;
    let offset=vec2f(cos(a+wedge*0.5),sin(a+wedge*0.5))*((30.0+random*145.0)*t+f*35.0)+vec2f(0,f*f*(140.0+70.0*random));
    let spin=(random-0.5)*(t*1.1+f*1.6);
    local=c*select(vec2f(extent),size()+120.0,impact<0.5);
    position=select(offset+rotate(local,spin),local,impact<0.5);
    parameters=vec4f(a,wedge,impact,0); visible=select(f<4.0,id==0u,impact<0.5);
  } else if(id<30u) {
    let j=f32(id-18u); let a=j*2.39996; let random=hash(j+41.0);
    let center=vec2f(cos(a),sin(a))*(180.0+t*(80.0+random*140.0))+vec2f(0,f*f*(160.0+random*80.0));
    local=c*24.0; position=center+rotate(local,a+f*3.0); parameters.x=4.0+random*7.0;
    visible=impact>0.5 && f<4.0;
  } else if(id==30u) {
    // Preserve draw order: panel/shards, strike, then emitted sparks.
    let points=endpoints(); let low=min(min(points[0],points[1]),min(points[2],points[3]))-180.0;
    let high=max(max(points[0],points[1]),max(points[2],points[3]))+180.0;
    local=mix(low,high,(c+1.0)*0.5); position=local; visible=data[1].x>0.5;
  } else {
    let k=f32(id-31u); let seed=hash(k+71.0); let age=fract(data[0].x*0.85+seed);
    let points=endpoints(); let along=hash(k+23.0);
    let source=select(mix(points[2],points[3],along),mix(points[0],points[1],along),k<12.0);
    let angle=hash(k+107.0)*6.283185; let velocity=vec2f(cos(angle),sin(angle))*(45.0+seed*100.0);
    local=c*48.0; position=source+velocity*age+vec2f(0,age*age*45.0)+local; parameters.x=age;
    visible=data[1].x>0.5 && elapsed()>0.38;
  }
  position=origin()+position*scale;
  visible=visible && data[1].x>0.5;
  if(!visible) { position=vec2f(-100000); }
  return Piece(vec4f(position/resolution*vec2f(2,-2)+vec2f(-1,1),0,1),local,id,parameters);
}
@fragment fn particleFragment(in:Piece)->@location(0) vec4f {
  let p=in.local; let id=in.id; let r=resolve(); let time=data[0].x;
  let pulse=0.5+0.5*sin(time*mix(7.0,3.5,r)); let tint=mix(strikeTint,checkTint,r);
  let visibility=1.0-(1.0-data[1].y)*smoothstep(0.9,1.5,elapsed());
  if(id<18u) {
    if(in.parameters.z<0.5) { return glass(p,data[0].y+data[1].w); }
    if(roundedBox(p,size(),radius)>=1.0) { return vec4f(0); }
    let theta=atan2(p.y,p.x); let a=in.parameters.x; let width=in.parameters.y;
    if(theta<a || theta>=a+width) { return vec4f(0); }
    var shard=glass(p,0.38+data[1].w); let edge=exp(-length(p)*min(theta-a,a+width-theta)*0.85);
    shard=vec4f(shard.rgb+vec3f(0.52,0.82,1)*edge*shard.a,shard.a); return shard;
  }
  if(id<30u) {
    let triangle=max(abs(p.x)*0.866+p.y*0.5,-p.y)-in.parameters.x;
    let alpha=1.0-smoothstep(-0.5,0.7,triangle); return vec4f(vec3f(0.58,0.84,1)*alpha,alpha);
  }
  if(id==30u) {
    let points=endpoints(); let first=clamp(elapsed()/0.17,0.0,1.0); let second=clamp((elapsed()-0.21)/0.17,0.0,1.0);
    let distance=min(stroke(p,points[0],points[1],first)+10000.0*(1.0-step(0.001,first)),stroke(p,points[2],points[3],second)+10000.0*(1.0-step(0.001,second)));
    let roughness=sin(p.x*0.15+p.y*0.22)*0.8+sin(p.y*0.43)*0.6;
    let thickness=mix(17.0,11.0,r)+pulse*3.5;
    let line=1.0-smoothstep(thickness+roughness,thickness+4.0+roughness,distance);
    let core=exp(-distance*distance*0.035); let glow=exp(-distance*0.045)*(0.60+pulse*0.25);
    let alpha=clamp(line+glow,0.0,1.0)*visibility;
    let shimmer=pow(0.5+0.5*sin(p.x*0.045+p.y*0.025-time*mix(12.0,5.0,r)),8.0);
    return vec4f(mix(tint,vec3f(1,0.96,0.8),clamp(core*0.6+shimmer*0.7,0.0,1.0))*alpha,alpha);
  }
  let life=sin(in.parameters.x*3.141593)*(0.75+pulse*0.25)*visibility;
  let dist=length(p); let spark=(exp(-dist*dist/5.0)+0.25*exp(-dist*0.24))*life;
  return vec4f(mix(tint,mix(vec3f(1,0.92,0.64),vec3f(0.65,1,0.78),r),0.45)*spark,spark);
}
@group(1) @binding(0) var fieldSampler:sampler;
@group(1) @binding(1) var fieldTexture:texture_2d<f32>;
@fragment fn compositeFragment(in:Surface)->@location(0) vec4f {
  let result=textureSampleLevel(fieldTexture,fieldSampler,in.uv,0.0);
  let flash=data[1].x*step(0.38,elapsed())*exp(-flight()*12.0)*exp(-length((in.uv*resolution-origin())/scale)*0.009);
  let alpha=max(result.a,flash); return vec4f(min(result.rgb+vec3f(0.38,0.58,0.68)*flash,vec3f(alpha)),alpha);
}
`);
}
