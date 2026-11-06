import type { CodeHighlight } from "@legend-apps/presentation";
import type { Ease } from "./camera";

/** Scene theme colors. Color props of scene parts also take these names, such as `color="accent"`. */
export const defaultColors = {
  text: "#eef0f3", muted: "#7d838c", idle: "#5b616b", accent: "#ff3a1c", hot: "#ffa21f",
  link: "#4aa8ff", added: "#4aa8ff", removed: "#ff3a1c", highlight: "#be91ff", panel: "#121419",
};
export type SceneColors = typeof defaultColors;
export type ColorName = keyof SceneColors;
/** A part's `enter` and `exit` default to these; `step` is the scene's local step. */
export const enterDefaults = { step: 0, delay: 0, duration: .8, ease: "cubic" as Ease, from: [0, -6, 0] as [number, number, number] };
export const exitDefaults = { delay: 0, duration: .8, ease: "cubic" as Ease, to: [0, 0, -40] as [number, number, number] };
export const sequenceDefaults = { delay: 0, duration: .8, ease: "cubic" as Ease, distance: 20 };
export const ambientEffects = ["dust", "trails", "orbs", "fog"] as const;
export type AmbientEffect = typeof ambientEffects[number];
export type Ambient = AmbientEffect | { effect: AmbientEffect; count?: number; color?: string; density?: number; length?: number };

const eases: Ease[] = ["linear", "cubic", "inOut", "out", "smoothstep", "expo", "spring"];
/** Returns a complaint about `value`, or nothing when it passes. */
type Rule = (value: unknown, path: string) => string | undefined;
const shown = (value: unknown) => { try { return JSON.stringify(value) ?? String(value); } catch { return String(value); } };
const is = (test: (value: unknown) => boolean, expected: string): Rule => (value, path) => test(value) ? undefined : `${path} must be ${expected} (got ${shown(value)}).`;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const number = (min = -Infinity, unit = "") => is(v => finite(v) && v >= min, min === -Infinity ? `a number${unit}` : min === 0 ? `a number${unit} ≥ 0` : `a number${unit} ≥ ${min}`);
const positive = (unit = "") => is(v => finite(v) && v > 0, `a number${unit} > 0`);
const fraction = is(v => finite(v) && v >= 0 && v <= 1, "a number from 0 to 1");
const step = is(v => Number.isInteger(v) && (v as number) >= 0, "a step number (0, 1, 2…)");
const text = is(v => typeof v === "string" && v.length > 0, "a non-empty string");
const flag = is(v => typeof v === "boolean", "true or false");
const vec3 = is(v => Array.isArray(v) && v.length === 3 && v.every(finite), "[x, y, z]");
const oneOf = (...options: string[]) => is(v => options.includes(v as string), `one of ${options.map(o => `"${o}"`).join(", ")}`);
const ease = oneOf(...eases);
const hex = (value: unknown) => typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
const color = is(v => hex(v) || Object.hasOwn(defaultColors, v as string), `#RGB, #RRGGBB or a theme color (${Object.keys(defaultColors).join(", ")})`);
/** Step maps and keyframe lists animate a value; only a plain value is checked. */
const animated = (rule: Rule): Rule => (value, path) => value !== null && typeof value === "object" ? undefined : rule(value, path);
const list = (rule: Rule, empty = false): Rule => (value, path) => !Array.isArray(value) || (!empty && !value.length) ? `${path} must be a${empty ? "" : " non-empty"} list (got ${shown(value)}).`
  : value.map((item, i) => rule(item, `${path}[${i}]`)).find(Boolean);
const either = (a: Rule, b: Rule, expected: string): Rule => (value, path) => !a(value, path) || !b(value, path) ? undefined : `${path} must be ${expected} (got ${shown(value)}).`;
const distance = (a: string, b: string) => {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const up = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)); diagonal = up; }
  }
  return row[b.length];
};
const wave = is(v => finite(v) && v >= 0 || Array.isArray(v) && v.length === 2 && v.every(finite) && v[0] >= 0 && v[1] > 0,
  "an amplitude ≥ 0 or [amplitude, period in seconds > 0]");
type Fields = Record<string, Rule>;
/** Props that parts and scenes pass on to World as they are; never mistaken for typos. */
const passThrough = new Set(["mdxSource", "children", "side", "font", "metal", "roughness", "material", "uppercase", "bevel", "bevelWidth", "bevelSegments",
  "opacity", "glyphs", "tracking", "text", "label", "labels", "name", "value", "next", "count", "step", "mark", "source", "gap", "world", "clock"]);
