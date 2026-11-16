import type { Ease, Vec3 } from "./camera";
import { compileTrack, labelInstance, primitive, type Animated, type Instance, type PrimitiveOptions } from "./scene";

/** `gradient` (0 to 1) darkens the box toward its bottom by that fraction. */
export type RoundedBoxOptions = Omit<PrimitiveOptions, "end" | "curve" | "thickness"> & { radius?: number; edge?: number; gradient?: number };
/** `beads` (default 7) spheres trail the head, `spacing` (default 0.025) apart in path progress, tapering from `trailSize` (default `size`). */
export type TubePulse = { every?: number; step?: number; at?: number; delay?: number; duration?: number; color?: string; size?: number; emissive?: number; trailEmissive?: number; trailSize?: number; beads?: number; spacing?: number };
export type RoutedTubeOptions = {
  id: string; path: Vec3[]; join?: "miter"; draw?: Animated<number>; thickness?: number; color?: Animated<string>; emissive?: Animated<number>; material?: PrimitiveOptions["material"]; pulses?: TubePulse[];
};
export type PillarOptions = {
  id: string; value: number; from?: number; maximum?: number; position?: Vec3; height?: number; width?: number; depth?: number;
  step?: number; at?: number; delay?: number; duration?: number; ease?: Ease; color?: string; label?: string; counterSize?: number;
  /** Body glow and independent cap glow (default 5). */
  emissive?: number; capEmissive?: number; material?: PrimitiveOptions["material"];
  /** A corner `radius` rounds the body, without a cap, and `gradient` darkens it toward its foot, as on RoundedBox. `counter: false` hides the digits. */
  radius?: number; gradient?: number; counter?: boolean;
};

/** Rounded solid geometry, instanced with the same material/rim controls as World cards. */
export function roundedBoxInstances({ radius = 0.1, edge = 0.6, gradient = 0, ...options }: RoundedBoxOptions): Instance[] {
  if (![radius, edge, gradient].every(v => Number.isFinite(v) && v >= 0) || gradient > 1) throw new Error("RoundedBox needs a nonnegative radius and edge, and a gradient from 0 to 1");
  return [{ ...primitive("box", { ...options, size: options.size ?? 0.5, scale: options.scale ?? [2, 0.7, 0.35], emissive: options.emissive ?? 0.08,
  }), custom: roundedBoxGeometry(radius, edge, gradient) }];
}

// One geometry object per shape so equal boxes batch into a single custom draw (draws group by geometry identity).
const roundedBoxGeometries = new Map<string, { vertexCount: number; wgsl: string }>();
function roundedBoxGeometry(radius: number, edge: number, gradient = 0) {
  const key = `${radius}:${edge}:${gradient}`;
  let geometry = roundedBoxGeometries.get(key);
  if (!geometry) roundedBoxGeometries.set(key, geometry = { vertexCount: 6 * 8 * 8 * 6, wgsl: `
fn bevelCoordinate(v:f32,half:f32,radius:f32)->f32 {
 let t=abs(v); return sign(v)*select((half-radius)+radius*(t-.25)/.75,t*4.*(half-radius),t<=.25);
}
fn shape(iid:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
 let base=slot(iid); let half=max(vector(base+8u)*uniforms[base+3u],vec3f(.0001));
 let radius=min(${radius.toFixed(6)},min(half.x,min(half.y,half.z))*.99);
 let cell=vid/6u; let face=cell/64u;
 let uv=((vec2f(f32(cell%8u),f32((cell%64u)/8u))+corner(vid))/8.)*2.-1.;
 var p=vec3f(0.); var n=vec3f(0.);
 if(face==0u) { p=vec3f(1.,uv.y,uv.x); n=vec3f(1.,0.,0.); }
 if(face==1u) { p=vec3f(-1.,uv.y,-uv.x); n=vec3f(-1.,0.,0.); }
 if(face==2u) { p=vec3f(uv.x,1.,uv.y); n=vec3f(0.,1.,0.); }
 if(face==3u) { p=vec3f(uv.x,-1.,-uv.y); n=vec3f(0.,-1.,0.); }
 if(face==4u) { p=vec3f(uv.x,uv.y,1.); n=vec3f(0.,0.,1.); }
 if(face==5u) { p=vec3f(-uv.x,uv.y,-1.); n=vec3f(0.,0.,-1.); }
 p=vec3f(bevelCoordinate(p.x,half.x,radius),bevelCoordinate(p.y,half.y,radius),bevelCoordinate(p.z,half.z,radius)); let inner=max(half-vec3f(radius),vec3f(.000001)); let q=clamp(p,-inner,inner);
 let delta=p-q; n=normalize(delta+n*.000001);
 return ShapeVertex((q+n*radius)/half,n*half);
}
fn shade(iid:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
 let base=slot(iid); let half=max(vector(base+8u)*uniforms[base+3u],vec3f(.0001)); let rise=clamp((world.y-vector(base).y)/half.y*.5+.5,0.,1.);
 let color=vector(base+4u)*(1.-${gradient.toFixed(6)}*(1.-rise)); let edge=pow(1.-abs(normal.z),.6)*${edge.toFixed(6)};
 return Material(vector(base+24u)*(1.-${gradient.toFixed(6)}*(1.-rise)),color*(uniforms[base+7u]+edge*.3),uniforms[base+27u],uniforms[base+28u]);
}` });
  return geometry;
}

