import React, { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { useDeckContent, usePresentationValue } from "@legend-apps/presentation";
import { WorldSlide, Text3D, Card, Rows, Stage, RoutedTube, type WorldProps, type WorldTrack } from "./World";

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
    collect(props.children, node => {
      const kind = (node.type as { worldPart?: string }).worldPart;
      if (!kind) throw Error("Scene children must be scene parts or fragments.");
      const { children, ...props } = node.props;
      const source = codeSource(children as ReactNode);
      const text = kind === "code" ? source.replace(/\n$/, "") : source;
      parts.push({ ...props, kind, order: parts.length, text } as AuthoredPart);
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
    slides.push({ id: props.id, layout: props.layout, camera: props.camera, durations, parts });
  });
  return slides;
}
const plans = new WeakMap<NonNullable<SceneProps["prepare"]>, { key: string; plan: ScenePlan }>();
export function Scene({ id, world = "scene", prepare, layout, durations, camera, children, ...appearance }: SceneProps) {
  const content = useDeckContent(), step = usePresentationValue("stepIndex");
  if (!prepare) return <WorldSlide {...appearance} world={world} track={camera ?? { spacing: 32 }}
    buildDuration={durations?.[step]}>{expandScene(children)}</WorldSlide>;
  const slides = readScenes(content, world), key = JSON.stringify(slides);
  let cached = plans.get(prepare);
  if (cached?.key !== key) { cached = { key, plan: prepare(slides) }; plans.set(prepare, cached); }
  const plan = cached.plan, slide = slides.findIndex(s => s.id === id), beat = plan.slideBeats[slide] + step;
  return <WorldSlide {...appearance} world={world} track={plan.tracks[slide] ?? { spacing: 32 }} clock="step"
    stepOffset={plan.slideBeats[slide]} buildDuration={(plan.starts[beat + 1] ?? plan.end) - plan.starts[beat]}>{plan.elements}</WorldSlide>;
}

export type TreeNode = { id: string; label?: string; x?: number; y?: number; d?: number; p?: number; width?: number; height?: number; [key: string]: unknown };
/** Parents precede children; explicit coordinates override the automatic tree layout. */
export function placeTree(nodes: TreeNode[]) {
  const depths: number[] = [];
  for (const [i, n] of nodes.entries()) {
    if (n.p !== undefined && (!Number.isInteger(n.p) || n.p < 0 || n.p >= i)) throw Error(`Tree parent must precede child: ${n.id}`);
    depths.push(n.d ?? (n.p === undefined ? 0 : depths[n.p] + 1));
  }
  return nodes.map((n, i) => {
    const d = depths[i], peers = depths.flatMap((depth, i) => depth === d ? [i] : []), column = peers.indexOf(i);
    return { ...n, d, x: n.x ?? (peers.length === 1 ? 0 : (column / (peers.length - 1) - .5) * (d < 2 ? 5.8 : 8.6)), y: n.y ?? 2 - d * 1.65 };
  });
}
/** Expand authoring parts only; raw World geometry remains available for free composition. */
export function expandScene(children: ReactNode): ReactNode {
  return Children.map(children, child => {
    if (!isValidElement<PartProps>(child)) return child;
    const { children, id, at = [0, 3.2, 0], ...props } = child.props;
    const kind = (child.type as { worldPart?: string }).worldPart;
    if (!kind) return children === undefined ? child : React.cloneElement(child, {}, expandScene(children));
    const source = codeSource(children), position = at as V3;
    if (kind === "headline" || kind === "quote") return <Text3D enter={{ offset: [-8,0,-2], scale: 0, stagger: .025, duration: .8 }} {...props} id={id} position={position} text={source}
      size={Number(props.size ?? (kind === "quote" ? .42 : .8))} />;
    if (kind === "list") return <Stage id={id} position={position}><Rows {...props} id={`${id}/rows`} items={props.items as string[]}
      count={Number(props.count ?? 9)} spacing={Number(props.spacing ?? .62)} width={Number(props.width ?? 5.4)} /></Stage>;
    if (kind === "counter") return <Stage id={id} position={position}>
      <Text3D id={`${id}/value`} text={String(props.value ?? 0)} mono size={Number(props.size ?? .52)} color={props.color as string} />
      <Text3D id={`${id}/label`} text={String(props.label ?? "")} mono size={.14} position={[0,.6,0]} />
    </Stage>;
    if (kind === "code") {
      const text = source.replace(/\n$/, ""), lines = text.split("\n"), size = Number(props.size ?? .165), lineHeight = Number(props.lineHeight ?? .3);
      const width = Math.max(1, ...lines.map(l => l.length)) * size * .84 + .6, height = (lines.length - 1) * lineHeight + size + .6;
      return <Stage id={id} position={position}>
        <Card id={`${id}/card`} position={[width / 2 - .3, -(height - .6) / 2, -.14]} scale={[width,height,.06]} fill={.75} />
        <Text3D id={`${id}/code`} text={text} mono size={size * TYPE} lineHeight={lineHeight / (size * TYPE)} align="left" />
      </Stage>;
    }
    if (kind === "tree") {
      const nodes = placeTree(props.nodes as TreeNode[]);
      return <Stage id={id} position={position}>{nodes.map(n => <Fragment key={n.id}>
        <Card id={`${id}/${n.id}`} position={[n.x,n.y,0]} scale={[Number(n.width ?? 3),Number(n.height ?? .82),.5]} />
        <Text3D id={`${id}/${n.id}/label`} text={n.label ?? n.id} mono size={.21} position={[n.x,n.y,.27]} />
        {n.p !== undefined && <RoutedTube id={`${id}/${n.id}/edge`} thickness={.035}
          path={[[nodes[n.p].x,nodes[n.p].y - .41,0],[nodes[n.p].x,n.y + .41,0],[n.x,n.y + .41,0]]} />}
      </Fragment>)}</Stage>;
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
