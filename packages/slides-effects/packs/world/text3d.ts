import type { CodeToken } from "@legend-apps/presentation";
import type { Ease, Vec3 } from "./camera";
import { font as defaultFont } from "./text3d-font";
import { font as monoFont } from "./text3d-mono";
import { compileTrack, primitive, type Animated, type Instance, type Keyframe, type MaterialOptions, type Track } from "./scene";

/** A font baked by scripts/world-text3d.cjs. `glyphs` holds advance (em), outline point, side segment and cap triangle counts per char. */
export type Text3DFont = { name: string; chars: string; space: number; ascent: number; descent: number; capHeight: number;
  glyphs: number[][]; kerning: Record<string, number>; data: string; license: string };
/** Per-glyph motion. `offset` is added to the glyph's home position; `rotation` is Euler XYZ in degrees about the glyph's center. */
export type GlyphMotion = { offset?: Animated<Vec3>; rotation?: Animated<Vec3>; scale?: Animated<number>; color?: Animated<string>;
  emissive?: Animated<number>; opacity?: Animated<number> };
/** Glyphs start at `offset`/`rotation`/`scale` from home and settle on `step` (or slide time `at`), one every `stagger` seconds. */
export type Text3DEnter = { step?: number; at?: number; delay?: number; offset?: Vec3; rotation?: Vec3; scale?: number; spread?: Vec3; stagger?: number;
  duration?: number; ease?: Ease; order?: "forward" | "reverse" | "center" | "random"; seed?: number; fade?: number };
export type Text3DOptions = {
  /** `mono` selects the bundled JetBrains Mono Bold; `font` takes any baked font. */
  id?: string; sharp?: Animated<boolean>; text: string; tokens?: readonly CodeToken[]; font?: Text3DFont; mono?: boolean; position?: Animated<Vec3>; size?: number;
  /** Extrusion depth, bevel thickness and bevel width, in em. `flat` draws only the front face, unlit in its exact color, like 2D text. */
  flat?: boolean; depth?: number; bevel?: number; bevelWidth?: number; bevelSegments?: number;
  align?: "left" | "center" | "right"; lineHeight?: number; tracking?: number; uppercase?: boolean;
  /** Face color and glow; `side` colors the extruded sides and bevels, shaded by `metal` and `roughness` (or a `material`). */
  color?: Animated<string>; emissive?: Animated<number>; side?: Animated<string>; metal?: Animated<number>; roughness?: Animated<number>;
  material?: string | MaterialOptions; opacity?: Animated<number>;
  enter?: Text3DEnter; glyphs?: GlyphMotion[] | ((index: number, char: string, home: Vec3, color?: string) => GlyphMotion | undefined);
};
export type GlyphInstance = { font: string; index: number; segments: number; rotation: Track<Vec3>; opacity: Track<number>; offset: Track<Vec3>;
  home: Vec3; pivot: [number, number]; depth: number; bevel: number; bevelWidth: number };

const fonts = new Map<string, Text3DFont>([[defaultFont.name, defaultFont], [monoFont.name, monoFont]]);
export function registerText3DFont(font: Text3DFont) {
  const existing = fonts.get(font.name);
  if (existing && existing !== font && existing.data !== font.data) throw new Error(`A different Text3D font is already registered as ${font.name}`);
  fonts.set(font.name, font);
  return font.name;
}
export function text3dFont(name: string) {
  const font = fonts.get(name);
  if (!font) throw new Error(`Unknown Text3D font: ${name}`);
  return font;
}
const strips = (segments: number) => segments > 0 ? 2 * segments + 1 : 1;
/** Vertices one glyph instance emits: both caps, then each outline segment once per profile strip. */
export function glyphVertexCount(font: Text3DFont, index: number, segments: number) {
  const [, , sides, triangles] = font.glyphs[index];
  return 6 * triangles + 6 * sides * strips(segments);
}

