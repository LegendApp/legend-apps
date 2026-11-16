import { colorVector, primitive, type Instance, type PrimitiveOptions, type Shading } from "./scene";

/** A flat picture in the scene, from an image `source` (a data, file or web URI) or from `pixels`.
 * An image holds `frames` equal frames side by side (default 1), `aspect` wide per unit of height (default 1); pixels under half
 * opacity are cut out. `pixels` is a list of frames, each a list of equal-length rows, top first, whose characters are `palette` keys;
 * `.` or a space is clear. `size` is half the sprite's height in world units, as for Box (default 0.5); `billboard` (default true) keeps it
 * facing the camera. Frames advance at `fps` on the continuous clock, so walk cycles run on through navigation. `shading` defaults to
 * "flat": colors draw exactly as authored. */
export type SpriteOptions = Omit<PrimitiveOptions, "end" | "curve" | "thickness" | "material" | "extent"> & {
  id: string; source?: string; frames?: number; aspect?: number; pixels?: string[][]; palette?: Record<string, string>; fps?: number; billboard?: boolean;
  shading?: Shading; roughness?: number;
};

const f = (n: number) => Number.isInteger(n) ? `${n}.` : String(n);
const geometries = new Map<string, { vertexCount: number; wgsl: string }>();

function spriteGeometry(frames: string[][], palette: Record<string, string>, fps: number, billboard: boolean) {
  const height = frames[0].length, width = frames[0][0]?.length ?? 0;
  if (!height || !width || frames.some(frame => frame.length !== height || frame.some(row => row.length !== width))) {
    throw new Error("Sprite frames need the same number of equal-length rows");
  }
  const keys = Object.keys(palette).filter(key => key.length === 1 && key !== "." && key !== " ");
  const indices: number[] = [];
  for (const frame of frames) for (const row of frame) for (const char of row) {
    if (char === "." || char === " ") { indices.push(0); continue; }
    const index = keys.indexOf(char);
    if (index < 0) throw new Error(`Sprite pixel "${char}" has no palette color`);
    indices.push(index + 1);
  }
  const key = JSON.stringify([indices, keys.map(k => palette[k]), width, fps, billboard]);
  let geometry = geometries.get(key);
  if (geometry) return geometry;
  const colors = keys.map(k => `vec3f(${colorVector(palette[k]).map(f).join(",")})`);
  const axes = axesCode(billboard);
  // The sprite spans y in [-1, 1]; x keeps the pixels square.
  geometry = { vertexCount: width * height * 6, wgsl: `
var<private> spritePixels:array<u32,${indices.length}>=array<u32,${indices.length}>(${indices.map(i => `${i}u`).join(",")});
var<private> spritePalette:array<vec3f,${colors.length + 1}>=array<vec3f,${colors.length + 1}>(vec3f(0.),${colors.join(",")});
fn spriteFrame()->u32 { return u32(floor(max(0.,continuousTime())*${f(fps)}))%${frames.length}u; }
fn spritePixel(x:u32,y:u32)->u32 { return spritePixels[spriteFrame()*${width * height}u+(${height - 1}u-y)*${width}u+x]; }
fn shape(iid:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
 ${axes}
 let cell=vid/6u; let x=cell%${width}u; let y=cell/${width}u;
 if(spritePixel(x,y)==0u) { return ShapeVertex(vec3f(0.),facing); }
 let p=(vec2f(f32(x),f32(y))+corner(vid))*${f(2 / height)}-vec2f(${f(width / height)},1.);
 return ShapeVertex(right*p.x+up*p.y,facing);
}
fn shade(iid:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
 ${axes}
 let base=slot(iid); let part=instanceAt(base);
 let local=transpose(partRotation(base))*(unbend(world)-part.position)/(max(part.scale,vec3f(.0001))*max(part.radius,.0001));
 let cell=clamp(vec2i(floor((vec2f(dot(local,right),dot(local,up))+vec2f(${f(width / height)},1.))*${f(height / 2)})),vec2i(0),vec2i(${width - 1},${height - 1}));
 let color=spritePalette[spritePixel(u32(cell.x),u32(cell.y))];
 return Material(color,color*part.emissive,part.roughness,0.);
}` };
  geometries.set(key, geometry);
  return geometry;
}

function axesCode(billboard: boolean) {
  return billboard ? "let right=cameraRight(); let up=cameraUp(); let facing=-cameraForward();" : "let right=vec3f(1.,0.,0.); let up=vec3f(0.,1.,0.); let facing=vec3f(0.,0.,1.);";
}
/** One quad textured from the instance's image map, frame by frame across the image. */
function imageGeometry(frames: number, aspect: number, fps: number, billboard: boolean) {
  const key = JSON.stringify(["image", frames, aspect, fps, billboard]);
  let geometry = geometries.get(key);
  if (geometry) return geometry;
  geometry = { vertexCount: 6, wgsl: `
fn shape(iid:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
 ${axesCode(billboard)}
 let p=corner(vid)*2.-1.;
 return ShapeVertex(right*p.x*${f(aspect)}+up*p.y,facing);
}
fn shade(iid:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
 ${axesCode(billboard)}
 let base=slot(iid); let part=instanceAt(base);
 let local=transpose(partRotation(base))*(unbend(world)-part.position)/(max(part.scale,vec3f(.0001))*max(part.radius,.0001));
 let frame=f32(u32(floor(max(0.,continuousTime())*${f(fps)}))%${frames}u);
 let uv=vec2f((frame+clamp(dot(local,right)/${f(aspect)}*.5+.5,0.,.9999))/${f(frames)},.5-dot(local,up)*.5);
 let texel=mapTexel(partMap(part.detail),uv,true);
 if(texel.a<.5) { discard; }
 return Material(texel.rgb,texel.rgb*part.emissive,part.roughness,0.);
}` };
  geometries.set(key, geometry);
  return geometry;
}

export function spriteInstance({ source, frames = 1, aspect = 1, pixels, palette = {}, fps = 8, billboard = true, shading = "flat", roughness = 1, ...options }: SpriteOptions): Instance {
  if (!(fps > 0) || !Number.isFinite(fps)) throw new Error("Sprite fps must be positive");
  if (!source === !pixels) throw new Error("Sprite needs either a source image or pixels");
  if (pixels && !pixels.length) throw new Error("Sprite needs at least one frame");
  if (source && (!Number.isInteger(frames) || frames < 1 || !(aspect > 0) || !Number.isFinite(aspect))) throw new Error("Sprite frames must be a positive integer and aspect positive");
  const instance: Instance = { ...primitive("box", { emissive: 0, ...options, size: options.size ?? 0.5, material: { roughness, shading } }),
    custom: source ? imageGeometry(frames, aspect, fps, billboard) : spriteGeometry(pixels!, palette, fps, billboard) };
  if (source) instance.map = source;
  return instance;
}
