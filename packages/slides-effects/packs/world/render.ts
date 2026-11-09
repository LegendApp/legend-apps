import type { GPUPass, GPURenderGraphDefinition } from "@legend-apps/presentation";
import { instanceField, travelSpeedSlot, WorldInstance, worldClockOffset, worldLightCountSlot, worldLightOffsetSlot, worldLightSize, worldHeaderSize, worldInstanceSize, type PreparedWorldScene, type PrimitiveKind, type WorldScene } from "./scene";
import { depthFadeSlot, trackHeadingSlot } from "./track";
import type { Vec3 } from "./camera";
import { customPostCode, dofEffect, dofSlots, finalCode, fogCode, shaftCode, type CustomGeometry, type SDFGeometry, type WorldPostPass } from "./post";
import { d } from "typegpu";
import { loaderCode } from "./layout";
import { defineWorldEffect, paramsCode, worldEffect, type WorldEffect, type WorldEffectPass, type WorldEffectStage } from "./effects";
import { glyphVertexCount, text3dBuffer, text3dCode, text3dFont } from "./text3d";
import { contactShadowCode, environmentCode, floorMarkingsCode, keyLightCode, type FloorMarkings } from "./lighting";
import { depthCode } from "./post";
import { glyphAtlas, glyphEm, glyphFirst, glyphLast, glyphRange, glyphMetrics, glyphKernings, glyphPixelCount } from "./glyphs";

export const worldBindings = `
struct Frame { time:f32, dt:f32, frame:f32, step:f32, aspect:f32, brightness:f32, slideTime:f32, stepTime:f32 }
@group(0) @binding(0) var<uniform> frame:Frame;
@group(0) @binding(1) var<storage,read> uniforms:array<f32>;
@group(0) @binding(2) var linearSampler:sampler;
fn vector(i:u32)->vec3f { return vec3f(uniforms[i],uniforms[i+1u],uniforms[i+2u]); }
// Euler XYZ pose for rigid World meshes; labels retain their packed text fields.
fn partRotation(base:u32)->mat3x3f {
 let a=vector(base+20u); let c=cos(a); let s=sin(a);
 return mat3x3f(vec3f(c.y*c.z,c.y*s.z,-s.y),
  vec3f(s.x*s.y*c.z-c.x*s.z,s.x*s.y*s.z+c.x*c.z,s.x*c.y),
  vec3f(c.x*s.y*c.z+s.x*s.z,c.x*s.y*s.z-s.x*c.z,c.x*c.y));
}
// The JS course and this window share quintic bends; heading bends integrate slope and retain it beyond the curve.
fn trackCurve(z:f32,at:u32)->f32 { return clamp((uniforms[at]-z)/(uniforms[at]-uniforms[at+1u]),0.,1.); }
fn trackX(z:f32)->f32 {
 let heading=uniforms[${trackHeadingSlot + 2}]>.5;
 var x=uniforms[128];
 if(heading) { x+=uniforms[${trackHeadingSlot}]*(uniforms[${trackHeadingSlot + 1}]-z); }
 for(var i=0u;i<u32(uniforms[129]);i++) {
  let at=130u+i*3u; let u=trackCurve(z,at); var curve=u*u*u*(10.+u*(-15.+6.*u));
  if(heading) { let length=uniforms[at]-uniforms[at+1u]; curve=length*(u*u*u*u*(2.5+u*(-3.+u))+max(0.,(uniforms[at+1u]-z)/length)); }
  x+=uniforms[at+2u]*curve;
 } return x;
}
fn trackSlope(z:f32)->f32 {
 let heading=uniforms[${trackHeadingSlot + 2}]>.5; var s=0.;
 if(heading) { s=-uniforms[${trackHeadingSlot}]; }
 for(var i=0u;i<u32(uniforms[129]);i++) {
  let at=130u+i*3u; let u=trackCurve(z,at); var slope=30.*u*u*(1.-u)*(1.-u)/(uniforms[at]-uniforms[at+1u]);
  if(heading) { slope=u*u*u*(10.+u*(-15.+6.*u)); }
  s-=uniforms[at+2u]*slope;
 } return s;
}
// Parts are sampled on a straight track; bending shifts them sideways onto the curve.
fn bend(p:vec3f)->vec3f { return vec3f(p.x+trackX(p.z),p.y,p.z); }
fn bendNormal(p:vec3f,n:vec3f)->vec3f { return vec3f(n.x,n.y,n.z-trackSlope(p.z)*n.x); }
fn unbend(p:vec3f)->vec3f { return vec3f(p.x-trackX(p.z),p.y,p.z); }
// An explicit mode wins; otherwise use the scene's current focus plane per part.
fn partSharp(base:u32)->bool {
 let mode=uniforms[base+${instanceField.sharp}u];
 if(mode>=0.) { return mode>.5; }
 let depth=dot(bend(vector(base))-vector(0u),cameraForward());
 return abs(depth-uniforms[32])<=max(1.,uniforms[54]);
}
fn cameraForward()->vec3f { return normalize(vector(4u)-vector(0u)); }
fn cameraRight()->vec3f {
 let forward=cameraForward();
 let axis=select(vec3f(0.,1.,0.),vec3f(0.,0.,1.),abs(forward.y)>.99);
 let right=normalize(cross(forward,axis)); let up=cross(right,forward);
 return right*cos(uniforms[7])+up*sin(uniforms[7]);
}
fn cameraUp()->vec3f { return cross(cameraRight(),cameraForward()); }
fn project(p:vec3f)->vec4f {
 let delta=p-vector(0u); let z=dot(delta,cameraForward()); let near=.05; let far=500.;
 return vec4f(dot(delta,cameraRight())/(uniforms[3]*frame.aspect),dot(delta,cameraUp())/uniforms[3],far/(far-near)*z-far*near/(far-near),z);
}
`;
const triangleCorner = `
fn corner(id:u32)->vec2f {
 let corners=array<vec2f,6>(vec2f(0.,0.),vec2f(1.,0.),vec2f(0.,1.),vec2f(0.,1.),vec2f(1.,0.),vec2f(1.,1.));
 return corners[id%6u];
}
`;
const mesh: Record<PrimitiveKind, { count: number; code: string }> = {
  sphere: { count: 6, code: "" },
  box: { count: 36, code: `
  let face=vid/6u; let uv=corner(vid)*2.-1.;
  if(face==0u) { normal=vec3f(1.,0.,0.); point=vec3f(1.,uv.y,uv.x); }
  if(face==1u) { normal=vec3f(-1.,0.,0.); point=vec3f(-1.,uv.y,-uv.x); }
  if(face==2u) { normal=vec3f(0.,1.,0.); point=vec3f(uv.x,1.,uv.y); }
  if(face==3u) { normal=vec3f(0.,-1.,0.); point=vec3f(uv.x,-1.,-uv.y); }
  if(face==4u) { normal=vec3f(0.,0.,1.); point=vec3f(uv.x,uv.y,1.); }
  if(face==5u) { normal=vec3f(0.,0.,-1.); point=vec3f(-uv.x,uv.y,-1.); }
  point*=radius;
` },
  tube: { count: 12 * 6 * 6, code: `
  let cell=vid/6u; let uv=(vec2f(f32(cell%12u),f32(cell/12u))+corner(vid))/vec2f(12.,6.);
  let endpoint=part.endpoint-origin;
  let control=endpoint*.5+vec3f(0.,length(endpoint)*part.curve,0.);
  let t=uv.x; let tangent=normalize(2.*(1.-t)*control+2.*t*(endpoint-control));
  let axis=select(vec3f(0.,1.,0.),vec3f(1.,0.,0.),abs(tangent.y)>.95);
  let right=normalize(cross(tangent,axis)); let up=cross(right,tangent);
  normal=right*cos(uv.y*6.2831853)+up*sin(uv.y*6.2831853);
  point=2.*(1.-t)*t*control+t*t*endpoint+normal*part.thickness;
` },
  ring: { count: 128 * 6 * 6, code: `
  let cell=vid/6u; let uv=(vec2f(f32(cell%128u),f32(cell/128u))+corner(vid))/vec2f(128.,6.);
  let a=uv.x*6.2831853; let b=uv.y*6.2831853; let radial=vec3f(cos(a),0.,sin(a));
  normal=radial*cos(b)+vec3f(0.,sin(b),0.);
  point=radial*radius+normal*part.thickness;
` },
};

