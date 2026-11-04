import React, { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { useDeckContent, usePresentationValue } from "@legend-apps/presentation";
import { Box, Card, Custom, Pillar, Rows, RoutedTube, Stage, Text3D, WorldSlide, type Text3DOptions, type WorldProps, type WorldTrack } from "./World";

export type V3 = [number, number, number];
export type Span = [number, number];
export const TYPE = 100 / 72;
export const ease = {
  io: (u: number) => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
  sine: (u: number) => .5 - .5 * Math.cos(Math.PI * u),
  out: (u: number) => 1 - Math.pow(1 - u, 3),
  lin: (u: number) => u,
};
export const hash = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ramp = (t: number, a: number, d: number, e: keyof typeof ease = "io") => ease[e](clamp((t - a) / d));
export const back = (u: number) => { const c = 1.25; u = clamp(u); return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const lerp3 = (a: V3, b: V3, u: number): V3 => add(a, mul(sub(b, a), u));
export const bez3 = (a: V3, b: V3, c: V3, d: V3, u: number): V3 => { const k = 1 - u;
  return add(add(mul(a, k * k * k), mul(b, 3 * k * k * u)), add(mul(c, 3 * k * u * u), mul(d, u * u * u))); };
export const deg = (r: V3): V3 => [r[0] * 57.2958, r[1] * 57.2958, r[2] * 57.2958];


const hex = (c: number) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0");
export const rgb = (c: V3) => `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`;
export const parse = (h: string): V3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export function createTimeline(lengths: number[]) {
  const START = lengths.reduce<number[]>((all, length, i) => [...all, all[i] + length], [0]).slice(0, lengths.length);
  const END = START[START.length - 1] + lengths[lengths.length - 1];
  const at = (beat: number, delay = 0) => START[beat] + delay;
  const beatOf = (t: number) => { let b = 0; while (b + 1 < START.length && t >= START[b + 1]) b++; return b; };
  type Window = { start: number; end: number };
  const win = (i: number): Window => ({ start: START[i], end: START[i + 1] ?? END });
  type Life = { home: V3; from: number; to?: number; side?: number; tin?: number; dur?: number; start?: V3; prev?: V3; next?: V3 };
  type Pose = { p: V3; r: V3; s: number };
  const railStart = (L: Life): V3 => L.start ?? add(L.home, [(L.side ?? 1) * 15, 0, -3]);
  const exitSlot = (L: Life): V3 => add(L.home, [(L.side ?? 1) * 6, 9, -14]);
  const hiddenPose = (p: V3): Pose => ({ p, r: [0, 0, 0], s: 0 });
  function poseIn(L: Life, t: number): Pose {
    if (L.tin === undefined) return { p: L.home, r: [0, 0, 0], s: 1 };
    const u = clamp((t - L.tin) / (L.dur ?? 1.1)), side = L.side ?? 1, start = railStart(L);
    return { p: bez3(start, add(start, [-side * 6, 0, 0]), add(L.home, [0, 0, -2.2]), L.home, back(u)), r: [0, (1 - clamp(u * 1.4)) * -side * .9, 0], s: u > 0 ? 1 : 0 };
  }
  function pose(lives: Life[], t: number): Pose {
    const b = beatOf(t);
    for (let i = 0; i < lives.length; i++) {
      const L = lives[i], last = L.to ?? L.from;
      if (b < L.from) return hiddenPose(L.prev ?? lives[i - 1]?.next ?? (L.tin === undefined ? L.home : railStart(L)));
      if (b <= last) return poseIn(L, t);
    }
    const L = lives[lives.length - 1];
    return hiddenPose(L.next ?? exitSlot(L));
  }
  /** Big parts shrink as they leave, not on landing, so they never fill the frame; the sliver stays parked behind the camera. */
  const shrinking = (q: Pose, t: number, last: number) => beatOf(t) > last ? .02 : q.s;
  const lifeSpans = (lives: Life[]): Span[] => lives.flatMap(L => L.tin === undefined ? [] : [[L.tin - .02, L.tin + (L.dur ?? 1.1) + .02] as Span]);

  // ---------- Bake ----------
  type KF<T> = { step: number; delay: number; value: T; duration: number; ease: "linear" };
  function sampleTimes(w: Window, spans: Span[] | undefined, fps: number) {
    // Each window ends just before its beat does: the next beat's first pose belongs to the carried flight.
    const end = w.end - .001, out = new Set<number>([w.start, end]);
    for (const [a0, b0] of spans ?? [[w.start, end] as Span]) {
      const a = Math.max(w.start, a0), b = Math.min(end, b0);
      if (a >= b) continue;
      for (let t = a; t < b; t += 1 / fps) out.add(t);
      out.add(b);
    }
    return [...out].sort((x, y) => x - y);
  }
  /** Ramer-Douglas-Peucker on time-parameterized samples, with per-component max error. */
  function thin(ts: number[], vs: number[][], eps: number) {
    const keep = new Uint8Array(ts.length); keep[0] = keep[ts.length - 1] = 1;
    const stack: [number, number][] = [[0, ts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!; let worst = -1, where = -1;
      for (let i = a + 1; i < b; i++) {
        const u = (ts[i] - ts[a]) / (ts[b] - ts[a]);
        let err = 0; for (let k = 0; k < vs[i].length; k++) err = Math.max(err, Math.abs(vs[a][k] + (vs[b][k] - vs[a][k]) * u - vs[i][k]));
        if (err > worst) { worst = err; where = i; }
      }
      if (worst > eps) { keep[where] = 1; stack.push([a, where], [where, b]); }
    }
    return ts.map((_, i) => i).filter(i => keep[i]);
  }
  /** A value outside `spans` is constant within a beat; a single [a, b] span samples at 30 fps (flashes), span lists at 20 fps (part motion). */
  function track<T>(f: (t: number) => number[], wrap: (v: number[]) => T, eps: number, span?: Span | Span[]): T | KF<T>[] {
    const spans = span === undefined ? undefined : typeof span[0] === "number" ? [span as Span] : span as Span[];
    const fps = span === undefined ? 15 : typeof span[0] === "number" ? 30 : 20;
    const frames: KF<T>[] = []; let last: number[] | undefined, first: number[] | undefined;
    for (let i = 0; i < START.length; i++) {
      const w = win(i), ts = sampleTimes(w, spans, fps), vs = ts.map(f);
      first ??= vs[0];
      const ref = last ?? vs[0];
      if (vs.every(v => v.every((x, k) => Math.abs(x - ref[k]) <= eps))) { last = ref; continue; }
      const idx = thin(ts, vs, eps);
      frames.push({ step: i, delay: 0, value: wrap(vs[0]), duration: 0, ease: "linear" });
      for (let k = 1; k < idx.length; k++) frames.push({ step: i, delay: ts[idx[k - 1]] - w.start, value: wrap(vs[idx[k]]), duration: ts[idx[k]] - ts[idx[k - 1]], ease: "linear" });
      last = vs[vs.length - 1];
    }
    if (!frames.length) return wrap(first!);
    if (frames[0].step > 0) frames.unshift({ step: 0, delay: 0, value: wrap(first!), duration: 0, ease: "linear" });
    return frames;
  }
  const vec = (f: (t: number) => V3, eps = .015, span?: Span | Span[]) => track<V3>(f, v => [v[0], v[1], v[2]], eps, span);
  const num = (f: (t: number) => number, eps = .01, span?: Span | Span[]) => track<number>(t => [f(t)], v => v[0], eps, span);
  const color = (f: (t: number) => V3, eps = .02, span?: Span | Span[]) => track<string>(f, v => rgb(v as V3), eps, span);

  return { START, END, at, beatOf, win, vec, num, color, pose, shrinking, lifeSpans };
}
export function createTypography(metrics: Record<string, { glyphs: Record<string, readonly number[]> }>, white = "#eef0f3") {
  type Face = "display" | "mono";
  const adv = (ch: string, font: Face, size: number) => ((metrics[font].glyphs as Record<string, readonly number[]>)[ch]?.[0] ?? .5) * size;
  type Glyph = { f: number; ch: string; font: Face; size: number; depth: number; home: V3; color: string; emissive: number };
  /** Glyph positions are the centers of their outline bounds. */
  function layout(str: string, o: { font?: Face; size?: number; depth?: number; align?: "left" | "center"; track?: number; caps?: boolean; color?: string; emissive?: number; at?: V3; f?: number } = {}) {
    // Nominal size uses TYPE em; tracking uses the unscaled nominal units.
    const font = o.font ?? "display", nominal = o.size ?? 1, size = nominal * TYPE, depth = o.depth ?? .25, track = o.track ?? 0;
    if (o.caps ?? font === "display") str = str.toUpperCase();
    const els: Glyph[] = []; let x = 0;
    for (const ch of str) {
      const g = (metrics[font].glyphs as Record<string, readonly number[]>)[ch];
      if (ch !== " " && g && g.length > 1) els.push({ f: o.f ?? 0, ch, font, size, depth, color: o.color ?? white, emissive: o.emissive ?? .32,
        home: [x + (g[1] + g[3]) / 2 * size, (g[2] + g[4]) / 2 * size, 0] });
      x += adv(ch, font, size) + track * nominal;
    }
    const w = x - track * nominal, dx = (o.align ?? "center") === "center" ? -w / 2 : 0;
    for (const e of els) e.home = add(e.home, [dx, 0, 0]);
    if (o.at) for (const e of els) e.home = add(e.home, o.at);
    return { els, w };
  }


  return { layout, TYPE };
}

export type AuthoredPart = { kind: string; id: string; text: string; order: number; [key: string]: unknown };
export type AuthoredSlide = { id: string; layout?: string; durations: number[]; camera?: WorldTrack; parts: AuthoredPart[] };
export type ScenePlan = { elements: ReactElement[]; starts: number[]; end: number; slideBeats: number[]; tracks: (WorldTrack | undefined)[] };
type PartProps = { id: string; children?: ReactNode; [key: string]: unknown };
function part(kind: string) { return Object.assign((_: PartProps) => null, { worldPart: kind }); }
export const Headline = part("headline");
export const Quote = part("quote");
export const CodePanel = part("code");
export const Tree = part("tree");
export const List = part("list");
export const Editor = part("editor");
export const Counter = part("counter");
export const Rule = part("rule");
export const Bars = part("bars");

/** Named placement for a scene: its camera and a slot per part. Parts take the free slots of their kind in order; `slot` names one, and explicit props win. */
export type SceneLayout = { camera?: WorldTrack; slots: Record<string, { kind: string; [prop: string]: unknown }> };
const heading = { kind: "headline", at: [-5.6,5.95,0], size: .62, depth: .16, align: "left", delay: .6, duration: .8 };
const caption = { kind: "headline", at: [-5.56,5.45,0], size: .15, depth: .03, mono: true, align: "left", track: .2, color: "#7d838c", emissive: .5, delay: .8, duration: .8 };
const trackSlots: SceneLayout["slots"] = {
  title: heading, subtitle: caption, tree: { kind: "tree", at: [0,2.6,0] },
  note: { kind: "headline", at: [1.85,2.6+2-.07,0], size: .2, mono: true, align: "left", color: "#be91ff", emissive: .8, delay: 1.8 },
  stat1: { kind: "counter", at: [2.7,2.6+2.95,0] }, stat2: { kind: "counter", at: [4.6,2.6+2.95,0] },
};
const code = { kind: "code", size: .165, lineHeight: .3 };
export const sceneLayouts: Record<string, SceneLayout> = {
  /** An empty hold, low and left of the lane, before the first station. */
  "lead-in": { camera: { position: [-6.5,1.3,-23.5], target: [0,3.2,-32] }, slots: {} },
  /** Large centered lines with an optional kicker above and rule below. */
  statement: { camera: { position: [-.8,2.5,11.6], target: [0,2.3,0] }, slots: {
    line1: { kind: "headline", at: [0,3.35,0], size: 1.25, depth: .32, track: .02, delay: .15 },
    line2: { kind: "headline", at: [0,1.85,0], size: 1.25, depth: .32, track: .02, delay: .9 },
    kicker: { kind: "headline", at: [0,4.9,0], size: .2, depth: .04, mono: true, track: .25, color: "#ff3a1c", emissive: .6, delay: .9, duration: .7 },
    rule: { kind: "rule", at: [0,1.27,0], width: 6.5, delay: 1.6 },
  } },
  /** A centered title over a scrolling list, then a quote in its place on the next step. */
  "title-list": { camera: { position: [-.6,3.9,12.6], target: [0,3.9,0], via: [-3.6,2.2,12], viaTarget: [0,3.5,0] }, slots: {
    title: { kind: "headline", at: [0,6.55,0], size: .95, depth: .3, track: .02, delay: .3, duration: 1.1 },
    quote: { kind: "quote", at: [0,4.75,0], size: .62, depth: .22, track: .02, lineHeight: 1.05 },
  } },
  /** A centered title and quote, then a pair of panels below. */
  "title-panels": { camera: { position: [-1.2,3.6,12.4], target: [0,3.3,0], via: [2.5,5.5,22], viaTarget: [0,3,10] }, slots: {
    title: { kind: "headline", at: [0,4.9,0], size: 1.35, depth: .34, track: .02, delay: .8 },
    quote: { kind: "quote", at: [0,2.55,0], size: .42, depth: .14, track: .015, color: "#d9dce2", emissive: .25, lineHeight: .78 },
  } },
  /** Heading and caption top left, tree in the middle, stats top right. */
  "track-left": { camera: { position: [-1.6,3.7,13], target: [0,3.2,0], via: [-3.5,6.5,20], viaTarget: [0,2,14] }, slots: trackSlots },
  /** `track-left`, flown into from high above. */
  "track-left-high": { camera: { position: [-1.2,3.6,13.2], target: [0,3.2,0], via: [-3,11.5,21], viaTarget: [0,2,12] }, slots: trackSlots },
  /** One tall code panel on the left, two stacked on the right. */
  "code-panels": { camera: { position: [0,3.6,13], target: [0,3.4,0], via: [2.8,6,22], viaTarget: [0,3,10] }, slots: {
    left: { ...code, at: [-7.3,5.8,0] }, topRight: { ...code, at: [.2,6.1,0] }, bottomRight: { ...code, at: [.2,2.25,0] },
  } },
  /** Heading top left over a row of bars on the floor. */
  "title-bars": { camera: { position: [-2.6,3.9,14], target: [0,3.2,0], via: [-3.5,6.5,22], viaTarget: [0,2,14] }, slots: {
    title: { ...heading, at: [-5.6,6.5,-2] }, bars: { kind: "bars", at: [0,0,0] },
    note: { kind: "headline", at: [3.4,-.25,1.6], size: .2, depth: .04, mono: true, track: .12, color: "#be91ff", emissive: .8, delay: 2.2 },
  } },
};
/** Adds a layout, or replaces one of the same name, for this deck. */
export function defineSceneLayout(name: string, layout: SceneLayout) { sceneLayouts[name] = layout; }
/** Without `prepare` a layout name must exist; a `prepare` deck may use the name as its own label. */
function findLayout(name: string | undefined, prepared: boolean) {
  const layout = name === undefined ? undefined : sceneLayouts[name];
  if (name !== undefined && !layout && !prepared) throw Error(`Unknown scene layout: ${name}. Known: ${Object.keys(sceneLayouts).join(", ")}`);
  return layout;
}
function slotPlacer(layout: SceneLayout | undefined) {
  const used = new Set<string>();
  return (kind: string, props: Record<string, unknown>) => {
    if (!layout) return props;
    const name = (props.slot as string | undefined) ?? Object.keys(layout.slots).find(s => layout.slots[s].kind === kind && !used.has(s));
    if (name === undefined) return props;
    if (!layout.slots[name]) throw Error(`Unknown layout slot: ${name}. Known: ${Object.keys(layout.slots).join(", ")}`);
    used.add(name);
    const { kind: _, ...defaults } = layout.slots[name];
    return { ...defaults, ...props };
  };
}
export type SceneProps = Omit<WorldProps, "children" | "track" | "id"> & {
  id: string; world?: string; layout?: string; durations?: number[]; camera?: WorldTrack;
  prepare?: (slides: AuthoredSlide[]) => ScenePlan; children?: ReactNode;
};
function collect(node: ReactNode, visit: (node: ReactElement<Record<string, unknown>>) => void) {
  Children.forEach(node, child => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    if (child.type === Fragment) collect(child.props.children as ReactNode, visit);
    else visit(child);
  });
}
/** Read a literal fence without mounting the native code viewer. */
export function codeSource(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  let result = "";
  Children.forEach(node, child => {
    if (typeof child === "string" || typeof child === "number") result += String(child);
    else if (isValidElement<{ children?: ReactNode }>(child)) result += codeSource(child.props.children);
  });
  return result;
}
export function readScenes(content: readonly ReactNode[], world?: string): AuthoredSlide[] {
  const slides: AuthoredSlide[] = [];
  for (const children of content) collect(children, child => {
    if (child.type !== Scene) return;
    const props = child.props as SceneProps, parts: AuthoredPart[] = [];
    if (world !== undefined && (props.world ?? "scene") !== world) return;
    const layout = findLayout(props.layout, !!props.prepare), place = slotPlacer(layout);
    collect(props.children, node => {
      const kind = (node.type as { worldPart?: string }).worldPart;
      if (!kind) throw Error("Scene children must be scene parts or fragments.");
      const { children, ...props } = node.props;
      const source = codeSource(children as ReactNode);
      const text = kind === "code" ? source.replace(/\n$/, "") : source;
      parts.push({ ...place(kind, props), kind, order: parts.length, text } as AuthoredPart);
    });
    for (const part of parts) if (part.kind === "tree") part.nodes = placeTree(part.nodes as TreeNode[]);
    const ids = new Set<string>();
    for (const p of parts) {
      if (ids.has(p.id)) throw Error(`Duplicate scene part: ${p.id}`);
      ids.add(p.id);
    }
    if (slides.some(s => s.id === props.id)) throw Error(`Duplicate scene: ${props.id}`);
    const durations = props.durations ?? [6];
    if (!durations.length || durations.some(d => !Number.isFinite(d) || d <= 0)) throw Error("Scene durations must be positive seconds.");
    slides.push({ id: props.id, layout: props.layout, camera: layout?.camera ? { ...layout.camera, ...props.camera } : props.camera, durations, parts });
  });
  return slides;
}
const plans = new WeakMap<NonNullable<SceneProps["prepare"]>, { key: string; plan: ScenePlan }>();
// Outside Scene so the React Compiler can't memoize the cache read: a stale miss would replan, and a new plan rebakes every surface.
function scenePlan(prepare: NonNullable<SceneProps["prepare"]>, slides: AuthoredSlide[]) {
  const key = JSON.stringify(slides);
  let cached = plans.get(prepare);
  if (cached?.key !== key) { cached = { key, plan: prepare(slides) }; plans.set(prepare, cached); }
  return cached.plan;
}
export function Scene({ id, world = "scene", prepare, layout, durations, camera, children, ...appearance }: SceneProps) {
  const content = useDeckContent(), step = usePresentationValue("stepIndex");
  if (!prepare) return <WorldSlide {...appearance} world={world} track={{ spacing: 32, ...findLayout(layout, false)?.camera, ...camera }}
    buildDuration={durations?.[step]}>{expandScene(children, layout)}</WorldSlide>;
  const slides = readScenes(content, world), plan = scenePlan(prepare, slides), slide = slides.findIndex(s => s.id === id), beat = plan.slideBeats[slide] + step;
  return <WorldSlide {...appearance} world={world} track={plan.tracks[slide] ?? { spacing: 32 }} clock="step"
    stepOffset={plan.slideBeats[slide]} buildDuration={(plan.starts[beat + 1] ?? plan.end) - plan.starts[beat]}>{plan.elements}</WorldSlide>;
}

export type TreeNode = { id: string; label?: string; x?: number; y?: number; d?: number; p?: number; width?: number; height?: number; color?: string; [key: string]: unknown };
/** Parents precede children; children fan out around their parent, and explicit coordinates override the automatic layout. */
export function placeTree(nodes: TreeNode[]) {
  const placed: (TreeNode & { d: number; x: number; y: number })[] = [];
  for (const [i, n] of nodes.entries()) {
    if (n.p !== undefined && (!Number.isInteger(n.p) || n.p < 0 || n.p >= i)) throw Error(`Tree parent must precede child: ${n.id}`);
    const parent = n.p === undefined ? undefined : placed[n.p], d = n.d ?? (parent ? parent.d + 1 : 0);
    const peers = nodes.flatMap((node, j) => node.p === n.p ? [j] : []), column = peers.indexOf(i);
    placed.push({ ...n, d, x: n.x ?? (parent?.x ?? 0) + (column - (peers.length - 1) / 2) * (d < 2 ? 5.8 : 2.8), y: n.y ?? Math.round((2 - d * 1.65) * 100) / 100 });
  }
  return placed;
}
/** Streaks along -z at floor level, looping on the continuous clock. `length` is the loop's run in world units. */
export function speedTrails(length = 250) {
  const count = 26, f32 = (n: number) => n.toFixed(8), trails = Array.from({ length: count }, (_, i) => ({ x: -11 + 22 * hash(i * 3 + 3), y: .04 + .08 * hash(i * 5 + 3) ** 2.5,
    l: 6 + 10 * hash(i * 7 + 3), ph: hash(i * 11 + 3), sp: .6 + .8 * hash(i * 13 + 3), gain: 2.2 * (.4 + .6 * hash(i * 17 + 3)) }));
  return <Custom id="trails" count={count} vertexCount={36} color="#ffffff" material={{ rim: 0 }} wgsl={`
const D=array<vec4f,${count}>(${trails.map(d => `vec4f(${f32(d.x)},${f32(d.y)},${f32(d.l)},${f32(d.ph)})`).join(",")});
const E=array<vec2f,${count}>(${trails.map(d => `vec2f(${f32(d.sp)},${f32(d.gain)})`).join(",")});
fn shape(id:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
 let d=D[id]; let z=20.-fract(continuousTime()*18.*E[id].x/${f32(length)}+d.w)*${f32(length)};
 let face=vid/6u; let q=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.))[vid%6u];
 let sgn=select(-1.,1.,face%2u==0u); let axis=face/2u; var p=vec3f(q.x,q.y,sgn); var n=vec3f(0.,0.,sgn);
 if(axis==0u) { p=vec3f(sgn,q.x,q.y); n=vec3f(sgn,0.,0.); }
 if(axis==1u) { p=vec3f(q.x,sgn,q.y); n=vec3f(0.,sgn,0.); }
 return ShapeVertex(vec3f(d.x,d.y,z)+p*vec3f(select(.02,.035,d.y<.3),.015,d.z*.5),n);
}
fn shade(id:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
 return Material(vec3f(0.),select(vec3f(1.),vec3f(1.,.04231141,.01161225),id%2u==0u)*E[id].y,1.,0.);
}`} />;
}
/** A repeating beat, in seconds. */
export type Beat = { start: number; every: number; count: number };
/** Seconds a beat's pulse spends on each tree edge. */
const HOP = .36;
/** Expand authoring parts only; raw World geometry remains available for free composition. A layout supplies each part's placement. */
export function expandScene(children: ReactNode, layout?: string): ReactNode {
  return expandParts(children, slotPlacer(findLayout(layout, false)));
}
/** World only reads its own element types, so this returns a Text3D rather than being a component. Sizes are nominal: `size * TYPE` is the em. */
function textLine(kind: string, { size: nominal, depth, track, delay, duration, lineHeight, emissive, slot: _, ...text }: Record<string, unknown>) {
  const size = Number(nominal ?? (kind === "quote" ? .42 : .8) / TYPE) * TYPE, mono = !!text.mono;
  return <Text3D uppercase={!mono} side={mono ? "#1c1d22" : "#24262b"} metal={.85} roughness={.28} enter={{ at: delay as number | undefined, offset: [-8,0,-2], scale: 0, stagger: .025, duration: Number(duration ?? .8) }}
    {...text as Partial<Text3DOptions>} text={String(text.text)} size={size} depth={Number(depth ?? (mono ? .04 : .2)) / size} tracking={Number(track ?? 0) / TYPE} emissive={.55 + Number(emissive ?? .32) * .5}
    lineHeight={lineHeight === undefined ? undefined : Number(lineHeight) / size} />;
}
function expandParts(children: ReactNode, place: ReturnType<typeof slotPlacer>): ReactNode {
  return Children.map(children, child => {
    if (!isValidElement<PartProps>(child)) return child;
    const kind = (child.type as { worldPart?: string }).worldPart;
    if (!kind) return child.props.children === undefined ? child : React.cloneElement(child, {}, expandParts(child.props.children, place));
    const { children, id, at = [0, 3.2, 0], ...props } = place(kind, child.props) as PartProps;
    const source = codeSource(children), position = at as V3;
    if (kind === "headline" || kind === "quote") return textLine(kind, { ...props, id, position, text: source });
    if (kind === "list") return <Stage id={id} position={position}><Rows {...props} id={`${id}/rows`} items={props.items as string[]}
      count={Number(props.count ?? 9)} spacing={Number(props.spacing ?? .62)} width={Number(props.width ?? 5.4)} /></Stage>;
    if (kind === "counter") {
      const size = Number(props.size ?? .52) * TYPE, beat = props.beat as Beat | undefined, per = Number(props.per ?? 1);
      const digits = { mono: true, size, depth: .12 / size, align: "left", color: props.color as string, emissive: 1, side: "#1c1d22" } as const;
      return <Stage id={id} position={position}>
        {beat ? Array.from({ length: beat.count + 1 }, (_, k) => <Text3D {...digits} key={k} id={`${id}/value${k}`} text={String(k * per)}
          opacity={[{ at: 0, value: k ? 0 : 1, duration: 0 }, ...k ? [{ at: beat.start + (k - 1) * beat.every, value: 1, duration: 0 }] : [],
            ...k < beat.count ? [{ at: beat.start + k * beat.every, value: 0, duration: 0 }] : []]} />)
          : <Text3D {...digits} id={`${id}/value`} text={String(props.value ?? 0)} />}
        <Text3D id={`${id}/label`} text={String(props.label ?? "")} mono size={.14 * TYPE} depth={.02 / (.14 * TYPE)} tracking={.2 / TYPE} align="left" color="#7d838c" emissive={.8} position={[.02,.6,0]} />
      </Stage>;
    }
    if (kind === "rule") { const delay = Number(props.delay ?? 0), width = Number(props.width ?? 6);
      return <Box id={id} size={.5} color="#ff3a1c" emissive={1.1} position={position}
        scale={[{ at: delay, value: [0,.09,.12], duration: 0 }, { at: delay, value: [width,.09,.12], duration: .7 }]} />; }
    if (kind === "bars") {
      const items = props.items as { label: string; value: number; color?: string }[], maximum = Math.max(...items.map(b => b.value)), delay = 1;
      return <Stage id={id} position={position}>{items.map((b, i) => { const x = (i - (items.length - 1) / 2) * 3.4; return <Fragment key={b.label}>
        <Pillar id={`${id}/${i}`} value={b.value} maximum={maximum} height={4.3} width={1.5} depth={1.5} color={b.color} position={[x,0,0]} at={delay + i * .35} duration={1.6} ease="out" />
        {textLine("headline", { id: `${id}/${i}/label`, text: b.label, position: [x,.45,1.6], size: .44, depth: .1, delay: delay + .2 + i * .12, duration: .7 })}
      </Fragment>; })}</Stage>;
    }
    if (kind === "code") {
      const text = source.replace(/\n$/, ""), lines = text.split("\n"), size = Number(props.size ?? .165), lineHeight = Number(props.lineHeight ?? .3);
      const width = Math.max(1, ...lines.map(l => l.length)) * size * .84 + .6, height = (lines.length - 1) * lineHeight + size + .6;
      return <Stage id={id} position={position}>
        <Card id={`${id}/card`} position={[width / 2 - .3, -(height - .6) / 2, -.14]} scale={[width,height,.06]} fill={.75} />
        <Text3D id={`${id}/code`} text={text} mono size={size * TYPE} lineHeight={lineHeight / (size * TYPE)} align="left" />
      </Stage>;
    }
    if (kind === "tree") {
      const nodes = placeTree(props.nodes as TreeNode[]), beat = props.beat as Beat | undefined;
      return <Stage id={id} position={position}>{nodes.map(n => { const parent = n.p === undefined ? undefined : nodes[n.p]; return <Fragment key={n.id}>
        <Card id={`${id}/${n.id}`} position={[n.x,n.y,0]} scale={[Number(n.width ?? (n.d < 2 ? 3 : 2.3)),Number(n.height ?? .82),.5]} color={n.color} />
        <Text3D id={`${id}/${n.id}/label`} text={n.label ?? n.id} mono size={(n.d < 2 ? .21 : .17) * TYPE} position={[n.x,n.y,.27]} />
        {parent && <RoutedTube id={`${id}/${n.id}/edge`} thickness={.035} color={n.color}
          path={[[parent.x,parent.y - .41,0],[parent.x,n.y + .41,0],[n.x,n.y + .41,0]]}
          pulses={beat ? Array.from({ length: beat.count }, (_, k) => ({ at: beat.start + k * beat.every + (n.d - 1) * HOP, duration: HOP, color: n.color, size: .11, emissive: 10 })) : undefined} />}
      </Fragment>; })}</Stage>;
    }
    if (kind === "editor") {
      const labels = props.labels as string[], values = [String(props.name ?? ""),String(props.email ?? "")];
      return <Stage id={id} position={position}>{[-1,1].map(side => <Stage key={side} id={`${id}/${side}`} position={[side * 3.35,0,0]}>
        <Card id={`${id}/${side}/card`} scale={[5.9,3.5,.3]} />
        {values.map((value,i) => <Fragment key={i}>
          {side < 0 && <Text3D id={`${id}/${side}/label${i}`} text={labels?.[i] ?? ""} mono size={.15} position={[-2.4,1.05-i*1.4,.2]} align="left" />}
          <Text3D id={`${id}/${side}/value${i}`} text={value} mono size={.22} position={[-2.25,.55-i*1.4,.2]} align="left" />
        </Fragment>)}
      </Stage>)}</Stage>;
    }
    throw Error(`Unknown scene part: ${kind}`);
  });
}
