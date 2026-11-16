import type { Vec3 } from "./camera";
import { colorVector, type Animated } from "./scene";

/** A directional key light. `position` and `target` set its direction; the shadow box is centred on `target`.
 * `follow: "camera"` makes both offsets from the camera target, so the light and its shadow box travel with the view. */
export type KeyLightOptions = {
  position?: Animated<Vec3>; target?: Animated<Vec3>; color?: Animated<string>; intensity?: Animated<number>; follow?: "camera";
  /** "map" renders a shadow map, "contact" a cheaper screen-space contact shadow; false lights without shadows. */
  shadow?: "map" | "contact" | false;
  /** Half-width of the square shadow box in world units. */
  shadowSize?: Animated<number>;
  /** Penumbra width in shadow-map texels. */
  softness?: Animated<number>;
  /** 0 leaves shadowed areas lit, 1 removes all key light there. */
  shadowStrength?: Animated<number>;
  /** Static shadow-map resolution relative to the scene target (default 0.5). */
  shadowScale?: number;
};
/** A small analytic studio environment, prefiltered by roughness, for glossy and metal reflections. */
export type EnvironmentOptions = { intensity?: Animated<number> };

/** Floor shading additions run after lighting with mutable `color` and `mask`, and read-only `world` and `fade`. */
export type FloorSurface = { lit?: boolean; grid?: { spacing?: number; color?: string; intensity?: number; width?: number }; shader?: string };

const f = (n: number) => Number.isInteger(n) ? n + "." : String(n);
const v3 = (color: string, scale = 1) => `vec3f(${colorVector(color).map(c => f(c * scale)).join(",")})`;

/**
 * Key light and environment WGSL shared by every lit pass. Header slots: 112 key position, 115 intensity, 116 color,
 * 119 shadow half-size, 120 target, 123 softness, 124 environment intensity, 125 shadow strength.
 */