/** Key light, environment and the shadow-map binding (when this pass receives shadows). */
type Look = { key?: boolean; environment?: boolean; shadowBinding?: number; shadowCaster?: boolean; shadeAll?: boolean };
function lightingCode(lightCount: number, look: Look = {}) {
  return `${look.key ? keyLightCode(look.shadowBinding, !look.shadeAll) : ""}${look.environment ? environmentCode : ""}
fn eye()->vec3f { return vector(0u); }
/** 1 up to \`depthFade\` world units past the camera target, then falling off; steeper while a station holds under \`heldFade\`. */
fn depthFade(world:vec3f)->f32 {
 let fade=uniforms[${depthFadeSlot}]; if(fade<=0.) { return 1.; }
 let start=uniforms[32]+fade; return pow(start/max(start,length(eye()-world)),3.+6.*uniforms[${depthFadeSlot + 1}]);
}
fn projected(world:vec3f)->vec4f { ${look.shadowCaster ? "let p=keyProject(world); return vec4f(p.xy,clamp(p.z,0.,1.),1.);"
  : "return project(world);"} }
struct Material { albedo:vec3f, emissive:vec3f, roughness:f32, metal:f32 }
struct ShapeContext { time:f32, slideTime:f32, stepTime:f32, step:f32 }
struct ShapeVertex { position:vec3f, normal:vec3f }
/** Runs on through navigation, for ambient motion that must not jump when a step or slide restarts its clock. */
fn continuousTime()->f32 { return uniforms[${worldClockOffset + 3}]; }
/** 0 at rest, rising to 1 at the peak of a camera move between stations. */
fn travelSpeed()->f32 { return uniforms[${travelSpeedSlot}]; }
fn shapeContext()->ShapeContext { return ShapeContext(uniforms[${worldClockOffset}],uniforms[${worldClockOffset}],uniforms[${worldClockOffset + 1}],uniforms[${worldClockOffset + 2}]); }
fn illuminate(world:vec3f,normal:vec3f,material:Material,rimColor:vec3f,rimIntensity:f32,activation:f32)->vec3f {
 let view=normalize(eye()-world); let nv=max(0.,dot(normal,view));
 var color=material.albedo*uniforms[52]+material.emissive*uniforms[18];
 let roughness=clamp(material.roughness,.04,1.); let metal=clamp(material.metal,0.,1.);
 ${!look.key && !look.environment ? `if(uniforms[${worldLightCountSlot}]==0.) { color+=material.albedo*max(0.,dot(normal,normalize(vec3f(-.4,1.,.6))))*.55; }` : ""}
 ${look.key ? "color+=keyLight(world,normal,view,material.albedo,roughness,metal);" : ""}
 ${look.environment ? "color+=environmentLight(normal,view,material.albedo,roughness,metal);" : ""}
 for(var light=0u;light<min(${lightCount}u,u32(uniforms[${worldLightCountSlot}]));light++) {
  let base=u32(uniforms[${worldLightOffsetSlot}])+light*${worldLightSize}u; let delta=vector(base)-world; let distance=max(length(delta),.001); let toward=delta/distance;
  let range=max(.001,uniforms[base+7u]); let cutoff=pow(max(0.,1.-pow(distance/range,4.)),2.);
  let attenuation=cutoff/max(1.,distance*distance);
  var cone=1.; let cosine=uniforms[base+11u];
  if(cosine>-.99) { cone=smoothstep(cosine,min(.9999,cosine+.08),dot(-toward,normalize(vector(base+8u)-vector(base)+vec3f(0.,-.00001,0.)))); }
  let halfVector=normalize(toward+view+vec3f(.00001));
  let nl=max(0.,dot(normal,toward)); let nh=max(0.,dot(normal,halfVector));
  let vh=max(0.,dot(view,halfVector)); let alpha=roughness*roughness; let a2=alpha*alpha;
  let denominator=nh*nh*(a2-1.)+1.;
  let distribution=a2/(3.14159265*denominator*denominator);
  let visibility=.5/max(.0001,nl*sqrt(nv*nv*(1.-a2)+a2)+nv*sqrt(nl*nl*(1.-a2)+a2));
  let f0=mix(vec3f(.04),material.albedo,metal); let fresnel=f0+(1.-f0)*pow(1.-vh,5.);
  let diffuse=material.albedo*(1.-fresnel)*(1.-metal)/3.14159265;
  color+=(diffuse+fresnel*distribution*visibility)*nl*vector(base+4u)*max(0.,uniforms[base+3u])*attenuation*cone;
 }
 let rim=pow(1.-nv,3.);
 return clamp(color+rim*(rimColor*rimIntensity+vector(48u)*uniforms[51]*activation),vec3f(0.),vec3f(4096.))*depthFade(world);
}
`;
}
const vertexFields = `
struct WorldVertex { @builtin(position) position:vec4f, @location(0) world:vec3f, @location(1) normal:vec3f,
 @location(2) color:vec3f, @location(3) emissive:f32, @location(4) material:vec4f, @location(5) albedo:vec3f,
 @location(6) opacity:f32, @location(7) @interpolate(flat) instance:u32 }
`;
// Display-space colors (as a 2D layer would draw them) mapped back through the tonemap, so cards and flat glyphs read the same at any exposure.
// The ceiling keeps the brightest colors under the bloom threshold.
const displayCode = `
fn aces(x:vec3f)->vec3f { return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3f(0.),vec3f(1.)); }
fn encode(x:vec3f)->vec3f { return select(x*12.92,1.055*pow(x,vec3f(1./2.4))-.055,x>vec3f(.0031308)); }
fn toScene(display:vec3f)->vec3f {
 let y=clamp(select(display/12.92,pow((display+.055)/1.055,vec3f(2.4)),display>vec3f(.04045)),vec3f(0.),vec3f(.9));
 let a=2.51-2.43*y; let b=.03-.59*y;
 return (-b+sqrt(b*b+.56*y*a))/(2.*a)/max(uniforms[8]*frame.brightness,.0001);
}
`;
// Cards are one quad in the card's front plane. The fragment shades a 2D rounded-rect distance field: coverage is antialiased over one
// device pixel, and the outer glow, glass gradient, inner glow, rim and avatar layer like a 2D canvas in display space, so edges
// stay crisp at any resolution without MSAA. Emissive from .03 to .09 blends a resting slate card into one lit in its color.
// Shape fields: 11 corner radius (negative: device pixels), 15 border width in device pixels (0 scales the rim with the glow), 16 glow blur width, 17 rim strength (a border's is 22% white per 1; a flat card's border takes its material albedo),
// 18 avatar radius / half height, 19 fill opacity (cards have no thickness).
function cardCode(offset: number, background: Vec3) {
  return `${worldBindings}${triangleCorner}${lightingCode(0)}
struct CardVertex { @builtin(position) position:vec4f, @location(0) local:vec2f, @location(1) @interpolate(flat) instance:u32 }
fn slot(iid:u32)->u32 { return ${worldHeaderSize}u+(iid+${offset}u)*${worldInstanceSize}u; }
fn cardHalf(base:u32)->vec3f { return max(vector(base+8u)*uniforms[base+3u],vec3f(.0001)); }
// Collapsing cards take their glow and shadow with them.
fn presence(half:vec3f)->f32 { return clamp(min(half.x,half.y)/.08,0.,1.); }
fn roundRect(p:vec2f,half:vec2f,radius:f32)->f32 { let q=abs(p)-half+radius; return length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.)-radius; }
@vertex fn cardVertex(@builtin(vertex_index) vid:u32,@builtin(instance_index) iid:u32)->CardVertex {
 let base=slot(iid); let half=cardHalf(base); let margin=uniforms[base+16u]*presence(half)*2.5+.01;
 let local=mix(-half.xy-margin,half.xy+margin,corner(vid));
 var result:CardVertex; result.position=projected(bend(vector(base))+partRotation(base)*vec3f(local,half.z)); result.local=local; result.instance=iid;
 if(uniforms[base+23u]<=.001 || presence(half)<=0.) { result.position=vec4f(2.,2.,0.,1.); }
 return result;
}
struct CardResult { @location(0) color:vec4f, @builtin(frag_depth) depth:f32 }
${displayCode}
fn over(dst:vec4f,color:vec3f,alpha:f32)->vec4f { return vec4f(color*alpha+dst.rgb*(1.-alpha),alpha+dst.a*(1.-alpha)); }
// Gaussian blur of a stroke of the given width centred on the edge.
fn blurredStroke(d:f32,width:f32,sigma:f32)->f32 { return width/(2.5066*sigma)*exp(-d*d/(2.*sigma*sigma)); }
fn fogAt(z:f32,y:f32)->f32 { return 1.-exp(-z*uniforms[12]*exp(clamp(-(y-uniforms[13])*uniforms[14],-8.,8.))); }
@fragment fn cardFragment(in:CardVertex)->CardResult {
 let base=slot(in.instance); let half=cardHalf(base); let p=in.local; let rotation=partRotation(base); let world=bend(vector(base))+rotation*vec3f(p,half.z);
 if(dot(rotation[2],eye()-world)<0.) { discard; }
 let corner=uniforms[base+11u]; let radius=clamp(select(corner,-corner*max(fwidth(p.x),fwidth(p.y)),corner<0.),0.,min(half.x,half.y)); let d=roundRect(p,half.xy,radius);
 let pixel=max(fwidth(d),.00001);
 let accent=encode(vector(base+4u)); let shown=presence(half); let edge=uniforms[base+17u]/.6;
 let sigma=max(uniforms[base+16u],.015)*.78; let unit=sigma/14.;
 let h=clamp((uniforms[base+7u]-.03)/.06,0.,1.); let v=clamp(.5-p.y/half.y*.5,0.,1.);
 let coverage=1.-smoothstep(-pixel*.5,pixel*.5,d);
 var layer=vec4f(0.);
 if(uniforms[base+16u]>0.) { layer=over(layer,accent,.45*h*edge*shown*blurredStroke(d,5.*unit,sigma)); }
 let fill=select(mix(mix(vec3f(.1,.14,.22),.12+accent*.18,h),mix(vec3f(.04,.06,.1),.085+accent*.07,h),v),accent,uniforms[base+31u]>.5);
 layer=over(layer,fill,coverage*uniforms[base+19u]);
 layer=over(layer,accent,coverage*.45*h*edge*blurredStroke(d,2.5*unit,3.*unit));
 let border=uniforms[base+15u]>0.; let line=select(1.4*unit,uniforms[base+15u]*pixel,border);
 // Box-filter the stroke so a subpixel rim keeps its coverage as it crosses pixel centers.
 let rim=clamp((line+pixel)*.5-abs(d),0.,min(line,pixel))/pixel;
 layer=over(layer,select(mix(vec3f(.2,.29,.4),accent,h),select(vec3f(1.),encode(vector(base+${instanceField.albedo}u)),uniforms[base+31u]>.5),border),rim*select((.8+.2*h)*edge*mix(1.,.45,v),min(1.,.22*uniforms[base+17u]),border));
 let avatar=uniforms[base+18u]*half.y;
 if(avatar>0.) {
  let q=p-vec2f(-half.x+half.y,0.); let disc=1.-smoothstep(-pixel*.5,pixel*.5,length(q)-avatar);
  let t=clamp((q.x-q.y)/(avatar*4.)+.5,0.,1.);
  layer=over(layer,mix(mix(vec3f(.55,.83,1.),accent*.65+.35,h),mix(vec3f(.3,.46,.98),accent*vec3f(1.,.85,.85),h),t),disc);
 }
 let opacity=uniforms[base+23u];
 if(layer.a*opacity<.003) { discard; }
 // Translucent pixels blend in display space over the background, as a 2D layer would, then map back to scene light.
 let alpha=layer.a*opacity; let exposure=uniforms[8]*frame.brightness; let background=vec3f(${background.join(",")});
 // Keep the whole filtered rim on the face so its outer half isn't clipped by a parent panel.
 // Only the glow sits behind the plane, at equal quantized depth to avoid z-fighting.
 let onFace=d<=(line+pixel)*.5;
 let at=select(world+normalize(world-eye())*.3,world,onFace);
 let clip=projected(at); var depth=clamp(clip.z/clip.w,0.,1.);
 var color=toScene(encode(aces(background*exposure))*(1.-alpha)+layer.rgb*opacity)-background*(1.-alpha);
 if(!onFace) { depth=min(1.,ceil(depth*8192.)/8192.); }
 if(!onFace && !partSharp(base)) {
  // The fog pass fogs the glow by the card's depth, but the open background around it by the far plane: blend over the
  // fogged background and undo the card-depth fog, so the glow reads as an overlay without a darker halo.
  let z=max(dot(at-eye(),cameraForward()),.05); let near=fogAt(z,at.y); let far=fogAt(500.,eye().y+(at.y-eye().y)*500./z);
  let fog=vector(20u); let behind=mix(background,fog,far);
  color=(toScene(encode(aces(behind*exposure))*(1.-alpha)+layer.rgb*opacity)-fog*near)/max(1.-near,.01)-background*(1.-alpha);
 }
 let fade=depthFade(world);
 return CardResult(vec4f(color*fade,alpha*fade),depth);
}`;
}
const instanceLoader = loaderCode(WorldInstance, "fn instanceAt(base:u32)", key => `base+${instanceField[key as keyof typeof instanceField]}u`);
function geometryCode(kind: PrimitiveKind, offset: number, lights: number, custom?: CustomGeometry, sdf?: SDFGeometry, look: Look = {}) {
  const shape = custom ? `let shapeVertex=shape(geometryId(iid),vid,shapeContext()); point=shapeVertex.position*radius; normal=shapeVertex.normal;` : mesh[kind].code;
  const sphere = kind === "sphere" && !custom && !sdf;
  const bounds = sdf ? sdf.bounds.map(v => `vec3f(${v.map(n => Number.isInteger(n) ? n + "." : n).join(",")})`) : [];
  return `${worldBindings}${triangleCorner}${lightingCode(lights, look)}${vertexFields}
${look.shadowCaster ? "@fragment fn shadowFragment(in:WorldVertex) { if(in.opacity<.5) { discard; } }" : ""}
${custom?.wgsl ?? sdf?.wgsl ?? ""}
fn slot(iid:u32)->u32 { return ${worldHeaderSize}u+(iid+${offset}u)*${worldInstanceSize}u; }
${instanceLoader}
${custom ? "fn geometryId(iid:u32)->u32 { let marker=instanceAt(slot(iid)).geometry; if(marker>0.) { return u32(marker)-1u; } return iid; }" : ""}
@vertex fn worldVertex(@builtin(vertex_index) vid:u32,@builtin(instance_index) iid:u32)->WorldVertex {
 let base=slot(iid); let part=instanceAt(base);
 let origin=part.position; let radius=max(part.radius,.0001);
 var point=vec3f(0.); var normal=vec3f(0.,1.,0.);
 ${shape}
 ${sdf ? `point=mix(${bounds[0]},${bounds[1]},point/radius*.5+.5)*radius;` : ""}
 let scale=max(part.scale,vec3f(.0001)); let rotation=partRotation(base); let straight=origin+rotation*(point*scale); let world=bend(straight);
 var result:WorldVertex; result.position=projected(world); result.world=world; result.normal=normalize(bendNormal(straight,rotation*(normal/scale)));
 result.color=part.color; result.emissive=part.emissive; result.material=vec4f(part.roughness,part.metal,part.rim,part.activation);
 result.albedo=part.albedo; result.opacity=part.opacity; result.instance=iid;
 ${sphere ? `
 let center=projected(bend(origin)); let radii=scale*radius;
 let extent=max(radii.x,max(radii.y,radii.z));
 if(result.opacity<=.001 || center.w+extent<=.05 || center.w-extent>=500.) {
  result.position=vec4f(2.,2.,0.,1.); return result;
 }
 let z=max(.0001,center.w); let centerNDC=center.xy/z;
 let margin=vec2f(extent)/(vec2f(uniforms[3]*frame.aspect,uniforms[3])*max(.0001,z-extent))*(1.+abs(centerNDC)*vec2f(uniforms[3]*frame.aspect,uniforms[3]));
 let lower=select(max(vec2f(-1.),centerNDC-margin),vec2f(-1.),center.w<=extent);
 let upper=select(min(vec2f(1.),centerNDC+margin),vec2f(1.),center.w<=extent);
 let ndc=mix(lower,upper,corner(vid));
 var ray=cameraForward()+cameraRight()*ndc.x*frame.aspect*uniforms[3]+cameraUp()*ndc.y*uniforms[3];
 result.position=vec4f(ndc,0.,1.); result.world=eye()+ray;
 ` : ""}
 return result;
}
${sphere ? `
struct SphereResult { @location(0) color:vec4f, @builtin(frag_depth) depth:f32 }
@fragment fn worldFragment(in:WorldVertex)->SphereResult {
 let base=slot(in.instance); let part=instanceAt(base);
 let radii=max(part.scale,vec3f(.0001))*max(part.radius,.0001);
 let rotation=partRotation(base); let inverse=transpose(rotation);
 let center=bend(part.position); let origin=(inverse*(eye()-center))/radii; let ray=normalize((inverse*(in.world-eye()))/radii);
 let along=dot(origin,ray); let closest=origin-ray*along; let field=1.-dot(closest,closest);
 let edge=max(fwidth(field),.00001);
 if(field<=0. || in.opacity<=.001) { discard; }
 let roots=vec2f(-along-sqrt(field),-along+sqrt(field));
 var local=vec3f(0.); var hit=vec3f(0.); var clip=vec4f(0.); var found=false;
 for(var root=0u;root<2u;root++) {
  if(roots[root]<0.) { continue; }
  local=origin+ray*roots[root]; hit=center+rotation*(local*radii); clip=projected(hit);
  if(clip.w<=.05 || clip.z<0. || clip.z>clip.w) { continue; }
  found=true; break;
 }
 if(!found) { discard; }
 let normal=normalize(rotation*(local/radii)); let facing=max(0.,dot(normal,normalize(eye()-hit)));
 let emission=(in.color*(.1+.9*pow(facing,3.))+vec3f(.35*pow(facing,16.)))*in.emissive;
 let material=Material(in.albedo,emission,in.material.x,in.material.y);
 let color=illuminate(hit,normal,material,in.color,in.material.z,in.material.w);
 let opacity=in.opacity*smoothstep(0.,edge,field);
 return SphereResult(vec4f(color*opacity,opacity),clip.z/clip.w);
}` : sdf ? `
struct SDFResult { @location(0) color:vec4f, @builtin(frag_depth) depth:f32 }
@fragment fn worldFragment(in:WorldVertex)->SDFResult {
 if(in.opacity<=.001) { discard; }
 let base=slot(in.instance); let part=instanceAt(base);
 let origin=bend(part.position); let scale=max(part.scale*part.radius,vec3f(.0001));
 let rotation=partRotation(base); let inverse=transpose(rotation);
 let rayOrigin=(inverse*(eye()-origin))/scale; let rayDirection=normalize((inverse*(in.world-eye()))/scale);
 let direction=select(rayDirection,vec3f(.000001),abs(rayDirection)<vec3f(.000001));
 let a=(${bounds[0]}-rayOrigin)/direction; let b=(${bounds[1]}-rayOrigin)/direction;
 let lower=min(a,b); let upper=max(a,b); var distance=max(0.,max(lower.x,max(lower.y,lower.z))); let exitDistance=min(upper.x,min(upper.y,upper.z));
 var found=false; var local=vec3f(0.);
 for(var i=0u;i<${Math.max(1, Math.min(256, sdf.steps ?? 64))}u;i++) {
  if(distance>exitDistance) { break; } local=rayOrigin+rayDirection*distance; let field=sdf(local);
  if(abs(field)<.001) { found=true; break; } distance+=max(.0005,abs(field));
 }
 if(!found) { discard; }
 let hit=origin+rotation*(local*scale);
 let e=.001; let normal=normalize(rotation*(vec3f(sdf(local+vec3f(e,0.,0.))-sdf(local-vec3f(e,0.,0.)),sdf(local+vec3f(0.,e,0.))-sdf(local-vec3f(0.,e,0.)),sdf(local+vec3f(0.,0.,e))-sdf(local-vec3f(0.,0.,e)))/scale));
 let material=Material(in.albedo,in.color*in.emissive,in.material.x,in.material.y);
 let color=illuminate(hit,normal,material,in.color,in.material.z,in.material.w); let clip=projected(hit);
 return SDFResult(vec4f(color*in.opacity,in.opacity),clamp(clip.z/clip.w,0.,1.));
}` : `
@fragment fn worldFragment(in:WorldVertex)->@location(0) vec4f {
 if(in.opacity<=.001) { discard; }
 let normal=normalize(in.normal);
 ${kind === "box" && !custom ? "if(in.opacity>=.999 && dot(normal,eye()-in.world)<0.) { discard; }" : ""}
 let material=${custom ? "shade(geometryId(in.instance),in.world,normal,shapeContext())" : "Material(in.albedo,in.color*in.emissive,in.material.x,in.material.y)"};
 let color=illuminate(in.world,normal,material,in.color,in.material.z,in.material.w);
 return vec4f(color*in.opacity,in.opacity);
}`}`;
}
// Depth-only sphere draw from the key light: a light-facing disc. Other shapes reuse their scene vertex shader in light space.
function sphereShadowCode(offset: number) {
  return `${worldBindings}${triangleCorner}${keyLightCode()}${instanceLoader}
struct ShadowVertex { @builtin(position) position:vec4f, @location(0) local:vec2f }
@vertex fn shadowVertex(@builtin(vertex_index) vid:u32,@builtin(instance_index) iid:u32)->ShadowVertex {
 let part=instanceAt(${worldHeaderSize}u+(iid+${offset}u)*${worldInstanceSize}u);
 let r=max(part.scale,vec3f(.0001))*max(part.radius,.0001); let local=corner(vid)*2.-1.;
 let p=keyProject(bend(part.position)+keyRight()*local.x*max(r.x,r.z)+keyUp()*local.y*r.y);
 var result:ShadowVertex; result.local=local; result.position=vec4f(p.xy,clamp(p.z,0.,1.),1.);
 if(part.opacity<.5) { result.position=vec4f(2.,2.,0.,1.); }
 return result;
}
@fragment fn shadowFragment(in:ShadowVertex) { if(dot(in.local,in.local)>1.) { discard; } }`;
}
const glyphCount = glyphLast - glyphFirst + 1;
const glyphMetricsSize = glyphMetrics.length * glyphCount * 6;
const glyphPixelsStart = glyphMetricsSize + glyphMetrics.length * glyphCount * glyphCount;
// Labels draw one quad per string in the card plane; the fragment finds its character and reads the baked distance atlas,
// with the same lighting and depth in either blur route.
function labelCode(offset: number, lights: number, look: Look = {}) {
  const f = (n: number) => Number.isInteger(n) ? n + "." : String(n);
  return `${worldBindings}${triangleCorner}${lightingCode(lights, look)}
@group(0) @binding(3) var<storage,read> glyphs:array<u32>;
fn metric(face:u32,code:u32,field:u32)->f32 { return bitcast<f32>(glyphs[(face*${glyphCount}u+clamp(code,${glyphFirst}u,${glyphLast}u)-${glyphFirst}u)*6u+field]); }
fn kern(face:u32,a:u32,b:u32)->f32 { return bitcast<f32>(glyphs[${glyphMetricsSize}u+face*${glyphCount * glyphCount}u+(clamp(a,${glyphFirst}u,${glyphLast}u)-${glyphFirst}u)*${glyphCount}u+clamp(b,${glyphFirst}u,${glyphLast}u)-${glyphFirst}u]); }
struct LabelVertex { @builtin(position) position:vec4f, @location(0) world:vec3f, @location(1) local:vec2f, @location(2) @interpolate(flat) instance:u32 }
fn slot(iid:u32)->u32 { return ${worldHeaderSize}u+(iid+${offset}u)*${worldInstanceSize}u; }
@vertex fn labelVertex(@builtin(vertex_index) vid:u32,@builtin(instance_index) iid:u32)->LabelVertex {
 let base=slot(iid); let size=uniforms[base+3u]; let width=uniforms[base+8u];
 let local=mix(vec2f(-.25,-.4),vec2f(width+.25,1.05),corner(vid));
 let world=bend(vector(base))+vec3f((local.x-width*uniforms[base+10u])*size,(local.y-.36)*size,0.);
 var result:LabelVertex; result.position=projected(world); result.world=world; result.local=local; result.instance=iid;
 if(uniforms[base+23u]<=.001 || uniforms[base+9u]<1.) { result.position=vec4f(2.,2.,0.,1.); }
 return result;
}
fn character(base:u32,i:u32)->u32 {
 let k=i/3u; let field=select(base+13u+k,base+12u+k,k<11u);
 return (u32(uniforms[field])>>((i%3u)*7u))&127u;
}
fn atlas(offset:u32,width:i32,height:i32,x:i32,y:i32)->vec3f {
 let pixel=glyphs[${glyphPixelsStart}u+offset+u32(clamp(y,0,height-1)*width+clamp(x,0,width-1))];
 return vec3f(f32(pixel&255u),f32((pixel>>8u)&255u),f32((pixel>>16u)&255u))/255.;
}
// Filter RGB in linear space, then take its median to preserve corners.
fn glyph(face:u32,code:u32,p:vec2f)->f32 {
 if(code<${glyphFirst + 1}u || code>${glyphLast}u) { return -.5; }
 let width=i32(metric(face,code,3u)); let height=i32(metric(face,code,4u));
 let pixel=vec2f((p.x+metric(face,code,1u))*${f(glyphEm)},f32(height)-(p.y+metric(face,code,2u))*${f(glyphEm)})-.5;
 if(any(pixel<vec2f(-.5)) || any(pixel>vec2f(f32(width)-.5,f32(height)-.5))) { return -.5; }
 let cell=vec2i(floor(pixel)); let t=fract(pixel); let offset=u32(metric(face,code,5u));
 let value=mix(mix(atlas(offset,width,height,cell.x,cell.y),atlas(offset,width,height,cell.x+1,cell.y),t.x),mix(atlas(offset,width,height,cell.x,cell.y+1),atlas(offset,width,height,cell.x+1,cell.y+1),t.x),t.y);
 return max(min(value.r,value.g),min(max(value.r,value.g),value.b))-.5;
}
fn advance(face:u32,base:u32,i:u32,count:u32)->f32 {
 let code=character(base,i); var result=metric(face,code,0u);
 if(i+1u<count) { result+=kern(face,code,character(base,i+1u)); }
 return result;
}
@fragment fn labelFragment(in:LabelVertex)->@location(0) vec4f {
 let base=slot(in.instance); let count=u32(uniforms[base+9u]); let face=u32(uniforms[base+11u]);
 // Derivatives are in actual render-target pixels, including Retina and renderScale.
 let emPerPixel=max(sqrt(dpdx(in.local)*dpdx(in.local)+dpdy(in.local)*dpdy(in.local)),vec2f(.00001));
 let screenRange=max(.5*dot(vec2f(${f(glyphRange / glyphEm)}),1./emPerPixel),1.);
 var pen=0.; var index=0u;
 if(face==3u) { let cell=metric(face,32u,0u); index=u32(clamp(floor(in.local.x/cell),0.,f32(count-1u))); pen=f32(index)*cell; }
 else { for(var i=0u;i+1u<count;i++) { let next=pen+advance(face,base,i,count); if(next>in.local.x) { break; } pen=next; index=i+1u; } }
 var distance=-.5;
 for(var d=-1;d<=1;d++) {
  let i=i32(index)+d; if(i<0 || i>=i32(count)) { continue; }
  let code=character(base,u32(i)); var start=pen;
  if(d<0) { start=pen-advance(face,base,u32(i),count); } if(d>0) { start=pen+advance(face,base,index,count); }
  distance=max(distance,glyph(face,code,in.local-vec2f(start,0.)));
 }
 let alpha=clamp(distance*screenRange+.5,0.,1.)*uniforms[base+23u];
 if(alpha<=.004) { discard; }
 let color=vector(base+4u);
 let lit=illuminate(in.world,vec3f(0.,0.,1.),Material(color*.25,color*uniforms[base+7u],.45,0.),color,0.,0.);
 return vec4f(lit*alpha,alpha);
}`;
}
let glyphWords: Float32Array | undefined;
/** Face metrics, kerning and losslessly packed RGB pixels, uploaded once per graph. */
function glyphBuffer() {
  if (!glyphWords) {
    glyphWords = new Float32Array(glyphPixelsStart + glyphPixelCount);
    glyphWords.set(glyphMetrics.flat(2));
    for (let face = 0; face < glyphMetrics.length; face++) for (const [pair, adjustment] of Object.entries(glyphKernings[face])) {
      glyphWords[glyphMetricsSize + face * glyphCount * glyphCount + Number(pair)] = adjustment;
    }
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const bytes = new Uint8Array(glyphAtlas.length * 3 / 4);
    let length = 0;
    for (let i = 0; i < glyphAtlas.length; i += 4) {
      const n = (alphabet.indexOf(glyphAtlas[i]) << 18) | (alphabet.indexOf(glyphAtlas[i + 1]) << 12) | (Math.max(0, alphabet.indexOf(glyphAtlas[i + 2])) << 6) | Math.max(0, alphabet.indexOf(glyphAtlas[i + 3]));
      bytes[length++] = n >> 16 & 255; if (glyphAtlas[i + 2] !== "=") bytes[length++] = n >> 8 & 255; if (glyphAtlas[i + 3] !== "=") bytes[length++] = n & 255;
    }
    const words = new Uint32Array(glyphWords.buffer);
    let output = glyphPixelsStart, input = 0;
    const pixel = () => { const value = bytes[input] | bytes[input + 1] << 8 | bytes[input + 2] << 16; input += 3; return value; };
    while (input < length) {
      const packet = bytes[input++];
      if (packet >= 128) { const value = pixel(), count = packet - 128 + 2; words.fill(value, output, output + count); output += count; }
      else for (let i = 0; i <= packet; i++) words[output++] = pixel();
    }
    if (output !== words.length) throw new Error("Invalid World glyph atlas length");
  }
  return { id: "glyphs", size: glyphWords.byteLength, init: glyphWords };
}
function floorCode(lights: number, look: Look = {}, markings: FloorMarkings = {}) {
  const paint = floorMarkingsCode(markings);
  return `${worldBindings}${lightingCode(lights, look)}
struct FloorVertex { @builtin(position) position:vec4f, @location(0) uv:vec2f }
@vertex fn floorVertex(@builtin(vertex_index) id:u32)->FloorVertex {
 let p=vec2f(f32((id<<1u)&2u),f32(id&2u)); return FloorVertex(vec4f(p*2.-1.,0.,1.),vec2f(p.x,1.-p.y));
}
struct FloorResult { @location(0) color:vec4f, @builtin(frag_depth) depth:f32 }
@fragment fn floorFragment(in:FloorVertex)->FloorResult {
 let ray=cameraForward()+cameraRight()*(in.uv.x*2.-1.)*frame.aspect*uniforms[3]+cameraUp()*(1.-in.uv.y*2.)*uniforms[3];
 if(ray.y>=-.0001 || vector(0u).y<=uniforms[36]) { discard; } let distance=(uniforms[36]-vector(0u).y)/ray.y;
 let world=vector(0u)+ray*distance;
 if(distance<=.05 || distance>=500. || abs(world.x)>uniforms[39] || abs(world.z)>uniforms[39]) { discard; }
 let normal=vec3f(0.,1.,0.); let view=normalize(vector(0u)-world); let material=Material(vector(40u),vector(40u)*uniforms[19],uniforms[37],uniforms[43]);
 var color=${markings.lit === false ? "material.emissive" : "illuminate(world,normal,material,vec3f(0.),0.,0.)"};
 var mask=0.; let hit=world;
 { let world=unbend(hit); let fade=1.-smoothstep(.25,1.,length(fwidth(world.xz)));
 ${paint} }
 ${look.shadowBinding !== undefined ? "color*=keyShadow(world,normal);" : ""}
 color*=depthFade(world);
 let clip=project(world); return FloorResult(vec4f(color,1.),clamp(clip.z/clip.w,0.,1.));
}`;
}
const filterCode = `
fn tap(uv:vec2f,offset:vec2f)->vec3f { return textureSampleLevel(source,linearSampler,uv+offset/vec2f(textureDimensions(source)),0.).rgb; }
fn box(color:vec3f,weight:f32,karis:bool)->vec4f { let w=weight*select(1.,1./(1.+max(color.r,max(color.g,color.b))),karis); return vec4f(color*w,w); }
// 13 taps as five overlapping 2x2 boxes; the Karis average keeps single HDR pixels from flaring.
fn downsample13(uv:vec2f,karis:bool)->vec3f {
 let a=tap(uv,vec2f(-2.,-2.)); let b=tap(uv,vec2f(0.,-2.)); let c=tap(uv,vec2f(2.,-2.));
 let d=tap(uv,vec2f(-2.,0.)); let e=tap(uv,vec2f(0.,0.)); let f=tap(uv,vec2f(2.,0.));
 let g=tap(uv,vec2f(-2.,2.)); let h=tap(uv,vec2f(0.,2.)); let i=tap(uv,vec2f(2.,2.));
 let j=tap(uv,vec2f(-1.,-1.)); let k=tap(uv,vec2f(1.,-1.)); let l=tap(uv,vec2f(-1.,1.)); let m=tap(uv,vec2f(1.,1.));
 let sum=box((j+k+l+m)*.25,.5,karis)+box((a+b+d+e)*.25,.125,karis)+box((b+c+e+f)*.25,.125,karis)+box((d+e+g+h)*.25,.125,karis)+box((e+f+h+i)*.25,.125,karis);
 return sum.rgb/sum.a;
}
// The 3x3 tent as four bilinear taps at half-texel offsets.
fn tent9(uv:vec2f)->vec3f {
 return (tap(uv,vec2f(-.5,-.5))+tap(uv,vec2f(.5,-.5))+tap(uv,vec2f(-.5,.5))+tap(uv,vec2f(.5,.5)))*.25;
}
`;
function downsampleCode(weight = "1.") {
  return `${filterCode}
@fragment fn downsample(@location(0) uv:vec2f)->@location(0) vec4f { return vec4f(downsample13(uv,false)*${weight},1.); }`;
}
const downsample = downsampleCode();
const threshold = `${filterCode}
@fragment fn threshold(@location(0) uv:vec2f)->@location(0) vec4f {
 let color=downsample13(uv,true); let brightness=max(color.r,max(color.g,color.b));
 let level=params().threshold; let knee=level*.5; let soft=clamp(brightness-level+knee,0.,2.*knee);
 return vec4f(color*max(soft*soft/(4.*knee+.0001),brightness-level)/max(.0001,brightness),1.);
}`;
// Luminance high-pass used by UnrealBloomPass; HDR values pass through without subtracting the threshold.
const luminosityThreshold = `${filterCode}
@fragment fn threshold(@location(0) uv:vec2f)->@location(0) vec4f {
 let color=textureSampleLevel(source,linearSampler,uv,0.).rgb;
 let brightness=dot(color,vec3f(.2126,.7152,.0722));
 return vec4f(color*smoothstep(params().threshold,params().threshold+.01,brightness),1.);
}`;
const upsample = `${filterCode}
@fragment fn upsample(@location(0) uv:vec2f)->@location(0) vec4f { return vec4f(textureSampleLevel(high,linearSampler,uv,0.).rgb+tent9(uv)*params().radius,1.); }`;
function unrealBloomWeight(mip: number) {
  const factor = (1 - mip * .2).toFixed(1);
  return `mix(${factor},1.2-${factor},clamp(params().radius,0.,1.))`;
}
function unrealUpsample(mip: number) {
  return `${filterCode}
@fragment fn upsample(@location(0) uv:vec2f)->@location(0) vec4f {
 return vec4f(textureSampleLevel(high,linearSampler,uv,0.).rgb*${unrealBloomWeight(mip)}+tent9(uv),1.);
}`;
}
/** Header slots the scene writes bloom values to. */
export const bloomSlots = { intensity: 9, threshold: 10, radius: 11 };
/** Dual-filter bloom: a thresholded 13-tap downsample chain and a tent upsample chain, added onto the scene. */
export const bloomEffect = defineWorldEffect<{ intensity: d.F32; threshold: d.F32; radius: d.F32 }, { mode?: "soft" | "unreal"; scale?: number }>({
  name: "bloom", params: { intensity: d.f32, threshold: d.f32, radius: d.f32 }, defaults: { intensity: 0, threshold: 1, radius: .8 },
  build({ input, options, scale, levels, id }) {
    const unreal = options.mode === "unreal", down = id(), up = id("up");
    const targetScale = scale * (options.scale ?? .5);
    const passes: WorldEffectPass[] = [{ id: id("threshold"), wgsl: unreal ? luminosityThreshold : threshold, fragment: "threshold", reads: { source: input }, output: `${down}@0` }];
    for (let mip = 1; mip < levels; mip++) passes.push({ id: id(`down-${mip}`), wgsl: downsample, fragment: "downsample", reads: { source: `${down}@${mip - 1}` }, output: `${down}@${mip}` });
    passes.push({ id: id(`up-${levels - 1}`), wgsl: unreal ? downsampleCode(unrealBloomWeight(levels - 1)) : downsample, fragment: "downsample", reads: { source: `${down}@${levels - 1}` }, output: `${up}@${levels - 1}` });
    for (let mip = levels - 2; mip >= 0; mip--) passes.push({ id: id(`up-${mip}`), wgsl: unreal ? unrealUpsample(mip) : upsample, fragment: "upsample", reads: { source: `${up}@${mip + 1}`, high: `${down}@${mip}` }, output: `${up}@${mip}` });
    return { targets: [{ id: down, scale: targetScale, mips: levels }, { id: up, scale: targetScale, mips: levels }], passes, add: { source: `${up}@0`, gain: "intensity" } };
  },
});
// FXAA on the display-referred image catches what MSAA cannot: shading edges, the floor horizon and low-quality scenes.
const fxaaCode = `${worldBindings}
@group(0) @binding(3) var source:texture_2d<f32>;
fn fetch(uv:vec2f)->vec3f { return textureSampleLevel(source,linearSampler,uv,0.).rgb; }
fn luma(color:vec3f)->f32 { return dot(color,vec3f(.299,.587,.114)); }
@fragment fn fxaa(@location(0) uv:vec2f)->@location(0) vec4f {
 let texel=1./vec2f(textureDimensions(source)); let source4=textureSampleLevel(source,linearSampler,uv,0.); let center=source4.rgb; let m=luma(center);
 if(source4.a<.5) { return vec4f(center,1.); }
 let nw=luma(fetch(uv+vec2f(-1.,-1.)*texel)); let ne=luma(fetch(uv+vec2f(1.,-1.)*texel));
 let sw=luma(fetch(uv+vec2f(-1.,1.)*texel)); let se=luma(fetch(uv+vec2f(1.,1.)*texel));
 let lumaMin=min(m,min(min(nw,ne),min(sw,se))); let lumaMax=max(m,max(max(nw,ne),max(sw,se)));
 if(lumaMax-lumaMin<max(.0312,lumaMax*.125)) { return vec4f(center,1.); }
 var direction=vec2f((sw+se)-(nw+ne),(nw+sw)-(ne+se));
 let reduce=max((nw+ne+sw+se)*.03125,1./128.);
 direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+reduce),vec2f(-8.),vec2f(8.))*texel;
 let inner=.5*(fetch(uv-direction/6.)+fetch(uv+direction/6.));
 let outer=inner*.5+.25*(fetch(uv-direction*.5)+fetch(uv+direction*.5));
 let l=luma(outer);
 return vec4f(select(outer,inner,l<lumaMin || l>lumaMax),1.);
}`;

