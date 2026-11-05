import React, { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { useDeckContent, usePresentationValue } from "@legend-apps/presentation";
import type { CodeHighlight, CodeToken } from "@legend-apps/presentation";
import type { Ease } from "./camera";
import { colorVector, compileTrack, type Keyframe } from "./scene";
import { ambientEffects, authoringError, checkHighlighted, checkPart, checkScene, defaultColors, enterDefaults, exitDefaults, paint, sequenceDefaults, type Ambient, type SceneColors } from "./authoringProps";
import { Box, Burst, Camera, Card, Custom, DOF, Fog, Orbs, Pillar, RoundedBox, Rows, RoutedTube, Stage, Text3D, WorldSlide, prepareWorldSlides, type Animated, type GlyphMotion, type Text3DOptions, type WorldProps, type WorldSegment, type WorldTrack } from "./World";

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

export type AuthoredPart = { kind: string; id: string; text: string; tokens?: CodeToken[]; order: number; [key: string]: unknown };
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
export const Flight = part("flight");

/** Named placement for a scene: its camera and a slot per part. Parts take the free slots of their kind in order; `slot` names one, and explicit props win. */
export type SceneLayout = { camera?: WorldTrack; slots: Record<string, { kind: string; [prop: string]: unknown }> };
const heading = { kind: "headline", at: [-5.6,5.95,0], size: .62, depth: .16, align: "left", delay: .6, duration: .8 };
const caption = { kind: "headline", at: [-5.56,5.45,0], size: .15, depth: .03, mono: true, align: "left", track: .2, color: "muted", emissive: .5, delay: .8, duration: .8 };
const trackSlots: SceneLayout["slots"] = {
  title: heading, subtitle: caption, tree: { kind: "tree", at: [0,2.6,0] },
  note: { kind: "headline", at: [1.85,2.6+2-.07,0], size: .2, mono: true, align: "left", color: "highlight", emissive: .8, delay: 1.8 },
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
    kicker: { kind: "headline", at: [0,4.9,0], size: .2, depth: .04, mono: true, track: .25, color: "accent", emissive: .6, delay: .9, duration: .7 },
    rule: { kind: "rule", at: [0,.95,0], width: 6.5, delay: 1.6 },
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
    note: { kind: "headline", at: [3.4,-.25,1.6], size: .2, depth: .04, mono: true, track: .12, color: "highlight", emissive: .8, delay: 2.2 },
  } },
  /** One large centered line, with an optional kicker above and rule below. */
  title: { camera: { position: [-.8,2.5,11.6], target: [0,2.3,0] }, slots: {
    line: { kind: "headline", at: [0,2.6,0], size: 1.25, depth: .32, track: .02, delay: .15 },
    kicker: { kind: "headline", at: [0,4.05,0], size: .2, depth: .04, mono: true, track: .25, color: "accent", emissive: .6, delay: .9, duration: .7 },
    rule: { kind: "rule", at: [0,1.3,0], width: 6.5, delay: 1.2 },
  } },
  /** `statement` from further back, for lines up to about 17 characters. */
  "statement-wide": { camera: { position: [-.8,2.8,15], target: [0,2.6,0] }, slots: {
    line1: { kind: "headline", at: [0,3.35,0], size: 1.25, depth: .32, track: .02, delay: .15 },
    line2: { kind: "headline", at: [0,1.85,0], size: 1.25, depth: .32, track: .02, delay: .9 },
    rule: { kind: "rule", at: [0,.95,0], width: 8, delay: 1.6 },
  } },
  /** Heading top left over a keyed list. */
  keys: { camera: { position: [-1,4.2,14], target: [0,3.6,0], via: [-3.5,7,21], viaTarget: [0,2.5,12] }, slots: {
    title: { ...heading, at: [-7.4,7.3,0] }, keys: { kind: "keys", at: [0,6.2,0] },
  } },
  /** Heading top left over a large tree laid out by leaves, five levels deep. */
  "tree-wide": { camera: { position: [-1.2,4.6,15.5], target: [0,4.2,0], via: [-3.5,7,22], viaTarget: [0,2.5,13] }, slots: {
    title: { ...heading, at: [-8.2,8.6,0] }, subtitle: { ...caption, at: [-8.16,8.05,0] },
    tree: { kind: "tree", at: [0,5,0], width: 16, levelHeight: 1.45, nodeWidth: 2.6, labelSize: .17 },
  } },
  /** Three captioned trees side by side, 9.6 apart, over a legend row; a slide tours them with step cameras. */
  "tree-tour": { camera: { position: [0,4.6,26], target: [0,4.2,0], via: [-4,8,34], viaTarget: [0,2.5,20] }, slots: {
    title: { ...heading, at: [-13.5,10,0], size: 1 },
    ...Object.fromEntries([-9.6, 0, 9.6].flatMap((x, i) => [[`caption${i + 1}`, { kind: "headline", at: [x,8.5,0], size: .42, depth: .12, track: .02, delay: .4 + i * .15 }],
      [`tree${i + 1}`, { kind: "tree", at: [x,4.8,0], width: 8.4, levelHeight: 1.6, nodeWidth: 1.95, labelSize: .13 }]])),
    ...Object.fromEntries([-4.5, 0, 4.5].map((x, i) => [`legend${i + 1}`, { kind: "headline", at: [x,.9,1], size: .24, depth: .04, mono: true, track: .12, emissive: .8, delay: 1 }])),
  } },
  /** Captioned trees stacked in the center of frame, one shown at a time; give each pair a `sequence`. Headlines fill the captions, centered over their trees, before the title. */
  "tree-sequence": { camera: { position: [0,4.6,14.3], target: [0,4.2,0], via: [-3.5,7,22], viaTarget: [0,2.5,13] }, slots: {
    ...Object.fromEntries([1, 2, 3, 4, 5].flatMap(i => [[`caption${i}`, { kind: "headline", at: [0,8.5,0], size: .42, depth: .12, track: .02, delay: .4 }],
      [`tree${i}`, { kind: "tree", at: [0,4.8,0], width: 8.4, levelHeight: 1.6, nodeWidth: 1.95, labelSize: .13 }]])),
    title: { ...heading, at: [-8.2,9,0] },
  } },
  /** A code panel on the left and a grid of cells on the right. */
  "code-grid": { camera: { position: [-.6,4.2,14], target: [0,4,0], via: [-3.5,7,21], viaTarget: [0,2.5,12] }, slots: {
    code: { ...code, at: [-7.2,6.5,0], size: .13, lineHeight: .32 }, grid: { kind: "grid", at: [4,4.8,0], cell: [.95,.54] },
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
  /** Heading top left over centered code; the extracted tree moves into the center. */
  trace: { camera: { position: [0,4.3,15], target: [0,4,0], via: [2.8,6,22], viaTarget: [0,3,10] }, slots: {
    title: { ...heading, at: [-8.2,8.4,0] }, trace: { kind: "trace", at: [0,4.3,0], anchor: "center" },
  } },
  /** Heading top left, a line of code on the left, stacked layers and a meter in the middle. */
  layers: { camera: { position: [-1.4,4,14], target: [0,3.8,0], via: [-3.5,7,21], viaTarget: [0,2.5,12] }, slots: {
    title: { ...heading, at: [-7.4,7.6,0] }, code: { ...code, at: [-7.6,4.6,0], size: .22, lineHeight: .4 }, layers: { kind: "layers", at: [-.4,4.2,0] },
  } },
};
/** Adds a layout, or replaces one of the same name, for this deck. */
export function defineSceneLayout(name: string, layout: SceneLayout) { sceneLayouts[name] = layout; }
/** Without `prepare` a layout name must exist; a `prepare` deck may use the name as its own label. */
function findLayout(name: string | undefined, prepared: boolean, scene: Record<string, unknown> = {}) {
  const layout = name === undefined ? undefined : sceneLayouts[name];
  if (name !== undefined && !layout && !prepared) throw authoringError(scene, "Scene", `Unknown scene layout: ${name}. Known: ${Object.keys(sceneLayouts).join(", ")}`);
  return layout;
}
function slotPlacer(layout: SceneLayout | undefined) {
  const used = new Set<string>();
  return (kind: string, props: Record<string, unknown>) => {
    if (!layout) return props;
    const name = (props.slot as string | undefined) ?? Object.keys(layout.slots).find(s => layout.slots[s].kind === kind && !used.has(s));
    if (name === undefined) return props;
    if (!layout.slots[name]) throw authoringError(props, kind, `Unknown layout slot: ${name}. Known: ${Object.keys(layout.slots).join(", ")}`);
    used.add(name);
    const { kind: _, ...defaults } = layout.slots[name];
    return { ...defaults, ...props };
  };
}
export type SceneProps = Omit<WorldProps, "children" | "track" | "id"> & {
  id: string; world?: string; layout?: string; durations?: number[]; camera?: WorldTrack;
  /** Theme colors for the generic parts; their color props also take these names. */
  colors?: Partial<SceneColors>;
  /** Ambient effects added to the scene. */
  ambient?: Ambient | Ambient[];
  /** Set by the deck compiler for authoring errors. */
  mdxSource?: string;
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
function codeHighlight(node: ReactNode): CodeHighlight | undefined {
  let highlighted: CodeHighlight | undefined;
  Children.forEach(node, child => {
    if (isValidElement<{ highlighted?: CodeHighlight; children?: ReactNode }>(child)) {
      highlighted ??= child.props.highlighted ?? codeHighlight(child.props.children);
    }
  });
  return highlighted;
}
function checkCodeChildren(kind: string, props: Record<string, unknown>, children: ReactNode) {
  Children.forEach(children, child => {
    if (isValidElement<{ highlighted?: CodeHighlight; children?: ReactNode }>(child)) {
      if (child.props.highlighted) checkHighlighted(kind, props, codeSource(child), child.props.highlighted);
      else checkCodeChildren(kind, props, child.props.children);
    } else checkHighlighted(kind, props, codeSource(child), undefined);
  });
}
export function readScenes(content: readonly ReactNode[], world?: string): AuthoredSlide[] {
  const slides: AuthoredSlide[] = [];
  for (const children of content) collect(children, child => {
    if (child.type !== Scene) return;
    const props = child.props as SceneProps, parts: AuthoredPart[] = [];
    if (world !== undefined && (props.world ?? "scene") !== world) return;
    checkScene(props);
    const layout = findLayout(props.layout, !!props.prepare, props), place = slotPlacer(layout), colors = { ...defaultColors, ...props.colors };
    collect(props.children, node => {
      const kind = (node.type as { worldPart?: string }).worldPart;
      if (!kind) throw authoringError(props, "Scene", "children must be scene parts or fragments.");
      checkPart(kind, node.props);
      const { children, mdxSource: _, ...part } = place(kind, node.props);
      const source = codeSource(children as ReactNode);
      const text = kind === "code" ? source.replace(/\n$/, "") : source;
      checkCodeChildren(kind, node.props, children as ReactNode);
      parts.push({ ...part, ...part.color === undefined ? {} : { color: paint(part.color, colors) }, kind, order: parts.length, text, tokens: codeHighlight(children as ReactNode)?.tokens } as AuthoredPart);
    });
    for (const part of parts) if (part.kind === "tree") part.nodes = placeTree(part.nodes as TreeNode[], part as { width?: number; levelHeight?: number });
    const ids = new Set<string>();
    for (const p of parts) {
      if (ids.has(p.id)) throw authoringError(props, "Scene", `Duplicate scene part: ${p.id}`);
      ids.add(p.id);
    }
    if (slides.some(s => s.id === props.id)) throw authoringError(props, "Scene", `Duplicate scene: ${props.id}`);
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
function sameSceneValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // React owners differ between renderers; component types, keys and props define the declaration.
  if (isValidElement(a) && isValidElement(b)) return a.type === b.type && a.key === b.key && sameSceneValue(a.props, b.props);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameSceneValue(a[i], b[i])) return false;
    return true;
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object" ||
    Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const keys = Object.keys(a), other = Object.keys(b);
  return keys.length === other.length && keys.every((key, i) => key === other[i] && sameSceneValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
// Each deck's pack retains one preparation per named world across equivalent renderer mounts.
const slidePlans = new Map<string, { declarations: SceneProps[]; slides: WorldProps[] }>();
function sceneTrack(scene: SceneProps): WorldTrack {
  return flightCamera(scene, { ...findLayout(scene.layout, false, scene)?.camera, via: undefined, viaTarget: undefined, ...scene.camera });
}
/** A scene's `Flight` adds a camera step per stop that shifts the camera onto it, and holds on the last stop through the remaining `durations`; authored `steps` win per field. */
function flightCamera(scene: SceneProps, track: WorldTrack): WorldTrack {
  let props: Record<string, unknown> | undefined;
  collect(scene.children, child => { if (child.type === Flight) props ??= child.props; });
  if (!props) return track;
  const stops = flightStops(props), first = Number(props.step ?? 1), at = (props.at ?? [0, 3.2, 0]) as V3, target = track.target ?? at;
  const duration = Number(props.duration ?? .8), ease = (props.ease ?? "out") as Ease, steps = { ...track.steps };
  for (let c = 0; c < Math.max(stops.length, (scene.durations?.length ?? 0) - first); c++) {
    steps[first + c] = { shift: sub(add(at, stops[Math.min(c, stops.length - 1)]), target), duration, ease, ...track.steps?.[first + c] };
  }
  return { ...track, steps };
}
function plannedSlides(content: readonly ReactNode[], world: string) {
  const declarations: SceneProps[] = [], indices: number[] = [];
  content.forEach((children, index) => collect(children, child => {
    if (child.type === Scene && !child.props.prepare && (child.props.world ?? "scene") === world) { declarations.push(child.props as SceneProps); indices.push(index); }
  }));
  if (!declarations.length) return [];
  let cached = slidePlans.get(world);
  if (!cached || !sameSceneValue(declarations, cached.declarations)) {
    const tracks = declarations.map(sceneTrack);
    // Every station's leg, by slide index, so the whole deck shares one track.
    const course: WorldSegment[] = [];
    tracks.forEach(({ spacing, duration, ease, bank, turn, rise, position }, i) => { course[indices[i]] = { spacing, duration, ease, bank, turn, rise, position }; });
    cached = { declarations, slides: prepareWorldSlides(declarations.map((scene, i) => { const { children, layout, camera, colors, ambient, mdxSource, ...props } = scene;
      return { ...props, track: { ...tracks[i], course }, children: expandScene(children, layout, scene) }; })) };
    slidePlans.set(world, cached);
  }
  return cached.slides;
}
export function Scene(scene: SceneProps) {
  const { id, world = "scene", prepare, layout, durations, camera, children, colors: _, ambient: __, mdxSource: ___, ...appearance } = scene;
  const content = useDeckContent(), step = usePresentationValue("stepIndex");
  if (!prepare) {
    const planned = plannedSlides(content, world).find(slide => slide.id === id);
    return <WorldSlide {...appearance} {...planned} world={world} track={planned?.track ?? sceneTrack(scene)}
      buildDuration={durations?.[step]}>{planned?.children ?? expandScene(children, layout, scene)}</WorldSlide>;
  }
  const slides = readScenes(content, world), plan = scenePlan(prepare, slides), slide = slides.findIndex(s => s.id === id), beat = plan.slideBeats[slide] + step;
  return <WorldSlide {...appearance} world={world} track={plan.tracks[slide] ?? { spacing: 32 }} clock="step"
    stepOffset={plan.slideBeats[slide]} buildDuration={(plan.starts[beat + 1] ?? plan.end) - plan.starts[beat]}>{plan.elements}</WorldSlide>;
}

/** A `quiet` node sits out its tree's beat; a `typed` node shows one more character of that text under its label on each beat. */
export type TreeNode = { id: string; label?: string; x?: number; y?: number; d?: number; p?: number; width?: number; height?: number; color?: string; quiet?: boolean; typed?: string; [key: string]: unknown };
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
/** Unit box mesh for instanced Custom shapes: 6 vertices per face. */
const boxWgsl = `
fn boxVertex(vid:u32)->ShapeVertex {
 let face=vid/6u; let q=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.))[vid%6u];
 let sgn=select(-1.,1.,face%2u==0u); let axis=face/2u;
 if(axis==0u) { return ShapeVertex(vec3f(sgn,q.x,q.y),vec3f(sgn,0.,0.)); }
 if(axis==1u) { return ShapeVertex(vec3f(q.x,sgn,q.y),vec3f(0.,sgn,0.)); }
 return ShapeVertex(vec3f(q.x,q.y,sgn),vec3f(0.,0.,sgn));
}`;
const f32 = (n: number) => n.toFixed(8);
/** Streaks along -z at floor level, looping on the continuous clock. `length` is the loop's run in world units.
 * At peak travel speed each streak is `stretch` times longer and `boost` times brighter. Every other streak is `accent` (default red). */
export function speedTrails(length = 250, { stretch = 3, boost = 1.6, accent }: { stretch?: number; boost?: number; accent?: string } = {}) {
  const count = 26, trails = Array.from({ length: count }, (_, i) => ({ x: -11 + 22 * hash(i * 3 + 3), y: .04 + .08 * hash(i * 5 + 3) ** 2.5,
    l: 6 + 10 * hash(i * 7 + 3), ph: hash(i * 11 + 3), sp: .6 + .8 * hash(i * 13 + 3), gain: 2.2 * (.4 + .6 * hash(i * 17 + 3)) }));
  return <Custom id="trails" count={count} vertexCount={36} color="#ffffff" material={{ rim: 0 }} wgsl={`${boxWgsl}
const D=array<vec4f,${count}>(${trails.map(d => `vec4f(${f32(d.x)},${f32(d.y)},${f32(d.l)},${f32(d.ph)})`).join(",")});
const E=array<vec2f,${count}>(${trails.map(d => `vec2f(${f32(d.sp)},${f32(d.gain)})`).join(",")});
fn shape(id:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
 let d=D[id]; let z=20.-fract(continuousTime()*18.*E[id].x/${f32(length)}+d.w)*${f32(length)};
 let mesh=boxVertex(vid);
 return ShapeVertex(vec3f(d.x,d.y,z)+mesh.position*vec3f(select(.02,.035,d.y<.3),.015,d.z*.5*(1.+travelSpeed()*${f32(stretch - 1)})),mesh.normal);
}
fn shade(id:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
 return Material(vec3f(0.),select(vec3f(1.),${accent ? `vec3f(${colorVector(accent).map(f32).join(",")})` : "vec3f(1.,.04231141,.01161225)"},id%2u==0u)*E[id].y*(1.+travelSpeed()*${f32(boost - 1)}),1.,0.);
}`} />;
}
/** Fourteen streaks burst from each landing point `p` at slide time `t`, arc down under gravity and fade within .7 s. */
export function sparks(landings: { p: V3; t: number }[]) {
  if (!landings.length) return null;
  const per = 14, count = landings.length * per;
  return <Custom id="sparks" count={count} vertexCount={36} color="#ffffff" material={{ rim: 0 }} wgsl={`${boxWgsl}
const L=array<vec4f,${landings.length}>(${landings.map(l => `vec4f(${l.p.map(f32).join(",")},${f32(l.t)})`).join(",")});
const H=array<vec2f,${count}>(${Array.from({ length: count }, (_, i) => `vec2f(${f32(hash(i))},${f32(hash(i + 99))})`).join(",")});
fn sparkAge(id:u32,ctx:ShapeContext)->f32 { return ctx.slideTime-L[id/${per}u].w; }
fn sparkRotate(p:vec3f,a:f32)->vec3f {
 let z=vec3f(p.x*cos(.6)-p.y*sin(.6),p.x*sin(.6)+p.y*cos(.6),p.z);
 return vec3f(z.x*cos(a)-z.z*sin(a),z.y,z.x*sin(a)+z.z*cos(a));
}
fn shape(id:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
 let age=sparkAge(id,ctx); let h=H[id]; let a=h.x*6.283185307; let v=2.5+3.*h.y;
 let p=L[id/${per}u].xyz+vec3f(cos(a)*v*age,(2.2+2.*h.x)*age-4.9*age*age,sin(a)*v*age*.6+.3);
 let mesh=boxVertex(vid); let half=vec3f(select(0.,.16*(1.-age/.7)+.02,age>0.&&age<.7),.018,.018)*.5;
 return ShapeVertex(p+sparkRotate(mesh.position*half,a),sparkRotate(mesh.normal,a));
}
fn shade(id:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
 let c=select(vec3f(1.,.36130678,.01370208),vec3f(1.),(id%${per}u)%3u==0u);
 return Material(vec3f(0.),c*6.*(1.-clamp(sparkAge(id,ctx)/.7,0.,1.)),1.,0.);
}`} />;
}
/** A repeating beat, in seconds. */
export type Beat = { start: number; every: number; count: number };
/** Seconds a beat's pulse spends on each tree edge. */
const HOP = .36;
/** Expand authoring parts only; raw World geometry remains available for free composition. A layout supplies each part's placement.
 * The scene's props, when given, are checked and supply its theme colors, ambient effects and the id that keeps `carry={false}` parts apart. */
export function expandScene(children: ReactNode, layout?: string, scene?: SceneProps): ReactNode {
  if (scene) checkScene(scene as Record<string, unknown>);
  const ink = inkOf({ ...defaultColors, ...scene?.colors });
  const parts = expandParts(children, slotPlacer(findLayout(layout, false, scene as Record<string, unknown> | undefined)), { ink, scene: scene?.id ?? "scene" });
  const ambient = scene?.ambient === undefined ? [] : Array.isArray(scene.ambient) ? scene.ambient : [scene.ambient];
  return ambient.length ? <>{ambient.map(effect => ambientElement(effect, ink, scene?.backgroundColor))}{parts}</> : parts;
}
/** Generic ambience for a scene; anything richer composes World primitives directly. */
function ambientElement(ambient: Ambient, ink: Ink, background: unknown) {
  const { effect, count, color, density, length } = typeof ambient === "string" ? { effect: ambient } as Exclude<Ambient, string> : ambient;
  const tint = color === undefined ? undefined : String(paint(color, ink.colors));
  if (effect === "dust") return <Orbs key={effect} id="ambient-dust" count={count ?? 320} colors={[tint ?? "#cfd6e4"]} radius={.018} spread={[24, 10, 160]}
    position={[0, 4, -60]} seed={5} drift={.08} emissive={.8} />;
  if (effect === "trails") return <Fragment key={effect}>{speedTrails(length ?? 250)}</Fragment>;
  if (effect === "orbs") return <Orbs key={effect} id="ambient-orb" count={count ?? 24} colors={tint ? [tint] : [ink.accent, ink.purple, ink.blue]} radius={.22}
    spread={[22, 9, 30]} position={[0, 4.5, -12]} seed={11} drift={.35} emissive={2} />;
  if (effect === "fog") return <Fog key={effect} density={density ?? .022} color={tint ?? (typeof background === "string" ? background : "#050506")} />;
  throw Error(`Unknown ambient effect: ${effect as string}. Known: ${ambientEffects.join(", ")}`);
}
/** A scene on a lane: its named layout and its parts. */
export type LaneScene = { layout: string; parts: ReactNode };
export type LaneOptions = { spacing?: number; fov?: number; handheld?: number };
/** Scene `index` of a lane whose scenes stand `spacing` apart down -z, as one slide's World children. The camera flies in from the previous
 * scene along its layout's `via`. That scene's parts leave as the slide starts: a part with `into` sends its glyphs or tree nodes on arcs into
 * the nodes or bars of that part, which grow in as they land, with sparks; the others rail off to the right. `handheld` is a drift in world units. */
export function laneScene(scenes: LaneScene[], index: number, { spacing = 32, fov, handheld = 0 }: LaneOptions = {}): ReactNode[] {
  const INK = inkOf(defaultColors);
  const station = (i: number): V3 => [0, 0, -spacing * i], scene = scenes[index], before = scenes[index - 1];
  const shot = (i: number) => { const camera = findLayout(scenes[i].layout, false)?.camera ?? {}, at = (p: unknown) => add(p as V3, station(i));
    return { position: at(camera.position), target: at(camera.target), via: camera.via ? [at(camera.via)] : undefined }; };
  const idle = handheld ? { position: [handheld, handheld, handheld] as V3, speed: .37 } : undefined, here = shot(index);
  const shots = before ? [{ at: 0, ...shot(index - 1), via: undefined, fov, duration: 0 }, { at: .25, ...here, fov, duration: 1.7, ease: "cubic" as const, idle }]
    : [{ at: 0, ...here, via: undefined, fov, duration: 0, idle }];
  const parts = laneParts(scene), landings: { p: V3; t: number }[] = [], arrivals = new Map<string, number>(), sent = new Map<string, number>();
  const leaving = before ? laneParts(before).map(({ node, kind, props }) => {
    const into = props.into as string | undefined, id = `${props.id}/out`, at = add((props.at ?? [0, 3.2, 0]) as V3, station(index - 1));
    if (into === undefined) return <Stage key={id} id={`${props.id}/exit`} position={[{ at: 0, value: station(index - 1), duration: 0 }, { at: .1, value: add(station(index - 1), [14, 0, 0]), duration: .8, ease: "cubic" }]}>
      {expandParts(node, () => ({ ...props, id, enter: undefined, delay: kind === "tree" ? undefined : -9, ...props.beat ? { beat: undefined, value: (props.beat as Beat).count * Number(props.per ?? 1) } : {} }), { ink: INK, scene: `lane${index - 1}` })}</Stage>;
    const target = parts.find(p => p.props.id === into);
    if (!target || (target.kind !== "tree" && target.kind !== "bars")) throw Error(`Scene part ${props.id} flies into ${into}, which must be a tree or bars on the next scene.`);
    const ends = target.kind === "tree" ? placeTree(target.props.nodes as TreeNode[], target.props as { width?: number; levelHeight?: number }).map(n => [n.x, n.y, 0] as V3)
      : (target.props.items as unknown[]).map((_, i, all) => [(i - (all.length - 1) / 2) * 3.4, 0, 0] as V3);
    const first = sent.get(into) ?? 0, end = (g: number) => add(add(add((target.props.at ?? [0, 3.2, 0]) as V3, station(index)), ends[g % ends.length]),
      target.kind === "bars" ? [0, .25 + Math.floor(g / ends.length) % 3 * .55, 0] : [0, 0, 0]);
    // Cubic arcs sampled into linear keyframes: up and back off the start, in from above and in front of the end.
    const arc = (from: V3, to: V3, lift: V3, lead: V3, t0: number, duration: number, value: (p: V3, u: number) => unknown) =>
      Array.from({ length: 13 }, (_, k) => { const u = k / 12; return { at: k ? t0 + (k - 1) / 12 * duration : 0, value: value(bez3(from, add(from, lift), add(to, lead), to, ease.io(u)), u), duration: k ? duration / 12 : 0 }; });
    const land = (g: number, t: number) => { landings.push({ p: end(g), t }); arrivals.set(into, Math.min(arrivals.get(into) ?? Infinity, t)); };
    if (kind === "headline" || kind === "quote") {
      const text = codeSource(props.children as ReactNode), count = [...text].filter(ch => ch.trim()).length;
      sent.set(into, first + count);
      const leaves = (g: number) => g % 7 * .07 + Math.floor(g / 7) * .05;
      for (let g = first; g < first + count; g++) land(g, leaves(g) + 1.25);
      const { children: _, at: __, ...style } = props;
      return <Fragment key={id}>{textLine(kind, { ...style, id, position: at, text, enter: undefined, glyphs: (i: number, _: string, home: V3): GlyphMotion => {
        const g = first + i, rest = add(at, home), side = rest[0] < 0 ? -1 : 1;
        const path = (value: (p: V3, u: number) => unknown) => arc(rest, end(g), [side * 3, 4.5 + g % 3 * .8, -9], [0, 2.2, 5], leaves(g), 1.25, value);
        return { offset: path(p => sub(p, rest)) as GlyphMotion["offset"], rotation: path((_, u) => deg([Math.sin(u * Math.PI) * .5, Math.sin(u * Math.PI) * side * .7, 0])) as GlyphMotion["rotation"],
          scale: path((_, u) => 1 - ramp(u, .82, .18) * .999) as GlyphMotion["scale"] };
      } }, INK)}</Fragment>;
    }
    if (kind !== "tree") throw Error(`Scene part ${props.id} cannot fly: only headlines, quotes and trees can.`);
    const nodes = placeTree(props.nodes as TreeNode[], props as { width?: number; levelHeight?: number }), idle = String(props.color ?? "#22d3ee");
    sent.set(into, first + nodes.length);
    return <Fragment key={id}>{nodes.map((n, j) => {
      const g = first + j, rest = add(at, [n.x, n.y, 0]), w = Number(n.width ?? props.nodeWidth ?? (n.d < 2 ? 3 : 2.3)), h = Number(n.height ?? .82), parent = n.p === undefined ? undefined : nodes[n.p];
      land(g, j * .06 + 1.3);
      return <Fragment key={n.id}>
        <Card id={`${id}/${n.id}`} color={n.color ?? idle} emissive={1.5} position={arc(rest, end(g), [0, 2.2, -4], [0, 3, 3], j * .06, 1.3, p => p) as Animated<V3>}
          scale={arc(rest, end(g), [0, 0, 0], [0, 0, 0], j * .06, 1.3, (_, u) => u < 1 ? [w * (1 - .45 * u), h * (1 - .8 * ramp(u, .7, .3)), .5] : [1e-4, 1e-4, 1e-4]) as Animated<V3>} />
        <Text3D id={`${id}/${n.id}/label`} text={n.label ?? n.id} mono font={props.font as Text3DOptions["font"]} size={(Number(props.labelSize ?? 0) || (n.d < 2 ? .21 : .17)) * TYPE}
          position={add(rest, [0, n.typed && props.beat ? .12 : 0, .27])} opacity={[{ at: 0, value: 1, duration: 0 }, { at: j * .06, value: 0, duration: .2 }]} />
        {parent && <RoutedTube id={`${id}/${n.id}/edge`} thickness={.035} color={n.color} draw={[{ at: 0, value: 1, duration: 0 }, { at: 0, value: 0, duration: .3 }]}
          path={[add(at, [parent.x, parent.y - .41, 0]), add(at, [parent.x, n.y + .41, 0]), add(at, [n.x, n.y + .41, 0])]} />}
      </Fragment>; })}</Fragment>;
  }) : [];
  const place = slotPlacer(findLayout(scene.layout, false));
  return [<Camera key="camera" shots={shots} />, ...leaving,
    <Stage key="station" id={`station${index}`} position={station(index)}>{expandParts(scene.parts, (kind, props) => {
      const placed = place(kind, props) as PartProps;
      return arrivals.has(placed.id) && placed.delay === undefined ? { ...placed, delay: arrivals.get(placed.id) } : placed;
    }, { ink: INK, scene: `lane${index}` })}</Stage>, sparks(landings)];
}
/** A scene's parts with their layout placement, in order, beside the elements they came from. */
function laneParts(scene: LaneScene) {
  const place = slotPlacer(findLayout(scene.layout, false)), parts: { node: ReactElement; kind: string; props: PartProps }[] = [];
  collect(scene.parts, node => { const kind = (node.type as { worldPart?: string }).worldPart; if (kind) parts.push({ node, kind, props: place(kind, node.props) as PartProps }); });
  return parts;
}
/** World only reads its own element types, so this returns a Text3D rather than being a component. Sizes are nominal: `size * TYPE` is the em. */
function textLine(kind: string, { size: nominal, depth, track, delay, duration, lineHeight, emissive, slot: _, into: __, enter, ...text }: Record<string, unknown>, ink: Ink) {
  const size = Number(nominal ?? (kind === "quote" ? .42 : .8) / TYPE) * TYPE, mono = !!text.mono;
  const { delay: start = delay, from: offset, ...motion } = (enter ?? {}) as { delay?: number; from?: V3 };
  return <Text3D uppercase={!mono} side={mono ? "#1c1d22" : "#24262b"} metal={.85} roughness={.28}
    enter={{ step: 0, delay: start as number | undefined, offset: offset ?? [-8,0,-2], scale: 0, stagger: .025, duration: Number(duration ?? .8), ...motion }}
    {...text as Partial<Text3DOptions>} color={paint(text.color, ink.colors) as Text3DOptions["color"]} text={String(text.text)} size={size} depth={Number(depth ?? (mono ? .04 : .2)) / size} tracking={Number(track ?? 0) / TYPE} emissive={.55 + Number(emissive ?? .32) * .5}
    lineHeight={lineHeight === undefined ? undefined : Number(lineHeight) / size} />;
}
/** The generic parts' palette, from a scene's theme colors. */
const inkOf = (colors: SceneColors) => ({ colors, white: colors.text, muted: colors.muted, idle: colors.idle, red: colors.removed, amber: colors.hot,
  purple: colors.highlight, blue: colors.link, green: colors.added, accent: colors.accent });
type Ink = ReturnType<typeof inkOf>;
/** Code panels are mostly opaque glass with a 1.5px light border: only a hint of the scenery shows through. Their code is flat, unlit text unless `flat={false}`. */
const PANEL = { fill: .9, edge: 1, line: 1.5, glow: .05 };
const panelStyle = (props: Record<string, unknown>) => ({ ...PANEL, fill: Number(props.fill ?? PANEL.fill), edge: Number(props.border ?? PANEL.edge) });
/** JetBrains Mono advance, in em. */
const MONO = .6;
const key = <T,>(step: number, value: T, delay = 0, duration = .5, ease?: Ease) => ({ step, delay, value, duration, ...ease ? { ease } : {} });
const loopTrack = <T,>(frames: Keyframe<T>[], step: number, every: number, delay = 0): Keyframe<T>[] => [frames[0], {
  step, delay, value: frames[0].value, duration: 0, loop: { every, frames: frames.slice(1).map(f => ({ ...f, at: (f.delay ?? 0) - delay, step: undefined, delay: undefined })) },
}];
type CodeMark = { text: string; opacity?: number; step?: number; delay?: number };
/** The one code highlight: a cool blue band, a 1px lighter outline (22% white per unit of `edge` sets its alpha) and 4px corners. `opacity` fades it. */
const HIGHLIGHT = { flat: true, color: "#5a96ff", material: { albedo: "#8cb9ff" }, fill: .3, line: 1, edge: .55 / .22, glow: 0, radius: -4 } as const;
/** Tree box face and edge albedo: lighter than night scenery so idle boxes read; flashes glow on top. */
const TREE_BOX = { fill: "#2a303a", border: "#8a94a3" };
/** A tree flash: `ids` (default all) take `color` on `step`, in a wave down the levels `hop` seconds apart, or all at once with `wave: false` (beams from `from`). */
type TreeFlash = { step: number; color: string; ids?: string[]; wave?: boolean; from?: string; hop?: number; delay?: number; flash?: boolean; glow?: number; pulseDuration?: number; repeat?: number | "infinite"; every?: number };
/** `anchor: "center"` centers a panel of this size on its position instead of hanging it from its top-left line. */
function anchored(position: V3, anchor: unknown, width: number, height: number): V3 {
  return anchor === "center" ? [position[0] - width / 2 + .3, position[1] + (height - .6) / 2, position[2]] : position;
}
/** Key cards `width` wide in rows `row` apart: a caption and labels that can crossfade. */
const keyCards = (width: number, row: number, caption: string, INK: Ink) =>
  (stage: string, position: unknown, color: unknown, emissive: unknown, opacity: unknown, labels: { text: string; opacity: unknown; color?: string }[]) =>
    <Stage key={stage} id={stage} position={position as V3}>
      <Card id={`${stage}/card`} scale={[width, row * .8, .3]} color={color as string} emissive={emissive as number} opacity={opacity as number} />
      <Text3D id={`${stage}/caption`} text={caption} mono size={.15 * TYPE} align="left" color={INK.muted} emissive={.8} position={[-width / 2 + .35, 0, .17]} opacity={opacity as number} />
      {labels.map((label, i) => <Text3D key={i} id={`${stage}/key${i}`} text={label.text} mono size={.34 * TYPE} align="left" color={label.color ?? INK.white}
        position={[-width / 2 + 1.3, 0, .17]} opacity={label.opacity as number} />)}
    </Stage>;
/** A keyed column: `scroll`, `diff` (clone), `remove`, `insert`, then `recycle` are local step numbers. */
function keyList(id: string, at: V3, props: Record<string, unknown>, INK: Ink) {
  const keys = props.keys as string[], next = (props.next ?? keys) as string[], diff = Number(props.diff ?? 1), recycle = Number(props.recycle ?? 2);
  const scroll = props.scroll as number | undefined, remove = Number(props.remove ?? diff), insert = Number(props.insert ?? diff);
  const row = Number(props.rowHeight ?? .95), width = Number(props.width ?? 3.4), gap = Number(props.gap ?? 7.6), caption = String(props.label ?? "key");
  const removed = keys.filter(k => !next.includes(k)), added = next.filter(k => !keys.includes(k)), y = (i: number) => -i * row;
  const container = keyCards(width, row, caption, INK);
  const left = keys.map((k, i) => {
    const gone = removed.indexOf(k), reuse = gone >= 0 ? added[gone] : undefined, split: V3 = [-gap / 2, y(i), 0];
    if (reuse === undefined) return container(`${id}/${k}`, [{ step: 0, value: [0, y(i), 0] }, key(diff, split, 0, .6), key(recycle, [0, y(next.includes(k) ? next.indexOf(k) : i), 0], 0, 1)],
      INK.idle, [{ step: 0, value: .8 }, key(recycle, .3, 0, .6)], 1, [{ text: k, opacity: 1 }]);
    const slot = y(next.indexOf(reuse));
    // Behind the list, down past the others, then forward into the free slot.
    return container(`${id}/${k}`, [{ step: 0, value: [0, y(i), 0] }, key(diff, split, 0, .6), key(recycle, [0, y(i), -2.2], 0, .6), key(recycle, [0, slot, -2.2], .7, 1),
      key(recycle, [0, slot, 0], 1.8, .5)], [{ step: 0, value: INK.idle }, key(remove, INK.red, 0, .4), key(recycle, INK.amber, 2.2, .1)],
      [{ step: 0, value: .8 }, key(remove, 2.4, 0, .4), key(recycle, .5, 0, .4), key(recycle, 9, 2.25, .06), key(recycle, 2.6, 2.4, .8)], 1,
      [{ text: k, opacity: [{ step: 0, value: 1 }, key(recycle, 0, 2.05, .12)] }, { text: reuse, opacity: [{ step: 0, value: 0 }, key(recycle, 1, 2.2, .12)] }]);
  });
  const copy = [...keys, ...added].map(k => {
    const from = keys.includes(k) ? keys.indexOf(k) : keys.length + added.indexOf(k), to = next.includes(k) ? next.indexOf(k) : from, isNew = added.includes(k);
    const insertionDelay = insert === diff ? .65 : 0;
    const shown = [{ step: 0, value: 0 }, key(isNew ? insert : diff, 1, isNew ? insertionDelay : 0, isNew ? .4 : .05),
      ...removed.includes(k) ? [key(insert, 0, insert === remove ? .6 : 0, .3)] : [], key(recycle, 0, .35, .15)];
    return <Fragment key={k}>
      {container(`${id}/copy/${k}`, [{ step: 0, value: [0, y(from), -.02] }, key(diff, [gap / 2, y(from), 0], 0, .6),
        key(insert, [gap / 2, y(to), 0], insertionDelay, .7), key(recycle, [gap / 2 + 3, y(to), -30], 0, .5)],
        isNew ? INK.green : removed.includes(k) ? [{ step: 0, value: INK.idle }, key(remove, INK.red, 0, .4)] : INK.idle,
        isNew ? 2.6 : .8, shown, [{ text: k, opacity: shown }])}
      {removed.includes(k) && <Box id={`${id}/copy/${k}/strike`} size={.5} color={INK.red} emissive={2}
        position={[gap / 2, y(from), .3]}
        scale={[{ step: 0, value: [0, .06, .06] }, key(remove, [width * .85, .06, .06], .1, .7),
          key(insert, [width * .85, 0, 0], insert === remove ? .8 : 0, .3)]} />}
    </Fragment>;
  });
  const links = keys.filter(k => next.includes(k)).map(k => {
    const a: V3 = [-gap / 2 + width / 2, y(keys.indexOf(k)), 0], b: V3 = [gap / 2 - width / 2, y(next.indexOf(k)), 0];
    return <RoutedTube key={`link/${k}`} id={`${id}/link/${k}`} path={[a, [a[0] + .9, a[1], 0], [b[0] - .9, b[1], 0], b]} thickness={.03} color={INK.blue} emissive={3.5}
      draw={[{ step: 0, value: 0 }, key(insert, 1, .8, .6), key(recycle, 0, 0, .25)]} />;
  });
  return <Stage id={id} position={scroll === undefined ? at : [{ step: 0, value: at }, key(scroll, add(at, [0, row * .6, 0]), 0, .9)]}>
    {left}{copy}{links}
  </Stage>;
}
/** A virtualized column whose first `viewport` keys sit in a frame, with the keys outside it dimmed. On `scroll` the keys move up one row.
 * On `window` the column steps aside and a second frame comes out holding copies of only the keys then in view, linked to their originals.
 * On `recycle` the keys stay put while the one that left the top travels behind the column into the slot entering at the bottom and takes its key.
 * With both, `recycle` follows `window`: the second frame flies away and the column recenters first. */
function viewportList(id: string, at: V3, props: Record<string, unknown>, INK: Ink) {
  const keys = props.keys as string[], shown = Number(props.viewport), scroll = props.scroll as number | undefined;
  const windowed = props.window as number | undefined, recycle = props.recycle as number | undefined, [viewLabel, windowLabel] = (props.labels ?? ["viewport", "rendered"]) as string[];
  const row = Number(props.rowHeight ?? .8), width = Number(props.width ?? 3), gap = Number(props.gap ?? 8.4), y = (i: number) => -i * row, by = scroll === undefined ? 0 : 1;
  const card = keyCards(width, row, String(props.label ?? "item"), INK), DIM = .22, cross = .25;
  const inView = (i: number, offset: number) => i - offset >= 0 && i - offset < shown;
  const frame = (fid: string, position: unknown, draw: unknown, label: string) => {
    const w = width / 2 + .28, top = row * .4 + .2, bottom = y(shown - 1) - row * .4 - .2;
    return <Stage id={fid} position={position as V3}>
      <RoutedTube id={`${fid}/edge`} path={[[-w, top, 0], [w, top, 0], [w, bottom, 0], [-w, bottom, 0], [-w, top, 0]]} thickness={.04} color={INK.accent} emissive={3} draw={draw as number} />
      <Text3D id={`${fid}/label`} text={label} mono size={.16 * TYPE} align="left" color={INK.accent} emissive={1.2} position={[-w, top + .3, 0]} opacity={draw as number} />
    </Stage>;
  };
  const leaving = keys.slice(0, by), entering = keys.slice(shown, shown + by);
  const rows = keys.map((k, i) => {
    // A pooled list's entering slot stays empty until the recycled key lands; a windowed one renders it, then empties it for the pool.
    const pooled = recycle !== undefined && entering.includes(k), before = inView(i, 0) ? 1 : DIM, after = inView(i, by) && !(pooled && windowed === undefined) ? 1 : DIM;
    const opacity = [{ step: 0, value: before }, ...scroll !== undefined && after !== before ? [key(scroll, after, cross, .35)] : [],
      ...pooled && windowed !== undefined ? [key(recycle!, DIM, 0, .3)] : []];
    const into = leaving.indexOf(k);
    if (recycle === undefined || into < 0) return card(`${id}/${k}`, [0, y(i), 0], INK.idle, .8,
      pooled ? [...opacity, key(recycle!, 0, 2, .3)] : opacity, [{ text: k, opacity }]);
    const reuse = entering[into], slot = y(shown + into), lit = [...opacity, key(recycle, 1, 0, .3)];
    // Back behind the column, down past the keys that stay, then forward into the slot.
    return <Fragment key={k}>
      {card(`${id}/${k}`, [{ step: 0, value: [0, y(i), 0] }, key(recycle, [0, y(i), -2], .3, .6), key(recycle, [0, slot, -2], .9, 1.1), key(recycle, [0, slot, 0], 2, .5)],
        [{ step: 0, value: INK.idle }, key(recycle, INK.amber, 0, .3), key(recycle, INK.idle, 2.9, .7)],
        [{ step: 0, value: .8 }, key(recycle, 2.4, 0, .3), key(recycle, 7, 2.45, .06), key(recycle, .8, 2.6, .9)], lit,
        [{ text: k, opacity: [...lit, key(recycle, 0, 2.15, .15)] }, { text: reuse, opacity: [{ step: 0, value: 0 }, key(recycle, 1, 2.2, .15)] }])}
      <Burst id={`${id}/${k}/landing`} position={[0, slot, .3]} step={recycle} delay={2.45} count={16} lifetime={.7} colors={[INK.amber, INK.amber, "#ffffff"]} emissive={6} size={.025} speed={2.5} />
    </Fragment>;
  });
  const visible = keys.map((k, i) => ({ k, i })).filter(({ i }) => inView(i, by));
  const copies = windowed === undefined ? null : <Stage id={`${id}/rendered`} position={(recycle === undefined ? [0, 0, 0] : [{ step: 0, value: [0, 0, 0] }, key(recycle, [3, 0, -30], 0, .5)]) as V3}>
    {visible.map(({ k, i }, j) => {
      const yy = y(i) + row * by, opacity = [{ step: 0, value: 0 }, key(windowed, 1, j * .05, .25)];
      return <Fragment key={k}>
        {card(`${id}/copy/${k}`, [{ step: 0, value: [0, yy, -.05] }, key(windowed, [gap / 2, yy, 0], j * .05, .8)], INK.idle, .8, opacity, [{ text: k, opacity }])}
        <RoutedTube id={`${id}/link/${k}`} path={[[-gap / 2 + width / 2, yy, 0], [gap / 2 - width / 2, yy, 0]]} thickness={.03} color={INK.blue} emissive={3.5}
          draw={[{ step: 0, value: 0 }, key(windowed, 1, 1 + j * .07, .4)]} />
      </Fragment>;
    })}
    {frame(`${id}/window`, [gap / 2, 0, 0], [{ step: 0, value: 0 }, key(windowed, 1, .35, .8)], windowLabel)}
  </Stage>;
  return <Stage id={id} position={at}>
    <Stage id={`${id}/column`} position={(windowed === undefined ? [0, 0, 0] : [{ step: 0, value: [0, 0, 0] }, key(windowed, [-gap / 2, 0, 0], 0, .8),
      ...recycle === undefined ? [] : [key(recycle, [0, 0, 0], 0, .8)]]) as V3}>
      {frame(`${id}/viewport`, [0, 0, 0], 1, viewLabel)}
      <Stage id={`${id}/keys`} position={(scroll === undefined ? [0, 0, 0] : [{ step: 0, value: [0, 0, 0] }, key(scroll, [0, row, 0], 0, .9)]) as V3}>{rows}</Stage>
    </Stage>
    {copies}
  </Stage>;
}
/** Labelled cells that flash together `rate` times a second from `flash.step`, while a resize handle drags the frame. */
function grid(id: string, at: V3, props: Record<string, unknown>, INK: Ink) {
  const count = Number(props.count ?? 36), columns = Number(props.columns ?? 6), [cw, ch] = (props.cell ?? [1.2, .7]) as [number, number], label = String(props.label ?? "");
  const tall = props.resize === "height", top = tall && props.anchor !== "center", grow = tall ? Number(props.grow ?? 0) : 0;
  const rows = Math.ceil(count / columns), total = rows + grow, px = cw + .18, py = ch + .18, width = columns * px, height = rows * py;
  const flash = props.flash as { step: number; rate?: number; duration?: number; delay?: number; color?: string; repeat?: "infinite" } | undefined, hot = flash?.color ?? INK.amber;
  const start = flash?.delay ?? 0, length = flash?.repeat === "infinite" ? 1 / (flash.rate ?? 8) : flash?.duration ?? 10, beats = flash ? Array.from({ length: Math.round(length * (flash.rate ?? 8)) }, (_, k) => start + k / (flash.rate ?? 8)) : [];
  const emission = flash ? [{ step: 0, value: flash.repeat === "infinite" ? 1 : .7 }, ...beats.flatMap(t => [key(flash.step, 5, t, .02), key(flash.step, 1, t + .04, .06)])] : [];
  const emissive = flash?.repeat === "infinite" ? loopTrack(emission, flash.step, length, start) : flash ? emission : .7;
  const color = flash ? [{ step: 0, value: INK.idle }, key(flash.step, hot, start, .2)] : INK.idle;
  // Growing windows drag slower and hold at each end so the revealed rows read.
  const move = grow ? 1.2 : .7, beat = move + (grow ? .5 : 0), reach = grow ? grow * py : .9;
  const drag = flash ? Array.from({ length: flash.repeat === "infinite" ? 2 : Math.ceil(length / beat) }, (_, k) => ({ at: start + k * beat, pull: k % 2 ? 0 : reach })) : [];
  const mac = props.chrome === "mac", bar = mac ? .42 : 0, w = width + .5, h = height + .5;
  const frame = (pull: number) => {
    const [x, y] = tall ? [0, pull] : [pull, 0], offset = top ? y / 2 : 0;
    return { position: [x / 2, bar / 2 - offset, -.2] as V3, scale: [w + x, h + bar + y, .05] as V3, handle: [width / 2 + .3 + x, -(height + y) / 2 - .3 - offset, .1] as V3,
      bar: [x / 2, (h + bar + y) / 2 - offset, -.17] as V3, barScale: [w + x, bar, .04] as V3 };
  };
  const loop = <T,>(frames: Keyframe<T>[]) => flash?.repeat === "infinite" ? loopTrack(frames, flash.step, 2 * beat, start) : frames;
  const track = (pick: (f: ReturnType<typeof frame>) => V3) => flash ? loop([{ step: 0, value: pick(frame(0)) }, ...drag.map(d => key(flash.step, pick(frame(d.pull)), d.at, move, "smoothstep"))]) : pick(frame(0));
  // A row beyond the starting window appears once the dragged frame clears it and leaves as it closes back over it.
  const reveal = (y: number) => {
    const open = top ? (-y + ch / 2 - .25 - height / 2) / reach : (2 * Math.abs(y) + ch - .5 - height) / reach;
    if (open <= 0) return undefined;
    const s = .5 - Math.sin(Math.asin(1 - 2 * Math.min(open, 1)) / 3);
    return flash ? loop([{ step: 0, value: 0 }, ...drag.map(d => d.pull ? key(flash.step, 1, d.at + s * move, .12) : key(flash.step, 0, d.at + (1 - s) * move, .12))]) : 0;
  };
  return <Stage id={id} position={at}>
    <Card id={`${id}/frame`} position={track(f => f.position)} scale={track(f => f.scale)} fill={Number(props.fill ?? .15)} edge={props.border as number | undefined} color={INK.idle} emissive={.5} />
    {mac && <>
      <Card id={`${id}/bar`} flat fill={1} edge={0} glow={0} position={track(f => f.bar)} scale={track(f => f.barScale)} color="#2b2e35" />
      {["#ff5f57", "#febc2e", "#28c840"].map((dot, k) => <Card key={dot} id={`${id}/dot${k}`} flat fill={1} edge={0} glow={0} radius={.075}
        position={track(f => [-w / 2 + .3 + k * .24, f.bar[1], -.14])} scale={[.15, .15, .02]} color={dot} />)}
    </>}
    <Box id={`${id}/handle`} size={.5} position={track(f => f.handle)} scale={[.3,.3,.3]} color={hot} emissive={flash ? [{ step: 0, value: 0 }, key(flash.step, 3, start, .3)] : 0} />
    {Array.from({ length: count + grow * columns }, (_, i) => { const x = (i % columns - (columns - 1) / 2) * px, y = -(Math.floor(i / columns) - ((top ? rows : total) - 1) / 2) * py, opacity = reveal(y); return <Fragment key={i}>
      <Card id={`${id}/${i}`} position={[x, y, 0]} scale={[cw, ch, .2]} color={color} emissive={emissive} opacity={opacity} />
      {label && <Text3D id={`${id}/${i}/label`} text={label} mono size={.16 * TYPE} position={[x, y, .12]} color={INK.white} emissive={.8} opacity={opacity} />}
    </Fragment>; })}
  </Stage>;
}
type FormNode = { title: string; renders?: boolean };
type FormField = { value: string; bind?: string; big?: boolean };
/** Panels of fields with render-count badges. `typing` types `text` into the fields bound to `bind`, one keystroke every `interval` seconds; each keystroke flashes those fields and ticks their badges. */
function form(id: string, at: V3, props: Record<string, unknown>, INK: Ink) {
  const parent = props.parent as FormNode | undefined;
  const panels = props.panels as (FormNode & { fields: FormField[] })[], typing = props.typing as { step: number; bind: string; text: string; delay?: number; interval?: number; repeat?: "infinite" } | undefined;
  const fw = Number(props.fieldWidth ?? 5.4), fh = 1, gap = .45, pw = fw + 1, spread = pw + 1.3, times: number[] = [];
  let versions: string[] = [];
  if (typing) {
    const base = panels.flatMap(p => p.fields).find(f => f.bind === typing.bind)?.value ?? "";
    if (!typing.text.startsWith(base)) throw Error(`Form typing must extend the bound value: ${typing.bind}`);
    versions = Array.from({ length: typing.text.length - base.length + 1 }, (_, k) => typing.text.slice(0, base.length + k));
    for (let k = 1; k < versions.length; k++) times.push((typing.delay ?? .6) + (k - 1) * (typing.interval ?? .45));
  }
  const period = (times.at(-1) ?? 0) + 1.5;
  const repeat = (frames: Keyframe<number>[]) => typing?.repeat === "infinite" ? loopTrack(frames, typing.step, period) : frames;
  const swap = (k: number) => typing ? repeat([{ step: 0, value: k ? 0 : 1 }, ...k ? [key(typing.step, 1, times[k - 1], 0)] : [], ...k < times.length ? [key(typing.step, 0, times[k], 0)] : [], ...typing.repeat === "infinite" ? [key(typing.step, k ? 0 : 1, period - .1, 0)] : []]) : 1;
  const flashes = (rest: number) => typing && times.length ? repeat([{ step: 0, value: typing.repeat === "infinite" ? 1.8 : rest }, ...times.flatMap(t => [key(typing.step, 7, t, .05), key(typing.step, 1.8, t + .08, .5)])]) : rest;
  const lit = typing && times.length ? [{ step: 0, value: INK.idle }, key(typing.step, INK.amber, times[0], .1)] : INK.idle;
  const badge = (stage: string, position: V3, bound: boolean) => <Stage key={stage} id={stage} position={position}>
    <Card id={`${stage}/disc`} scale={[.66,.66,.2]} radius={.33} color={bound ? lit : INK.idle} emissive={bound ? flashes(.9) : .9} />
    {(bound ? versions : [""]).map((_, k) => <Text3D key={k} id={`${stage}/n${k}`} text={String(k + 1)} mono size={.26 * TYPE} position={[0, 0, .13]} color={INK.white} opacity={bound ? swap(k) : 1} />)}
  </Stage>;
  return <Stage id={id} position={at}>
    {parent && <Stage id={`${id}/parent`} position={[0, 2, 0]}>
      <Card id={`${id}/parent/card`} scale={[3.6, 1, .2]} fill={.55} color={INK.idle} emissive={.6} />
      <Text3D id={`${id}/parent/title`} text={parent.title} mono size={.24 * TYPE} position={[-.4, 0, .15]} color={INK.white} />
      {badge(`${id}/parent/badge`, [1.2, 0, .15], !!parent.renders && !!typing)}
    </Stage>}
    {panels.map((panel, p) => {
      const stage = `${id}/${p}`, ph = .9 + panel.fields.length * (fh + gap) + .2;
      const x = (p - (panels.length - 1) / 2) * spread;
      return <Fragment key={p}>
        {parent && <RoutedTube id={`${id}/parent/link/${p}`} path={[[0, 1.5, -.1], [x, .65, -.1]]} thickness={.025} color={INK.idle} emissive={.8} />}
        <Stage id={stage} position={[x, 0, 0]}>
          <Card id={`${stage}/card`} position={[0, -ph / 2 + .6, -.2]} scale={[pw, ph, .2]} fill={.55} color={INK.idle} emissive={.6} />
          <Text3D id={`${stage}/title`} text={panel.title.toUpperCase()} mono size={.17 * TYPE} align="left" tracking={.1} position={[-pw / 2 + .4, .22, .05]} color={INK.muted} emissive={.8} />
          {badge(`${stage}/badge`, [pw / 2 - .65, .22, .05], !!panel.renders && !!typing)}
          {panel.fields.map((field, f) => { const y = -.55 - f * (fh + gap), bound = !!typing && field.bind === typing.bind, cell = `${stage}/${f}`;
            return <Fragment key={f}>
              <Card id={cell} position={[0, y, 0]} scale={[fw, fh, .3]} color={bound ? lit : INK.idle} emissive={bound ? flashes(.8) : .8} />
              {(bound ? versions : [field.value]).map((value, k) => <Text3D key={k} id={`${cell}/v${k}`} text={value} mono size={(field.big ? .34 : .26) * TYPE} align="left"
                position={[-fw / 2 + .35, y, .18]} color={INK.white} opacity={bound ? swap(k) : 1} />)}
              {badge(`${cell}/badge`, [fw / 2 - .55, y, .2], bound)}
            </Fragment>; })}
        </Stage>
    </Fragment>; })}</Stage>;
}
function lineTokens(tokens: CodeToken[] | undefined, offset: number, length: number) {
  return tokens?.filter(token => token.offset < offset + length && token.offset + token.content.length > offset).map(token => {
    const start = Math.max(offset, token.offset), end = Math.min(offset + length, token.offset + token.content.length);
    return { ...token, offset: start - offset, content: token.content.slice(start - token.offset, end - token.offset) };
  });
}
type DiffLine = [" " | "-" | "+", string, CodeToken[] | undefined];
function codeDiffs(children: ReactNode) {
  return Children.toArray(children).filter(child => codeSource(child).trim()).map(child => {
    const tokens = codeHighlight(child)?.tokens;
    let offset = 0;
    return codeSource(child).replace(/\n$/, "").split("\n").map(line => {
      const result = [line[0] ?? " ", line.slice(1), lineTokens(tokens, offset + 1, line.length - 1)] as DiffLine;
      offset += line.length + 1;
      return result;
    });
  });
}
/** Each diff starts from the previous result. Matching tokens retain their identity and only removed lines are struck through. */
function codeMorph(id: string, at: V3, props: Record<string, unknown>, diffs: DiffLine[][], INK: Ink, compactLineHeight?: number) {
  if (diffs.some(diff => diff.some(([mark]) => !" -+".includes(mark)))) throw Error(`Code morph ${id}: diff lines start with a space, - or +.`);
  const size = Number(props.size ?? .13), lineHeight = Number(props.lineHeight ?? .27), first = Number(props.step ?? 1), em = size * TYPE, advance = em * MONO, settle = .25;
  const rowHeight = (s: number) => s ? compactLineHeight ?? lineHeight : lineHeight;
  const parts: { text: string; identity: string; tokens?: CodeToken[]; positions: (V3 | undefined)[] }[] = [];
  const lines: { text: string; parts: { id: number; column: number }[]; rows: (number | undefined)[]; removed?: number }[] = [];
  const newLine = (text: string, tokens?: CodeToken[]) => lines.push({ text, rows: [], parts: [...text.matchAll(/[\w$]+|[^\s\w$]/gu)].map(match => {
    const syntax = lineTokens(tokens, match.index!, match[0].length);
    return { column: match.index!, id: parts.push({ text: match[0], tokens: syntax,
      identity: JSON.stringify([match[0], syntax?.map(token => [token.content, token.color])]), positions: [] }) - 1 };
  }) }) - 1;
  let state = diffs[0].filter(([mark]) => mark !== "+").map(([, text, tokens]) => newLine(text, tokens));
  const states = [state], bands: { step: number; before: number[]; after: number[] }[] = [];
  diffs.forEach((diff, t) => {
    const before = diff.filter(([mark]) => mark !== "+");
    if (before.length !== state.length || before.some(([, text], i) => lines[state[i]].text !== text)) throw Error(`Code morph ${id}: diff ${t} must start from the previous code.`);
    let i = 0, removed: number[] = [], added: number[] = [];
    const next: number[] = [], changed = { step: first + t, before: [] as number[], after: [] as number[] };
    const match = () => {
      const old = removed.flatMap(n => lines[n].parts), fresh = added.flatMap(n => lines[n].parts);
      const lengths = Array.from({ length: old.length + 1 }, () => new Uint32Array(fresh.length + 1));
      for (let a = old.length - 1; a >= 0; a--) for (let b = fresh.length - 1; b >= 0; b--)
        lengths[a][b] = parts[old[a].id].identity === parts[fresh[b].id].identity ? 1 + lengths[a + 1][b + 1] : Math.max(lengths[a + 1][b], lengths[a][b + 1]);
      const carried = new Set<number>();
      let a = 0, b = 0;
      while (a < old.length && b < fresh.length) {
        if (parts[old[a].id].identity === parts[fresh[b].id].identity) {
          carried.add(old[a].id); fresh[b].id = old[a].id; a++; b++;
        } else if (lengths[a + 1][b] >= lengths[a][b + 1]) a++;
        else b++;
      }
      const unmatched = removed.filter(n => !lines[n].parts.some(part => carried.has(part.id) && /\w/.test(parts[part.id].text)));
      const replacements = Math.max(0, added.length - (removed.length - unmatched.length));
      for (const n of unmatched.slice(replacements)) lines[n].removed = first + t;
      removed = []; added = [];
    };
    for (const [mark, text, tokens] of diff) {
      if (mark === "+") { changed.after.push(next.length); const line = newLine(text, tokens); next.push(line); added.push(line); }
      else {
        if (mark === " ") { match(); next.push(state[i]); }
        else { changed.before.push(i); removed.push(state[i]); }
        i++;
      }
    }
    match(); bands.push(changed); states.push(state = next);
  });
  states.forEach((rows, s) => rows.forEach((line, row) => {
    lines[line].rows[s] = row;
    lines[line].parts.forEach(part => { parts[part.id].positions[s] = [part.column * advance, -row * rowHeight(s), 0]; });
  }));
  const widths = states.map(rows => Math.max(0, ...rows.map(n => lines[n].text.length)) * advance + .9);
  const width = Math.max(...widths), height = (s: number) => (states[s].length - 1) * rowHeight(s) + em + .6;
  const panel = (s: number) => ({ position: [widths[s] / 2 - .3, -(height(s) - em - .6) / 2, -.14] as V3, scale: [widths[s], height(s), .06] as V3 });
  const panelTrack = (pick: (p: ReturnType<typeof panel>) => V3) => [{ step: 0, value: pick(panel(0)) }, ...states.slice(1).map((_, t) => key(first + t, pick(panel(t + 1)), settle, .5))];
  const highlight = props.highlight as { opacity?: number; word?: { opacity?: number } } | undefined;
  const highlightOpacity = highlight?.opacity ?? 1, wordOpacity = highlight?.word?.opacity ?? highlightOpacity;
  // On a changed line that keeps some tokens, each run of new tokens gets its own band over the line band.
  const words = bands.flatMap((band, t) => band.after.flatMap(row => {
    const line = lines[states[t + 1][row]], fresh = line.parts.map(part => parts[part.id].positions[t] === undefined);
    if (fresh.every(Boolean)) return [];
    const runs: { row: number; from: number; to: number }[] = [];
    line.parts.forEach((part, k) => {
      const end = part.column + parts[part.id].text.length;
      if (!fresh[k]) return;
      if (fresh[k - 1]) runs[runs.length - 1].to = end; else runs.push({ row, from: part.column, to: end });
    });
    return runs.map(run => ({ ...run, t, step: band.step }));
  }));
  return <Stage id={id} position={anchored(at, props.anchor, width, Math.max(...states.map((_, s) => height(s))))}>
    <Card id={`${id}/card`} position={panelTrack(p => p.position)} scale={panelTrack(p => p.scale)} {...panelStyle(props)} color={INK.colors.panel} />
    {bands.flatMap((band, t) => [band.before, band.after].flatMap((rows, side) => rows.map(row => <Card {...HIGHLIGHT} key={`${t}/${side}/${row}`} id={`${id}/band${t}/${side}/${row}`}
      position={[widths[t + side] / 2 - .3, -row * rowHeight(t + side), -.07]} scale={[widths[t + side] - .2, rowHeight(t + side), .02]}
      opacity={[{ step: 0, value: t === 0 && side === 0 ? highlightOpacity : 0 }, key(band.step, side ? highlightOpacity : 0, side ? settle : 0, .3),
        key(band.step + 1, 0, 0, 0)]} />)))}
    {words.map(({ row, from, to, t, step }) => <Card {...HIGHLIGHT} key={`${t}/${row}/${from}`} id={`${id}/word${t}/${row}/${from}`}
      position={[(from + to) / 2 * advance, -row * rowHeight(t + 1), -.06]} scale={[(to - from) * advance + .08, rowHeight(t + 1) * .84, .02]}
      opacity={[{ step: 0, value: 0 }, key(step, wordOpacity, settle, .3), key(step + 1, 0, 0, 0)]} />)}
    {((props.marks ?? []) as CodeMark[]).flatMap((mark, m) => {
      const shownAt = Math.min(states.length - 1, Math.max(0, (mark.step ?? 0) - first + 1)), scale: V3 = [mark.text.length * advance + .12, lineHeight * .9, .02];
      return states[shownAt].flatMap((line, row) => [...lines[line].text.matchAll(new RegExp(mark.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))].map(found =>
        <Card {...HIGHLIGHT} opacity={mark.opacity ?? 1} key={`${m}/${row}/${found.index}`} id={`${id}/mark${m}/${row}/${found.index}`}
          position={[(found.index! + mark.text.length / 2) * advance, -row * lineHeight, -.08]} scale={mark.step ? [{ step: 0, value: [0,0,0] }, key(mark.step, scale, mark.delay ?? 0, .35), key(mark.step + 1, [0,0,0] as V3, 0, 0)] : scale} />));
    })}
    {parts.map((part, n) => {
      const shown = part.positions.flatMap((position, s) => position === undefined ? [] : [s]);
      if (!shown.length) return null;
      const enter = shown[0], exit = shown[shown.length - 1] + 1;
      const addedAt = enter > 0 ? first + enter - 1 : undefined, removedAt = exit < states.length ? first + exit - 1 : undefined;
      const visibility = addedAt === undefined && removedAt === undefined ? 1 : [{ step: 0, value: enter ? 0 : 1 }, ...addedAt === undefined ? [] : [key(addedAt, 1, settle, .25)], ...removedAt === undefined ? [] : [key(removedAt, 0, 0, .25)]];
      return <Text3D key={n} id={`${id}/token${n}`} text={part.text} tokens={part.tokens} mono flat={props.flat !== false} size={em} align="left"
        opacity={visibility} glyphs={addedAt === undefined ? undefined : () => ({ scale: [{ step: 0, value: .8 }, key(addedAt, 1, settle, .5)] })} position={shown.every(s => part.positions[s]!.every((v, axis) => v === part.positions[enter]![axis])) ? part.positions[enter]! :
          [{ step: 0, value: part.positions[enter]! }, ...shown.slice(1).filter(s => part.positions[s]!.some((v, axis) => v !== part.positions[s - 1]![axis]))
            .map(s => key(first + s - 1, part.positions[s]!, settle, .5))]} />;
    })}
    {lines.map((line, n) => {
      if (line.removed === undefined || !line.text.trim()) return null;
      const row = line.rows[line.rows.length - 1]!, indent = line.text.length - line.text.trimStart().length;
      const strike = (line.text.trimEnd().length - indent) * advance + .1, x = indent * advance;
      return <Box key={n} id={`${id}/${n}/strike`} size={.5} color={HIGHLIGHT.color}
        position={[{ step: 0, value: [x, -row * lineHeight, .1] }, key(line.removed, [x + strike / 2, -row * lineHeight, .1], 0, .25)]}
        scale={[{ step: 0, value: [0, .025, .025] }, key(line.removed, [strike, .025, .025], 0, .2), key(line.removed, [strike, 0, 0], .25, .15)]} />;
    })}
  </Stage>;
}
/** Code that highlights where state is created (`source`), passed (`pass`) and read (`reads`) on `mark`, collapses everything else on `collapse`,
 * and lifts the source and read lines into a tree of `nodes` labels on `extract`. */
function codeTrace(id: string, at: V3, props: Record<string, unknown>, children: ReactNode, INK: Ink) {
  const fences = Children.toArray(children).filter(child => codeSource(child).trim());
  const source = codeSource(fences[0]), tokens = codeHighlight(fences[0])?.tokens;
  const lines = source.replace(/\n$/, "").split("\n"), size = Number(props.size ?? .13), lineHeight = Number(props.lineHeight ?? .27), em = size * TYPE, advance = em * MONO;
  const origin = Number(props.source), reads = props.reads as number[], pass = (props.pass ?? []) as number[], labels = props.nodes as string[];
  const mark = Number(props.mark ?? 1), collapse = Number(props.collapse ?? 2), extract = Number(props.extract ?? 3);
  const hot = [origin, ...reads].sort((a, b) => a - b), gap = lineHeight * 1.8;
  const width = Math.max(...lines.map(l => l.length)) * advance + .9, full = (lines.length - 1) * lineHeight + em + .6, short = (hot.length - 1) * gap + em + .6;
  const bandOpacity = (props.highlight as { opacity?: number } | undefined)?.opacity ?? 1;
  const tx = width + 3.2, node = (k: number): V3 => k === 0 ? [tx, -.4, 0] : [tx + (k - (reads.length + 1) / 2) * 3.6, -3.2, 0];
  const show = [{ step: 0, value: 0 }, key(extract, 1, 1.25, .35)];
  const centered: V3 = [at[0] - width / 2 + .3, at[1] + (full - em - .6) / 2, at[2]];
  const position = props.anchor === "center" ? [{ step: 0, value: centered }, key(extract, [at[0] - tx, at[1] + (labels.length > 1 ? 1.8 : .4), at[2]] as V3, .55, .9)] : at;
  let morph: ReactNode;
  if (fences.length > 1) {
    if (fences.length !== 2) throw Error(`Code trace ${id}: use one source fence and one compact target fence.`);
    const target = codeSource(fences[1]).replace(/\n$/, "").split("\n"), targetTokens = codeHighlight(fences[1])?.tokens;
    if (target.length !== hot.length) throw Error(`Code trace ${id}: compact target needs one line per source/read.`);
    const diff = (rows: string[], syntax: CodeToken[] | undefined, mark: "-" | "+"): DiffLine[] => {
      let offset = 0;
      return rows.map(text => { const line: DiffLine = [mark, text, lineTokens(syntax, offset, text.length)]; offset += text.length + 1; return line; });
    };
    const tree = codeMorph(id, [0,0,0], { ...props, anchor: undefined, step: collapse, highlight: { opacity: 0, word: { opacity: bandOpacity } } },
      [[...diff(lines, tokens, "-"), ...diff(target, targetTokens, "+")]], INK, gap);
    morph = React.Children.map(tree.props.children, child => {
      if (!isValidElement<Record<string, unknown>>(child)) return child;
      if (child.props.id === `${id}/card`) return React.cloneElement(child, { opacity: [{ step: 0, value: 1 }, key(extract, 0, .9, .4)] });
      if (child.type === Box) return null;
      if (child.type !== Text3D) return child;
      const opacity = compileTrack(child.props.opacity as Animated<number>);
      if ((opacity.frames.at(-1)?.value ?? opacity.initial) === 0) return child;
      const track = compileTrack(child.props.position as Animated<V3>), end = track.frames.at(-1)?.value ?? track.initial;
      const row = Math.round(-end[1] / gap), n = hot[row], destination = node(n === origin ? 0 : 1 + reads.indexOf(n));
      const middle = (target[row].length - target[row].trimStart().length + target[row].trimEnd().length) * advance / 2;
      return React.cloneElement(child, {
        position: [{ step: 0, value: track.initial }, ...track.frames, key(extract, [end[0], end[1], 1.4] as V3, 0, .45),
          key(extract, [destination[0] - middle + end[0], destination[1], 1.4] as V3, .55, .9)],
        opacity: [{ step: 0, value: opacity.initial }, ...opacity.frames, key(extract, 0, 1.25, .35)],
      });
    });
  }
  return <Stage id={id} position={position}>
    {morph && lines.map((_, n) => (hot.includes(n) || pass.includes(n)) && <Card key={`mark${n}`} id={`${id}/${n}/glow`} {...HIGHLIGHT}
      position={[width / 2 - .3, -n * lineHeight, -.07]} scale={[width - .2, lineHeight, .02]}
      opacity={[{ step: 0, value: 0 }, key(mark, bandOpacity, 0, .4), key(collapse, 0, 0, .3)]} />)}
    {morph ?? <>
    <Card id={`${id}/card`} {...panelStyle(props)} color={INK.colors.panel} opacity={[{ step: 0, value: 1 }, key(extract, 0, .9, .4)]}
      position={[{ step: 0, value: [width / 2 - .3, -(full - em - .6) / 2, -.14] }, key(collapse, [width / 2 - .3, -(short - em - .6) / 2, -.14], .45, .5)]}
      scale={[{ step: 0, value: [width, full, .06] }, key(collapse, [width, short, .06], .45, .5)]} />
    {lines.map((text, n) => {
      const kept = hot.indexOf(n), y0 = -n * lineHeight, y1 = -kept * gap;
      const syntax = lineTokens(tokens, lines.slice(0, n).reduce((sum, line) => sum + line.length + 1, 0), text.length);
      const band = kept >= 0 || pass.includes(n) ? <Card id={`${id}/${n}/glow`} {...HIGHLIGHT}
        position={[{ step: 0, value: [width / 2 - .3, y0, -.07] }, key(collapse, [width / 2 - .3, kept < 0 ? y0 : y1, -.07], .45, .5)]}
        scale={[width - .2, lineHeight, .02]}
        opacity={[{ step: 0, value: 0 }, key(mark, bandOpacity, 0, .4), key(kept < 0 ? collapse : extract, 0, 0, .3)]} /> : null;
      if (kept < 0) return <Fragment key={n}>{band}<Text3D id={`${id}/${n}`} text={text} tokens={syntax} mono flat={props.flat !== false} size={em} align="left" position={[0, y0, 0]}
        glyphs={() => ({ scale: [{ step: 0, value: 1 }, key(collapse, 0, .05 + n * .015, .35)], opacity: [{ step: 0, value: 1 }, key(collapse, 0, .1 + n * .015, .3)] })} /></Fragment>;
      const indent = (text.length - text.trimStart().length) * advance, end = text.trimEnd().length * advance, middle = (indent + end) / 2;
      const target = node(n === origin ? 0 : 1 + reads.indexOf(n));
      return <Fragment key={n}>
        <Text3D id={`${id}/${n}`} text={text} tokens={syntax} mono flat={props.flat !== false} size={em} align="left" glyphs={() => ({ opacity: [{ step: 0, value: 1 }, key(extract, 0, 1.25, .35)] })}
          position={[{ step: 0, value: [0, y0, 0] }, key(collapse, [0, y1, 0], .45, .5), key(extract, [0, y1, 1.4], 0, .45), key(extract, [target[0] - middle, target[1], 1.4], .55, .9)]} />
        {band}
      </Fragment>;
    })}
    </>}
    {labels.map((label, k) => { const p = node(k), root = node(0), mid = (root[1] + p[1]) / 2; return <Fragment key={`node${k}`}>
      <Card id={`${id}/node${k}`} position={p} scale={[3.3, .85, .4]} color={k ? INK.blue : INK.amber} opacity={show}
        emissive={[{ step: 0, value: 0 }, key(extract, 7, 1.25, .1), key(extract, 1.8, 1.4, .6)]} />
      <Text3D id={`${id}/node${k}/label`} text={label} mono size={.2 * TYPE} position={[p[0], p[1], .25]} opacity={show} />
      {k > 0 && <RoutedTube id={`${id}/edge${k}`} thickness={.035} color={INK.amber} emissive={3} path={[[root[0], root[1] - .45, 0], [root[0], mid, 0], [p[0], mid, 0], [p[0], p[1] + .45, 0]]}
        draw={[{ step: 0, value: 0 }, key(extract, 1, 1.6, .5)]} pulses={[{ step: extract, delay: 2.2, every: 1.1, duration: .5, color: INK.amber, size: .11, emissive: 10 }]} />}
    </Fragment>; })}
  </Stage>;
}
/** Words floating at depth. Each step brings its `focus` words to the front, sharp and glowing, while earlier ones recede; `zoom` also defocuses everything else. */
function cloud(id: string, at: V3, props: Record<string, unknown>, INK: Ink) {
  const words = props.words as string[], focus = (props.focus as (string | string[])[]).map(f => typeof f === "string" ? [f] : f), zoom = props.zoom as number | undefined;
  const size = Number(props.size ?? .42) * TYPE, steps = focus.map((_, s) => s);
  const home = (i: number): V3 => [(i % 4 - 1.5) * 3.8 + (hash(i * 3 + 1) - .5) * 1.4, 1.6 + Math.floor(i / 4) % 3 * 1.9 + hash(i * 5 + 2) * .7, -4 - hash(i * 7 + 3) * 10];
  const front = (k: number, n: number): V3 => {
    const columns = n <= 3 ? n : 3, rows = Math.ceil(n / columns), c = k % columns, r = Math.floor(k / columns), across = Math.min(columns, n - r * columns);
    return [(c - (across - 1) / 2) * (n <= 3 ? 4.6 : 5), (n <= 3 ? 3.8 : 3.8 + (rows - 1) * .7) - r * 1.4, n <= 3 ? 2 : -2];
  };
  const pose = (i: number, s: number) => {
    const word = words[i], current = focus[s].indexOf(word), seen = focus.slice(0, s).some(f => f.includes(word));
    if (current >= 0) { const p = front(current, focus[s].length); return { p: s === zoom ? [p[0] * .85, p[1], p[2]] as V3 : p, color: "#ffffff", glow: 1 }; }
    const h = home(i);
    if (seen) return { p: [h[0] * .9, h[1], -2 - hash(i) * 1.5] as V3, color: "#a8aeb8", glow: s === zoom ? .08 : .9 };
    return { p: h, color: INK.muted, glow: s === zoom ? .05 : .3 };
  };
  const anchor = (s: number): V3 => focus[s].length ? pose(words.indexOf(focus[s][0]), s).p : [0, 3.5, -6];
  return <Stage id={id} position={at}>
    <Stage id={`${id}/focus`} position={[{ step: 0, value: anchor(0) }, ...steps.slice(1).map(s => key(s, anchor(s), 0, 1, "cubic"))]} />
    {words.map((word, i) => <Stage key={word} id={`${id}/${word}`} sharp={steps.map(s => ({ step: s, value: focus[s].includes(word), duration: 0 }))} position={[{ step: 0, value: pose(i, 0).p }, ...steps.slice(1).map(s => key(s, pose(i, s).p, .05 * (i % 4), 1.1, "cubic"))]}>
      <Text3D id={`${id}/${word}/text`} text={word} mono size={size} color={[{ step: 0, value: pose(i, 0).color }, ...steps.slice(1).map(s => key(s, pose(i, s).color, .2, .6))]}
        emissive={[{ step: 0, value: pose(i, 0).glow }, ...steps.slice(1).map(s => key(s, pose(i, s).glow, .3, .7))]} />
    </Stage>)}
    <DOF focus={`stage:${id}/focus`} focusRange={zoom === undefined ? .9 : [{ step: 0, value: .9 }, key(zoom, .5, 0, .8), key(zoom + 1, .9, 0, .8)]}
      aperture={zoom === undefined ? 3 : [{ step: 0, value: 3 }, key(zoom, 6, 0, .8), key(zoom + 1, 3, 0, .8)]} maxBlur={22} />
  </Stage>;
}
/** Stop k's offset: `gap` deeper per stop, zigzagging up to `drift` sideways and half that up or down, unless `path[k]` sets it. */
export function flightStops(props: Record<string, unknown>): V3[] {
  const path = props.path as V3[] | undefined, gap = Number(props.gap ?? 10), drift = Number(props.drift ?? 2.4);
  return (props.words as unknown[]).map((_, k) => path?.[k] ?? [(k % 2 ? -1 : 1) * drift * (.5 + .5 * hash(k * 3 + 1)), drift * (hash(k * 5 + 2) - .5), -gap * (k + 1)]);
}
/** Words at stops down into depth, one stop (a word or a row of words) per step from `step`; the scene camera flies to each, over `duration` with `ease`.
 * The next `ahead` stops wait dimmed in the distance, passed ones fade out, and steps after the last stop bring them all back. */
function flight(id: string, at: V3, props: Record<string, unknown>, INK: Ink) {
  const stops = (props.words as (string | string[])[]).map(w => typeof w === "string" ? [w] : w), offsets = flightStops(props), first = Number(props.step ?? 1);
  const size = Number(props.size ?? .5) * TYPE, ahead = Number(props.ahead ?? 2), duration = Number(props.duration ?? .8), passed = "#a8aeb8";
  const look = (k: number, s: number) => {
    const c = s - first;
    if (c === k) return { color: INK.white, glow: 1, opacity: 1 };
    if (c >= stops.length) return { color: passed, glow: .5, opacity: 1 };
    if (k < c) return { color: passed, glow: .3, opacity: 0 };
    return { color: INK.muted, glow: .25, opacity: k - c <= ahead ? 1 : 0 };
  };
  const track = <T,>(k: number, pick: (l: ReturnType<typeof look>) => T) =>
    [{ step: 0, value: pick(look(k, 0)) }, ...Array.from({ length: first + stops.length }, (_, s) => key(s + 1, pick(look(k, s + 1)), 0, duration * .6))];
  return <Stage id={id} position={at}>{stops.map((words, k) => {
    const widths = words.map(w => w.length * MONO * size), gap = size * 1.5, total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
    return <Stage key={k} id={`${id}/${k}`} sharp={Array.from({ length: first + stops.length + 1 }, (_, s) => ({ step: s, value: Math.min(s - first, stops.length - 1) === k, duration: 0 }))} position={offsets[k]}>{words.map((word, j) => {
      const x = -total / 2 + widths.slice(0, j).reduce((a, b) => a + b, 0) + gap * j + widths[j] / 2;
      return <Text3D key={word} id={`${id}/${k}/${word}`} text={word} mono size={size} position={[x, 0, 0]}
        color={track(k, l => l.color)} emissive={track(k, l => l.glow)} opacity={track(k, l => l.opacity)} />;
    })}</Stage>;
  })}</Stage>;
}
/** `count` translucent layers nested around `value`, each wider and nearer than the last, one more on each step from `step`, over a `meter` that fills
 * to the given fraction on each step. Layer k takes `colors[k]`. Landed layers keep moving: `bob`, `orbit` and `pulse` take an amplitude or
 * `[amplitude, period]`, and each layer trails the one inside it by `lag` seconds. With `words`, the part's code line is shown at `size` instead,
 * and layer k is a box around `words[k]`, which then moves with its box. */
function layers(id: string, at: V3, props: Record<string, unknown>, INK: Ink, source: string, tokens?: CodeToken[]) {
  const words = props.words as string[] | undefined;
  if (words) return proxyLine(id, at, props, INK, source.replace(/\n$/, ""), words, tokens);
  const count = Number(props.count ?? 4), first = Number(props.step ?? 0), label = String(props.label ?? ""), meter = (props.meter ?? []) as number[], length = 9;
  const { color, bob, orbit, pulse, lag } = layerStyle(props, INK), value = props.value as string | undefined, caption = props.caption as string | undefined;
  const layer = (k: number): V3 => [0, 0, k * .5], size = (k: number): V3 => [2.3 + .65 * k, 2.6 + .55 * k, .08];
  const shown = (k: number) => [{ step: 0, value: 0 }, key(first + k, 1, 0, .3)];
  const floor = -size(count - 1)[1] / 2 - .45;
  return <Stage id={id} position={at}>
    {Array.from({ length: count }, (_, k) => {
      const [w, h] = size(k), corner: V3 = [-w / 2, h / 2, layer(k)[2]];
      return <Fragment key={k}>
        <Stage id={`${id}/${k}/arrival`} position={[{ step: 0, value: add(layer(k), [0, .5, 7]) }, key(first + k, layer(k), 0, .8, "spring")]}
          glow={[{ step: 0, value: 1 }, key(first + k, 3, land, .08), key(first + k, 1, land + .1, .8)]}>
          <Stage id={`${id}/${k}/wave`} wave={{ bob, orbit, pulse, lag: (k + 1) * lag }}>
            <Card id={`${id}/${k}`} scale={size(k)} fill={.12} edge={1.2} glow={.32} color={color(k)} emissive={1.4 - k * .12} opacity={shown(k)} />
            {label && <Text3D id={`${id}/${k}/label`} text={label} mono size={.2 * TYPE} align="left" position={[-w / 2 + .18, h / 2 - .3, .08]} color={color(k)} emissive={1.4} opacity={shown(k)} />}
          </Stage>
        </Stage>
        {landing(id, k, first, corner, [w, -h, 0], color(k))}
      </Fragment>;
    })}
    {value && <Stage id={`${id}/value`} wave={{ bob, orbit, pulse: [pulse[0] / 2, pulse[1]] }}>
      <Text3D id={`${id}/value/text`} text={value} mono size={.6 * TYPE} position={[0, -.15, -.5]} color={INK.white}
        emissive={[{ step: 0, value: 1.1 }, ...Array.from({ length: count }, (_, k) => key(first + k, 1.1 * .82 ** (k + 1), land, .6))]} />
    </Stage>}
    {taxMeter(id, meter, first, length, floor, color, INK, caption)}
  </Stage>;
}
/** Seconds from a layer's step until it lands, flashes and sparks. */
const land = .55;
function layerStyle(props: Record<string, unknown>, INK: Ink) {
  const colors = ((props.colors ?? (props.color ? [props.color] : [INK.blue, INK.purple, INK.amber, INK.accent])) as string[]).map(c => String(paint(c, INK.colors)));
  const wave = (name: string, amplitude: number, period: number): [number, number] => {
    const v = props[name] as number | [number, number] | undefined;
    return Array.isArray(v) ? v : [v ?? amplitude, period];
  };
  return { color: (k: number) => colors[Math.min(k, colors.length - 1)], bob: wave("bob", .1, 4.4), orbit: wave("orbit", .07, 7), pulse: wave("pulse", .18, 3.2), lag: Number(props.lag ?? .3) };
}
/** Sparks from two opposite corners of layer k as it lands. */
const landing = (id: string, k: number, first: number, corner: V3, across: V3, color: string) => [0, 1].map(n =>
  <Burst key={n} id={`${id}/${k}/landing${n ? 2 : ""}`} position={add(n ? add(corner, across) : corner, [0, 0, .1])} step={first + k} delay={land} count={14} lifetime={.7}
    colors={[color, color, "#ffffff"]} emissive={6} size={.025} speed={2.5} {...n ? { seed: k + 7 } : {}} />);
/** A meter that fills to `meter[s]` on each step, either on arrival or with increasing drag. */
function taxMeter(id: string, meter: number[], first: number, length: number, floor: number, color: (k: number) => string, INK: Ink, caption?: string, arrival = false) {
  const fill = (fraction: number) => ({ position: [-length / 2 + fraction * length / 2, floor, .05] as V3, scale: [Math.max(.001, fraction * length), .16, .16] as V3 });
  const meterTrack = (pick: (f: ReturnType<typeof fill>) => V3) => {
    if (arrival) return [{ step: 0, value: pick(fill(0)) }, ...meter.map((f, k) => key(first + k, pick(fill(f)), 0, 0))];
    return meter.length ? [{ step: 0, value: pick(fill(meter[0])) }, ...meter.slice(1).map((f, s) => key(first + s + 1, pick(fill(f)), land + .15 * s, .7 + .25 * s))] : pick(fill(0));
  };
  return <>
    {meter.length > 0 && <>
      <Box id={`${id}/track`} size={.5} position={[0, floor, 0]} scale={[length, .16, .14]} color={INK.idle} emissive={.4} />
      <Box id={`${id}/fill`} size={.5} position={meterTrack(f => f.position)} scale={meterTrack(f => f.scale)} emissive={2.6}
        color={[{ step: 0, value: color(0) }, ...arrival ? meter.map((_, k) => key(first + k, color(k), 0, 0)) : meter.slice(1).map((_, s) => key(first + s + 1, color(s + 1), land, .4))]} />
    </>}
    {caption && <Text3D id={`${id}/caption`} text={caption} mono size={.2 * TYPE} position={[0, floor - .6, 0]} color={INK.muted} emissive={.8} />}
  </>;
}
/** A code line centered on `at`, wrapping one glowing box around each of `words` per step, left to right. Each box hugs its word, centered on
 * its cap height, and the word moves with its box once it lands. */
function proxyLine(id: string, at: V3, props: Record<string, unknown>, INK: Ink, line: string, words: string[], tokens?: CodeToken[]) {
  const first = Number(props.step ?? 0), label = String(props.label ?? ""), meter = (props.meter ?? []) as number[], caption = props.caption as string | undefined;
  const { color, bob, orbit, pulse, lag } = layerStyle(props, INK), em = Number(props.size ?? .6) * TYPE, advance = em * MONO, left = -line.length * advance / 2;
  let from = 0;
  const columns = words.map(word => {
    const column = line.indexOf(word, from);
    if (column < 0) throw authoringError({ ...props, id }, "Layers", `words: "${word}" is not in the code line after column ${from}.`);
    from = column + word.length;
    return column;
  });
  const text = (column: number, length: number) => <Text3D key={column} id={`${id}/text${column}`} text={line.slice(column, column + length)}
    tokens={lineTokens(tokens, column, length)} mono size={em} align="left" position={[left + column * advance, 0, 0]} />;
  const gaps = [...columns.map((c, k) => [k ? columns[k - 1] + words[k - 1].length : 0, c]), [from, line.length]].filter(([a, b]) => line.slice(a, b).trim());
  const height = em * 1.3, floor = -height / 2 - .7;
  return <Stage id={id} position={at}>
    {gaps.map(([a, b]) => text(a, b - a))}
    {words.map((word, k) => {
      const w = word.length * advance + em * .35, center: V3 = [left + (columns[k] + word.length / 2) * advance, 0, 0], shown = [{ step: 0, value: 0 }, key(first + k, 1, 0, .3)];
      return <Fragment key={k}>
        <Stage id={`${id}/${k}/wave`} wave={{ bob, orbit, pulse, lag: k * lag, step: first + k, delay: land }}>
          {text(columns[k], word.length)}
          <Stage id={`${id}/${k}/arrival`} position={[{ step: 0, value: add(center, [0, .5, 7]) }, key(first + k, center, 0, .8, "spring")]}
            glow={[{ step: 0, value: 1 }, key(first + k, 3, land, .08), key(first + k, 1, land + .1, .8)]}>
            <Card id={`${id}/${k}`} scale={[w, height, .08]} fill={.12} edge={1.2} glow={.32} color={color(k)} emissive={1.4} opacity={shown} />
            {label && <Text3D id={`${id}/${k}/label`} text={label} mono size={.2 * TYPE} align="left" position={[-w / 2, height / 2 + .2, 0]} color={color(k)} emissive={1.4} opacity={shown} />}
          </Stage>
        </Stage>
        {landing(id, k, first, add(center, [-w / 2, height / 2, 0]), [w, -height, 0], color(k))}
      </Fragment>;
    })}
    {taxMeter(id, meter, first, Math.max(4, line.length * advance), floor, color, INK, caption, true)}
  </Stage>;
}
type PartMotion = { step?: number; delay?: number; duration?: number; ease?: Ease };
type Sequence = Omit<PartMotion, "step"> & { in?: number; out?: number; distance?: number };
/** A part's `exit`, and a non-text part's `enter`, move it as one Stage; text also fades out and keeps its per-glyph entrance. */
function moved(id: string, part: ReactNode, enter: PartMotion & { from?: V3 } | undefined, exit: PartMotion & { to?: V3 } | undefined) {
  const frames: { step: number; value: V3; delay?: number; duration?: number; ease?: Ease }[] = [];
  if (enter) { const e = { ...enterDefaults, ...enter }; frames.push({ step: 0, value: e.from }, { step: e.step, delay: e.delay, value: [0, 0, 0], duration: e.duration, ease: e.ease }); }
  if (exit) { const e = { ...exitDefaults, ...exit }; if (!frames.length) frames.push({ step: 0, value: [0, 0, 0] }); frames.push({ step: e.step!, delay: e.delay, value: e.to, duration: e.duration, ease: e.ease }); }
  return frames.length ? <Stage key={id} id={`${id}/motion`} position={frames}>{part}</Stage> : part;
}
/** A part with a `sequence` waits off to the right, slides into place on `in` and off to the left on `out`. */
function sequenced(id: string, part: ReactNode, sequence: Sequence | undefined) {
  if (!sequence) return part;
  const { in: shown = 0, out, distance, delay, duration, ease } = { ...sequenceDefaults, ...sequence };
  const frames: { step: number; value: V3; delay?: number; duration?: number; ease?: Ease }[] = [{ step: 0, value: [shown ? distance : 0, 0, 0] }];
  if (shown) frames.push({ step: shown, delay, value: [0, 0, 0], duration, ease });
  if (out !== undefined) frames.push({ step: out, delay, value: [-distance, 0, 0], duration, ease });
  return <Stage key={id} id={`${id}/sequence`} position={frames}>{part}</Stage>;
}
/** A chart's `from`: sibling part `part` lifts off on `step` after `delay`, flies `duration` seconds to the chart's foot as a glowing block,
 * squares up, lands with sparks and spreads into the plinth the chart grows out of. With `fold`, the part's panel instead tips back flat as its
 * contents fade, sinks into the chart's base plate and tints to `color`. */
type ChartFrom = { part: string; step?: number; delay?: number; duration?: number; fold?: boolean; color?: string };
const launchOf = ({ step = 0, delay = 0, fold = false, duration = fold ? 1.1 : .75 }: ChartFrom) => ({ step, delay, duration, fold, land: delay + duration });
/** The value an animated prop holds as `step` begins. */
function restAt<T>(value: Animated<T>, step: number): T {
  if (Array.isArray(value) && typeof value[0] === "object") return (value as Keyframe<T>[]).filter((f, i) => !i || (f.step ?? 0) < step).at(-1)!.value;
  if (!Array.isArray(value) && typeof value === "object" && value !== null) return (value as Record<number, T>)[Math.max(0, ...Object.keys(value).map(Number).filter(k => k < step))];
  return value as T;
}
/** The center and size of an expanded part's `${id}/card` panel as `step` begins, summing the Stages around it. */
function panelRect(node: ReactNode, id: string, step: number): { center: V3; size: V3 } | undefined {
  let found: { center: V3; size: V3 } | undefined;
  const walk = (n: ReactNode, offset: V3) => Children.forEach(n, child => {
    if (found || !isValidElement<Record<string, unknown>>(child)) return;
    const { props } = child;
    if (child.type === Card && props.id === `${id}/card`) found = { center: add(offset, restAt(props.position as Animated<V3> ?? [0, 0, 0], step)), size: restAt(props.scale as Animated<V3>, step) };
    else walk(props.children as ReactNode, child.type === Stage ? add(offset, restAt(props.position as Animated<V3> ?? [0, 0, 0], step)) : offset);
  });
  walk(node, [0, 0, 0]);
  return found;
}
/** The block that carries a source panel at `rect` into bars `chart`: a panel-sized slab flashes, arcs to the chart's foot while it squares into a cube,
 * lands with a squash and sparks, then spreads into a dark plinth under the bars. */
function chartLaunch(chart: PartProps, from: ChartFrom, rect: { center: V3; size: V3 }, INK: Ink): ReactNode {
  const { step, delay, duration, land } = launchOf(from), id = `${chart.id}/from`, foot = (chart.at ?? [0, 3.2, 0]) as V3;
  const items = chart.items as { color?: string }[], { width = 1.5, gap = 3.4 } = chart as Record<string, number>, depth = Number(chart.depth ?? width);
  const glow = String(paint(items[0]?.color ?? chart.color, INK.colors) ?? "#22d3ee"), cube = Math.min(1.4, width * 1.1);
  const start = add(rect.center, [0, 0, .35]), landing = add(foot, [0, cube / 2, depth / 2]), plinth: V3 = [(items.length - 1) * gap + width + .5, .1, depth + .4];
  const at = <T,>(t: number, value: T, d = 0, e?: Ease) => ({ step, delay: t, value, duration: d, ...e ? { ease: e } : {} });
  const path = Array.from({ length: 12 }, (_, k) => { const u = (k + 1) / 12;
    return at(delay + k / 12 * duration, bez3(start, add(start, [0, 2.4, -3]), add(landing, [0, 3.2, 2.5]), landing, ease.io(u)), duration / 12); });
  const morph = Array.from({ length: 6 }, (_, k) => { const u = ramp((k + 1) / 6, 0, 1, "out");
    return at(delay + .1 + k / 6 * (duration - .1), rect.size.map(v => v + (cube - v) * u) as V3, (duration - .1) / 6); });
  return <Fragment key={id}>
    <RoundedBox id={id} radius={.06} edge={.8} material={{ metal: .35, roughness: .22 }}
      position={[{ step: 0, value: start }, at(delay, start), ...path, at(land + .08, add(foot, [0, plinth[1] / 2, depth / 2]), .3, "out")]}
      scale={[{ step: 0, value: [1e-4, 1e-4, 1e-4] }, at(delay, rect.size), ...morph, at(land, [cube * 1.3, cube * .6, cube * 1.3], .08), at(land + .08, plinth, .3, "out")]}
      color={[{ step: 0, value: INK.colors.panel }, at(delay, glow, duration * .6), at(land + .1, "#1c2027", .6)]}
      emissive={[{ step: 0, value: 0 }, at(delay, 2.6, .1), at(delay + .1, .35, duration - .1), at(land, 2.4, .05), at(land + .1, .12, .7)]} />
    <Burst id={`${id}/landing`} position={landing} step={step} delay={land} count={28} lifetime={.7} colors={["#ffa21f", "#ffa21f", "#ffffff"]} emissive={6} size={.03} speed={3.2} />
  </Fragment>;
}
/** The base plate a folding source panel at `rect` becomes: it tips back about its x axis while sinking forward to the chart's foot,
 * then flashes and tints to the plate color. */
function chartFold(chart: PartProps, from: ChartFrom, rect: { center: V3; size: V3 }, INK: Ink): ReactNode {
  const { step, delay, duration, land } = launchOf(from), id = `${chart.id}/from`, foot = (chart.at ?? [0, 3.2, 0]) as V3;
  const items = chart.items as unknown[], { width = 1.5, gap = 3.4 } = chart as Record<string, number>, depth = Number(chart.depth ?? width);
  const plate = paint(from.color ?? "link", INK.colors) as string, back = -depth / 2 - .35, front = depth + .45, thick = .16;
  // Plate scale is in the panel's own frame: once tipped back 90°, its height runs along z and its thickness along y.
  const size: V3 = [(items.length - 1) * gap + width + 1, front - back, thick], seat = add(foot, [0, -thick / 2, (back + front) / 2]);
  const at = <T,>(t: number, value: T, d = 0, e: Ease = "inOut") => ({ step, delay: t, value, duration: d, ease: e });
  return <RoundedBox key={id} id={id} radius={.07} edge={.5} material={{ metal: .55, roughness: .16 }}
      position={[{ step: 0, value: add(rect.center, [0, 0, -.04]) }, at(delay, seat, duration)]}
      rotation={[{ step: 0, value: [0, 0, 0] }, at(delay, [-90, 0, 0], duration)]}
      scale={[{ step: 0, value: [1e-4, 1e-4, 1e-4] }, at(delay, rect.size), at(delay, size, duration)]}
      color={[{ step: 0, value: INK.colors.panel }, at(land, plate, .4, "out")]}
      emissive={[{ step: 0, value: .08 }, at(land, 1.4, .12, "out"), at(land + .12, .25, .6, "out")]} />;
}
function expandParts(children: ReactNode, place: ReturnType<typeof slotPlacer>, scene: { ink: Ink; scene: string }): ReactNode {
  const charts: PartProps[] = [];
  Children.forEach(children, child => { if (isValidElement<PartProps>(child) && (child.type as { worldPart?: string }).worldPart === "bars" && child.props.from) charts.push(place("bars", child.props) as PartProps); });
  const sources = new Map(charts.map(chart => [(chart.from as ChartFrom).part, chart])), launched = new Set<string>();
  const expanded = Children.map(children, child => {
    if (!isValidElement<PartProps>(child)) return child;
    const kind = (child.type as { worldPart?: string }).worldPart;
    if (!kind) return child.props.children === undefined ? child : React.cloneElement(child, {}, expandParts(child.props.children, place, scene));
    checkPart(kind, child.props);
    checkCodeChildren(kind, child.props, child.props.children);
    const { children, id: own, at = [0, 3.2, 0], mdxSource: _, carry, enter, exit, sequence, ...props } = place(kind, child.props) as PartProps;
    // A part that doesn't carry gets ids of its own, so no part of the previous slide flies into it.
    const id = carry === false ? `${own}@${scene.scene}` : own, INK = scene.ink;
    const source = codeSource(children), position = at as V3, leave = exit as PartMotion & { to?: V3 } | undefined;
    if (kind === "headline" || kind === "quote") {
      const fade = leave && [{ step: 0, value: 1 }, { step: leave.step!, delay: leave.delay ?? exitDefaults.delay, value: 0, duration: leave.duration ?? exitDefaults.duration }];
      return sequenced(id, moved(id, textLine(kind, { ...props, ...fade ? { opacity: fade } : {}, enter, id, position, text: source, tokens: codeHighlight(children)?.tokens }, INK), undefined, leave), sequence as Sequence | undefined);
    }
    const expandedPart = expandPart(kind, id, position, props, children, source, INK);
    const focusedPart = props.sharp === undefined ? expandedPart : <Stage id={`${id}/sharp`} sharp={props.sharp as boolean}>{expandedPart}</Stage>;
    const part = sequenced(id, moved(id, focusedPart, enter as PartMotion & { from?: V3 } | undefined, leave), sequence as Sequence | undefined);
    const chart = sources.get(own);
    if (!chart) return part;
    launched.add(own);
    // The source drops out of sight just after the block flashes over it, or fades as its panel folds away.
    const from = chart.from as ChartFrom, { step, delay, fold } = launchOf(from), rect = panelRect(part, id, step) ?? { center: position, size: [2, 1.2, .06] as V3 };
    const gone = delay + (fold ? .4 : .06);
    return <Fragment key={id}><Stage id={`${id}/launch`} position={[{ step: 0, value: [0, 0, 0] }, { step, delay: gone, value: [0, -60, 0], duration: 0 }]}
      {...fold ? { opacity: [{ step: 0, value: 1 }, { step, delay, value: 0, duration: .35 }] } : {}}>{part}</Stage>
      {(fold ? chartFold : chartLaunch)(chart, from, rect, INK)}</Fragment>;
  });
  for (const [part, chart] of sources) if (!launched.has(part)) throw Error(`Bars ${chart.id} grows from ${part}, which must be a part beside it in the same scene.`);
  return expanded;
}
function expandPart(kind: string, id: string, position: V3, props: Record<string, unknown>, children: ReactNode, source: string, INK: Ink): ReactNode {
  if (kind === "list") return <Stage id={id} position={position}><Rows {...props} id={`${id}/rows`} items={props.items as string[]}
    count={Number(props.count ?? 9)} spacing={Number(props.spacing ?? .62)} width={Number(props.width ?? 5.4)} /></Stage>;
  if (kind === "counter") {
    const size = Number(props.size ?? .52) * TYPE, beat = props.beat as Beat | undefined, per = Number(props.per ?? 1);
    const font = props.font as Text3DOptions["font"], digits = { mono: true, font, size, depth: .12 / size, align: "left", color: paint(props.color, INK.colors) as string, emissive: 1, side: "#1c1d22" } as const;
    return <Stage id={id} position={position}>
      {beat ? Array.from({ length: beat.count + 1 }, (_, k) => <Text3D {...digits} key={k} id={`${id}/value${k}`} text={String(k * per)}
        opacity={[{ at: 0, value: k ? 0 : 1, duration: 0 }, ...k ? [{ at: beat.start + (k - 1) * beat.every, value: 1, duration: 0 }] : [],
          ...k < beat.count ? [{ at: beat.start + k * beat.every, value: 0, duration: 0 }] : []]} />)
        : <Text3D {...digits} id={`${id}/value`} text={String(props.value ?? 0)} />}
      <Text3D id={`${id}/label`} text={String(props.label ?? "")} mono font={font} size={.14 * TYPE} depth={.02 / (.14 * TYPE)} tracking={.2 / TYPE} align="left" color={INK.muted} emissive={.8} position={[.02,.6,0]} />
    </Stage>;
  }
  if (kind === "rule") { const delay = Number(props.delay ?? 0), width = Number(props.width ?? 6);
    return <Box id={id} size={.5} color={String(paint(props.color ?? "accent", INK.colors))} emissive={1.1} position={position}
      scale={[{ at: delay, value: [0,.09,.12], duration: 0 }, { at: delay, value: [width,.09,.12], duration: .7 }]} />; }
  if (kind === "bars") {
    const items = props.items as { label: string; value: number; color?: string }[], maximum = Number(props.max ?? Math.max(...items.map(b => b.value)));
    // Bars grown `from` another part stay out of sight until its block lands, then rise out of the plinth quicker; out of a folded plate once it has tinted, with a spring.
    const launch = props.from ? launchOf(props.from as ChartFrom) : undefined;
    const { height = 4.3, width = 1.5, depth = width, gap = 3.4, delay = launch ? launch.land + (launch.fold ? .4 : .1) : 1, stagger = launch ? launch.fold ? .14 : .1 : .35,
      duration = launch ? launch.fold ? 1.1 : .9 : 1.6, ease = launch?.fold ? "spring" : "out", labelSize = .44 } = props as Record<string, number> & { ease?: Ease };
    const tint = props.color === undefined ? undefined : paint(props.color, INK.colors) as string;
    return <Stage id={id} position={launch ? [{ step: 0, value: add(position, [0, -60, 0]) }, { step: launch.step, delay: launch.land + (launch.fold ? 0 : .08), value: position, duration: 0 }] : position}>{items.map((b, i) => { const x = (i - (items.length - 1) / 2) * gap; return <Fragment key={b.label}>
      <Pillar id={`${id}/${i}`} value={b.value} maximum={maximum} height={height} width={width} depth={depth} color={b.color === undefined ? tint : paint(b.color, INK.colors) as string}
        radius={Math.min(width, depth) * .12} gradient={.45} counter={false}
        position={[x,0,0]} {...launch ? { step: launch.step, delay: delay + i * stagger } : { at: delay + i * stagger }} duration={duration} ease={ease} />
      {textLine("headline", { id: `${id}/${i}/label`, text: b.label, position: [x,.3,depth / 2 + .3], size: labelSize, flat: true, delay: delay + .2 + i * stagger * .12 / .35, duration: .7,
        ...launch ? { enter: { step: launch.step } } : {} }, INK)}
    </Fragment>; })}</Stage>;
  }
  if (kind === "code") {
    const text = source.replace(/\n$/, ""), lines = text.split("\n"), size = Number(props.size ?? .165), lineHeight = Number(props.lineHeight ?? .3), pad = Number(props.padding ?? .3);
    const width = Math.max(1, ...lines.map(l => l.length)) * size * .84 + 2 * pad, height = (lines.length - 1) * lineHeight + size + 2 * pad, advance = size * TYPE * MONO;
    const marks = (props.marks ?? []) as CodeMark[], panel = props.panelColor === undefined ? undefined : paint(props.panelColor, INK.colors) as string;
    return <Stage id={id} position={anchored(position, props.anchor, width, height)}>
      <Card id={`${id}/card`} position={[width / 2 - pad, -(lines.length - 1) * lineHeight / 2, -.14]} scale={[width,height,.06]} {...panelStyle(props)} color={panel ?? INK.colors.panel} />
      <Text3D id={`${id}/code`} text={text} tokens={codeHighlight(children)?.tokens} mono flat={props.flat !== false} size={size * TYPE} lineHeight={lineHeight / (size * TYPE)} align="left"
        color={props.textColor === undefined ? undefined : paint(props.textColor, INK.colors) as string} />
      {marks.flatMap((mark, m) => lines.flatMap((line, row) => [...line.matchAll(new RegExp(mark.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))].map(found => {
        const scale: V3 = [mark.text.length * advance + .12, lineHeight * .9, .02];
        return <Card {...HIGHLIGHT} opacity={mark.opacity ?? 1} key={`${m}/${row}/${found.index}`} id={`${id}/mark${m}/${row}/${found.index}`}
          position={[(found.index! + mark.text.length / 2) * advance, -row * lineHeight, -.08]} scale={mark.step ? [{ step: 0, value: [0,0,0] }, key(mark.step, scale, mark.delay ?? 0, .35)] : scale} />;
      })))}
    </Stage>;
  }
  if (kind === "tree") {
    const nodes = placeTree(props.nodes as TreeNode[], { width: props.width as number | undefined, levelHeight: props.levelHeight as number | undefined });
    const beat = props.beat as Beat | undefined, flashes = ((props.flash ?? []) as TreeFlash[]).flatMap(f => Array.from({ length: f.repeat === "infinite" ? 1 : f.repeat ?? 1 }, (_, r) => ({ ...f, delay: (f.delay ?? 0) + r * (f.every ?? 1.5) })));
    const idle = String(paint(props.color ?? "#22d3ee", INK.colors)), nodeWidth = props.nodeWidth as number | undefined, labelSize = props.labelSize as number | undefined;
    const lit = (f: TreeFlash, n: TreeNode) => !f.ids || f.ids.includes(n.id), font = props.font as Text3DOptions["font"];
    const delay = props.delay as number | undefined;
    const boxColor = String(paint(props.boxColor ?? TREE_BOX.fill, INK.colors)), borderColor = String(paint(props.borderColor ?? TREE_BOX.border, INK.colors));
    const beats = (n: TreeNode & { d: number }) => beat && !n.quiet ? Array.from({ length: beat.count }, (_, k) => beat.start + k * beat.every + n.d * HOP) : [];
    const arrives = (f: TreeFlash, n: { d: number }) => (f.delay ?? 0) + (f.wave === false ? .22 : n.d * (f.hop ?? .25));
    const pulseFrames = <T,>(f: TreeFlash, n: { d: number }, rest: T, peak: T): Keyframe<T>[] => {
      const start = arrives(f, n), duration = f.pulseDuration ?? .4;
      const frames = [{ at: 0, value: peak, duration: duration * .15 }, { at: duration * .25, value: rest, duration: duration * .75 }];
      return f.repeat === "infinite" ? [{ ...key(f.step, rest, start, 0), loop: { every: f.every ?? 1.5, frames } }]
        : frames.map(({ at, ...frame }) => ({ ...frame, step: f.step, delay: start + at }));
    };
    return <Stage id={id} position={position}>{nodes.map((n, i) => { const parent = n.p === undefined ? undefined : nodes[n.p], own = flashes.filter(f => lit(f, n));
      const color = own.length ? [{ step: 0, value: n.color ?? idle }, ...own.flatMap(f => f.flash === false ? [key(f.step, f.color, arrives(f, n), .12)]
        : pulseFrames(f, n, n.color ?? idle, f.color))] : n.color;
      const emissive = own.length ? [{ step: 0, value: .006 }, ...own.flatMap(f => f.flash === false ? [key(f.step, (f.glow ?? .4) * .1, arrives(f, n), .4)]
        : pulseFrames(f, n, .006, .45))]
        : beats(n).length ? [{ at: 0, value: .006, duration: 0 }, ...beats(n).flatMap(t => [{ at: t, value: .45, duration: .06 }, { at: t + .1, value: .006, duration: .6 }])] : .006;
      const pulses = [...beats(n).map(t => ({ at: t - HOP, duration: HOP, color: typeof n.color === "string" ? n.color : idle, size: .11, emissive: 10 })),
        ...own.filter(f => f.wave !== false).map(f => ({ step: f.step, delay: arrives(f, n) - (f.hop ?? .25), duration: f.hop ?? .25, every: f.repeat === "infinite" ? f.every ?? 1.5 : undefined, color: f.color, size: .11, emissive: 10 }))];
      const bursts = own.filter(f => f.wave === false && f.from !== undefined && f.from !== n.id), from = bursts.length ? nodes.find(m => m.id === bursts[0].from) : undefined;
      const width = Number(n.width ?? nodeWidth ?? (n.d < 2 ? 3 : 2.3)), height = Number(n.height ?? .82), side = n.x < 0 ? -1 : 1, land = delay === undefined ? 1.35 + i / Math.max(1, nodes.length - 1) * .35 : delay + i * .07 + .3;
      const typed = n.typed && beat ? Array.from({ length: beat.count }, (_, k) => ({ text: `"${n.typed!.slice(0, k + 1)}"`, from: beat.start + k * beat.every + n.d * HOP, to: k + 1 < beat.count ? beat.start + (k + 1) * beat.every + n.d * HOP : undefined })) : [];
      return <Fragment key={n.id}>
        <Stage id={`${id}/${n.id}/assembly`} position={[key(0, [n.x + side * 14,n.y,-3] as V3, 0, 0),
          key(0, [n.x - side * .12,n.y,.06] as V3, land - 1, 1, "out"), key(0, [n.x,n.y,0] as V3, land, .2)]}>
          <RoundedBox id={`${id}/${n.id}`} radius={.08} edge={0} scale={delay === undefined ? [width,height,.5] : [{ at: 0, value: [1e-4,1e-4,1e-4], duration: 0 }, { at: delay + i * .07, value: [width,height,.5], duration: .45, ease: "spring" }]} color={color ?? idle} emissive={emissive}
            material={{ albedo: borderColor, metal: .3, roughness: .5, rim: 0 }} />
          <Box id={`${id}/${n.id}/plate`} position={[0,0,.252]} scale={[width - .14,height - .14,.005]} color={color ?? "#16171b"} emissive={emissive}
            material={{ albedo: boxColor, metal: 0, roughness: 1 }} />
          <Box id={`${id}/${n.id}/rim`} position={[0,-height / 2 + .02,0]} scale={[width + .02,.035,.52]} color={color ?? idle} emissive={typeof emissive === "number" ? .9 : compileTrack(emissive, value => .9 + value * 2).frames} material={{ albedo: "#000000" }} />
          <Text3D id={`${id}/${n.id}/label`} text={n.label ?? n.id} mono font={font} size={(labelSize ?? (n.d < 2 ? .21 : .17)) * TYPE} position={[0,typed.length ? .12 : 0,.27]}
            emissive={.82} side="#1c1d22" metal={.85} roughness={.28} />
          {typed.map((v, k) => <Text3D key={k} id={`${id}/${n.id}/typed${k}`} text={v.text} mono font={font} size={.14 * TYPE} position={[0,-.17,.27]} color={n.color} emissive={.9}
            opacity={[{ at: 0, value: 0, duration: 0 }, { at: v.from, value: 1, duration: 0 }, ...v.to === undefined ? [] : [{ at: v.to, value: 0, duration: 0 }]]} />)}
        </Stage>
        <Burst id={`${id}/${n.id}/landing`} position={[n.x,n.y,.3]} step={0} delay={land} count={14} lifetime={.7} colors={["#ffa21f", "#ffa21f", "#ffffff"]} emissive={6} size={.025} speed={2.5} />
        {parent && <RoutedTube id={`${id}/${n.id}/edge`} thickness={.035} color={n.color ?? "#2e3036"} emissive={.3}
          draw={[key(0, 0, 0, 0), key(0, 1, land - .15, .35)]}
          path={[[parent.x,parent.y - .41,0],[parent.x,n.y + .41,0],[n.x,n.y + .41,0]]} pulses={pulses.length ? pulses : undefined} />}
        {from && <RoutedTube id={`${id}/${n.id}/beam`} thickness={.03} color={bursts[0].color} emissive={4} path={[[from.x,from.y,-.35],[n.x,n.y,-.35]]}
          draw={[{ step: 0, value: 0 }, ...bursts.map(f => key(f.step, 1, f.delay ?? 0, .22))]}
          pulses={bursts.map(f => ({ step: f.step, delay: f.delay ?? 0, duration: .22, every: f.repeat === "infinite" ? f.every ?? 1.5 : undefined, color: f.color, size: .12, emissive: 10 }))} />}
      </Fragment>; })}</Stage>;
  }
  if (kind === "keys") return props.viewport === undefined ? keyList(id, position, props, INK) : viewportList(id, position, props, INK);
  if (kind === "grid") return grid(id, position, props, INK);
  if (kind === "form") return form(id, position, props, INK);
  if (kind === "morph") return codeMorph(id, position, props, codeDiffs(children), INK);
  if (kind === "trace") return codeTrace(id, position, props, children, INK);
  if (kind === "cloud") return cloud(id, position, props, INK);
  if (kind === "flight") return flight(id, position, props, INK);
  if (kind === "layers") return layers(id, position, props, INK, source, codeHighlight(children)?.tokens);
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
}