/** `shadeKey` false leaves the key term unshadowed, for passes that shade their whole color (the floor). */
export function keyLightCode(shadowBinding?: number, shadeKey = true) {
  return `
fn keyDirection()->vec3f { return normalize(vector(120u)-vector(112u)+vec3f(0.,-.00001,0.)); }
fn keyRight()->vec3f { let d=keyDirection(); return normalize(cross(d,select(vec3f(0.,1.,0.),vec3f(1.,0.,0.),abs(d.y)>.99))); }
fn keyUp()->vec3f { return cross(keyRight(),keyDirection()); }
fn keyRange()->f32 { return max(uniforms[119],1.)*4.; }
/** Orthographic light space: x/y in [-1,1] across the shadow box (x widened by the target aspect), z in [0,1]. */
fn keyProject(p:vec3f)->vec3f {
 let q=p-vector(120u); let half=max(uniforms[119],.01);
 return vec3f(dot(q,keyRight())/(half*frame.aspect),dot(q,keyUp())/half,dot(q,keyDirection())/(2.*keyRange())+.5);
}
${shadowBinding === undefined ? "fn keyShadow(world:vec3f,normal:vec3f)->f32 { return 1.; }" : `
@group(0) @binding(${shadowBinding}) var shadowMap:texture_depth_2d;
fn keyShadow(world:vec3f,normal:vec3f)->f32 {
 let size=vec2f(textureDimensions(shadowMap)); let texel=2.*max(uniforms[119],.01)/size.y;
 let soft=max(uniforms[123],.5); let facing=clamp(abs(dot(normal,keyDirection())),.05,1.);
 let p=keyProject(world+normal*texel*1.5);
 let uv=vec2f(p.x*.5+.5,.5-p.y*.5);
 if(any(uv<vec2f(0.)) || any(uv>vec2f(1.)) || p.z>=1.) { return 1.; }
 // A 4x4-cell bilinear PCF (5x5 texel compares with tent weights) on a grid spaced by the softness in texels: smooth and noise-free.
 // A sloped receiver moves away across the kernel, so the bias follows its slope.
 let slope=min(sqrt(1.-facing*facing)/facing,4.);
 let bias=(texel*.6+texel*soft*2.*slope*.6)/(2.*keyRange());
 let cell=uv*size/soft-.5; let origin=floor(cell); let t=cell-origin;
 // When the kernel's corners and center agree the receiver is fully lit or fully shadowed: skip the 25 compares outside penumbrae.
 var agree=0.;
 for(var k=0;k<5;k++) {
  let o=select(vec2f(f32(k&1)*4.-1.,f32(k>>1u)*4.-1.),vec2f(1.),k==4);
  let pixel=clamp(vec2i((origin+o+.5)*soft),vec2i(0),vec2i(size)-vec2i(1));
  agree+=select(0.,1.,p.z-bias<=textureLoad(shadowMap,pixel,0));
 }
 if(agree==5.) { return 1.; }
 if(agree==0.) { return 1.-clamp(uniforms[125],0.,1.); }
 var lit=0.;
 for(var j=0;j<5;j++) { for(var i=0;i<5;i++) {
  let pixel=clamp(vec2i((origin+vec2f(f32(i-1),f32(j-1))+.5)*soft),vec2i(0),vec2i(size)-vec2i(1));
  let w=vec2f(select(select(1.,t.x,i==4),1.-t.x,i==0),select(select(1.,t.y,j==4),1.-t.y,j==0));
  lit+=w.x*w.y*select(0.,1.,p.z-bias<=textureLoad(shadowMap,pixel,0));
 } }
 return mix(1.,lit/16.,clamp(uniforms[125],0.,1.));
}`}
fn keyLight(world:vec3f,normal:vec3f,view:vec3f,albedo:vec3f,roughness:f32,metal:f32)->vec3f {
 let toward=-keyDirection(); let nl=max(0.,dot(normal,toward));
 if(nl<=0. || uniforms[115]<=0.) { return vec3f(0.); }
 let halfVector=normalize(toward+view); let nh=max(0.,dot(normal,halfVector)); let nv=max(.0001,dot(normal,view));
 let alpha=roughness*roughness; let a2=alpha*alpha; let denominator=nh*nh*(a2-1.)+1.;
 let distribution=a2/(3.14159265*denominator*denominator);
 let visibility=.5/max(.0001,nl*sqrt(nv*nv*(1.-a2)+a2)+nv*sqrt(nl*nl*(1.-a2)+a2));
 let f0=mix(vec3f(.04),albedo,metal); let fresnel=f0+(1.-f0)*pow(1.-max(0.,dot(view,halfVector)),5.);
 let diffuse=albedo*(1.-fresnel)*(1.-metal)/3.14159265;
 return (diffuse+fresnel*distribution*visibility)*nl*vector(116u)*uniforms[115]${shadeKey ? "*keyShadow(world,normal)" : ""};
}
`;
}

/** Studio panels and a horizon band over a dark floor; roughness blurs every edge with conserved energy, standing in for a prefiltered map. */
export const environmentCode = `
// A soft rectangle in azimuth/elevation: centre, half-size and blur in radians.
fn envPanel(az:f32,el:f32,center:vec2f,half:vec2f,blur:f32)->f32 {
 let dx=abs(fract((az-center.x)/6.2831853+.5)-.5)*6.2831853; let dy=abs(el-center.y);
 let x=1.-smoothstep(-blur,blur,dx-half.x); let y=1.-smoothstep(-blur,blur,dy-half.y);
 return x*y*half.x*half.y/((half.x+blur)*(half.y+blur));
}
fn environment(d:vec3f,roughness:f32)->vec3f {
 let a=roughness*roughness; let blur=.015+a*1.2;
 let az=atan2(d.x,d.z); let el=asin(clamp(d.y,-1.,1.));
 var c=mix(vec3f(.004,.004,.005),vec3f(.018,.019,.024),smoothstep(-.05,.6,d.y));
 c+=vec3f(.09,.095,.11)*exp(-abs(el)/(.05+a))*(.05+a)/(.05+a*3.);
 c+=vec3f(1.,.98,.95)*2.2*envPanel(az,el,vec2f(0.,1.35),vec2f(3.2,.22),blur);
 c+=vec3f(.92,.95,1.)*2.6*envPanel(az,el,vec2f(-1.65,.3),vec2f(.22,.4),blur);
 c+=vec3f(1.,.96,.92)*1.6*envPanel(az,el,vec2f(1.4,.25),vec2f(.12,.32),blur);
 c+=vec3f(.85,.9,1.)*.9*envPanel(az,el,vec2f(3.1416,.3),vec2f(.5,.15),blur);
 c+=vec3f(.8,.85,1.)*.5*envPanel(az,el,vec2f(.3,.18),vec2f(.6,.1),blur);
 return c;
}
fn environmentLight(normal:vec3f,view:vec3f,albedo:vec3f,roughness:f32,metal:f32)->vec3f {
 let nv=max(0.,dot(normal,view)); let f0=mix(vec3f(.04),albedo,metal);
 // Analytic split-sum approximation (Karis, mobile).
 let c0=vec4f(-1.,-.0275,-.572,.022); let c1=vec4f(1.,.0425,1.04,-.04);
 let r=roughness*c0+c1; let a004=min(r.x*r.x,exp2(-9.28*nv))*r.x+r.y; let ab=vec2f(-1.04,1.04)*a004+r.zw;
 let specular=environment(reflect(-view,normal),roughness)*(f0*ab.x+ab.y);
 let diffuse=environment(normal,1.)*albedo*(1.-metal)*.6;
 return (specular+diffuse)*uniforms[124];
}
`;

