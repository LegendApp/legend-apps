import React, { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { useDeckContent, usePresentationValue } from "@legend-apps/presentation";
import type { Ease } from "./camera";
import { colorVector } from "./scene";
import { Box, Card, Custom, DOF, Pillar, Rows, RoutedTube, Stage, Text3D, WorldSlide, prepareWorldSlides, type GlyphMotion, type Text3DOptions, type WorldProps, type WorldTrack } from "./World";

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
export const Keys = part("keys");
export const Grid = part("grid");
export const Form = part("form");
export const CodeMorph = part("morph");
export const CodeTrace = part("trace");
export const Cloud = part("cloud");
export const Layers = part("layers");

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
  /** One large centered line, with an optional kicker above and rule below. */
  title: { camera: { position: [-.8,2.5,11.6], target: [0,2.3,0] }, slots: {
    line: { kind: "headline", at: [0,2.6,0], size: 1.25, depth: .32, track: .02, delay: .15 },
    kicker: { kind: "headline", at: [0,4.05,0], size: .2, depth: .04, mono: true, track: .25, color: "#ff3a1c", emissive: .6, delay: .9, duration: .7 },
    rule: { kind: "rule", at: [0,1.55,0], width: 6.5, delay: 1.2 },
  } },
  /** `statement` from further back, for lines up to about 17 characters. */
  "statement-wide": { camera: { position: [-.8,2.8,15], target: [0,2.6,0] }, slots: {
    line1: { kind: "headline", at: [0,3.35,0], size: 1.25, depth: .32, track: .02, delay: .15 },
    line2: { kind: "headline", at: [0,1.85,0], size: 1.25, depth: .32, track: .02, delay: .9 },
    rule: { kind: "rule", at: [0,1.27,0], width: 8, delay: 1.6 },
  } },
  /** Heading top left over a keyed list; the camera orbits 30° to the right on step 2 to watch a container recycle behind it. */
  keys: { camera: { position: [-1,4.2,14], target: [0,3.6,0], via: [-3.5,7,21], viaTarget: [0,2.5,12], steps: { 2: { orbit: 30, duration: 1.6 } } }, slots: {
    title: { ...heading, at: [-7.4,7.3,0] }, keys: { kind: "keys", at: [0,6.2,0] },
  } },
  /** Heading top left over a large tree laid out by leaves, five levels deep. */
  "tree-wide": { camera: { position: [-1.2,4.6,15.5], target: [0,4.2,0], via: [-3.5,7,22], viaTarget: [0,2.5,13] }, slots: {
    title: { ...heading, at: [-8.2,8.6,0] }, subtitle: { ...caption, at: [-8.16,8.05,0] },
    tree: { kind: "tree", at: [0,5,0], width: 16, levelHeight: 1.45, nodeWidth: 2.6, labelSize: .17 },
  } },
  /** Three captioned trees side by side and a legend row; each later step flies the camera to the next tree. */
  "tree-tour": { camera: { position: [0,4.6,26], target: [0,4.2,0], via: [-4,8,34], viaTarget: [0,2.5,20],
    steps: { 1: { shift: [-9.6,0,0], dolly: .55 }, 2: { dolly: .55 }, 3: { shift: [9.6,0,0], dolly: .55 } } }, slots: {
    title: { ...heading, at: [-13.5,10,0], size: 1 },
    ...Object.fromEntries([-9.6, 0, 9.6].flatMap((x, i) => [[`caption${i + 1}`, { kind: "headline", at: [x,8.5,0], size: .42, depth: .12, track: .02, delay: .4 + i * .15 }],
      [`tree${i + 1}`, { kind: "tree", at: [x,4.8,0], width: 8.4, levelHeight: 1.6, nodeWidth: 1.95, labelSize: .13 }]])),
    ...Object.fromEntries([-6, 0, 6].map((x, i) => [`legend${i + 1}`, { kind: "headline", at: [x,.9,1], size: .2, depth: .04, mono: true, track: .12, emissive: .8, delay: 1 }])),
  } },
  /** A code panel on the left and a grid of cells on the right. */
  "code-grid": { camera: { position: [-.6,4.2,14], target: [0,4,0], via: [-3.5,7,21], viaTarget: [0,2.5,12] }, slots: {
    code: { ...code, at: [-7.9,6.6,0], size: .15, lineHeight: .34 }, grid: { kind: "grid", at: [4.3,4.8,0], cell: [1.1,.62] },
  } },
  /** One code panel centered in frame. */
  "code-center": { camera: { position: [-.6,4.2,14], target: [0,4,0], via: [-3.5,7,21], viaTarget: [0,2.5,12] }, slots: {
    code: { ...code, at: [0,4.4,0], anchor: "center", size: .2, lineHeight: .36 },
  } },
  /** A tall morphing code panel centered in frame. */
  morph: { camera: { position: [0,4.3,13.6], target: [0,4.2,0], via: [2.8,6,22], viaTarget: [0,3,10] }, slots: {
    morph: { kind: "morph", at: [0,4.3,0], anchor: "center", size: .14, lineHeight: .28 },
  } },
  /** Panels of fields across the middle. */
  form: { camera: { position: [-.8,4,13.5], target: [0,3.4,0], via: [-3.5,6.5,20], viaTarget: [0,2,14] }, slots: {
    form: { kind: "form", at: [0,5.6,0] },
  } },
  /** Words at depth in front of the camera. */
  cloud: { camera: { position: [0,4.2,13], target: [0,4,0], via: [-3.5,7,21], viaTarget: [0,2.5,12] }, slots: {
    cloud: { kind: "cloud", at: [0,0,0] },
  } },
  /** Heading top left over traced code on the left; its tree forms on the right. */
  trace: { camera: { position: [0,4.3,15], target: [0,4,0], via: [2.8,6,22], viaTarget: [0,3,10] }, slots: {
    title: { ...heading, at: [-8.2,8.4,0] }, trace: { kind: "trace", at: [-8.8,7.2,0] },
  } },
  /** Heading top left, a line of code on the left, stacked layers and a meter in the middle. */
  layers: { camera: { position: [-1.4,4,14], target: [0,3.8,0], via: [-3.5,7,21], viaTarget: [0,2.5,12] }, slots: {
    title: { ...heading, at: [-7.4,7.6,0] }, code: { ...code, at: [-7.6,4.6,0], size: .22, lineHeight: .4 }, layers: { kind: "layers", at: [-.4,4.2,0] },
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
    for (const part of parts) if (part.kind === "tree") part.nodes = placeTree(part.nodes as TreeNode[], part as { width?: number; levelHeight?: number });
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
const slidePlans = new WeakMap<SceneProps, { declarations: SceneProps[]; slides: WorldProps[] }>();
function plannedSlides(content: readonly ReactNode[], world: string) {
  const declarations: SceneProps[] = [];
  for (const children of content) collect(children, child => {
    if (child.type === Scene && !child.props.prepare && (child.props.world ?? "scene") === world) declarations.push(child.props as SceneProps);
  });
  if (!declarations.length) return [];
  let cached = slidePlans.get(declarations[0]);
  if (!cached || declarations.length !== cached.declarations.length || declarations.some((props, i) => props !== cached!.declarations[i])) {
    cached = { declarations, slides: prepareWorldSlides(declarations.map(({ children, layout, camera, ...props }) => ({ ...props,
      track: { spacing: 32, ...findLayout(layout, false)?.camera, ...camera }, children: expandScene(children, layout) }))) };
    slidePlans.set(declarations[0], cached);
  }
  return cached.slides;
}
export function Scene({ id, world = "scene", prepare, layout, durations, camera, children, ...appearance }: SceneProps) {
  const content = useDeckContent(), step = usePresentationValue("stepIndex");
  if (!prepare) {
    const planned = plannedSlides(content, world).find(slide => slide.id === id);
    return <WorldSlide {...appearance} {...planned} world={world} track={planned?.track ?? { spacing: 32, ...findLayout(layout, false)?.camera, ...camera }}
      buildDuration={durations?.[step]}>{planned?.children ?? expandScene(children, layout)}</WorldSlide>;
  }
  const slides = readScenes(content, world), plan = scenePlan(prepare, slides), slide = slides.findIndex(s => s.id === id), beat = plan.slideBeats[slide] + step;
  return <WorldSlide {...appearance} world={world} track={plan.tracks[slide] ?? { spacing: 32 }} clock="step"
    stepOffset={plan.slideBeats[slide]} buildDuration={(plan.starts[beat + 1] ?? plan.end) - plan.starts[beat]}>{plan.elements}</WorldSlide>;
}

export type TreeNode = { id: string; label?: string; x?: number; y?: number; d?: number; p?: number; width?: number; height?: number; color?: string; [key: string]: unknown };
/** Parents precede children; children fan out around their parent, and explicit coordinates override the automatic layout. */
/** With `width`, each subtree gets a share of it in proportion to its leaves, so cousins never overlap. `levelHeight` spaces the depths. */
export function placeTree(nodes: TreeNode[], { width, levelHeight = 1.65 }: { width?: number; levelHeight?: number } = {}) {
  const placed: (TreeNode & { d: number; x: number; y: number })[] = [], spans: number[] = [];
  const children = (i: number | undefined) => nodes.flatMap((node, j) => node.p === i ? [j] : []);
  const leaves = (i: number): number => children(i).reduce((sum, j) => sum + leaves(j), 0) || 1;
  if (width !== undefined) {
    const total = children(undefined).reduce((sum, j) => sum + leaves(j), 0);
    const share = (ids: number[], left: number, span: number) => { for (const j of ids) { spans[j] = left + span * leaves(j) / 2; share(children(j), left, span); left += span * leaves(j); } };
    share(children(undefined), -width / 2, width / Math.max(1, total));
  }
  for (const [i, n] of nodes.entries()) {
    if (n.p !== undefined && (!Number.isInteger(n.p) || n.p < 0 || n.p >= i)) throw Error(`Tree parent must precede child: ${n.id}`);
    const parent = n.p === undefined ? undefined : placed[n.p], d = n.d ?? (parent ? parent.d + 1 : 0);
    const peers = children(n.p), column = peers.indexOf(i);
    placed.push({ ...n, d, x: n.x ?? spans[i] ?? (parent?.x ?? 0) + (column - (peers.length - 1) / 2) * (d < 2 ? 5.8 : 2.8), y: n.y ?? Math.round((2 - d * levelHeight) * 100) / 100 });
  }
  return placed;
}
/** Streaks along -z at floor level, looping on the continuous clock. `length` is the loop's run in world units.
 * At peak travel speed each streak is `stretch` times longer and `boost` times brighter. Every other streak is `accent` (default red). */
export function speedTrails(length = 250, { stretch = 3, boost = 1.6, accent }: { stretch?: number; boost?: number; accent?: string } = {}) {
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
 return ShapeVertex(vec3f(d.x,d.y,z)+p*vec3f(select(.02,.035,d.y<.3),.015,d.z*.5*(1.+travelSpeed()*${f32(stretch - 1)})),n);
}
fn shade(id:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
 return Material(vec3f(0.),select(vec3f(1.),${accent ? `vec3f(${colorVector(accent).map(f32).join(",")})` : "vec3f(1.,.04231141,.01161225)"},id%2u==0u)*E[id].y*(1.+travelSpeed()*${f32(boost - 1)}),1.,0.);
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
/** Shared palette for the generic parts. */
const INK = { white: "#eef0f3", muted: "#7d838c", idle: "#5b616b", red: "#ff3a1c", amber: "#ffa21f", purple: "#be91ff", blue: "#4aa8ff", green: "#39d98a" };
/** JetBrains Mono advance, in em. */
const MONO = .6;
const key = <T,>(step: number, value: T, delay = 0, duration = .5, ease?: Ease) => ({ step, delay, value, duration, ...ease ? { ease } : {} });
type CodeMark = { text: string; color?: string; step?: number; delay?: number };
/** A tree flash: `ids` (default all) take `color` on `step`, in a wave down the levels `hop` seconds apart, or all at once with `wave: false` (beams from `from`). */
type TreeFlash = { step: number; color: string; ids?: string[]; wave?: boolean; from?: string; hop?: number; delay?: number; flash?: boolean; glow?: number; repeat?: number; every?: number };
/** `anchor: "center"` centers a panel of this size on its position instead of hanging it from its top-left line. */
function anchored(position: V3, anchor: unknown, width: number, height: number): V3 {
  return anchor === "center" ? [position[0] - width / 2 + .3, position[1] + (height - .6) / 2, position[2]] : position;
}
/** A keyed column that splits into a changed copy, then recycles the removed key's container into the added key's slot. */
function keyList(id: string, at: V3, props: Record<string, unknown>) {
  const keys = props.keys as string[], next = (props.next ?? keys) as string[], diff = Number(props.diff ?? 1), recycle = Number(props.recycle ?? 2);
  const row = Number(props.rowHeight ?? .95), width = Number(props.width ?? 3.4), gap = Number(props.gap ?? 7.6), caption = String(props.label ?? "key");
  const removed = keys.filter(k => !next.includes(k)), added = next.filter(k => !keys.includes(k)), y = (i: number) => -i * row;
  const container = (stage: string, position: unknown, color: unknown, emissive: unknown, opacity: unknown, labels: { text: string; opacity: unknown; color?: string }[]) =>
    <Stage key={stage} id={stage} position={position as V3}>
      <Card id={`${stage}/card`} scale={[width, row * .8, .3]} color={color as string} emissive={emissive as number} opacity={opacity as number} />
      <Text3D id={`${stage}/caption`} text={caption} mono size={.15 * TYPE} align="left" color={INK.muted} emissive={.8} position={[-width / 2 + .35, 0, .17]} opacity={opacity as number} />
      {labels.map((label, i) => <Text3D key={i} id={`${stage}/key${i}`} text={label.text} mono size={.34 * TYPE} align="left" color={label.color ?? INK.white}
        position={[-width / 2 + 1.3, 0, .17]} opacity={label.opacity as number} />)}
    </Stage>;
  const left = keys.map((k, i) => {
    const gone = removed.indexOf(k), reuse = gone >= 0 ? added[gone] : undefined, split: V3 = [-gap / 2, y(i), 0];
    if (reuse === undefined) return container(`${id}/${k}`, [{ step: 0, value: [0, y(i), 0] }, key(diff, split, 0, .6), key(recycle, [0, y(next.includes(k) ? next.indexOf(k) : i), 0], 0, 1)],
      INK.idle, [{ step: 0, value: .8 }, key(recycle, .3, 0, .6)], 1, [{ text: k, opacity: 1 }]);
    const slot = y(next.indexOf(reuse));
    // Behind the list, down past the others, then forward into the free slot.
    return container(`${id}/${k}`, [{ step: 0, value: [0, y(i), 0] }, key(diff, split, 0, .6), key(recycle, [0, y(i), -2.2], 0, .6), key(recycle, [0, slot, -2.2], .7, 1),
      key(recycle, [0, slot, 0], 1.8, .5)], [{ step: 0, value: INK.idle }, key(diff, INK.red, .5, .3), key(recycle, INK.amber, 2.2, .1)],
      [{ step: 0, value: .8 }, key(diff, 2.4, .5, .3), key(recycle, .5, 0, .4), key(recycle, 9, 2.25, .06), key(recycle, 2.6, 2.4, .8)], 1,
      [{ text: k, opacity: [{ step: 0, value: 1 }, key(recycle, 0, 2.05, .12)] }, { text: reuse, opacity: [{ step: 0, value: 0 }, key(recycle, 1, 2.2, .12)] }]);
  });
  const copy = [...keys, ...added].map(k => {
    const from = keys.includes(k) ? keys.indexOf(k) : next.indexOf(k), to = next.includes(k) ? next.indexOf(k) : from, isNew = added.includes(k);
    const shown = removed.includes(k) ? [{ step: 0, value: 0 }, key(diff, 1, 0, .05), key(diff, 0, .35, .3)]
      : [{ step: 0, value: 0 }, key(diff, 1, isNew ? .65 : 0, isNew ? .3 : .05), key(recycle, 0, .35, .15)];
    return container(`${id}/copy/${k}`, [{ step: 0, value: [0, y(from), -.02] }, key(diff, [gap / 2, y(to), 0], 0, .6), key(recycle, [gap / 2 + 3, y(to), -30], 0, .5)],
      isNew ? INK.green : INK.idle, isNew ? 2.6 : .8, shown, [{ text: k, opacity: shown }]);
  });
  const links = keys.filter(k => next.includes(k)).map(k => {
    const a: V3 = [-gap / 2 + width / 2, y(keys.indexOf(k)), 0], b: V3 = [gap / 2 - width / 2, y(next.indexOf(k)), 0];
    return <RoutedTube key={`link/${k}`} id={`${id}/link/${k}`} path={[a, [a[0] + .9, a[1], 0], [b[0] - .9, b[1], 0], b]} thickness={.03} color={INK.blue} emissive={3.5}
      draw={[{ step: 0, value: 0 }, key(diff, 1, .7, .45), key(recycle, 0, 0, .25)]} />;
  });
  return <Stage id={id} position={at}>{left}{copy}{links}</Stage>;
}
/** Labelled cells that flash together `rate` times a second from `flash.step`, while a resize handle drags the frame. */
function grid(id: string, at: V3, props: Record<string, unknown>) {
  const count = Number(props.count ?? 36), columns = Number(props.columns ?? 6), [cw, ch] = (props.cell ?? [1.2, .7]) as [number, number], label = String(props.label ?? "");
  const rows = Math.ceil(count / columns), px = cw + .18, py = ch + .18, width = columns * px, height = rows * py;
  const flash = props.flash as { step: number; rate?: number; duration?: number; delay?: number; color?: string } | undefined, hot = flash?.color ?? INK.amber;
  const start = flash?.delay ?? 0, length = flash?.duration ?? 10, beats = flash ? Array.from({ length: Math.round(length * (flash.rate ?? 8)) }, (_, k) => start + k / (flash.rate ?? 8)) : [];
  const emissive = flash ? [{ step: 0, value: .7 }, ...beats.flatMap(t => [key(flash.step, 5, t, .02), key(flash.step, 1, t + .04, .06)])] : .7;
  const color = flash ? [{ step: 0, value: INK.idle }, key(flash.step, hot, start, .2)] : INK.idle;
  const drag = flash ? Array.from({ length: Math.ceil(length / .7) }, (_, k) => ({ at: start + k * .7, pull: k % 2 ? 0 : .9 })) : [];
  const frame = (pull: number) => ({ position: [pull / 2, 0, -.2] as V3, scale: [width + .5 + pull, height + .5, .05] as V3, handle: [width / 2 + .3 + pull, -height / 2 - .3, .1] as V3 });
  const track = (pick: (f: ReturnType<typeof frame>) => V3) => flash ? [{ step: 0, value: pick(frame(0)) }, ...drag.map(d => key(flash.step, pick(frame(d.pull)), d.at, .7, "smoothstep"))] : pick(frame(0));
  return <Stage id={id} position={at}>
    <Card id={`${id}/frame`} position={track(f => f.position)} scale={track(f => f.scale)} fill={.15} color={INK.idle} emissive={.5} />
    <Box id={`${id}/handle`} size={.5} position={track(f => f.handle)} scale={[.3,.3,.3]} color={hot} emissive={flash ? [{ step: 0, value: 0 }, key(flash.step, 3, start, .3)] : 0} />
    {Array.from({ length: count }, (_, i) => { const x = (i % columns - (columns - 1) / 2) * px, y = -(Math.floor(i / columns) - (rows - 1) / 2) * py; return <Fragment key={i}>
      <Card id={`${id}/${i}`} position={[x, y, 0]} scale={[cw, ch, .2]} color={color} emissive={emissive} />
      {label && <Text3D id={`${id}/${i}/label`} text={label} mono size={.16 * TYPE} position={[x, y, .12]} color={INK.white} emissive={.8} />}
    </Fragment>; })}
  </Stage>;
}
type FormField = { value: string; bind?: string; big?: boolean };
/** Panels of fields with render-count badges. `typing` types `text` into the fields bound to `bind`, one keystroke every `interval` seconds; each keystroke flashes those fields and ticks their badges. */
function form(id: string, at: V3, props: Record<string, unknown>) {
  const panels = props.panels as { title: string; fields: FormField[] }[], typing = props.typing as { step: number; bind: string; text: string; delay?: number; interval?: number } | undefined;
  const fw = Number(props.fieldWidth ?? 5.4), fh = 1, gap = .45, pw = fw + 1, spread = pw + 1.3, times: number[] = [];
  let versions: string[] = [];
  if (typing) {
    const base = panels.flatMap(p => p.fields).find(f => f.bind === typing.bind)?.value ?? "";
    if (!typing.text.startsWith(base)) throw Error(`Form typing must extend the bound value: ${typing.bind}`);
    versions = Array.from({ length: typing.text.length - base.length + 1 }, (_, k) => typing.text.slice(0, base.length + k));
    for (let k = 1; k < versions.length; k++) times.push((typing.delay ?? .6) + (k - 1) * (typing.interval ?? .45));
  }
  const swap = (k: number) => typing ? [{ step: 0, value: k ? 0 : 1 }, ...k ? [key(typing.step, 1, times[k - 1], 0)] : [], ...k < times.length ? [key(typing.step, 0, times[k], 0)] : []] : 1;
  const flashes = (rest: number) => typing && times.length ? [{ step: 0, value: rest }, ...times.flatMap(t => [key(typing.step, 7, t, .05), key(typing.step, 1.8, t + .08, .5)])] : rest;
  const lit = typing && times.length ? [{ step: 0, value: INK.idle }, key(typing.step, INK.amber, times[0], .1)] : INK.idle;
  const badge = (stage: string, position: V3, bound: boolean) => <Stage key={stage} id={stage} position={position}>
    <Card id={`${stage}/disc`} scale={[.66,.66,.2]} radius={.33} color={bound ? lit : INK.idle} emissive={bound ? flashes(.9) : .9} />
    {(bound ? versions : [""]).map((_, k) => <Text3D key={k} id={`${stage}/n${k}`} text={String(k + 1)} mono size={.26 * TYPE} position={[0, 0, .13]} color={INK.white} opacity={bound ? swap(k) : 1} />)}
  </Stage>;
  return <Stage id={id} position={at}>{panels.map((panel, p) => {
    const stage = `${id}/${p}`, ph = .9 + panel.fields.length * (fh + gap) + .2;
    return <Stage key={p} id={stage} position={[(p - (panels.length - 1) / 2) * spread, 0, 0]}>
      <Card id={`${stage}/card`} position={[0, -ph / 2 + .6, -.2]} scale={[pw, ph, .2]} fill={.55} color={INK.idle} emissive={.6} />
      <Text3D id={`${stage}/title`} text={panel.title.toUpperCase()} mono size={.17 * TYPE} align="left" tracking={.1} position={[-pw / 2 + .4, .22, .05]} color={INK.muted} emissive={.8} />
      {badge(`${stage}/badge`, [pw / 2 - .1, .55, .1], false)}
      {panel.fields.map((field, f) => { const y = -.55 - f * (fh + gap), bound = !!typing && field.bind === typing.bind, cell = `${stage}/${f}`;
        return <Fragment key={f}>
          <Card id={cell} position={[0, y, 0]} scale={[fw, fh, .3]} color={bound ? lit : INK.idle} emissive={bound ? flashes(.8) : .8} />
          {(bound ? versions : [field.value]).map((value, k) => <Text3D key={k} id={`${cell}/v${k}`} text={value} mono size={(field.big ? .34 : .26) * TYPE} align="left"
            position={[-fw / 2 + .35, y, .18]} color={INK.white} opacity={bound ? swap(k) : 1} />)}
          {badge(`${cell}/badge`, [fw / 2 - .05, y + fh / 2 - .05, .2], bound)}
        </Fragment>; })}
    </Stage>; })}</Stage>;
}
type DiffLine = [" " | "-" | "+", string];
/** Code that morphs by diff on each step from `step`: removed lines are struck through and collapse, the rest close up, and added lines grow in.
 * Each `diff` fence starts from the previous result. */
function codeMorph(id: string, at: V3, props: Record<string, unknown>, children: ReactNode) {
  const diffs = Children.toArray(children).map(codeSource).filter(text => text.trim())
    .map(text => text.replace(/\n$/, "").split("\n").map(line => [line[0] ?? " ", line.slice(1)] as DiffLine));
  if (diffs.some(diff => diff.some(([mark]) => !" -+".includes(mark)))) throw Error(`Code morph ${id}: diff lines start with a space, - or +.`);
  const size = Number(props.size ?? .13), lineHeight = Number(props.lineHeight ?? .27), first = Number(props.step ?? 1), em = size * TYPE, advance = em * MONO, settle = .55;
  const lines: { text: string; rows: (number | undefined)[] }[] = [];
  let state = diffs[0].filter(([mark]) => mark !== "+").map(([, text]) => lines.push({ text, rows: [] }) - 1);
  const states = [state];
  diffs.forEach((diff, t) => {
    const before = diff.filter(([mark]) => mark !== "+");
    if (before.length !== state.length || before.some(([, text], i) => lines[state[i]].text !== text)) throw Error(`Code morph ${id}: diff ${t} must start from the previous code.`);
    let i = 0;
    const next: number[] = [];
    for (const [mark, text] of diff) {
      if (mark === "+") next.push(lines.push({ text, rows: [] }) - 1);
      else { const line = state[i++]; if (mark === " ") next.push(line); }
    }
    states.push(state = next);
  });
  states.forEach((rows, s) => rows.forEach((line, row) => { lines[line].rows[s] = row; }));
  const width = Math.max(...lines.map(l => l.text.length)) * advance + .9, height = (n: number) => (n - 1) * lineHeight + em + .6;
  const panel = (s: number) => ({ position: [width / 2 - .3, -(height(states[s].length) - .6) / 2, -.14] as V3, scale: [width, height(states[s].length), .06] as V3 });
  const panelTrack = (pick: (p: ReturnType<typeof panel>) => V3) => [{ step: 0, value: pick(panel(0)) }, ...states.slice(1).map((_, t) => key(first + t, pick(panel(t + 1)), settle, .5))];
  return <Stage id={id} position={anchored(at, props.anchor, width, Math.max(...states.map(s => height(s.length))))}>
    <Card id={`${id}/card`} position={panelTrack(p => p.position)} scale={panelTrack(p => p.scale)} fill={.75} />
    {lines.map((line, n) => {
      const shown = line.rows.flatMap((row, s) => row === undefined ? [] : [s]), enter = shown[0], exit = shown[shown.length - 1] + 1, y = (s: number) => -line.rows[s]! * lineHeight;
      const addedAt = enter > 0 ? first + enter - 1 : undefined, removedAt = exit < states.length ? first + exit - 1 : undefined;
      const indent = line.text.length - line.text.trimStart().length, strike = (line.text.trimEnd().length - indent) * advance + .1, x = indent * advance;
      const glyphs = addedAt === undefined && removedAt === undefined ? undefined : (i: number): GlyphMotion => {
        const start = addedAt === undefined ? 1 : 0, grow = settle + .45 + i * .006;
        return {
          opacity: [{ step: 0, value: start }, ...addedAt === undefined ? [] : [key(addedAt, 1, grow, .2)], ...removedAt === undefined ? [] : [key(removedAt, 0, .45, .3)]],
          scale: [{ step: 0, value: start }, ...addedAt === undefined ? [] : [key(addedAt, 1, grow, .35)], ...removedAt === undefined ? [] : [key(removedAt, 0, .45, .35)]],
          color: [{ step: 0, value: addedAt === undefined ? INK.white : INK.green }, ...addedAt === undefined ? [] : [key(addedAt, INK.white, 2.4, .8)], ...removedAt === undefined ? [] : [key(removedAt, INK.red, 0, .2)]],
        };
      };
      return <Fragment key={n}>
        <Text3D id={`${id}/${n}`} text={line.text} mono size={em} align="left" glyphs={glyphs}
          position={[{ step: 0, value: [0, y(enter), 0] }, ...shown.slice(1).map(s => key(first + s - 1, [0, y(s), 0] as V3, settle, .5))]} />
        {removedAt !== undefined && strike > .1 && <Box id={`${id}/${n}/strike`} size={.5} color={INK.red} emissive={3}
          position={[{ step: 0, value: [x, y(exit - 1), .1] }, key(removedAt, [x + strike / 2, y(exit - 1), .1], 0, .35)]}
          scale={[{ step: 0, value: [0, .035, .035] }, key(removedAt, [strike, .035, .035], 0, .35), key(removedAt, [strike, 0, 0], .5, .2)]} />}
      </Fragment>;
    })}
  </Stage>;
}
/** Code that highlights where state is created (`source`), passed (`pass`) and read (`reads`) on `mark`, collapses everything else on `collapse`,
 * and lifts the source and read lines into a tree of `nodes` labels on `extract`. */
function codeTrace(id: string, at: V3, props: Record<string, unknown>, source: string) {
  const lines = source.replace(/\n$/, "").split("\n"), size = Number(props.size ?? .13), lineHeight = Number(props.lineHeight ?? .27), em = size * TYPE, advance = em * MONO;
  const origin = Number(props.source), reads = props.reads as number[], pass = (props.pass ?? []) as number[], labels = props.nodes as string[];
  const mark = Number(props.mark ?? 1), collapse = Number(props.collapse ?? 2), extract = Number(props.extract ?? 3);
  const hot = [origin, ...reads].sort((a, b) => a - b), gap = lineHeight * 1.8;
  const width = Math.max(...lines.map(l => l.length)) * advance + .9, full = (lines.length - 1) * lineHeight + em + .6, short = (hot.length - 1) * gap + em + .6;
  const tone = (n: number) => n === origin ? INK.amber : reads.includes(n) ? INK.blue : pass.includes(n) ? INK.idle : INK.white;
  const tx = width + 3.2, node = (k: number): V3 => k === 0 ? [tx, -.4, 0] : [tx + (k - (reads.length + 1) / 2) * 3.6, -3.2, 0];
  const show = [{ step: 0, value: 0 }, key(extract, 1, 1.25, .35)];
  return <Stage id={id} position={at}>
    <Card id={`${id}/card`} fill={.75} opacity={[{ step: 0, value: 1 }, key(extract, 0, .9, .4)]}
      position={[{ step: 0, value: [width / 2 - .3, -(full - .6) / 2, -.14] }, key(collapse, [width / 2 - .3, -(short - .6) / 2, -.14], .45, .5)]}
      scale={[{ step: 0, value: [width, full, .06] }, key(collapse, [width, short, .06], .45, .5)]} />
    {lines.map((text, n) => {
      const kept = hot.indexOf(n), color = [{ step: 0, value: INK.white }, key(mark, tone(n), 0, .4)];
      if (kept < 0) return <Text3D key={n} id={`${id}/${n}`} text={text} mono size={em} align="left" position={[0, -n * lineHeight, 0]}
        glyphs={() => ({ color, scale: [{ step: 0, value: 1 }, key(collapse, 0, .05 + n * .015, .35)], opacity: [{ step: 0, value: 1 }, key(collapse, 0, .1 + n * .015, .3)] })} />;
      const indent = (text.length - text.trimStart().length) * advance, end = text.trimEnd().length * advance, middle = (indent + end) / 2, y0 = -n * lineHeight, y1 = -kept * gap;
      const target = node(n === origin ? 0 : 1 + reads.indexOf(n));
      return <Fragment key={n}>
        <Text3D id={`${id}/${n}`} text={text} mono size={em} align="left" glyphs={() => ({ color, emissive: [{ step: 0, value: .75 }, key(mark, 1.8, 0, .4)], opacity: [{ step: 0, value: 1 }, key(extract, 0, 1.25, .35)] })}
          position={[{ step: 0, value: [0, y0, 0] }, key(collapse, [0, y1, 0], .45, .5), key(extract, [0, y1, 1.4], 0, .45), key(extract, [target[0] - middle, target[1], 1.4], .55, .9)]} />
        <Box id={`${id}/${n}/glow`} size={.5} color={tone(n)} emissive={1.2} position={[{ step: 0, value: [middle, y0, -.08] }, key(collapse, [middle, y1, -.08], .45, .5)]}
          scale={[{ step: 0, value: [0, 0, 0] }, key(mark, [end - indent + .2, lineHeight * .9, .04], 0, .4), key(extract, [0, 0, 0], 0, .3)]} />
      </Fragment>;
    })}
    {labels.map((label, k) => { const p = node(k), root = node(0), mid = (root[1] + p[1]) / 2; return <Fragment key={`node${k}`}>
      <Card id={`${id}/node${k}`} position={p} scale={[3.3, .85, .4]} color={k ? INK.blue : INK.amber} opacity={show}
        emissive={[{ step: 0, value: 0 }, key(extract, 7, 1.25, .1), key(extract, 1.8, 1.4, .6)]} />
      <Text3D id={`${id}/node${k}/label`} text={label} mono size={.2 * TYPE} position={[p[0], p[1], .25]} opacity={show} />
      {k > 0 && <RoutedTube id={`${id}/edge${k}`} thickness={.035} color={INK.amber} emissive={3} path={[[root[0], root[1] - .45, 0], [root[0], mid, 0], [p[0], mid, 0], [p[0], p[1] + .45, 0]]}
        draw={[{ step: 0, value: 0 }, key(extract, 1, 1.6, .5)]} pulses={Array.from({ length: 6 }, (_, r) => ({ step: extract, delay: 2.2 + r * 1.1, duration: .5, color: INK.amber, size: .11, emissive: 10 }))} />}
    </Fragment>; })}
  </Stage>;
}
/** Words floating at depth. Each step brings its `focus` words to the front, sharp and glowing, while earlier ones recede; `zoom` also defocuses everything else. */
function cloud(id: string, at: V3, props: Record<string, unknown>) {
  const words = props.words as string[], focus = (props.focus as (string | string[])[]).map(f => typeof f === "string" ? [f] : f), zoom = props.zoom as number | undefined;
  const size = Number(props.size ?? .42) * TYPE, steps = focus.map((_, s) => s);
  const home = (i: number): V3 => [(hash(i * 3 + 1) * 2 - 1) * 6.5, 1.4 + hash(i * 5 + 2) * 5.2, -4 - hash(i * 7 + 3) * 10];
  const front = (k: number, n: number): V3 => {
    const columns = n <= 3 ? n : 3, rows = Math.ceil(n / columns), c = k % columns, r = Math.floor(k / columns);
    return [(c - (columns - 1) / 2) * (n <= 3 ? 4.6 : 5), (n <= 3 ? 3.8 : 3.8 + (rows - 1) * .7) - r * 1.4, n <= 3 ? 2 : -2];
  };
  const pose = (i: number, s: number) => {
    const word = words[i], current = focus[s].indexOf(word), seen = focus.slice(0, s).some(f => f.includes(word));
    if (current >= 0) { const p = front(current, focus[s].length); return { p: s === zoom ? [p[0] * .85, p[1], p[2]] as V3 : p, color: "#ffffff", glow: 1.3 }; }
    const h = home(i);
    if (seen) return { p: [h[0] * .9, h[1], -2 - hash(i) * 1.5] as V3, color: "#a8aeb8", glow: s === zoom ? .08 : .9 };
    return { p: h, color: INK.muted, glow: s === zoom ? .05 : .3 };
  };
  const anchor = (s: number): V3 => focus[s].length ? pose(words.indexOf(focus[s][0]), s).p : [0, 3.5, -6];
  return <Stage id={id} position={at}>
    <Stage id={`${id}/focus`} position={[{ step: 0, value: anchor(0) }, ...steps.slice(1).map(s => key(s, anchor(s), 0, 1, "cubic"))]} />
    {words.map((word, i) => <Stage key={word} id={`${id}/${word}`} position={[{ step: 0, value: pose(i, 0).p }, ...steps.slice(1).map(s => key(s, pose(i, s).p, .05 * (i % 4), 1.1, "cubic"))]}>
      <Text3D id={`${id}/${word}/text`} text={word} mono size={size} color={[{ step: 0, value: pose(i, 0).color }, ...steps.slice(1).map(s => key(s, pose(i, s).color, .2, .6))]}
        emissive={[{ step: 0, value: pose(i, 0).glow }, ...steps.slice(1).map(s => key(s, pose(i, s).glow, .3, .7))]} />
    </Stage>)}
    <DOF focus={`stage:${id}/focus`} focusRange={zoom === undefined ? .9 : [{ step: 0, value: .9 }, key(zoom, .5, 0, .8), key(zoom + 1, .9, 0, .8)]}
      aperture={zoom === undefined ? 3 : [{ step: 0, value: 3 }, key(zoom, 6, 0, .8), key(zoom + 1, 3, 0, .8)]} maxBlur={22} />
  </Stage>;
}
/** `count` translucent layers stacked into depth, one more on each step from `step`, over a `meter` that fills to the given fraction on each step. */
function layers(id: string, at: V3, props: Record<string, unknown>) {
  const count = Number(props.count ?? 4), first = Number(props.step ?? 0), label = String(props.label ?? ""), meter = (props.meter ?? []) as number[], length = 9;
  const color = String(props.color ?? INK.purple), value = props.value as string | undefined, caption = props.caption as string | undefined;
  const layer = (k: number): V3 => [k * .9, 0, -k * 1.5], shown = (k: number) => k === 0 && first === 0 ? 1 : [{ step: 0, value: 0 }, key(first + k, 1, 0, .4)];
  const fill = (fraction: number) => ({ position: [-length / 2 + fraction * length / 2, -2.6, .05] as V3, scale: [Math.max(.001, fraction * length), .16, .16] as V3 });
  const meterTrack = (pick: (f: ReturnType<typeof fill>) => V3) => meter.length ? [{ step: 0, value: pick(fill(meter[0])) }, ...meter.slice(1).map((f, s) => key(first + s + 1, pick(fill(f)), .2, .8))] : pick(fill(0));
  return <Stage id={id} position={at}>
    {Array.from({ length: count }, (_, k) => <Fragment key={k}>
      <Card id={`${id}/${k}`} position={layer(k)} scale={[2.4, 3.4, .08]} fill={.18} color={color} emissive={1.4 - k * .25} opacity={shown(k)} />
      {label && <Text3D id={`${id}/${k}/label`} text={label} mono size={.24 * TYPE} align="left" position={[layer(k)[0] - .9, -1.25, layer(k)[2] + .08]} color={color} emissive={1.2} opacity={shown(k)} />}
    </Fragment>)}
    {value && <Text3D id={`${id}/value`} text={value} mono size={.6 * TYPE} position={[layer(count - 1)[0] + 2.6, 0, layer(count - 1)[2] - 1]} color={INK.white} emissive={.5} opacity={.4} />}
    {meter.length > 0 && <>
      <Box id={`${id}/track`} size={.5} position={[0, -2.6, 0]} scale={[length, .16, .14]} color={INK.idle} emissive={.4} />
      <Box id={`${id}/fill`} size={.5} position={meterTrack(f => f.position)} scale={meterTrack(f => f.scale)} color={color} emissive={2.6} />
    </>}
    {caption && <Text3D id={`${id}/caption`} text={caption} mono size={.2 * TYPE} position={[0, -3.2, 0]} color={INK.muted} emissive={.8} />}
  </Stage>;
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
      const width = Math.max(1, ...lines.map(l => l.length)) * size * .84 + .6, height = (lines.length - 1) * lineHeight + size + .6, advance = size * TYPE * MONO;
      const marks = (props.marks ?? []) as CodeMark[];
      return <Stage id={id} position={anchored(position, props.anchor, width, height)}>
        <Card id={`${id}/card`} position={[width / 2 - .3, -(height - .6) / 2, -.14]} scale={[width,height,.06]} fill={.75} />
        <Text3D id={`${id}/code`} text={text} mono size={size * TYPE} lineHeight={lineHeight / (size * TYPE)} align="left" />
        {marks.flatMap((mark, m) => lines.flatMap((line, row) => [...line.matchAll(new RegExp(mark.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))].map(found => {
          const scale: V3 = [mark.text.length * advance + .12, lineHeight * .9, .04];
          return <Box key={`${m}/${row}/${found.index}`} id={`${id}/mark${m}/${row}/${found.index}`} size={.5} color={mark.color ?? INK.amber} emissive={1.4}
            position={[(found.index! + mark.text.length / 2) * advance, -row * lineHeight, -.08]} scale={mark.step ? [{ step: 0, value: [0,0,0] }, key(mark.step, scale, mark.delay ?? 0, .35)] : scale} />;
        })))}
      </Stage>;
    }
    if (kind === "tree") {
      const nodes = placeTree(props.nodes as TreeNode[], { width: props.width as number | undefined, levelHeight: props.levelHeight as number | undefined });
      const beat = props.beat as Beat | undefined, flashes = ((props.flash ?? []) as TreeFlash[]).flatMap(f => Array.from({ length: f.repeat ?? 1 }, (_, r) => ({ ...f, delay: (f.delay ?? 0) + r * (f.every ?? 1.5) })));
      const idle = String(props.color ?? "#22d3ee"), nodeWidth = props.nodeWidth as number | undefined, labelSize = props.labelSize as number | undefined;
      const lit = (f: TreeFlash, n: TreeNode) => !f.ids || f.ids.includes(n.id);
      const arrives = (f: TreeFlash, n: { d: number }) => (f.delay ?? 0) + (f.wave === false ? .22 : n.d * (f.hop ?? .25));
      return <Stage id={id} position={position}>{nodes.map(n => { const parent = n.p === undefined ? undefined : nodes[n.p], own = flashes.filter(f => lit(f, n));
        const color = own.length ? [{ step: 0, value: n.color ?? idle }, ...own.map(f => key(f.step, f.color, arrives(f, n), .12))] : n.color;
        const emissive = own.length ? [{ step: 0, value: 1.5 }, ...own.flatMap(f => f.flash === false ? [key(f.step, f.glow ?? .4, arrives(f, n), .4)]
          : [key(f.step, 7, arrives(f, n), .06), key(f.step, f.glow ?? 2, arrives(f, n) + .1, .6)])] : undefined;
        const pulses = [...beat ? Array.from({ length: beat.count }, (_, k) => ({ at: beat.start + k * beat.every + (n.d - 1) * HOP, duration: HOP, color: typeof n.color === "string" ? n.color : idle, size: .11, emissive: 10 })) : [],
          ...own.filter(f => f.wave !== false).map(f => ({ step: f.step, delay: arrives(f, n) - (f.hop ?? .25), duration: f.hop ?? .25, color: f.color, size: .11, emissive: 10 }))];
        const bursts = own.filter(f => f.wave === false && f.from !== undefined && f.from !== n.id), from = bursts.length ? nodes.find(m => m.id === bursts[0].from) : undefined;
        return <Fragment key={n.id}>
          <Card id={`${id}/${n.id}`} position={[n.x,n.y,0]} scale={[Number(n.width ?? nodeWidth ?? (n.d < 2 ? 3 : 2.3)),Number(n.height ?? .82),.5]} color={color} emissive={emissive} />
          <Text3D id={`${id}/${n.id}/label`} text={n.label ?? n.id} mono size={(labelSize ?? (n.d < 2 ? .21 : .17)) * TYPE} position={[n.x,n.y,.27]} />
          {parent && <RoutedTube id={`${id}/${n.id}/edge`} thickness={.035} color={n.color}
            path={[[parent.x,parent.y - .41,0],[parent.x,n.y + .41,0],[n.x,n.y + .41,0]]} pulses={pulses.length ? pulses : undefined} />}
          {from && <RoutedTube id={`${id}/${n.id}/beam`} thickness={.03} color={bursts[0].color} emissive={4} path={[[from.x,from.y,-.35],[n.x,n.y,-.35]]}
            draw={[{ step: 0, value: 0 }, ...bursts.map(f => key(f.step, 1, f.delay ?? 0, .22))]}
            pulses={bursts.map(f => ({ step: f.step, delay: f.delay ?? 0, duration: .22, color: f.color, size: .12, emissive: 10 }))} />}
        </Fragment>; })}</Stage>;
    }
    if (kind === "keys") return keyList(id, position, props);
    if (kind === "grid") return grid(id, position, props);
    if (kind === "form") return form(id, position, props);
    if (kind === "morph") return codeMorph(id, position, props, children);
    if (kind === "trace") return codeTrace(id, position, props, source);
    if (kind === "cloud") return cloud(id, position, props);
    if (kind === "layers") return layers(id, position, props);
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