/** Lays text out in em: each glyph's index, center (pivot) and line, with kerning and tracking. Unsupported characters become '?'. */
export function layoutText3D(font: Text3DFont, text: string, { align = "center", lineHeight = 1.15, tracking = 0 }: Pick<Text3DOptions, "align" | "lineHeight" | "tracking"> = {}) {
  const fallback = font.chars.indexOf("?");
  const glyphs: { index: number; char: string; offset: number; x: number; y: number; advance: number }[] = [];
  const lines = text.split("\n");
  let offset = 0;
  lines.forEach((line, row) => {
    const chars = [...line], start = glyphs.length;
    let pen = 0;
    chars.forEach((char, i) => {
      const found = font.chars.indexOf(char), index = found < 0 && char !== " " ? fallback : found;
      const advance = index < 0 ? font.space : font.glyphs[index][0];
      if (index >= 0) glyphs.push({ index, char, offset, x: pen + advance / 2, y: -row * lineHeight, advance });
      offset += char.length;
      pen += advance + (font.kerning[char + (chars[i + 1] ?? "")] ?? 0) + (i + 1 < chars.length ? tracking : 0);
    });
    offset++;
    const shift = align === "left" ? 0 : align === "right" ? pen : pen / 2;
    for (let i = start; i < glyphs.length; i++) glyphs[i].x -= shift;
  });
  return glyphs;
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function enterOrder(order: Text3DEnter["order"], count: number, seed: number) {
  const ranks = Array.from({ length: count }, (_, i) => i);
  if (order === "reverse") return ranks.map(i => count - 1 - i);
  if (order === "center") return ranks.map(i => Math.round(Math.abs(i - (count - 1) / 2) * 2));
  if (order === "random") {
    const next = random(seed), shuffled = ranks.slice();
    for (let i = count - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const result: number[] = []; shuffled.forEach((glyph, rank) => { result[glyph] = rank; });
    return result;
  }
  return ranks;
}
function enterTrack<T>(enter: Text3DEnter, from: T, to: T, delay: number, duration: number, ease: Ease | undefined): Keyframe<T>[] {
  delay += enter.delay ?? 0;
  const start = enter.at === undefined ? { step: enter.step ?? 0 } : { at: enter.at };
  return enter.at === undefined
    ? [{ ...start, value: from, duration: 0 }, { ...start, delay, value: to, duration, ease }]
    : [{ at: 0, value: from, duration: 0 }, { at: enter.at + delay, value: to, duration, ease }];
}

/** One instance per visible glyph, drawn together in a single instanced pass per font. Code glyph ids retain their token identity. */
export function text3dInstances(options: Text3DOptions): Instance[] {
  const font = options.font ?? (options.mono ? monoFont : defaultFont);
  const name = registerText3DFont(font);
  const size = options.size ?? 1, depth = options.flat ? 0 : options.depth ?? 0.25, bevel = Math.min(options.bevel ?? 0.03, depth / 2), bevelWidth = options.flat ? 0 : options.bevelWidth ?? 0.014;
  const segments = Math.max(0, Math.min(6, Math.round(options.bevelSegments ?? (bevel > 0 ? 2 : 0))));
  const text = options.uppercase ? options.text.toUpperCase() : options.text;
  const layout = layoutText3D(font, text, options);
  const enter = options.enter, ranks = enter ? enterOrder(enter.order, layout.length, enter.seed ?? 1) : [];
  const jitter = random(enter?.seed ?? 7);
  let tokenIndex = 0;
  return layout.map((glyph, i) => {
    const tokens = options.tokens;
    while (tokens && tokenIndex + 1 < tokens.length && tokens[tokenIndex + 1].offset <= glyph.offset) tokenIndex++;
    const candidate = tokens?.[tokenIndex];
    const token = candidate && glyph.offset >= candidate.offset && glyph.offset < candidate.offset + candidate.content.length ? candidate : undefined;
    const home: Vec3 = [glyph.x * size, glyph.y * size, 0];
    const custom = typeof options.glyphs === "function" ? options.glyphs(i, glyph.char, home, token?.color) : options.glyphs?.[i];
    let offset: Animated<Vec3> = [0, 0, 0], rotation: Animated<Vec3> = [0, 0, 0], scale: Animated<number> = 1, opacity: Animated<number> = options.opacity ?? 1;
    if (enter) {
      const delay = ranks[i] * (enter.stagger ?? 0.06), duration = enter.duration ?? 0.9, spread = enter.spread ?? [0, 0, 0];
      const from = enter.offset ?? [0, 0, 6];
      const start: Vec3 = [from[0] + (jitter() - 0.5) * spread[0], from[1] + (jitter() - 0.5) * spread[1], from[2] + (jitter() - 0.5) * spread[2]];
      offset = enterTrack<Vec3>(enter, start, [0, 0, 0], delay, duration, enter.ease ?? "spring");
      rotation = enterTrack<Vec3>(enter, enter.rotation ?? [0, 0, 0], [0, 0, 0], delay, duration, enter.ease ?? "spring");
      scale = enterTrack(enter, enter.scale ?? 1, 1, delay, duration, enter.ease ?? "spring");
      opacity = enterTrack(enter, 0, 1, delay, duration * (enter.fade ?? 0.35), "cubic");
    }
    const motion = { offset, rotation, scale, opacity, color: token?.color ?? options.color ?? "#f2f4f8", emissive: options.emissive ?? 0.75, ...custom };
    const scaleTrack = compileTrack(motion.scale, (value: number): Vec3 => [value, value, value]);
    return {
      ...primitive("box", { id: options.id ? `${options.id}:${token ? `${token.id}:${glyph.offset - token.offset}` : i}` : undefined, position: options.position, sharp: options.sharp, size, color: motion.color, emissive: motion.emissive,
        material: options.material ?? { albedo: options.side ?? "#2a2c31", metal: options.metal ?? 0.85, roughness: options.roughness ?? 0.32, rim: 0.4 } }),
      scale: scaleTrack,
      glyph: { font: name, index: glyph.index, segments, rotation: compileTrack<Vec3>(motion.rotation), opacity: compileTrack(motion.opacity),
        offset: compileTrack<Vec3>(motion.offset), home, pivot: [glyph.advance / 2, font.capHeight / 2], depth, bevel, bevelWidth },
    };
  });
}

const words = new Map<string, Float32Array>();
/** Header (6 words per glyph: point, segment and triangle offsets and counts), points (x, y, normal, miter as f32), packed segments and triangles. */
export function text3dBuffer(name: string, id: string) {
  let buffer = words.get(name);
  if (!buffer) {
    const font = text3dFont(name);
    const bytes = new Uint8Array(font.data.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(font.data.substr(i * 2, 2), 16);
    const source = new Int16Array(bytes.buffer);
    const total = font.glyphs.reduce((sum, [, points, segments, triangles]) => sum + points * 6 + segments + triangles, 0);
    buffer = new Float32Array(font.glyphs.length * 6 + total);
    const integers = new Uint32Array(buffer.buffer);
    let input = 0, output = font.glyphs.length * 6;
    font.glyphs.forEach(([, points, segments, triangles], glyph) => {
      const header = glyph * 6;
      integers[header] = output; integers[header + 1] = points;
      for (let i = 0; i < points; i++, input += 6) {
        buffer![output++] = source[input] / 8192; buffer![output++] = source[input + 1] / 8192;
        buffer![output++] = source[input + 2] / 32767; buffer![output++] = source[input + 3] / 32767;
        buffer![output++] = source[input + 4] / 8191; buffer![output++] = source[input + 5] / 8191;
      }
      integers[header + 2] = output; integers[header + 3] = segments;
      for (let i = 0; i < segments; i++, input += 2) integers[output++] = source[input] | source[input + 1] << 16;
      integers[header + 4] = output; integers[header + 5] = triangles;
      for (let i = 0; i < triangles; i++, input += 3) integers[output++] = source[input] | source[input + 1] << 10 | source[input + 2] << 20;
    });
    if (output !== buffer.length || input !== source.length) throw new Error(`Invalid Text3D font data: ${name}`);
    words.set(name, buffer);
  }
  return { id, size: buffer.byteLength, init: buffer };
}

const f = (n: number) => Number.isInteger(n) ? n + "." : String(n);
/** Glyph instance fields: 0 center, 3 size, 4 face color, 7 face emissive, 8 scale, 11 glyph, 12 rotation (degrees), 15 pivot y,
 * 16 depth (0 draws only an unlit front face), 17 bevel, 18 bevel width, 19 pivot x (em), 23 opacity, 24 side albedo, 27 roughness, metal, rim, activation. */
export function text3dCode(prefix: string, slot: string, segments: number) {
  const rings = segments > 0 ? `
fn profile(ring:u32,width:f32,bevel:f32,depth:f32)->vec4f {
 let back=ring>${segments}u; let k=select(ring,${2 * segments + 1}u-ring,back);
 let angle=f32(k)/${f(segments)}*1.5707963; let s=sin(angle); let c=cos(angle);
 let normal=normalize(vec2f(s/max(width,.0001),c/max(bevel,.0001)));
 let z=depth*.5-bevel*(1.-c);
 return vec4f(-width*(1.-s),select(z,-z,back),normal.x,select(normal.y,-normal.y,back));
}` : `
fn profile(ring:u32,width:f32,bevel:f32,depth:f32)->vec4f { return vec4f(0.,select(depth*.5,-depth*.5,ring>0u),1.,0.); }`;
  return `${prefix}
@group(0) @binding(3) var<storage,read> glyphData:array<u32>;
${slot}
struct GlyphVertex { @builtin(position) position:vec4f, @location(0) world:vec3f, @location(1) normal:vec3f, @location(2) @interpolate(flat) instance:u32, @location(3) face:f32 }
fn real(i:u32)->f32 { return bitcast<f32>(glyphData[i]); }
${rings}
fn rotate(v:vec3f,degrees:vec3f)->vec3f {
 let r=degrees*.017453293; let c=cos(r); let s=sin(r);
 let x=vec3f(v.x,v.y*c.x-v.z*s.x,v.y*s.x+v.z*c.x);
 let y=vec3f(x.x*c.y+x.z*s.y,x.y,-x.x*s.y+x.z*c.y);
 return vec3f(y.x*c.z-y.y*s.z,y.x*s.z+y.y*c.z,y.z);
}
@vertex fn glyphVertex(@builtin(vertex_index) vid:u32,@builtin(instance_index) iid:u32)->GlyphVertex {
 let base=slot(iid); let header=u32(uniforms[base+11u])*6u;
 let points=glyphData[header]; let segments=glyphData[header+2u]; let segmentCount=glyphData[header+3u];
 let triangles=glyphData[header+4u]; let capVertices=glyphData[header+5u]*3u;
 let depth=uniforms[base+16u]; let bevel=uniforms[base+17u]; let width=uniforms[base+18u];
 var result:GlyphVertex; result.instance=iid;
 if(depth<=0. && vid>=capVertices) { result.position=vec4f(2.,2.,0.,1.); return result; }
 var local=vec3f(0.); var normal=vec3f(0.,0.,1.);
 if(vid<capVertices*2u) {
  let back=vid>=capVertices; let k=vid%capVertices; let corner=select(k%3u,2u-k%3u,back);
  let point=points+((glyphData[triangles+k/3u]>>(corner*10u))&1023u)*6u;
  let miter=vec2f(real(point+4u),real(point+5u));
  local=vec3f(vec2f(real(point),real(point+1u))-miter*width,select(depth*.5,-depth*.5,back));
  normal=vec3f(0.,0.,select(1.,-1.,back)); result.face=1.;
 } else {
  let side=vid-capVertices*2u; let quad=side/6u; let strip=quad/max(segmentCount,1u);
  if(strip>=${strips(segments)}u || uniforms[base+23u]<=.001) { result.position=vec4f(2.,2.,0.,1.); return result; }
  let uv=corner(side); let pair=glyphData[segments+quad%segmentCount];
  let point=points+select(pair&65535u,pair>>16u,uv.x>.5)*6u;
  let ring=profile(strip+u32(uv.y),width,bevel,depth);
  let outward=vec2f(real(point+2u),real(point+3u));
  local=vec3f(vec2f(real(point),real(point+1u))+vec2f(real(point+4u),real(point+5u))*ring.x,ring.y);
  normal=vec3f(outward*ring.z,ring.w); result.face=0.;
 }
 if(uniforms[base+23u]<=.001) { result.position=vec4f(2.,2.,0.,1.); return result; }
 let scale=max(vector(base+8u),vec3f(.0001)); let size=uniforms[base+3u];
 let rotation=vector(base+12u);
 let world=bend(vector(base))+rotate((local-vec3f(uniforms[base+19u],uniforms[base+15u],0.))*size*scale,rotation);
 result.position=projected(world); result.world=world; result.normal=normalize(rotate(normal/scale,rotation));
 return result;
}
// A soft studio environment: dark floor, a bright overhead band and a cool horizon, so metal sides read without an environment map.
fn studio(direction:vec3f)->vec3f {
 let y=direction.y;
 return mix(vec3f(.012,.012,.014),vec3f(.08,.085,.1),smoothstep(-.3,.15,y))+vec3f(.9,.92,1.)*smoothstep(.55,.75,y)*(1.-smoothstep(.85,1.,y))*.3;
}
@fragment fn glyphFragment(in:GlyphVertex)->@location(0) vec4f {
 let base=slot(in.instance); let opacity=uniforms[base+23u];
 if(opacity<=.001) { discard; }
 var normal=normalize(in.normal); let view=normalize(eye()-in.world);
 if(dot(normal,view)<0.) { normal=-normal; }
 let color=vector(base+4u); let glow=uniforms[base+7u];
 if(uniforms[base+16u]<=0.) { return vec4f(toScene(encode(color))*opacity,opacity); }
 if(in.face>.5) {
  let lit=illuminate(in.world,normal,Material(color*.12,color*glow,.45,0.),color,0.,0.);
  return vec4f(lit*opacity,opacity);
 }
 let albedo=vector(base+24u); let roughness=clamp(uniforms[base+27u],.04,1.); let metal=clamp(uniforms[base+28u],0.,1.);
 var lit=illuminate(in.world,normal,Material(albedo,color*glow*.04,roughness,metal),color,uniforms[base+29u],uniforms[base+30u]);
 let f0=mix(vec3f(.04),albedo,metal); let fresnel=f0+(1.-f0)*pow(1.-max(0.,dot(normal,view)),5.);
 lit+=studio(reflect(-view,normal))*fresnel*(1.-roughness*.75);
 return vec4f(lit*opacity,opacity);
}`;
}