/** Screen-space contact shadow toward the key light: a short depth-buffer march, darkening the lit scene where it is blocked. */
export function contactShadowCode(bindings: string, depthCode: string) {
  return `${bindings}
@group(0) @binding(3) var source:texture_2d<f32>;
@group(0) @binding(4) var depth:texture_depth_2d;
${depthCode}
fn keyDirectionContact()->vec3f { return normalize(vector(120u)-vector(112u)+vec3f(0.,-.00001,0.)); }
fn screenOf(world:vec3f)->vec3f {
 let delta=world-vector(0u); let z=dot(delta,cameraForward());
 let ndc=vec2f(dot(delta,cameraRight())/(uniforms[3]*frame.aspect),dot(delta,cameraUp())/uniforms[3])/max(z,.0001);
 return vec3f(ndc.x*.5+.5,.5-ndc.y*.5,z);
}
@fragment fn contactShadow(@location(0) uv:vec2f,@builtin(position) position:vec4f)->@location(0) vec4f {
 let color=textureSampleLevel(source,linearSampler,uv,0.);
 let distance=depthAt(uv); let world=vector(0u)+worldRay(uv)*distance; let toward=-keyDirectionContact();
 // Surfaces facing away from the key are already unlit; lit ones start a little off their depth-derived normal to avoid self-hits.
 let normal=normalize(cross(dpdy(world),dpdx(world))+vec3f(0.,.00001,0.));
 if(distance>=400.) { return color; }
 let facing=dot(normal,toward)*sign(dot(normal,vector(0u)-world));
 if(facing<=.05) { return color; }
 let start=world+normal*sign(dot(normal,vector(0u)-world))*distance*.004;
 let jitter=fract(52.9829189*fract(dot(floor(position.xy),vec2f(.06711056,.00583715))));
 let reach=max(uniforms[119],1.)*.08; var occlusion=0.;
 for(var i=0u;i<12u;i++) {
  let t=(f32(i)+jitter)/12.; let p=start+toward*(reach*t*t+.02); let s=screenOf(p);
  if(any(s.xy<vec2f(0.)) || any(s.xy>vec2f(1.))) { break; }
  let scene=depthAt(s.xy); let thickness=reach*.5;
  if(scene<s.z-.02 && scene>s.z-thickness) { occlusion=max(occlusion,1.-t); }
 }
 return vec4f(color.rgb*(1.-occlusion*clamp(uniforms[125],0.,1.)*.75),color.a);
}`;
}

export function floorSurfaceCode(surface: FloorSurface) {
  const grid = surface.grid;
  return (grid ? `{ let cell=world.xz/${f(grid.spacing ?? 2)}; let g=abs(fract(cell)-.5)/max(fwidth(cell),vec2f(.00001)); let grid=(1.-min(min(g.x,g.y)/${f(grid.width ?? 1)},1.))*fade;
  color+=${v3(grid.color ?? "#ffffff", grid.intensity ?? .022)}*grid; }` : "") + "\n" + (surface.shader ?? "");
}
