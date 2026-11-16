import { d, tgpu } from "typegpu";

/** Journey structs live in the flat f32 uniform array: scalars take one float, 3-vectors three, with no padding. */
export type FloatField = d.F32 | d.Vec3f;
export type FloatFields = Record<string, FloatField>;
export function floatLayout<T extends FloatFields>(fields: T) {
  let size = 0;
  const offsets = {} as Record<keyof T, number>;
  for (const [key, type] of Object.entries(fields) as [keyof T, FloatField][]) { offsets[key] = size; size += type.type === "vec3f" ? 3 : 1; }
  return { offsets, size };
}
/** WGSL declaring `struct` and `<signature>->Struct`, which loads each field from `index(key)`, a WGSL float index. */
export function loaderCode(struct: d.WgslStruct<FloatFields>, signature: string, index: (key: string) => string) {
  const fields = Object.entries(struct.propTypes).map(([key, type]) => type.type === "vec3f" ? `vector(${index(key)})` : `uniforms[${index(key)}]`);
  return tgpu.resolve({ externals: { Struct: struct }, template: `\n${signature}->Struct { return Struct(${fields.join(",")}); }\n` });
}
