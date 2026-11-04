import type { Vec3 } from "./camera";
import { colorVector, primitive, type Animated, type Instance, type MaterialOptions } from "./scene";

/** A directional key light. `position` and `target` set its direction; the shadow box is centred on `target`. */
export type KeyLightOptions = {
  position?: Animated<Vec3>; target?: Animated<Vec3>; color?: Animated<string>; intensity?: Animated<number>;
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

/** Painted lines run along the floor's z axis at `x` (mirrored to -x unless `symmetric` is false). `dash` is the dash length; 0 draws a solid line. */
export type FloorLine = { x: number; width?: number; color?: string; intensity?: number; dash?: number; gap?: number; symmetric?: boolean };
/** Alternating kerb stripes between `x` and `x + width`, `stripe` long. */
export type FloorKerb = { x: number; width?: number; stripe?: number; colors?: [string, string]; intensity?: number; symmetric?: boolean };
export type FloorMarkings = {
  /** Opacity of the floor surface over its mirror reflection; markings stay opaque. */
  veil?: number;
  /** `false` leaves the floor unlit: its color and markings ignore scene lights; key shadows still apply. */
  lit?: boolean;
  /** `"overlay"` overlays the reflection on the floor color per channel, as three.js `Reflector` does: dim reflections vanish, bright ones stay. */
  reflectionBlend?: "mix" | "overlay";
  grid?: { spacing?: number; color?: string; intensity?: number; width?: number };
  lines?: FloorLine[]; kerbs?: FloorKerb[];
  /** A checkered start line across the track at `z`, with `rows` staggered grid slots behind it (toward +z), `spacing` apart.
   * `width` is the track's half-width (default the outermost line or kerb). On by default when the floor has lines or kerbs. */
  start?: { z?: number; width?: number; rows?: number; spacing?: number; checker?: number; color?: string; intensity?: number } | false;
  /** World units that dashes, kerbs and the start line smear along z at peak travel speed (default 2.5; 0 keeps them sharp). */
  motionBlur?: number;
};

export type TunnelOptions = {
  id?: string;
  /** Axis-aligned polyline the tunnel follows; the floor of each frame sits at the point's y. Defaults to `from` → `to`. */
  path?: Vec3[]; from?: Vec3; to?: Vec3;
  spacing?: number; width?: number; height?: number; thickness?: number;
  color?: string; material?: string | MaterialOptions;
  /** Emissive strips under the top beam, running between frames. */
  strips?: { color?: string; intensity?: number; material?: MaterialOptions; count?: number; length?: number; width?: number } | false;
  /** Low emissive edge lights along both walls. */
  edges?: { color?: string; intensity?: number; material?: MaterialOptions; height?: number; length?: number } | false;
  /** Light rigs on the inner face of every `every`th pair of posts (default 2): `count` lamps per post that chase down the tunnel
   * (`chase` is its speed, 0 holds them steady) and streak `streak` world units along the path at peak travel speed. */
  lights?: { color?: string; intensity?: number; every?: number; count?: number; chase?: number; streak?: number } | false;
};

const tunnelMaterial: MaterialOptions = { albedo: "#0d0e11", roughness: 0.4, metal: 0.8 };

/** Repeated portal frames (two posts and a beam) with light strips, built from boxes. */
export function tunnelInstances({ id = "tunnel", path, from = [0, 0, 20], to = [0, 0, -120], spacing = 6, width = 22, height = 10, thickness = 0.4,
  color = "#0d0e11", material = tunnelMaterial, strips = {}, edges = {}, lights = {} }: TunnelOptions = {}): Instance[] {
  const points = path ?? [from, to];
  if (points.length < 2 || !(spacing > 0)) throw new Error("Tunnel needs a path of two or more points and a positive spacing");
  const instances: Instance[] = [];
  const box = (name: string, position: Vec3, scale: Vec3, glow?: { color: string; intensity: number; material?: MaterialOptions }) => instances.push(primitive("box", {
    id: `${id}:${name}:${instances.length}`, position, scale, size: 0.5, color: glow?.color ?? color, emissive: glow?.intensity ?? 0,
    material: glow ? glow.material : material }));
  const rigs: string[] = [];
  let carry = 0, frame = 0;
  for (let segment = 0; segment + 1 < points.length; segment++) {
    const a = points[segment], b = points[segment + 1];
    const delta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const length = Math.hypot(delta[0], delta[2]);
    if (length === 0) continue;
    const alongX = Math.abs(delta[0]) > Math.abs(delta[2]);
    const direction: Vec3 = [delta[0] / length, delta[1] / length, delta[2] / length];
    // Local axes: `across` is horizontal and perpendicular to the path; sizes swap x/z when the path runs along x.
    const across = (x: number, y: number, z: number): Vec3 => alongX ? [z, y, x] : [x, y, z];
    for (let distance = carry; distance <= length + 1e-6; distance += spacing) {
      const p: Vec3 = [a[0] + direction[0] * distance, a[1] + direction[1] * distance, a[2] + direction[2] * distance];
      const at = (x: number, y: number, z: number): Vec3 => { const o = across(x, y, z); return [p[0] + o[0], p[1] + o[1], p[2] + o[2]]; };
      for (const side of [-1, 1]) box("post", at(side * width / 2, height / 2, 0), across(thickness, height, thickness));
      box("beam", at(0, height, 0), across(width + thickness, thickness, thickness));
      if (lights && frame++ % (lights.every ?? 2) === 0) rigs.push(`vec4f(${p.map(f).join(",")},${alongX ? "1." : "0."})`);
      const next = distance + spacing <= length + 1e-6 || segment + 2 < points.length;
      if (!next) continue;
      // Strips and edges sit halfway to the next frame, along the path.
      const half = (x: number, y: number, z: number): Vec3 => {
        const o = across(x, y, z);
        return [p[0] + o[0] + direction[0] * spacing / 2, p[1] + o[1] + direction[1] * spacing / 2, p[2] + o[2] + direction[2] * spacing / 2];
      };
      if (strips) {
        const count = strips.count ?? 2;
        for (let i = 0; i < count; i++) {
          const x = count === 1 ? 0 : (i / (count - 1) - 0.5) * width / 2;
          box("strip", half(x, height - 0.25, 0), across(strips.width ?? 0.18, 0.06, spacing * (strips.length ?? 0.55)),
            { color: strips.color ?? "#cfe0ff", intensity: strips.intensity ?? 2.2, material: strips.material });
        }
      }
      if (edges) for (const side of [-1, 1]) box("edge", half(side * (width / 2 - 0.3), edges.height ?? 0.3, 0), across(0.06, 0.06, spacing * (edges.length ?? 0.7)),
        { color: edges.color ?? "#ff3b30", intensity: edges.intensity ?? 1.8, material: edges.material });
    }
    if (carry <= length + 1e-6) carry += Math.floor((length - carry) / spacing + 1e-6) * spacing + spacing;
    carry -= length;
  }
  if (lights && rigs.length) instances.push(tunnelLights(id, rigs, lights, width / 2 - thickness / 2 - 0.04, height));
  return instances;
}

/** Every rig's lamps in one custom draw; travel speed stretches them along the path. */
function tunnelLights(id: string, rigs: string[], { color = "#9fd8ff", intensity = 7, count = 4, chase = 1, streak = 3 }: Exclude<TunnelOptions["lights"], false | undefined>, inner: number, height: number): Instance {
  const lamps = count * 2;
  return { ...primitive("box", { id: `${id}:lights`, size: 1, color, emissive: intensity, material: { albedo: "#000000", rim: 0 } }), custom: { vertexCount: rigs.length * lamps * 36, wgsl: `
const RIGS=array<vec4f,${rigs.length}>(${rigs.join(",")});
fn shape(iid:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
 let lamp=vid/36u; let rig=RIGS[lamp/${lamps}u]; let side=select(-1.,1.,lamp%2u==0u); let row=f32((lamp%${lamps}u)/2u);
 let face=(vid%36u)/6u; let q=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.))[vid%6u];
 let sgn=select(-1.,1.,face%2u==0u); let axis=face/2u; var p=vec3f(q.x,q.y,sgn); var n=vec3f(0.,0.,sgn);
 if(axis==0u) { p=vec3f(sgn,q.x,q.y); n=vec3f(sgn,0.,0.); }
 if(axis==1u) { p=vec3f(q.x,sgn,q.y); n=vec3f(0.,sgn,0.); }
 let local=vec3f(side*${f(inner)},${f(height)}*(.22+.56*row/${f(Math.max(1, count - 1))}),0.)+p*vec3f(.04,.13,.13+travelSpeed()*${f(streak)});
 let world=select(local,local.zyx,rig.w>.5); let normal=select(n,n.zyx,rig.w>.5);
 return ShapeVertex(rig.xyz+world,normal);
}
fn shade(iid:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
 let base=slot(iid); let along=world.x+world.z;
 let pulse=${chase > 0 ? `.35+.65*pow(.5+.5*sin(along*.12+continuousTime()*${f(chase * 6)}),3.)` : "1."};
 return Material(vec3f(0.),vector(base+4u)*uniforms[base+7u]*pulse/(1.+travelSpeed()*${f(streak * 0.5)}),1.,0.);
}` } };
}

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

/** Floor markings, static in the shader; returns WGSL statements that read `world` and update `color` and `mask`. */
export function floorMarkingsCode(markings: FloorMarkings) {
  const lines: string[] = [`let blur=travelSpeed()*${f(markings.motionBlur ?? 2.5)};`];
  if (markings.grid) {
    const g = markings.grid, spacing = f(g.spacing ?? 2);
    lines.push(`{ let cell=world.xz/${spacing}; let g=abs(fract(cell)-.5)/max(fwidth(cell),vec2f(.00001)); let grid=(1.-min(min(g.x,g.y)/${f(g.width ?? 1)},1.))*fade;
  color+=${v3(g.color ?? "#ffffff", g.intensity ?? 0.022)}*grid; }`);
  }
  for (const line of markings.lines ?? []) {
    const width = f(line.width ?? 0.08), dash = line.dash ?? 0, gap = line.gap ?? dash;
    const distance = line.symmetric === false ? `abs(world.x-${f(line.x)})` : `abs(abs(world.x)-${f(Math.abs(line.x))})`;
    lines.push(`{ let d=${distance}; let aa=max(fwidth(world.x),.0001); var paint=1.-smoothstep(${width}*.5-aa*.5,${width}*.5+aa*.5,d);
  ${dash > 0 ? `let period=${f(dash + gap)}; let z=fract(world.z/period)*period; let dz=max(fwidth(world.z),blur+.0001); paint*=smoothstep(0.,dz,z)*(1.-smoothstep(${f(dash)}-dz,${f(dash)},z));` : ""}
  paint*=fade; color=mix(color,${v3(line.color ?? "#ffffff", line.intensity ?? 0.55)},paint); mask=max(mask,paint); }`);
  }
  for (const kerb of markings.kerbs ?? []) {
    const width = kerb.width ?? 0.8, stripe = f(kerb.stripe ?? 1.6), [a, b] = kerb.colors ?? ["#808080", "#ff3b30"];
    const x = kerb.symmetric === false ? "world.x" : "abs(world.x)", from = kerb.symmetric === false ? kerb.x : Math.abs(kerb.x);
    lines.push(`{ let aa=max(fwidth(world.x),.0001); let k=smoothstep(${f(from)}-aa,${f(from)}+aa,${x})*(1.-smoothstep(${f(from + width)}-aa,${f(from + width)}+aa,${x}));
  let sw=max(fwidth(world.z/${stripe}),blur/${stripe}); let s=smoothstep(.5-sw*.5,.5+sw*.5,abs(fract(world.z/${stripe})-.5)*2.);
  let paint=k*fade; color=mix(color,mix(${v3(a, kerb.intensity ?? 0.45)},${v3(b, kerb.intensity ?? 0.45)},s),paint); mask=max(mask,paint); }`);
  }
  const start = markings.start ?? (markings.lines?.length || markings.kerbs?.length ? {} : false);
  if (start) {
    const edges = [...(markings.lines ?? []), ...(markings.kerbs ?? [])].map(mark => Math.abs(mark.x));
    const width = start.width ?? (edges.length ? Math.max(...edges) : 9), z = start.z ?? 0, c = start.checker ?? 0.75;
    const rows = start.rows ?? 4, spacing = start.spacing ?? 3.2, paint = v3(start.color ?? "#ffffff", start.intensity ?? 0.6);
    // Box-filtered checkers (the filter widens along z with travel speed), two squares deep, ending at the line.
    lines.push(`{ let q=world.xz/${f(c)}+vec2f(${f(width / c)},0.); let w=fwidth(q)+vec2f(.001,blur/${f(c)});
  let i=2.*(abs(fract((q-.5*w)*.5)-.5)-abs(fract((q+.5*w)*.5)-.5))/w; let checker=.5-.5*i.x*i.y;
  let aa=max(fwidth(world.z),.0001)+blur*.5; let band=(1.-smoothstep(${f(width)}-aa,${f(width)}+aa,abs(world.x)))*smoothstep(${f(z - 2 * c)}-aa,${f(z - 2 * c)}+aa,world.z)*(1.-smoothstep(${f(z)}-aa,${f(z)}+aa,world.z));
  let paint=band*fade; color=mix(color,${paint}*checker+${v3("#0c0d10", 1)}*(1.-checker),paint); mask=max(mask,paint); }`);
    if (rows > 0) lines.push(`for(var side=-1.;side<2.;side+=2.) {
  let lz=world.z-${f(z + 1.2)}-select(0.,${f(spacing / 2)},side>0.); let row=clamp(floor((lz+.3)/${f(spacing)}),0.,${f(rows - 1)}); let local=vec2f(world.x-side*${f(width / 2)},lz-row*${f(spacing)});
  let aa=max(length(fwidth(world.xz)),.0001); let bar=max(abs(local.x)-1.3,abs(local.y))-.06; let leg=max(abs(abs(local.x)-1.3)-.06,abs(local.y-.7)-.7);
  let paint=(1.-smoothstep(-aa,aa,min(bar,leg)))*fade; color=mix(color,${paint},paint); mask=max(mask,paint); }`);
  }
  return lines.join("\n ");
}

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