/** Unknown keys pass through to the scene, except near-misses of a known one, which are typos. */
function fields(value: Record<string, unknown>, known: Fields, path: string, required: string[] = []) {
  for (const key of required) if (value[key] === undefined) return `${path ? `${path}.` : ""}${key} is required.`;
  for (const [key, item] of Object.entries(value)) {
    const name = path ? `${path}.${key}` : key;
    if (known[key]) { if (item !== undefined) { const error = known[key](item, name); if (error) return error; } continue; }
    if (passThrough.has(key)) continue;
    const near = Object.keys(known).find(k => distance(k.toLowerCase(), key.toLowerCase()) <= (key.length > 4 ? 2 : 1));
    if (near) return `Unknown prop ${name}. Did you mean ${path ? `${path}.` : ""}${near}?`;
  }
  return undefined;
}
const shape = (known: Fields, required: string[] = []): Rule => (value, path) =>
  value === null || typeof value !== "object" || Array.isArray(value) ? `${path} must be an object (got ${shown(value)}).` : fields(value as Record<string, unknown>, known, path, required);
const record = (rule: Rule, key: Rule): Rule => (value, path) => value === null || typeof value !== "object" || Array.isArray(value) ? `${path} must be an object (got ${shown(value)}).`
  : Object.entries(value).map(([k, v]) => key(Number(k), `${path} key ${k}`) ?? rule(v, `${path}[${k}]`)).find(Boolean);

const carry = shape({ lift: number(), spread: number(), spin: number(), stagger: is(v => finite(v) && v >= 0 && v <= .9, "a number from 0 to 0.9") });
const stepCamera = shape({ orbit: number(-Infinity, " of degrees"), dolly: positive(), shift: vec3, frame: text, fov: is(v => finite(v) && v > 0 && v < 180, "degrees between 0 and 180"),
  duration: positive(" of seconds"), ease });
export const cameraFields: Fields = { spacing: positive(), duration: positive(" of seconds"), ease, position: vec3, target: vec3, via: vec3, viaTarget: vec3,
  turn: is(v => finite(v) && Math.abs(v as number) <= 60, "degrees from -60 to 60"), rise: number(-Infinity, " of world units"),
  bank: is(v => finite(v) && (v as number) >= 0 && (v as number) <= 45, "degrees from 0 to 45"),
  frame: oneOf("station", "world"), carry, steps: record(stepCamera, step), heldMotion: fraction, heldBlur: number(0), depthFade: number(0), heldFade: fraction };
const ambientOne = either(oneOf(...ambientEffects), shape({ effect: oneOf(...ambientEffects), count: is(v => Number.isInteger(v) && (v as number) > 0, "a whole number > 0"),
  color, density: number(0), length: positive() }, ["effect"]), `one of ${ambientEffects.join(", ")}, or { effect, … }`);
const sceneFields: Fields = { id: text, layout: is(v => typeof v === "string", "a layout name"), durations: list(positive(" of seconds")), camera: shape(cameraFields),
  colors: shape(Object.fromEntries(Object.keys(defaultColors).map(k => [k, is(hex, "#RGB or #RRGGBB")]))), ambient: either(ambientOne, list(ambientOne), "an ambient effect or a list of them") };

const motion = { step, delay: number(0, " of seconds"), duration: positive(" of seconds"), ease };
const partFields: Fields = { id: text, slot: text, at: vec3, delay: number(0, " of seconds"), duration: positive(" of seconds"), color: animated(color), carry: flag, sharp: flag,
  enter: shape({ ...motion, from: vec3, stagger: number(0, " of seconds"), scale: number(0) }), exit: shape({ ...motion, to: vec3 }, ["step"]),
  sequence: shape({ in: step, out: step, distance: positive(), delay: motion.delay, duration: motion.duration, ease }) };