type CustomDraw = CustomGeometry & { offset: number; count: number };
type GlyphDraw = { font: string; segments: number; offset: number; count: number; vertexCount: number };
type SDFDraw = SDFGeometry & { offset: number; count: number };
export type WorldGraphTopology = {
  quality: WorldScene["quality"]; msaaSamples?: WorldScene["msaaSamples"]; toneMapping?: WorldScene["toneMapping"]; outputColorSpace?: WorldScene["outputColorSpace"]; bloomMode?: "soft" | "unreal"; counts: Record<PrimitiveKind, number>; backgroundVector: Vec3;
  floor?: boolean; dof?: boolean; shafts?: boolean; lightCount?: number; supersampled?: boolean;
  bloomScale?: number; dofScale?: number; dofSamples?: number; shaftScale?: number; shaftSamples?: number;
  key?: boolean; environment?: boolean; shadow?: "map" | "contact"; shadowScale?: number; floorMarkings?: FloorMarkings;
  customs?: CustomDraw[]; sdfs?: SDFDraw[]; glyphs?: GlyphDraw[]; cards?: { offset: number; count: number }; labels?: { offset: number; count: number }; passes?: WorldPostPass[]; postOrder?: string[];
  effects?: { effect: string; options: Record<string, unknown>; before?: WorldEffectStage; after?: WorldEffectStage; base: number }[];
};
export function worldGraphTopology(scene: PreparedWorldScene): WorldGraphTopology {
  const counts: Record<PrimitiveKind, number> = { box: 0, ring: 0, sphere: 0, tube: 0 };
  const customs: CustomDraw[] = [], sdfs: SDFDraw[] = [], glyphs: GlyphDraw[] = [];
  let previousCustom: CustomGeometry | undefined, previousSDF: SDFGeometry | undefined, labels: { offset: number; count: number } | undefined, cards: typeof labels;
  for (let offset = 0; offset < scene.instances.length; offset++) {
    const instance = scene.instances[offset];
    if (instance.label) {
      labels ??= { offset, count: 0 };
      labels.count++;
    } else if (instance.card) {
      cards ??= { offset, count: 0 };
      cards.count++;
    } else if (instance.glyph) {
      const { font, segments, index } = instance.glyph, last = glyphs.at(-1);
      const vertexCount = glyphVertexCount(text3dFont(font), index, segments);
      if (last && last.font === font && last.segments === segments) { last.count++; last.vertexCount = Math.max(last.vertexCount, vertexCount); }
      else glyphs.push({ font, segments, offset, count: 1, vertexCount });
    } else if (instance.custom) {
      const last = customs.at(-1);
      if (last && last.offset + last.count === offset && previousCustom === instance.custom) last.count++;
      else customs.push({ ...instance.custom, offset, count: 1 });
      previousCustom = instance.custom;
    } else if (instance.sdf) {
      const last = sdfs.at(-1);
      if (last && last.offset + last.count === offset && previousSDF === instance.sdf) last.count++;
      else sdfs.push({ ...instance.sdf, offset, count: 1 });
      previousSDF = instance.sdf;
    } else counts[instance.kind]++;
  }
  return { quality: scene.quality, msaaSamples: scene.msaaSamples, toneMapping: scene.toneMapping, outputColorSpace: scene.outputColorSpace, bloomMode: scene.bloom?.mode, counts, backgroundVector: scene.backgroundVector,
    floor: !!scene.floor, dof: !!scene.dof, shafts: !!scene.shafts, lightCount: scene.lights?.length ?? 0,
    bloomScale: scene.bloom?.scale, dofScale: scene.dof?.scale, dofSamples: scene.dof?.samples, shaftScale: scene.shafts?.scale, shaftSamples: scene.shafts?.samples,
    key: !!scene.keyLight, environment: !!scene.environment, shadow: scene.keyLight ? (scene.keyLight.shadow ?? "map") || undefined : undefined,
    shadowScale: scene.keyLight?.shadowScale,
    floorMarkings: scene.floor && { lit: scene.floor.lit, grid: scene.floor.grid, lines: scene.floor.lines, kerbs: scene.floor.kerbs },
    customs, sdfs, glyphs, cards, labels, passes: scene.passes, postOrder: scene.postOrder,
    effects: scene.effectUses.map(({ effect, options, before, after, base }) => ({ effect, options, before, after, base })) };
}
/** Pure topology: animated values travel only through the uniform snapshot. */
export function buildWorldGraph(scene: PreparedWorldScene | WorldGraphTopology): GPURenderGraphDefinition & { uniformsSize: number } {
  const topology = "instances" in scene ? worldGraphTopology(scene) : scene;
  const scale = topology.quality === "low" ? .65 : topology.quality === "medium" ? .85 : 1;
  const levels = topology.quality === "low" ? 3 : 5;
  const samples = topology.quality === "low" ? 8 : topology.quality === "medium" ? 12 : 16;
  const msaa = topology.msaaSamples ?? (topology.quality === "low" || topology.quality === "auto" && topology.supersampled ? 1 : 4);
  const passes: GPUPass[] = [];
  const targets: GPURenderGraphDefinition["targets"] = [{ id: "hdr", format: "rgba16float", scale, samples: msaa }, { id: "depth", format: "depth32float", scale, samples: msaa }];
  const background = topology.backgroundVector;
  const clear: [number, number, number, number] = [background[0], background[1], background[2], 1];
  const customDraws = topology.customs ?? [], sdfDraws = topology.sdfs ?? [], glyphDraws = topology.glyphs ?? [];
  const glyphFonts = [...new Set(glyphDraws.map(draw => draw.font))];
  const lights = topology.lightCount ?? 0;
  const labels = topology.labels, cards = topology.cards;
  const instanceCount = Object.values(topology.counts).reduce((a, b) => a + b, 0) + [...customDraws, ...sdfDraws, ...glyphDraws].reduce((sum, draw) => sum + draw.count, 0) + (cards?.count ?? 0) + (labels?.count ?? 0);
  const shadowMap = topology.shadow === "map";
  const look: Look = { key: topology.key, environment: topology.environment, shadowBinding: shadowMap ? 3 : undefined };
  if (shadowMap) {
    targets.push({ id: "shadow", format: "depth32float", scale: topology.shadowScale ?? .5 });
    let offset = 0, draws = 0;
    const cast = (id: string, kind: PrimitiveKind, count: number, start: number, custom?: CustomGeometry) => passes.push({ kind: "render", id: `shadow-${id}`,
      code: kind === "sphere" && !custom ? sphereShadowCode(start) : geometryCode(kind, start, 0, custom, undefined, { key: true, shadowCaster: true }),
      vertex: kind === "sphere" && !custom ? "shadowVertex" : "worldVertex", fragment: "shadowFragment", color: [], depth: "shadow",
      vertexCount: custom?.vertexCount ?? mesh[kind].count, instanceCount: count, clear: draws++ === 0 ? [0, 0, 0, 0] : false });
    for (const kind of ["box", "ring", "sphere", "tube"] as const) { if (topology.counts[kind]) cast(kind, kind, topology.counts[kind], offset); offset += topology.counts[kind]; }
    for (const [index, draw] of customDraws.entries()) cast(`custom-${index}`, "box", draw.count, draw.offset, draw);
    for (const [index, draw] of glyphDraws.entries()) passes.push({ kind: "render", id: `shadow-glyphs-${index}`,
      code: text3dCode(`${worldBindings}${triangleCorner}${displayCode}${lightingCode(0, { key: true, shadowCaster: true })}`, `fn slot(iid:u32)->u32 { return ${worldHeaderSize}u+(iid+${draw.offset}u)*${worldInstanceSize}u; }`, draw.segments)
        + "\n@fragment fn shadowFragment(in:GlyphVertex) {}",
      vertex: "glyphVertex", fragment: "shadowFragment", color: [], depth: "shadow", vertexCount: draw.vertexCount, instanceCount: draw.count,
      instanceCull: { offset: worldHeaderSize + draw.offset * worldInstanceSize + instanceField.opacity, stride: worldInstanceSize, threshold: .001 },
      clear: draws++ === 0 ? [0, 0, 0, 0] : false, reads: [`text3d-${glyphFonts.indexOf(draw.font)}`] });
    if (!draws) cast("empty", "box", 0, 0);
  }
  if (topology.floor) passes.push({ kind: "render", id: "floor", code: floorCode(lights, { ...look, environment: false, shadeAll: true }, topology.floorMarkings),
    vertex: "floorVertex", fragment: "floorFragment", color: ["hdr"], depth: "depth", vertexCount: 3, clear, ...shadowMap ? { reads: ["shadow"] } : {} });
  let offset = 0, draws = 0;
  const add = (id: string, kind: PrimitiveKind, count: number, start: number, custom?: CustomGeometry, sdf?: SDFGeometry) => {
    passes.push({ kind: "render", id: `scene-${id}`, code: geometryCode(kind, start, lights, custom, sdf, look), vertex: "worldVertex", fragment: "worldFragment",
      color: ["hdr"], depth: "depth", vertexCount: custom?.vertexCount ?? mesh[kind].count, instanceCount: count, blend: "over", clear: draws++ === 0 && !topology.floor ? clear : false,
      ...shadowMap ? { reads: ["shadow"] } : {} });
  };
  for (const kind of ["box", "ring", "sphere", "tube"] as const) { if (topology.counts[kind]) add(kind, kind, topology.counts[kind], offset); offset += topology.counts[kind]; }
  for (const [index, draw] of customDraws.entries()) add(`custom-${index}`, "box", draw.count, draw.offset, draw);
  for (const [index, draw] of sdfDraws.entries()) add(`sdf-${index}`, "box", draw.count, draw.offset, undefined, draw);
  if (!draws && !topology.floor) add("empty", "box", 0, 0);
  for (const [index, draw] of glyphDraws.entries()) passes.push({ kind: "render", id: `scene-glyphs-${index}`,
    code: text3dCode(`${worldBindings}${triangleCorner}${displayCode}${lightingCode(lights, { ...look, shadowBinding: shadowMap ? 4 : undefined })}`, `fn slot(iid:u32)->u32 { return ${worldHeaderSize}u+(iid+${draw.offset}u)*${worldInstanceSize}u; }`, draw.segments),
    vertex: "glyphVertex", fragment: "glyphFragment", color: ["hdr"], depth: "depth", vertexCount: draw.vertexCount, instanceCount: draw.count, blend: "over",
    instanceCull: { offset: worldHeaderSize + draw.offset * worldInstanceSize + instanceField.opacity, stride: worldInstanceSize, threshold: .001 },
    clear: false, reads: [`text3d-${glyphFonts.indexOf(draw.font)}`, ...shadowMap ? ["shadow"] : []] });
  if (cards) passes.push({ kind: "render", id: "scene-cards", code: cardCode(cards.offset, topology.backgroundVector), vertex: "cardVertex", fragment: "cardFragment",
    color: ["hdr"], depth: "depth", vertexCount: 6, instanceCount: cards.count, blend: "over", depthCompare: "less-equal", clear: false });
  if (labels) passes.push({ kind: "render", id: "scene-labels", code: labelCode(labels.offset, lights, { ...look, shadowBinding: undefined }), vertex: "labelVertex", fragment: "labelFragment",
    color: ["hdr"], depth: "depth", vertexCount: 6, instanceCount: labels.count, blend: "over", clear: false, reads: ["glyphs"] });
  const sharpPasses: GPUPass[] = [];
  for (const pass of passes) if (pass.kind === "render" && pass.id.startsWith("scene-") && pass.instanceCount) {
    const route = (sharp: boolean) => pass.code.replace(/(@fragment fn \w+\(in:\w+\)[^{]*\{)/,
      `$1\n if(partSharp(slot(in.instance))!=${sharp}) { discard; }`);
    sharpPasses.push({ ...pass, id: pass.id.replace("scene-", "sharp-"), code: route(true), color: ["sharp"], clear: false });
    pass.code = route(false);
  }
  if (topology.shafts) {
    targets.push({ id: "shafts", format: "rgba16float", scale: scale * (topology.shaftScale ?? .5) });
    passes.push({ kind: "fullscreen", id: "shafts", code: shaftCode(worldBindings, lights, topology.shaftSamples ?? samples), fragment: "shafts", reads: ["depth"], output: "shafts" });
  }
  let color = "hdr", customIndex = 0;
  const transientTargets = new Set<string>();
  const fullscreen = (id: string, code: string, fragment: string, reads: string[], output = id, targetScale = scale) => {
    if (output !== "screen") targets.push({ id: output, format: "rgba16float", scale: targetScale });
    if (output !== "screen" && output !== "dof" && targetScale === scale) transientTargets.add(output);
    passes.push({ kind: "fullscreen", id, code, fragment, reads, output }); color = output;
  };
  if (topology.shadow === "contact") fullscreen("contact-shadow", contactShadowCode(worldBindings, depthCode()), "contactShadow", [color, "depth"]);
  const stages = ["scene", "fog", "dof", "bloom", "tonemap"];
  // Repeated effects are numbered in declaration order: glow, glow-2, ...
  const declared = new Map<string, number>();
  const effectUses = (topology.effects ?? []).map(use => {
    const count = (declared.get(use.effect) ?? 0) + 1;
    declared.set(use.effect, count);
    return { ...use, prefix: count > 1 ? `${use.effect}-${count}` : use.effect, after: use.after ?? (use.before ? undefined : worldEffect(use.effect).definition.after ?? "bloom") };
  });
  for (const item of [...topology.passes ?? [], ...effectUses]) {
    if (item.before && item.after || !stages.includes(item.before ?? item.after ?? "bloom") || item.before === "scene") throw new Error("Invalid World post-pass placement");
  }
  /** Compiles an effect into fullscreen passes; returns its additive term, which the caller fuses into the tone map or composites. */
  const runEffect = (effect: WorldEffect<any, any>, options: Record<string, unknown>, base: number, slots?: Record<string, number>, fuse = false, prefix = effect.definition.name) => {
    const graph = effect.definition.build({ input: color, options, quality: topology.quality ?? "auto", scale, samples, levels, id: (part?: string) => part ? `${prefix}-${part}` : prefix });
    const params = paramsCode(effect, base, slots);
    const owned = new Set((graph.targets ?? []).map(target => target.id));
    for (const target of graph.targets ?? []) targets.push({ id: target.id, format: "rgba16float", scale: target.scale ?? scale, ...target.mips ? { mips: target.mips } : {} });
    const passCode = (pass: WorldEffectPass) => worldBindings + Object.entries(pass.reads).map(([binding, target], index) =>
      `@group(0) @binding(${3 + index}) var ${binding}:${target === "depth" ? "texture_depth_2d" : "texture_2d<f32>"};\n`).join("")
      + (Object.values(pass.reads).includes("depth") ? depthCode() : "") + params + pass.wgsl;
    graph.passes.forEach((pass, index) => {
      const reads = Object.values(pass.reads), isOwned = owned.has(pass.output.split("@")[0]);
      // Only the final full-resolution result may share the post ping-pong targets; intermediates keep their own.
      if (!isOwned && index === graph.passes.length - 1 && !graph.add) fullscreen(pass.id, passCode(pass), pass.fragment, reads, pass.output);
      else {
        if (!isOwned) targets.push({ id: pass.output, format: "rgba16float", scale });
        passes.push({ kind: "fullscreen", id: pass.id, code: passCode(pass), fragment: pass.fragment, reads, output: pass.output });
      }
    });
    if (!graph.add) { color = graph.passes.at(-1)!.output; return undefined; }
    const gain = slots?.[graph.add.gain] ?? base + effect.offsets[graph.add.gain];
    if (fuse) return { source: graph.add.source, gain: `uniforms[${gain}]` };
    fullscreen(`${prefix}-composite`, `${worldBindings}
@group(0) @binding(3) var source:texture_2d<f32>;
@group(0) @binding(4) var added:texture_2d<f32>;
@fragment fn composite(@location(0) uv:vec2f)->@location(0) vec4f { return vec4f(textureSampleLevel(source,linearSampler,uv,0.).rgb+textureSampleLevel(added,linearSampler,uv,0.).rgb*uniforms[${gain}],1.); }`,
      "composite", [color, graph.add.source]);
    return undefined;
  };
  const custom = (stage: string, before: boolean) => {
    for (const item of topology.passes ?? []) {
      if ((before ? item.before : item.after ?? (!item.before ? "bloom" : undefined)) !== stage) continue;
      const id = `custom-post-${customIndex++}`;
      fullscreen(item.id ?? id, customPostCode(worldBindings, item.wgsl), "customPost", [color, "depth", "hdr", ...(item.reads ?? [])], id);
    }
    for (const use of effectUses) if ((before ? use.before : use.after) === stage) runEffect(worldEffect(use.effect), use.options, use.base, undefined, false, use.prefix);
  };
  const order = topology.postOrder ?? ["fog", "dof", "bloom"];
  if (order.length !== 3 || new Set(order).size !== 3 || order.some(stage => !["fog", "dof", "bloom"].includes(stage))) throw new Error("World postOrder must contain fog, dof and bloom exactly once");
  // With nothing placed between bloom and the tonemap, the tonemap adds the bloom itself instead of a separate full-resolution composite.
  const fuseBloom = order[2] === "bloom" && ![...topology.passes ?? [], ...effectUses].some(item => item.before === "tonemap" || (item.after ?? (item.before ? undefined : "bloom")) === "bloom");
  let fused: { source: string; gain: string } | undefined;
  // Fog directly followed by focus folds into the focus passes, which already read depth for every tap.
  const fuseFog = !!topology.dof && !topology.shafts && order[order.indexOf("fog") + 1] === "dof" && !(topology.passes ?? []).some(item => item.after === "fog" || item.before === "dof" || item.reads?.includes("fog"));
  custom("scene", false);
  for (const stage of order) {
    custom(stage, true);
    if (stage === "fog" && !fuseFog) fullscreen("fog", fogCode(worldBindings, !!topology.shafts), "fog", [color, "depth", ...(topology.shafts ? ["shafts"] : [])]);
    if (stage === "dof" && topology.dof) runEffect(dofEffect, { samples: topology.dofSamples, scale: topology.dofScale, fog: fuseFog }, 0, dofSlots);
    if (stage === "bloom") fused = runEffect(bloomEffect, { mode: topology.bloomMode, scale: topology.bloomScale }, 0, bloomSlots, fuseBloom);
    custom(stage, false);
  }
  custom("tonemap", true);
  if (sharpPasses.length) {
    targets.push({ id: "sharp", format: "rgba16float", scale, samples: msaa });
    // Clear only color; the sharp draws load the scene depth to retain occlusion.
    passes.push({ kind: "render", id: "sharp-clear", code: geometryCode("box", 0, 0), vertex: "worldVertex", fragment: "worldFragment",
      color: ["sharp"], vertexCount: mesh.box.count, instanceCount: 0, clear: [0, 0, 0, 0] }, ...sharpPasses);
  }
  fullscreen("tonemap", finalCode(worldBindings, topology.toneMapping, topology.outputColorSpace, fused?.gain, !!sharpPasses.length), "tonemap",
    [color, ...fused ? [fused.source] : [], ...sharpPasses.length ? ["sharp", "depth"] : []], "tonemapped");
  custom("tonemap", false);
  fullscreen("screen", fxaaCode, "fxaa", [color], "screen");
  if (msaa > 1) for (const pass of passes) if (pass.reads?.includes("depth")) pass.code = pass.code.replace("texture_depth_2d", "texture_depth_multisampled_2d");
  const passIds = new Set<string>();
  for (const pass of passes) {
    if (passIds.has(pass.id)) throw new Error("World pass id is duplicated: " + pass.id);
    passIds.add(pass.id);
  }
  if (!(topology.passes ?? []).some(pass => pass.reads?.length)) {
    const aliases = new Map<string, string>(), used = new Set<string>();
    for (const pass of passes) {
      if (pass.reads) pass.reads = pass.reads.map(id => aliases.get(id) ?? id);
      if (pass.kind !== "fullscreen" || !transientTargets.has(pass.output)) continue;
      const output = ["post-a", "post-b"].find(id => !pass.reads?.includes(id))!;
      aliases.set(pass.output, output); used.add(output); pass.output = output;
    }
    for (let i = targets.length - 1; i >= 0; i--) if (transientTargets.has(targets[i].id)) targets.splice(i, 1);
    for (const id of used) targets.push({ id, format: "rgba16float", scale });
  }
  const buffers = [...labels ? [glyphBuffer()] : [], ...glyphFonts.map((font, index) => text3dBuffer(font, `text3d-${index}`))];
  const effectEnd = effectUses.reduce((end, use) => Math.max(end, use.base + worldEffect(use.effect).size), 0);
  return { targets, ...buffers.length ? { buffers } : {}, passes, uniformsSize: Math.max(worldHeaderSize + instanceCount * worldInstanceSize, effectEnd) + lights * worldLightSize };
}