// Closed routes meet on the angle-bisector plane, rather than ending in two open cylinder rings.
// Keep a growing endpoint square until it reaches the joint; arc-length draw and pulse timing stay unchanged.
function joinedTubeGeometry(start: Vec3, end: Vec3, previous: Vec3, next: Vec3) {
  const direction = (a: Vec3, b: Vec3) => { const d = b.map((v, i) => v - a[i]); const length = Math.hypot(...d); return d.map(v => v / length); };
  const tangent = direction(start, end);
  const miter = (direction: number[]) => { const divisor = 1 + direction.reduce((sum, v, i) => sum + v * tangent[i], 0); return direction.map(v => -v / Math.max(divisor, .000001)); };
  const vector = (v: number[]) => `vec3f(${v.map(n => n.toFixed(8)).join(",")})`;
  return { vertexCount: 12 * 6 * 6, wgsl: `
fn shape(iid:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
 let part=instanceAt(slot(iid)); let endpoint=part.endpoint-part.position;
 let tangent=normalize(endpoint); let axis=select(vec3f(0.,1.,0.),vec3f(1.,0.,0.),abs(tangent.y)>.95);
 let right=normalize(cross(tangent,axis)); let up=cross(right,tangent);
 let cell=vid/6u; let uv=(vec2f(f32(cell%12u),f32(cell/12u))+corner(vid))/vec2f(12.,6.);
 let normal=right*cos(uv.y*6.2831853)+up*sin(uv.y*6.2831853);
 let startMiter=${vector(miter(direction(previous, start)))};
 let endMiter=select(vec3f(0.),${vector(miter(direction(end, next)))},length(endpoint)>=${Math.hypot(...end.map((v, i) => v - start[i])).toFixed(8)}-.00001);
 let shift=mix(dot(normal, startMiter),dot(normal, endMiter),uv.x);
 return ShapeVertex((endpoint*uv.x+(normal+tangent*shift)*part.thickness)/max(part.radius,.0001),normal);
}
fn shade(iid:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
 let part=instanceAt(slot(iid)); return Material(part.albedo,part.color*part.emissive,part.roughness,part.metal);
}` };
}