const textFields: Fields = { size: positive(), depth: number(0), track: number(), lineHeight: positive(), emissive: animated(number(0)), mono: flag, align: oneOf("left", "center", "right") };
const codeMarks = list(shape({ text, opacity: fraction, step, delay: number(0, " of seconds") }, ["text"]), true);
const kindFields: Record<string, Fields> = {
  headline: textFields, quote: textFields,
  code: { size: positive(), lineHeight: positive(), anchor: oneOf("center"), fill: fraction, panelColor: color, textColor: color, padding: number(0), border: number(0), flat: flag, marks: codeMarks },
  grid: { chrome: oneOf("mac"), fill: fraction, border: number(0), resize: oneOf("width", "height"), anchor: oneOf("top", "center"), grow: number(0) },
  morph: { size: positive(), lineHeight: positive(), anchor: oneOf("center"), fill: fraction, border: number(0), flat: flag, highlight: shape({ opacity: fraction, word: shape({ opacity: fraction }) }), marks: codeMarks },
  trace: { size: positive(), lineHeight: positive(), anchor: oneOf("center"), fill: fraction, border: number(0), flat: flag, highlight: shape({ opacity: fraction }) },
  rule: { lights: flag },
  bars: { items: list(shape({ label: is(v => typeof v === "string", "a string"), value: number(0), color }, ["label", "value"])), height: positive(), width: positive(), depth: positive(),
    gap: positive(), max: positive(), delay: number(0, " of seconds"), stagger: number(0, " of seconds"), duration: positive(" of seconds"), ease, labelSize: positive(),
    from: shape({ part: text, step, delay: number(0, " of seconds"), duration: positive(" of seconds"), fold: flag, color }, ["part"]) },
  tree: { nodes: list(shape({ id: text })), width: positive(), levelHeight: positive(), nodeWidth: positive(), labelSize: positive(), boxColor: color, borderColor: color, drop: number(0, " of seconds") },
  keys: { keys: list(text), next: list(text), scroll: step, diff: step, remove: step, insert: step, recycle: step,
    viewport: is(v => Number.isInteger(v) && (v as number) > 0, "a whole number > 0"), window: step, links: step },
  layers: { count: is(v => Number.isInteger(v) && (v as number) > 0, "a whole number > 0"), meter: list(fraction, true), colors: list(color),
    bob: wave, orbit: wave, pulse: wave, lag: number(0, " of seconds"), words: list(text), size: positive() },
  flight: { words: list(either(text, list(text), "a word or a list of words")), path: list(vec3), gap: positive(), drift: number(0), size: positive(), ahead: number(0), ease, gather: step, row: vec3 },
};
const required: Record<string, string[]> = { bars: ["items"], tree: ["nodes"], keys: ["keys"], flight: ["words"] };

const parts: Record<string, string> = { headline: "Headline", quote: "Quote", code: "CodePanel", tree: "Tree", list: "List", editor: "Editor", counter: "Counter", rule: "Rule",
  bars: "Bars", keys: "Keys", grid: "Grid", form: "Form", morph: "CodeMorph", trace: "CodeTrace", cloud: "Cloud", layers: "Layers", flight: "Flight" };
/** An authoring error names the MDX file and line when the deck compiler supplied `mdxSource`, and always the element. */
export function authoringError(props: Record<string, unknown>, element: string, message: string) {
  const id = typeof props.id === "string" ? ` id="${props.id}"` : "";
  return Error(`${typeof props.mdxSource === "string" ? `${props.mdxSource}: ` : ""}<${element}${id}> ${message}`);
}
export function checkScene(props: Record<string, unknown>) {
  const error = fields(props, sceneFields, "", ["id"]);
  if (error) throw authoringError(props, "Scene", error);
}
export function checkPart(kind: string, props: Record<string, unknown>) {
  const error = fields(props, { ...partFields, ...kindFields[kind] }, "", ["id", ...required[kind] ?? []]);
  if (error) throw authoringError(props, parts[kind] ?? kind, error);
}
const highlightedKinds = new Set(["code", "morph", "trace", "layers"]);
/** Code parts take their colors from the compiler's Shiki tokens, which only fenced blocks carry; a string child would render uncolored. */
export function checkHighlighted(kind: string, props: Record<string, unknown>, source: string, highlighted: CodeHighlight | undefined) {
  if (highlightedKinds.has(kind) && source.trim() && !highlighted?.tokens.length)
    throw authoringError(props, parts[kind], "code must be a fenced block (```tsx) so it is syntax highlighted, not a string.");
}
/** Theme color names resolve against the scene's colors; anything else passes through. */
export function paint<T>(value: T, colors: SceneColors): T | string {
  return typeof value === "string" && Object.hasOwn(colors, value) ? colors[value as ColorName] : value;
}