/** Straight segments share an arc-length draw track and a fixed pool of pulse beads. Closed paths can opt into mitered joints. */
export function routedTubeInstances({ id, path, join, draw = 1, thickness = 0.018, color = "#334155", emissive = 0.5, material, pulses = [] }: RoutedTubeOptions): Instance[] {
  if (path.length < 2 || path.some(p => p.some(n => !Number.isFinite(n))) || !Number.isFinite(thickness) || thickness <= 0) throw new Error("RoutedTube needs a finite path and positive thickness");
  const points = path.filter((p, i) => i === 0 || p.some((n, axis) => n !== path[i - 1][axis]));
  if (points.length < 2) throw new Error("RoutedTube path must have nonzero length");
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(...points[i].map((v, axis) => v - points[i - 1][axis])));
  const route = { points, lengths, draw: compileTrack(draw) };
  const closed = points.length > 3 && points[0].every((v, axis) => v === points.at(-1)![axis]);
  if (join && !closed) throw new Error("Mitered RoutedTube joints need a closed path");
  const instances = points.slice(1).map((end, index) => ({ ...primitive("tube", { id: `${id}:${index}`, position: points[index], end, color, emissive, thickness, material }),
    ...join ? { custom: joinedTubeGeometry(points[index], end, points[index ? index - 1 : points.length - 2], points[(index + 2) % (points.length - 1)]) } : {},
    route: { ...route, segment: index } }));
  const beads: Instance[] = [];
  pulses.forEach((pulse, index) => {
    if (!Number.isFinite(pulse.duration ?? 0.5) || (pulse.duration ?? 0.5) <= 0) throw new Error("Tube pulses need a positive duration");
    if (pulse.every !== undefined && (!Number.isFinite(pulse.every) || pulse.every <= 0)) throw new Error("Tube pulse period must be positive");
    const count = pulse.beads ?? 7;
    for (let bead = 0; bead < count; bead++) beads.push({ ...primitive("sphere", { id: `${id}:pulse:${index}:${bead}`, size: (bead ? pulse.trailSize ?? pulse.size ?? thickness * 2.7 : pulse.size ?? thickness * 2.7) * (1 - bead * 0.63 / count),
      color: pulse.color ?? "#22d3ee", emissive: (bead ? pulse.trailEmissive ?? pulse.emissive ?? 5 : pulse.emissive ?? 5) * (1 - bead / (count + 1)) }), route: { ...route, pulse, bead } });
  });
  return [...instances, ...beads];
}

/** Floor-anchored luminous column and extruded digits, all reading one numeric keyframe track. */
export function pillarInstances(options: PillarOptions): Instance[] {
  const { id, value, from = 0, maximum = Math.max(value, from, 1), position = [0, -4, 0], height = 5, width = 1.2, depth = 0.8,
    color = "#22d3ee", counterSize = 0.5, label } = options;
  if (![value, from, maximum, height, width, depth, counterSize].every(Number.isFinite) || value < 0 || from < 0 || maximum <= 0 || height <= 0 || width <= 0 || depth <= 0 || counterSize <= 0) throw new Error("Pillar needs nonnegative values and positive dimensions");
  const track = compileTrack([{ step: 0, value: from, duration: 0 }, { step: options.step ?? 0, at: options.at, value, delay: options.delay,
    duration: options.duration ?? 1.6, ease: options.ease ?? "smoothstep" }]);
  const pillar = { value: track, maximum, height };
  const body = primitive("box", { id, position, scale: [width, 1, depth], color, emissive: options.emissive ?? 1.2, material: options.material ?? { metal: 0.35, roughness: 0.22 } });
  body.pillar = { ...pillar, role: "body" };
  const instances = [body];
  if (options.radius !== undefined) body.custom = roundedBoxGeometry(options.radius, 0.6, options.gradient);
  else {
    const cap = primitive("box", { id: `${id}:cap`, position, scale: [width + 0.05, 0.045, depth + 0.05], color, emissive: options.capEmissive ?? 5 });
    cap.pillar = { ...pillar, role: "top" };
    instances.push(cap);
  }
  const digits = String(Math.round(Math.max(from, value))).length, advance = counterSize * 0.68;
  // Seven-segment digits are real lit meshes, with a stable fixed-width pool as values tick.
  const segments = [[0, 0.45, 0.43, 0.09], [0.23, 0.23, 0.09, 0.38], [0.23, -0.23, 0.09, 0.38], [0, -0.45, 0.43, 0.09], [-0.23, -0.23, 0.09, 0.38], [-0.23, 0.23, 0.09, 0.38], [0, 0, 0.43, 0.09]];
  for (let digit = 0; digit < (options.counter === false ? 0 : digits); digit++) for (let segment = 0; segment < 7; segment++) {
    const [x, y, w, h] = segments[segment];
    const instance = primitive("box", { id: `${id}:digit:${digit}:${segment}`, position: [position[0] + ((digits - 1) / 2 - digit) * advance + x * counterSize,
      position[1] + counterSize * (0.8 + y), position[2]], scale: [w * counterSize, h * counterSize, counterSize * 0.15], color: "#e8eef6", emissive: 0.8 });
    instance.pillar = { ...pillar, role: "digit", digit, segment };
    instances.push(instance);
  }
  if (label) instances.push(labelInstance({ id: `${id}:label`, text: label, position: [position[0], position[1] - 0.5, position[2] + depth / 2], align: "center", mono: true, size: 0.25, color: "#a8b8cc", emissive: 0.8 }));
  return instances;
}
