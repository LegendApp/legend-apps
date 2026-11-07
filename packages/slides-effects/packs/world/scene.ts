import { composePartRotation, rotatePart, sampleBurst, samplePartMotion, type BurstMotion, type ChoreographyMotion } from "./motionSample";
import { routePoint, tubePulseProgress, digitSegments } from "./stageMotion";
import type { TubePulse } from "./stage";
import { cameraFocus, clockAtTime, easeProgress, evaluateCamera, mixVector, shotOrigin, type CameraOptions, type CameraPose, type ClockSample, type Ease, type Vec3 } from "./camera";
import { activationAt, layoutTree, type Activation, type LayoutNode, type TreeNode } from "./graph";
import { glyphMetrics, glyphKernings, glyphFirst, glyphLast } from "./glyphs";
import type { GlyphInstance } from "./text3d";
import type { EnvironmentOptions, FloorMarkings, KeyLightOptions } from "./lighting";
import { worldEffect, type WorldEffectStage, type WorldEffectUse } from "./effects";
import { d } from "typegpu";
import { floatLayout } from "./layout";

/** `delay` staggers a step keyframe. `loop` repeats local `at` frames every N seconds, starting from `value`. */
export type Keyframe<T> = { step?: number; at?: number; value: T; duration?: number; ease?: Ease; delay?: number; loop?: { every: number; frames: Keyframe<T>[] } };
export type Animated<T> = T | Record<number, T> | Keyframe<T>[];
export type PrimitiveKind = "sphere" | "box" | "tube" | "ring";
/** `steps` (set when every frame is a step keyframe in ascending step order) lets sampling skip frames of later steps by binary search. */
export type Track<T> = { initial: T; frames: Keyframe<T>[]; steps?: number[] };
export type MaterialOptions = { id?: string; albedo?: Animated<string>; emissive?: Animated<number>; roughness?: Animated<number>; metal?: Animated<number>; rim?: Animated<number> };
export type LightOptions = { kind?: "point" | "spot"; position?: Animated<Vec3>; target?: Animated<Vec3>; color?: Animated<string>; intensity?: Animated<number>; range?: Animated<number>; angle?: Animated<number> };
/** Endless motion on the slide clock, each as `[amplitude, period in seconds]`: `bob` rises and falls, `orbit` circles in the ground plane,
 * `pulse` scales glow by 1 ± amplitude. `lag` delays all three by seconds. */
export type StageWave = { bob?: [number, number]; orbit?: [number, number]; pulse?: [number, number]; lag?: number; step?: number; delay?: number };
/** `opacity` multiplies every instance inside the stage. */
export type StageOptions = { id: string; sharp?: Animated<boolean>; position?: Animated<Vec3>; glow?: Animated<number>; opacity?: Animated<number>; wave?: StageWave };
export type StageMotion = { id: string; sharp?: Track<number>; position: Track<Vec3>; glow: Track<number>; opacity?: Track<number>; wave?: StageWave };
export type Collapse = { step: number; to?: number; duration?: number; ease?: Ease };
export type PulseOptions = { id: string; path: (string | Vec3)[]; step?: number; duration?: number; color?: Animated<string>; size?: number; trail?: number; emissive?: Animated<number> };
export type SprayOptions = { id?: string; under?: string; position?: Vec3; rate?: number; lifetime?: number; color?: string; size?: number; spread?: Vec3; velocity?: Vec3; seed?: number; step?: number };
export type LabelWeight = "regular" | "medium" | "bold";
export type LabelAlign = "left" | "center" | "right";
export type LabelOptions = { id?: string; sharp?: Animated<boolean>; text: string; attach?: string; position?: Animated<Vec3>; size?: Animated<number>; color?: Animated<string>;
  emissive?: Animated<number>; opacity?: Animated<number>; align?: LabelAlign; mono?: boolean; weight?: LabelWeight };
/** Rounded card shape: corner `radius` (negative for device pixels) and outer `glow` width in world units, `edge` rim strength, `avatar` disc radius as a fraction of half the height (0 hides it),
 * `fill` the body's opacity (0 to 1) under the rim and glow, for a translucent plate. A `line` width in device pixels draws the rim as a light border, 22% white per unit of `edge` (a `flat` card's border is its material albedo). */
export type CardStyle = { radius?: number; glow?: number; edge?: number; avatar?: number; fill?: number; line?: number };
/** A rounded card with an optional avatar (initials default to the title's first letter), a title, a second line and a right-aligned meta tag.
 * `scale` is the card's full width, height and depth. Text sizes follow the height; text opacities multiply `opacity`. */
export type CardOptions = Omit<PrimitiveOptions, "end" | "curve" | "thickness"> & CardStyle & {
  title?: string; subtitle?: string; meta?: string; initials?: string; mono?: boolean; weight?: LabelWeight; textColor?: string; subtleColor?: string; textEmissive?: number;
  opacity?: Animated<number>; titleOpacity?: Animated<number>; flat?: boolean };
/** `text` substitutes `{item}` (items[index]), `{initial}` (its first letter), `{index}` (the logical row) and `{slot}` (the pooled container). */
export type RowLabel = { text: string; offset?: Vec3; size?: number; color?: string; emissive?: number; align?: LabelAlign; mono?: boolean; weight?: LabelWeight };
/** `glow` scales the travelling and docking accent (default 1). */
export type RecycleOptions = { above?: number; below?: number; reach?: number; lift?: number; color?: string; ghosts?: number; glow?: number };
export type RowsOptions = { id: string; count?: number; position?: Vec3; spacing?: number; speed?: number; start?: number; width?: number; height?: number; depth?: number; color?: string; flashColor?: string; changes?: { row: number; step: number }[]; flashDuration?: number;
  scroll?: Animated<number>; items?: string[]; labels?: RowLabel[]; recycle?: RecycleOptions; emissive?: number; material?: string | MaterialOptions; card?: CardStyle };
export type VoxelsOptions = { id: string; grid?: Vec3; spacing?: number; size?: number; position?: Vec3; color?: Animated<string>; emissive?: Animated<number>; collapse?: Collapse };
export type CustomOptions = PrimitiveOptions & { wgsl: string; count?: number; vertexCount: number };
export type SDFOptions = PrimitiveOptions & { wgsl: string; bounds: [Vec3, Vec3]; steps?: number };
export type PostOptions = { id?: string; wgsl: string; before?: string; after?: string; reads?: string[] };
export type EffectOptions = { use: WorldEffectUse; before?: WorldEffectStage; after?: WorldEffectStage };
/** `rotation` is Euler XYZ in degrees about the instance's center. */
export type PrimitiveOptions = {
  id?: string; sharp?: Animated<boolean>; position?: Animated<Vec3>; size?: Animated<number>; color?: Animated<string>;
  emissive?: Animated<number>; scale?: Animated<Vec3>; rotation?: Animated<Vec3>; end?: Vec3; curve?: number; thickness?: number;
  material?: string | MaterialOptions;
};
export type Instance = {
  id?: string; sharp?: Track<number>; kind: PrimitiveKind; position: Track<Vec3>; size: Track<number>; color: Track<Vec3>;
  emissive: Track<number>; scale: Track<Vec3>; rotation?: Track<Vec3>; end: Vec3; curve: number; thickness: number;
  drift?: number; seed?: number;
  choreography?: ChoreographyMotion; burst?: BurstMotion;
  route?: { points: Vec3[]; lengths: number[]; draw: Track<number>; segment?: number; pulse?: TubePulse; bead?: number };
  pillar?: { value: Track<number>; maximum: number; height: number; role: "body" | "top" | "digit"; digit?: number; segment?: number };
  customIndex?: number;
  endpoints?: [string, string];
  stages?: StageMotion[]; material?: string | MaterialOptions;
  materialTracks?: { albedo: Track<Vec3>; roughness: Track<number>; metal: Track<number>; rim: Track<number> };
  pulse?: { options: PulseOptions; anchors: Instance[]; curves: number[]; tail: boolean };
  spray?: { options: SprayOptions; source?: Instance; phase: number };
  rows?: { options: RowsOptions; slot: number; logical?: number; flashColor: Vec3; scroll?: Track<number>; recycleColor?: Vec3; ghost?: number };
  label?: { text: string; align: LabelAlign; mono: boolean; weight: LabelWeight; offset: Track<Vec3>; opacity: Track<number>; attach?: string; parent?: Instance; row?: RowLabel };
  voxel?: { options: VoxelsOptions; index: number; count: number; target: Vec3 };
  glyph?: GlyphInstance;
  custom?: { wgsl: string; vertexCount: number }; sdf?: { wgsl: string; bounds: [Vec3, Vec3]; steps?: number }; card?: Required<CardStyle> & { opacity?: Track<number>; flat?: boolean };
  graph?: { node: LayoutNode; nodes: LayoutNode[]; activate: Activation[]; dim: Vec3 };
  /** Set by prepareWorldScene: an edge or pulse reads this instance's position by id. */
  anchor?: boolean;
  /** Set by prepareWorldScene: the slot never changes, changes only with its voxel collapse progress, changes only inside its keyframe spans,
   * or only its drifting position changes. */
  motion?: "static" | "voxel" | "tracks" | "drift";
  /** Keyframe spans of a "tracks" instance: per step (ascending), the earliest start and latest end delay; plus slide-time `at` spans. */
  settle?: { steps: number[]; first: number[]; last: number[]; at: number[] };
};
const customKeys = new WeakMap<NonNullable<Instance["custom"]>, { wgsl: string; vertexCount: number; family: string; order: string }>();
export function customGeometryKeys(geometry: NonNullable<Instance["custom"]>) {
  const cached = customKeys.get(geometry);
  if (cached?.wgsl === geometry.wgsl && cached.vertexCount === geometry.vertexCount) return cached;
  const { wgsl, vertexCount } = geometry, suffix = `${wgsl}:${vertexCount}`;
  const keys = { wgsl, vertexCount, family: `custom:${suffix}`, order: `1:${suffix}` };
  customKeys.set(geometry, keys);
  return keys;
}
export type GraphOptions = {
  data: TreeNode; layout?: "cone"; radius?: number; levelHeight?: number; position?: Vec3;
  node?: { color?: Animated<string>; dim?: string; size?: Animated<number>; emissive?: Animated<number>; scale?: Animated<Vec3> };
  nodes?: Record<string, PrimitiveOptions>;
  edge?: { color?: string; curve?: number; glow?: number; thickness?: number };
  activate?: Activation[];
};
export type OrbsOptions = {
  id?: string; count?: number; colors?: string[]; radius?: number; spread?: Vec3; position?: Vec3; seed?: number; drift?: number; emissive?: number;
};
export type WorldScene = {
  camera?: CameraOptions; instances: Instance[]; exposure?: Animated<number>;
  toneMapping?: "aces" | "neutral" | "aces-filmic" | "agx"; outputColorSpace?: "srgb" | "linear-srgb"; emissiveScale?: Animated<number>; quality?: "auto" | "low" | "medium" | "high"; msaaSamples?: 1 | 4;
  backgroundColor?: string; fog?: { density?: Animated<number>; color?: Animated<string>; height?: Animated<number>; falloff?: Animated<number> };
  bloom?: { intensity?: Animated<number>; threshold?: Animated<number>; radius?: Animated<number>; mode?: "soft" | "unreal"; scale?: number }; vignette?: Animated<number>; grain?: Animated<number>; scrim?: number;
  stages?: { stage: StageMotion; parents: StageMotion[] }[]; materials?: Record<string, MaterialOptions>;
  dof?: { focus?: Animated<number | string>; focusRange?: Animated<number>; aperture?: Animated<number>; maxBlur?: Animated<number>; scale?: number; samples?: number };
  floor?: { y?: Animated<number>; roughness?: Animated<number>; emissive?: Animated<number>; size?: Animated<number>; color?: Animated<string>; metal?: Animated<number> } & FloorMarkings;
  shafts?: { intensity?: Animated<number>; density?: Animated<number>; anisotropy?: Animated<number>; scale?: number; samples?: number };
  chromatic?: Animated<number>; rim?: { color?: Animated<string>; intensity?: Animated<number> }; ambient?: Animated<number>;
  lights?: LightOptions[]; passes?: PostOptions[]; effects?: EffectOptions[];
  keyLight?: KeyLightOptions; environment?: EnvironmentOptions;
  postOrder?: ("fog" | "dof" | "bloom")[];
  counter?: { source: string; position?: [number, number]; size?: number; color?: string };
};

export function colorVector(color: string): Vec3 {
  const hex = color.startsWith("#") ? color.slice(1) : color;
  const full = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`World colors require #RGB or #RRGGBB: ${color}`);
  return [0, 2, 4].map(index => {
    const value = parseInt(full.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }) as Vec3;
}
export function compileTrack<T, U = T>(value: Animated<T>, transform: (value: T) => U = (v => v as unknown as U)): Track<U> {
  let frames: Keyframe<T>[];
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null && "value" in value[0]) frames = value as Keyframe<T>[];
  else if (typeof value === "object" && !Array.isArray(value) && value !== null) frames = Object.entries(value).map(([step, v]) => ({ step: Number(step), value: v })).sort((a, b) => a.step! - b.step!);
  else return { initial: transform(value as T), frames: [] };
  if (frames.length === 0) throw new Error("World keyframes must not be empty");
  const steps = frames.map(frame => frame.step ?? 0);
  const ordered = frames.every((frame, index) => frame.at === undefined && (index === 0 || steps[index - 1] <= steps[index]));
  return { initial: transform(frames[0].value), frames: frames.map(frame => {
    if (frame.loop && (!Number.isFinite(frame.loop.every) || frame.loop.every <= 0)) throw new Error("World loop period must be positive");
    return { ...frame, value: transform(frame.value), loop: frame.loop ? { every: frame.loop.every, frames: compileTrack(frame.loop.frames, transform).frames } : undefined };
  }), steps: ordered ? steps : undefined };
}
function sampleTrackFrames<T extends number | Vec3>(track: Track<T>, clock: ClockSample, count: number): T {
  "worklet";
  // The last started frame wins, so scan backwards and stop at the first match: the recursive start-value lookup below
  // usually finds its frame immediately instead of rescanning every earlier keyframe each frame.
  // Frames of later steps cannot have started: with ordered steps, begin the scan below the first of them.
  const steps = track.steps;
  if (steps) {
    let low = 0, high = count;
    while (low < high) { const middle = (low + high) >> 1; if (steps[middle] <= clock.stepIndex) low = middle + 1; else high = middle; }
    count = low;
  }
  let index = -1;
  for (let i = count - 1; i >= 0; i--) {
    const frame = track.frames[i], step = frame.step ?? 0;
    if (frame.at !== undefined ? clock.slideTime >= frame.at : clock.stepIndex >= step &&
      (!frame.delay || clock.stepIndex > step && clock.stepOrigins[step] === undefined || clock.slideTime >= (clock.stepOrigins[step] ?? clock.slideTime - clock.stepTime) + frame.delay)) { index = i; break; }
  }
  if (index < 0) return track.initial;
  const frame = track.frames[index];
  const origin = frame.at ?? (clock.stepOrigins[frame.step ?? 0] ?? clock.slideTime - clock.stepTime) + (frame.delay ?? 0);
  const elapsed = Math.max(0, clock.slideTime - origin);
  const completed = frame.at === undefined && (frame.step ?? 0) < clock.stepIndex && clock.stepOrigins[frame.step ?? 0] === undefined;
  if (frame.loop) return completed ? frame.value : sampleTrackFrames({ initial: frame.value, frames: frame.loop.frames },
    clockAtTime(clock, elapsed % frame.loop.every), frame.loop.frames.length);
  const progress = completed || (frame.duration ?? 0.65) <= 0 ? 1 : elapsed / (frame.duration ?? 0.65);
  // A finished frame holds its value. Skipping its start value keeps dense back-to-back keyframes linear instead of
  // recursing through every earlier frame; the tolerance absorbs float drift where one frame ends as the next begins.
  if (progress >= 1 - 1e-6) return frame.value;
  const value = sampleTrackFrames(track, clockAtTime(clock, origin), index);
  const t = easeProgress(progress, frame.ease);
  return (typeof value === "number" ? value + ((frame.value as number) - value) * t : mixVector(value, frame.value as Vec3, t)) as T;
}
export function sampleTrack<T extends number | Vec3>(track: Track<T>, clock: ClockSample): T {
  "worklet";
  const count = track.frames.length;
  return count ? sampleTrackFrames(track, clock, count) : track.initial;
}
export function primitive(kind: PrimitiveKind, options: PrimitiveOptions = {}): Instance {
  return { id: options.id, sharp: options.sharp === undefined ? undefined : compileTrack(options.sharp, Number), kind, position: compileTrack<Vec3>(options.position ?? [0, 0, 0]), size: compileTrack(options.size ?? 0.5),
    color: compileTrack(options.color ?? "#22d3ee", colorVector), emissive: compileTrack(options.emissive ?? 1.5),
    scale: compileTrack<Vec3>(options.scale ?? [1, 1, 1]), rotation: options.rotation === undefined ? undefined : compileTrack<Vec3>(options.rotation, r => r.map(d => d * Math.PI / 180) as Vec3), end: options.end ?? [0, 2, 0], curve: options.curve ?? 0,
    thickness: options.thickness ?? (kind === "ring" ? 0.04 : 0.025), material: options.material };
}
export function graphInstances(options: GraphOptions): Instance[] {
  const layout = layoutTree(options.data, options);
  const nodeOptions = options.node ?? {}, edgeOptions = options.edge ?? {};
  const dim = colorVector(nodeOptions.dim ?? "#101c38");
  const nodeById = new Map(layout.nodes.map(node => [node.id, node]));
  const nodes = layout.nodes.map(node => {
    const instance = primitive("sphere", { position: node.position,
      color: nodeOptions.color ?? "#b56bff", size: nodeOptions.size ?? 0.3, scale: nodeOptions.scale,
      emissive: nodeOptions.emissive ?? 5, ...options.nodes?.[node.id], id: `node:${node.id}` });
    instance.graph = { node, nodes: layout.nodes, activate: options.activate ?? [], dim };
    return instance;
  });
  const edges = layout.edges.map(edge => {
    const source = nodeById.get(edge.source)!, target = nodeById.get(edge.target)!;
    const instance = primitive("tube", { id: `edge:${edge.source}:${edge.target}`, position: source.position, end: target.position,
      color: edgeOptions.color ?? (typeof nodeOptions.color === "string" ? nodeOptions.color : "#b56bff"),
      emissive: edgeOptions.glow ?? 1.8, curve: edgeOptions.curve ?? 0.4, thickness: edgeOptions.thickness ?? 0.025 });
    instance.graph = { node: target, nodes: layout.nodes, activate: options.activate ?? [], dim };
    instance.endpoints = [`node:${source.id}`, `node:${target.id}`];
    return instance;
  });
  return [...nodes, ...edges];
}
export function orbInstances({ id = "orb", count = 48, colors = ["#22d3ee", "#b56bff"], radius = 0.22, spread = [12, 7, 9], position = [0, 0, 0], seed = 1, drift = 0.4, emissive = 5 }: OrbsOptions = {}): Instance[] {
  if (!Number.isInteger(count) || count < 0 || count > 10000) throw new Error("World orb count must be between 0 and 10000");
  if (colors.length === 0) throw new Error("World orbs require at least one color");
  let state = seed >>> 0;
  function random() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }
  return Array.from({ length: count }, (_, index) => {
    const location: Vec3 = [position[0] + (random() - 0.5) * spread[0], position[1] + (random() - 0.5) * spread[1], position[2] + (random() - 0.5) * spread[2]];
    return { ...primitive("sphere", { id: `${id}:${index}`, position: location, size: radius * (0.6 + random() * 0.8), color: colors[index % colors.length], emissive }), drift, seed: random() * 100 };
  });
}

export function pulseInstances(options: PulseOptions): Instance[] {
  if (options.path.length < 2 || !Number.isFinite(options.duration ?? 2) || (options.duration ?? 2) <= 0 || !Number.isFinite(options.trail ?? 0.18) || (options.trail ?? 0.18) < 0) throw new Error("A world pulse needs at least two anchors, a positive duration and a nonnegative trail");
  return [false, true].map(tail => ({ ...primitive(tail ? "tube" : "sphere", { id: tail ? `${options.id}:trail` : options.id,
    size: options.size ?? 0.08, thickness: (options.size ?? 0.08) * 0.18, color: options.color ?? "#22d3ee", emissive: options.emissive ?? 8 }),
    pulse: { options, anchors: [], curves: [], tail } }));
}
export function sprayInstances(options: SprayOptions = {}): Instance[] {
  const count = Math.ceil((options.rate ?? 40) * (options.lifetime ?? 2));
  if (!Number.isFinite(count) || count < 0 || count > 10000 || (options.lifetime ?? 2) <= 0) throw new Error("World spray requires a positive lifetime and at most 10000 particles");
  return orbInstances({ id: options.id ?? "spray", count, colors: [options.color ?? "#22d3ee"], radius: options.size ?? 0.025,
    spread: [0, 0, 0], position: options.position, seed: options.seed, drift: 0, emissive: 5 }).map((instance, index) => ({
      ...instance, spray: { options, phase: ((index + 1) * 0.61803398875) % 1 },
    }));
}
export function rowInstances(options: RowsOptions): Instance[] {
  const count = options.count ?? 9, recycle = options.recycle;
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error("World rows need an integer pool size between 1 and 1000");
  if (recycle && (recycle.above ?? 0) + (recycle.below ?? 0) >= count) throw new Error("World recycled rows need at least one visible row besides the buffers");
  const shared = { options, flashColor: colorVector(options.flashColor ?? "#22d3ee"), scroll: options.scroll === undefined ? undefined : compileTrack(options.scroll),
    recycleColor: recycle ? colorVector(recycle.color ?? "#b07cff") : undefined };
  const card = options.card ? { card: cardStyle(options.card) } : {};
  const box = (id: string): Instance => ({ ...primitive("box", { id, position: options.position ?? [0, 0, 0],
    scale: [options.width ?? 3, options.height ?? 0.35, options.depth ?? 0.35], size: 0.5, color: options.color ?? "#163047", emissive: options.emissive ?? 0.1, material: options.material }), ...card });
  const slots: Instance[] = Array.from({ length: count }, (_, slot) => ({ ...box(`${options.id}:slot:${slot}`), rows: { ...shared, slot } }));
  const ghosts: Instance[] = Array.from({ length: recycle?.ghosts ?? 0 }, (_, ghost) => ({ ...box(`${options.id}:ghost:${ghost}`), rows: { ...shared, slot: -1, ghost: ghost + 1 } }));
  const labels = slots.flatMap(parent => (options.labels ?? []).map((row, index) => {
    const instance = labelInstance({ ...row, id: `${parent.id}:label:${index}`, position: row.offset });
    instance.label = { ...instance.label!, parent, row };
    return instance;
  }));
  return [...slots, ...ghosts, ...labels];
}
function cardStyle({ radius = 0.12, glow = 0.14, edge = 0.6, avatar = 0, fill = 1, line = 0 }: CardStyle): Required<CardStyle> {
  return { radius, glow, edge, avatar, fill, line };
}
function largestScale(scale: Animated<Vec3> | undefined): Vec3 {
  const track = compileTrack<Vec3>(scale ?? [1, 1, 1]);
  return [track.initial, ...track.frames.map(frame => frame.value)].reduce((a, b) => b[1] > a[1] ? b : a);
}
export function cardInstances(options: CardOptions): Instance[] {
  const { title, subtitle, meta, mono = false, textColor = "#e8f4ff", subtleColor = "#7f9bb3", textEmissive = 1, opacity, titleOpacity } = options;
  const style = cardStyle({ avatar: title ? 0.62 : 0, ...options });
  if (!options.id && (title || subtitle || meta)) throw new Error("A World card with text needs an id");
  const card = { ...primitive("box", { ...options, size: options.size ?? 0.5, scale: options.scale ?? [4, 0.62, 0.18] }), card: { ...style, opacity: compileTrack(opacity ?? 1), ...options.flat ? { flat: true } : {} } };
  const [width, height, depth] = largestScale(options.scale ?? [4, 0.62, 0.18]).map(value => value * (typeof options.size === "number" ? options.size : 0.5) * 2) as Vec3;
  const z = depth / 2 + 0.01, left = -width / 2 + (style.avatar > 0 ? height * (0.5 + style.avatar * 0.5) + height * 0.22 : height * 0.3);
  const label = (key: string, text: string, position: Vec3, size: number, color: string, emissive: number, extra: Partial<LabelOptions> = {}) =>
    labelInstance({ id: `${options.id}:${key}`, attach: options.id, text, position, size, color, emissive, ...extra });
  const initials = options.initials ?? title?.[0]?.toUpperCase();
  return [card,
    ...style.avatar > 0 && initials ? [label("initials", initials, [-width / 2 + height / 2, 0, z], height * style.avatar * 0.62, "#060d1a", textEmissive * 1.2, { align: "center", weight: "bold" })] : [],
    ...title ? [label("title", title, [left, subtitle ? height * 0.13 : 0, z], height * (subtitle ? 0.36 : 0.4), textColor, textEmissive, { mono, weight: options.weight, ...titleOpacity !== undefined ? { opacity: titleOpacity } : {} })] : [],
    ...subtitle ? [label("subtitle", subtitle, [left, -height * 0.24, z], height * 0.22, subtleColor, textEmissive * 0.55, { weight: "regular" })] : [],
    ...meta ? [label("meta", meta, [width / 2 - height * 0.3, 0, z], height * 0.28, subtleColor, textEmissive * 0.55, { mono: true, align: "right" })] : []];
}
export function labelInstance(options: LabelOptions): Instance {
  return { ...primitive("box", { id: options.id, sharp: options.sharp, size: options.size ?? 0.3, color: options.color ?? "#e6f6ff", emissive: options.emissive ?? 1.5 }),
    label: { text: options.text, align: options.align ?? "left", mono: options.mono ?? false, weight: options.weight ?? "medium", offset: compileTrack<Vec3>(options.position ?? [0, 0, 0]),
      opacity: compileTrack(options.opacity ?? 1), attach: options.attach } };
}
// Worklets capture module bindings when they are defined, so constants and helpers precede their users.
export const labelCapacity = 57;
const labelSwap = 0.75;
function labelFace(mono: boolean, weight: LabelWeight) {
  "worklet";
  return mono ? 3 : weight === "regular" ? 0 : weight === "bold" ? 2 : 1;
}
/** Width and kerning use the same face metrics as the shader. Unsupported characters become '?'. */
export function labelWidth(text: string, mono: boolean, weight: LabelWeight = "medium") {
  "worklet";
  const face = labelFace(mono, weight);
  const length = Math.min(text.length, labelCapacity);
  let width = 0;
  for (let i = 0; i < length; i++) {
    const code = text.charCodeAt(i), next = text.charCodeAt(i + 1);
    const glyph = (code < glyphFirst || code > glyphLast ? 63 : code) - glyphFirst;
    width += glyphMetrics[face][glyph][0];
    if (i + 1 < length) width += glyphKernings[face][glyph * (glyphLast - glyphFirst + 1) + (next < glyphFirst || next > glyphLast ? 63 : next) - glyphFirst] ?? 0;
  }
  return width;
}

/** Packs seven-bit characters three per float into the label slot's spare fields 12-22 and 24-31. */
export function packLabelText(text: string, values: number[] | Float32Array, index: number) {
  "worklet";
  for (let k = 0; k < labelCapacity / 3; k++) {
    let packed = 0;
    for (let c = 2; c >= 0; c--) {
      const i = k * 3 + c, code = i < text.length ? text.charCodeAt(i) : 0;
      packed = packed * 128 + (code < glyphFirst || code > glyphLast ? (i < text.length ? 63 : 0) : code);
    }
    values[index + (k < 11 ? 12 + k : 13 + k)] = packed;
  }
}
export function formatRowLabel(template: string, items: string[] | undefined, logical: number, slot: number) {
  "worklet";
  const item = items?.length ? items[((logical % items.length) + items.length) % items.length] : "";
  return template.replace("{item}", item).replace("{initial}", item.slice(0, 1).toUpperCase()).replace("{index}", String(logical)).replace("{slot}", String(slot));
}
/** The pooled container model: slot k holds the mounted logical row congruent to k; the top-most one travels while scroll crosses a row. */
export function recycleSlot(slot: number, count: number, above: number, scroll: number) {
  "worklet";
  const top = Math.floor(scroll), base = top - above;
  const logical = base + (((slot - base) % count) + count) % count;
  return { logical, travel: logical === base ? scroll - top : -1 };
}
/** Exits upward from `start`, loops around the right at `reach` and slides left into `end`, sampled by arc length. */
export function recyclePathPoint(start: Vec3, end: Vec3, reach: number, lift: number, t: number): Vec3 {
  "worklet";
  const right = start[0] + reach, top = start[1] + lift;
  const radius = Math.max(0.001, Math.min(reach - lift, (top - end[1]) / 2) * 0.6);
  const quarter = Math.PI / 2;
  const lengths = [quarter * lift, Math.max(0, right - radius - start[0] - lift), quarter * radius, Math.max(0, top - end[1] - 2 * radius), quarter * radius, Math.max(0, right - radius - end[0])];
  let distance = Math.max(0, Math.min(1, t)) * lengths.reduce((a, b) => a + b, 0);
  const z = start[2] + (end[2] - start[2]) * Math.max(0, Math.min(1, t));
  let segment = 0;
  while (segment < 5 && distance > lengths[segment]) distance -= lengths[segment++];
  const f = lengths[segment] > 0 ? distance / lengths[segment] : 1;
  if (segment === 0) return [start[0] + lift + lift * Math.cos(Math.PI - quarter * f), start[1] + lift * Math.sin(Math.PI - quarter * f), z];
  if (segment === 1) return [start[0] + lift + lengths[1] * f, top, z];
  if (segment === 2) return [right - radius + radius * Math.cos(quarter - quarter * f), top - radius + radius * Math.sin(quarter - quarter * f), z];
  if (segment === 3) return [right, top - radius - lengths[3] * f, z];
  if (segment === 4) return [right - radius + radius * Math.cos(-quarter * f), end[1] + radius + radius * Math.sin(-quarter * f), z];
  return [right - radius - lengths[5] * f, end[1], z];
}
export function voxelInstances(options: VoxelsOptions): Instance[] {
  const grid = options.grid ?? [8, 8, 8];
  if (grid.some(value => !Number.isInteger(value) || value < 1) || grid[0] * grid[1] * grid[2] > 10000 ||
    options.collapse && ((options.collapse.to ?? 0.2) < 0 || (options.collapse.to ?? 0.2) > 1)) throw new Error("World voxels require a positive grid up to 10000 cells and collapse fraction between zero and one");
  const count = grid[0] * grid[1] * grid[2], remaining = Math.round(count * (options.collapse?.to ?? 0.2));
  const compact = Math.max(1, Math.ceil(Math.cbrt(remaining)));
  return Array.from({ length: count }, (_, index) => {
    const x = index % grid[0], y = Math.floor(index / grid[0]) % grid[1], z = Math.floor(index / (grid[0] * grid[1]));
    const spacing = options.spacing ?? 0.35;
    const offset: Vec3 = [(x - (grid[0] - 1) / 2) * spacing, (y - (grid[1] - 1) / 2) * spacing, (z - (grid[2] - 1) / 2) * spacing];
    const center = options.position ?? [0, 0, 0];
    const target: Vec3 = [((index % compact) - (compact - 1) / 2) * spacing,
      ((Math.floor(index / compact) % compact) - (compact - 1) / 2) * spacing,
      (Math.floor(index / (compact * compact)) - (Math.ceil(remaining / (compact * compact)) - 1) / 2) * spacing];
    return { ...primitive("box", { id: `${options.id}:${index}`, position: [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]],
      size: options.size ?? 0.13, color: options.color ?? "#22d3ee", emissive: options.emissive ?? 2 }), voxel: { options, index, count, target } };
  });
}
export function customInstances(options: CustomOptions): Instance[] {
  const count = options.count ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 10000 || !Number.isInteger(options.vertexCount) || options.vertexCount < 1) throw new Error("World custom geometry needs count between one and 10000 and positive integer vertexCount");
  const custom = { wgsl: options.wgsl, vertexCount: options.vertexCount };
  return Array.from({ length: count }, (_, index) => ({ ...primitive("box", { ...options, size: options.size ?? 1, id: options.id ? `${options.id}:${index}` : undefined }), custom, customIndex: index }));
}
export function sdfInstance(options: SDFOptions): Instance {
  if (options.bounds.some(bound => bound.some(value => !Number.isFinite(value))) || options.bounds[0].some((value, index) => value >= options.bounds[1][index])) throw new Error("World SDF bounds must be finite and have positive extent");
  if (options.steps !== undefined && (!Number.isInteger(options.steps) || options.steps < 1 || options.steps > 256)) throw new Error("World SDF steps must be an integer between one and 256");
  return { ...primitive("box", { ...options, size: options.size ?? 1 }), sdf: { wgsl: options.wgsl, bounds: options.bounds, steps: options.steps } };
}

/** Slots 128–159 hold the track bend window (see `trackBendSlot`). */
export const worldHeaderSize = 160;
export const worldLightCountSlot = 63;
/** Reserved header slots for the projected World clock used by custom WGSL contexts. */
export const worldClockOffset = 24;
/** Header slot holding the camera's travel speed between track stations, 0 at rest to 1 at the move's peak; the next slot holds its radial blur. */
export const travelSpeedSlot = 126;
/**
 * One mesh instance's 32 floats, shared by the TS writer and the WGSL `instanceAt` loader. Labels and Text3D glyphs
 * pack their own fields into `detail`, `endpoint`, `curve`, `extra` and `thickness`.
 */
export const WorldInstance = d.struct({
  position: d.vec3f, radius: d.f32, color: d.vec3f, emissive: d.f32, scale: d.vec3f, detail: d.f32, endpoint: d.vec3f, curve: d.f32,
  extra: d.vec3f, thickness: d.f32, rotation: d.vec3f, opacity: d.f32, albedo: d.vec3f, roughness: d.f32, metal: d.f32, rim: d.f32,
  activation: d.f32, geometry: d.f32, sharp: d.f32,
}).$name("WorldInstance");
const instanceLayout = floatLayout(WorldInstance.propTypes);
/** Float offset of each WorldInstance field from the instance's base. */
export const instanceField = instanceLayout.offsets;
export const worldInstanceSize = instanceLayout.size;
export function triggerElapsed(step: number, clock: ClockSample) {
  "worklet";
  if (clock.stepIndex < step) return -1;
  if (clock.stepIndex > step && clock.stepOrigins[step] === undefined) return 1000000;
  return clock.slideTime - shotOrigin({ step }, clock);
}
export function collapseProgress(collapse: Collapse | undefined, clock: ClockSample) {
  "worklet";
  if (!collapse) return 0;
  const elapsed = triggerElapsed(collapse.step, clock);
  return elapsed < 0 ? 0 : easeProgress((collapse.duration ?? 2) <= 0 ? 1 : elapsed / (collapse.duration ?? 2), collapse.ease);
}
export function voxelRemaining(instance: Instance, clock: ClockSample): number {
  "worklet";
  const voxel = instance.voxel!;
  const target = Math.round(voxel.count * (voxel.options.collapse?.to ?? 0.2));
  return voxel.count + (target - voxel.count) * collapseProgress(voxel.options.collapse, clock);
}
/** A wave with a `step` is still until that step, then eases in over a second after `delay`. */
function waveRise(wave: StageWave, clock: ClockSample) {
  "worklet";
  if (wave.step === undefined) return 1;
  const elapsed = triggerElapsed(wave.step, clock), u = Math.min(1, Math.max(0, elapsed - (wave.delay ?? 0)));
  return elapsed < 0 ? 0 : u * u * (3 - 2 * u);
}
const noOffset: Vec3 = [0, 0, 0];
function stageOffset(stages: StageMotion[] | undefined, clock: ClockSample): Vec3 {
  "worklet";
  if (!stages?.length) return noOffset;
  const offset: Vec3 = [0, 0, 0];
  for (const stage of stages) {
    const position = sampleTrack(stage.position, clock);
    for (let axis = 0; axis < 3; axis++) offset[axis] += position[axis];
    const wave = stage.wave;
    if (wave) {
      const t = clock.slideTime - (wave.lag ?? 0), k = waveRise(wave, clock);
      if (wave.bob) offset[1] += Math.sin(t * 2 * Math.PI / wave.bob[1]) * wave.bob[0] * k;
      if (wave.orbit) { const a = t * 2 * Math.PI / wave.orbit[1]; offset[0] += Math.cos(a) * wave.orbit[0] * k; offset[2] += Math.sin(a) * wave.orbit[0] * k; }
    }
  }
  return offset;
}
function stageOpacity(stages: StageMotion[] | undefined, clock: ClockSample) {
  "worklet";
  let opacity = 1;
  for (const stage of stages ?? []) if (stage.opacity) opacity *= sampleTrack(stage.opacity, clock);
  return opacity;
}
function stageGlow(stage: StageMotion, clock: ClockSample) {
  "worklet";
  const glow = sampleTrack(stage.glow, clock), pulse = stage.wave?.pulse;
  return pulse ? glow * (1 + Math.sin((clock.slideTime - (stage.wave!.lag ?? 0)) * 2 * Math.PI / pulse[1]) * pulse[0] * waveRise(stage.wave!, clock)) : glow;
}
function rowScroll(rows: NonNullable<Instance["rows"]>, clock: ClockSample) {
  "worklet";
  return rows.scroll ? sampleTrack(rows.scroll, clock) : (rows.options.start ?? 0) + clock.slideTime * (rows.options.speed ?? 0.3);
}
export function rowLogicalIndex(instance: Instance, clock: ClockSample) {
  "worklet";
  const rows = instance.rows!, recycle = rows.options.recycle;
  if (rows.logical !== undefined) return rows.logical;
  if (recycle) return recycleSlot(rows.slot, rows.options.count ?? 9, recycle.above ?? 0, rowScroll(rows, clock)).logical;
  return Math.floor(rowScroll(rows, clock)) + rows.slot;
}
function rowLabelLogical(instance: Instance, clock: ClockSample) {
  "worklet";
  const parent = instance.label!.parent!, rows = parent.rows!, recycle = rows.options.recycle;
  if (!recycle) return rowLogicalIndex(parent, clock);
  const count = rows.options.count ?? 9, slot = recycleSlot(rows.slot, count, recycle.above ?? 0, rowScroll(rows, clock));
  return slot.logical + (slot.travel >= labelSwap ? count : 0);
}
/** Row-space y of a logical row: 0 is the top visible row; recycled pools exclude their buffers from the centred window. */
function rowY(rows: NonNullable<Instance["rows"]>, row: number) {
  "worklet";
  const recycle = rows.options.recycle, visible = (rows.options.count ?? 9) - (recycle ? (recycle.above ?? 0) + (recycle.below ?? 0) : 0);
  return ((visible - 1) / 2 - row) * (rows.options.spacing ?? 1.2);
}
/** Position of a recycled pool slot, or of a ghost trailing the travelling slot; null hides a ghost. */
function recycledRowPosition(rows: NonNullable<Instance["rows"]>, origin: Vec3, clock: ClockSample): Vec3 | null {
  "worklet";
  const recycle = rows.options.recycle!, count = rows.options.count ?? 9, above = recycle.above ?? 0, scroll = rowScroll(rows, clock);
  let travel: number;
  if (rows.ghost) travel = scroll - Math.floor(scroll) - rows.ghost * 0.025;
  else if (rows.logical !== undefined) return [origin[0], origin[1] + rowY(rows, rows.logical - scroll), origin[2]];
  else {
    const slot = recycleSlot(rows.slot, count, above, scroll);
    if (slot.travel < 0) return [origin[0], origin[1] + rowY(rows, slot.logical - scroll), origin[2]];
    travel = slot.travel;
  }
  if (travel <= 0) return rows.ghost ? null : [origin[0], origin[1] + rowY(rows, -above), origin[2]];
  return recyclePathPoint([origin[0], origin[1] + rowY(rows, -above), origin[2]], [origin[0], origin[1] + rowY(rows, count - above - 1), origin[2]],
    recycle.reach ?? (rows.options.width ?? 3) * 2 + 1, recycle.lift ?? (rows.options.spacing ?? 1.2) * 0.8, easeProgress(travel, "smoothstep"));
}
/** 0 inside the viewport, rising to 1 one row into a buffer; travelling slots count as inside. */
function rowOutside(instance: Instance, clock: ClockSample) {
  "worklet";
  const rows = instance.rows!, recycle = rows.options.recycle;
  if (!recycle || rows.ghost) return 0;
  const scroll = rowScroll(rows, clock), slot = recycleSlot(rows.slot, rows.options.count ?? 9, recycle.above ?? 0, scroll);
  if (slot.travel >= 0 && rows.logical === undefined) return 0;
  const row = (rows.logical ?? slot.logical) - scroll, last = (rows.options.count ?? 9) - (recycle.above ?? 0) - (recycle.below ?? 0) - 1;
  return Math.max(0, Math.min(1, Math.max(-row, row - last)));
}
/** Recycle accent: rises as a slot leaves, holds along the path and fades after it docks with new data. */
function recycleGlow(instance: Instance, clock: ClockSample) {
  "worklet";
  const rows = instance.rows!, recycle = rows.options.recycle;
  if (!recycle || rows.logical !== undefined) return 0;
  const count = rows.options.count ?? 9, scroll = rowScroll(rows, clock), fraction = scroll - Math.floor(scroll);
  if (rows.ghost) return 1;
  const slot = recycleSlot(rows.slot, count, recycle.above ?? 0, scroll);
  if (slot.travel >= 0) return Math.min(1, slot.travel / 0.12);
  const initial = rows.scroll ? rows.scroll.initial : rows.options.start ?? 0;
  return slot.logical === Math.floor(scroll) - (recycle.above ?? 0) + count - 1 && Math.floor(scroll) > Math.floor(initial) ? Math.max(0, 1 - fraction / 0.5) : 0;
}
function rowHighlight(instance: Instance, clock: ClockSample) {
  "worklet";
  const rows = instance.rows!;
  const logical = rowLogicalIndex(instance, clock), duration = rows.options.flashDuration ?? 0.8;
  let changed = false, active = false, flash = 0;
  for (const change of rows.options.changes ?? []) {
    const elapsed = triggerElapsed(change.step, clock);
    if (elapsed < 0) continue;
    active = true;
    if (change.row !== logical) continue;
    changed = true;
    if (elapsed < duration) flash = Math.max(flash, Math.pow(1 - elapsed / duration, 2));
  }
  // Changed rows keep their color and glow once their step has started; the others dim behind them.
  return { changed, dimmed: active && !changed, flash };
}
function quadraticPoint(from: Vec3, to: Vec3, curve: number, t: number): Vec3 {
  "worklet";
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const lift = Math.sqrt(dx * dx + dy * dy + dz * dz) * curve;
  return [from[0] + dx * t, from[1] + dy * t + 2 * (1 - t) * t * lift, from[2] + dz * t];
}
function pulseRange(pulse: NonNullable<Instance["pulse"]>, clock: ClockSample) {
  "worklet";
  const segments = pulse.anchors.length - 1;
  const progress = Math.max(0, Math.min(1, triggerElapsed(pulse.options.step ?? 0, clock) / (pulse.options.duration ?? 2)));
  const travel = progress * segments, segment = Math.min(segments - 1, Math.floor(travel));
  const head = travel - segment;
  return { segment, head, tail: Math.max(0, head - (pulse.options.trail ?? 0.18) * segments) };
}
export function instancePosition(instance: Instance, clock: ClockSample): Vec3 {
  "worklet";
  if (instance.choreography) {
    const pose = samplePartMotion(instance.choreography, clock), local = instance.choreography.local;
    const point = rotatePart([local[0] * pose.scale[0], local[1] * pose.scale[1], local[2] * pose.scale[2]], pose.rotation);
    const offset = stageOffset(instance.stages, clock);
    return [pose.position[0] + point[0] + offset[0], pose.position[1] + point[1] + offset[1], pose.position[2] + point[2] + offset[2]];
  }
  if (instance.burst) {
    const point = sampleBurst(instance.burst, clock).position, offset = stageOffset(instance.stages, clock);
    return [point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]];
  }
  let position = sampleTrack(instance.position, clock);
  if (instance.route?.pulse) {
    const route = instance.route, progress = tubePulseProgress(route.pulse!, clock) - (route.bead ?? 0) * (route.pulse!.spacing ?? 0.025);
    position = routePoint(route.points, route.lengths, progress * route.lengths[route.lengths.length - 1]);
  }
  if (instance.pillar) {
    const pillar = instance.pillar, height = pillar.height * Math.max(0, sampleTrack(pillar.value, clock) / pillar.maximum);
    position = [position[0], position[1] + (pillar.role === "body" ? height / 2 : height), position[2]];
  }
  if (instance.pulse) {
    const pulse = instance.pulse;
    const range = pulseRange(pulse, clock);
    return quadraticPoint(instancePosition(pulse.anchors[range.segment], clock), instancePosition(pulse.anchors[range.segment + 1], clock), pulse.curves[range.segment], pulse.tail ? range.tail : range.head);
  }
  if (instance.spray) {
    const spray = instance.spray, life = spray.options.lifetime ?? 2;
    const elapsed = spray.options.step === undefined ? clock.slideTime : triggerElapsed(spray.options.step, clock);
    const age = ((Math.max(0, elapsed) / life + spray.phase) % 1) * life;
    if (spray.source) position = instancePosition(spray.source, clock);
    else {
      const offset = stageOffset(instance.stages, clock);
      position = [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]];
    }
    const spread = spray.options.spread ?? [1, 0.3, 1], velocity = spray.options.velocity ?? [0, -1, 0];
    return [position[0] + Math.sin(spray.phase * 97) * spread[0] * age + velocity[0] * age,
      position[1] + Math.cos(spray.phase * 53) * spread[1] * age + velocity[1] * age,
      position[2] + Math.sin(spray.phase * 71) * spread[2] * age + velocity[2] * age];
  }
  if (instance.label?.parent) {
    const parent = instancePosition(instance.label.parent, clock), offset = sampleTrack(instance.label.offset, clock);
    return [parent[0] + offset[0], parent[1] + offset[1], parent[2] + offset[2]];
  }
  if (instance.label) {
    const offset = sampleTrack(instance.label.offset, clock);
    position = [offset[0], offset[1], offset[2]];
  }
  if (instance.glyph) {
    const glyph = instance.glyph, offset = sampleTrack(glyph.offset, clock);
    position = [position[0] + glyph.home[0] + offset[0], position[1] + glyph.home[1] + offset[1], position[2] + glyph.home[2] + offset[2]];
  }
  if (instance.rows?.options.recycle) position = recycledRowPosition(instance.rows, position, clock) ?? position;
  else if (instance.rows) {
    const rows = instance.rows, scroll = rowScroll(rows, clock);
    position = [position[0], position[1] + (((rows.options.count ?? 9) - 1) / 2 + scroll - rowLogicalIndex(instance, clock)) * (rows.options.spacing ?? 1.2), position[2]];
  }
  if (instance.voxel) {
    const voxel = instance.voxel, center = voxel.options.position ?? [0, 0, 0];
    if (voxel.index < Math.round(voxel.count * (voxel.options.collapse?.to ?? 0.2))) {
      position = mixVector(position, [center[0] + voxel.target[0], center[1] + voxel.target[1], center[2] + voxel.target[2]], collapseProgress(voxel.options.collapse, clock));
    }
  }
  const drift = instance.drift ?? 0, seed = instance.seed ?? 0;
  const offset = stageOffset(instance.stages, clock);
  return [position[0] + offset[0] + Math.sin(clock.slideTime * 0.27 + seed) * drift,
    position[1] + offset[1] + Math.cos(clock.slideTime * 0.31 + seed * 2) * drift,
    position[2] + offset[2] + Math.sin(clock.slideTime * 0.19 + seed * 3) * drift];
}
export function instanceOpacity(instance: Instance, clock: ClockSample): number {
  "worklet";
  if (instance.choreography) return samplePartMotion(instance.choreography, clock).opacity * instance.choreography.opacity;
  if (instance.burst) return sampleBurst(instance.burst, clock).opacity;
  if (instance.route) {
    const route = instance.route;
    if (route.pulse) {
      // Idle beads (outside the pulse) skip sampling the draw track.
      const progress = tubePulseProgress(route.pulse, clock) - (route.bead ?? 0) * (route.pulse.spacing ?? 0.025);
      return progress < 0 || progress > 1 || progress > Math.max(0, Math.min(1, sampleTrack(route.draw, clock))) ? 0 : 1;
    }
    const drawn = Math.max(0, Math.min(1, sampleTrack(route.draw, clock)));
    return drawn * route.lengths[route.lengths.length - 1] <= route.lengths[route.segment!] ? 0 : 1;
  }
  if (instance.pillar?.role === "digit") {
    const pillar = instance.pillar, value = Math.max(0, Math.round(sampleTrack(pillar.value, clock))), place = Math.pow(10, pillar.digit!);
    if (pillar.digit! > 0 && value < place) return 0;
    return digitSegments[Math.floor(value / place) % 10] & (1 << pillar.segment!) ? 1 : 0;
  }
  if (instance.label) {
    const label = instance.label;
    let opacity = sampleTrack(label.opacity, clock) * (label.parent ? instanceOpacity(label.parent, clock) : 1);
    const rows = label.parent?.rows;
    if (rows?.options.recycle && label.row) {
      const travel = recycleSlot(rows.slot, rows.options.count ?? 9, rows.options.recycle.above ?? 0, rowScroll(rows, clock)).travel;
      // Content swaps at the dock point, hidden by a short dip.
      if (travel >= 0) opacity *= Math.min(1, Math.abs(travel - labelSwap) / 0.15);
    }
    return opacity;
  }
  if (instance.rows?.options.recycle) {
    const rows = instance.rows, recycle = instance.rows.options.recycle, count = rows.options.count ?? 9, scroll = rowScroll(rows, clock);
    if (rows.ghost) {
      const travel = scroll - Math.floor(scroll) - rows.ghost * 0.025;
      return travel <= 0 || travel >= 1 ? 0 : 0.2 * Math.pow(0.6, rows.ghost) * Math.min(1, travel / 0.1, (1 - travel) / 0.1);
    }
    const slot = recycleSlot(rows.slot, count, recycle.above ?? 0, scroll);
    const logical = rows.logical ?? slot.logical;
    if (slot.travel >= 0 && rows.logical === undefined) return (logical >= 0 ? 1 - slot.travel : 0) + (logical + count >= 0 ? slot.travel : 0);
    return logical >= 0 ? 1 : 0;
  }
  if (instance.rows) {
    const rows = instance.rows, scroll = rowScroll(rows, clock);
    const fraction = scroll - Math.floor(scroll);
    return (rows.slot === 0 ? 1 - fraction : 1) * (rows.slot === (rows.options.count ?? 9) - 1 ? fraction : 1);
  }
  if (instance.pulse) {
    const elapsed = triggerElapsed(instance.pulse.options.step ?? 0, clock), duration = instance.pulse.options.duration ?? 2;
    if (instance.pulse.tail) {
      const range = pulseRange(instance.pulse, clock);
      if (range.head === range.tail) return 0;
    }
    return elapsed < 0 ? 0 : Math.max(0, Math.min(1, (duration + 0.25 - elapsed) / 0.25));
  }
  if (instance.voxel) {
    return Math.max(0, Math.min(1, voxelRemaining(instance, clock) - instance.voxel.index));
  }
  if (instance.glyph) return sampleTrack(instance.glyph.opacity, clock);
  if (instance.spray) {
    const spray = instance.spray, elapsed = spray.options.step === undefined ? clock.slideTime : triggerElapsed(spray.options.step, clock);
    if (elapsed < 0) return 0;
    const phase = (elapsed / (spray.options.lifetime ?? 2) + spray.phase) % 1;
    const source = spray.source;
    const lit = source?.graph ? activationAt(source.graph.node, source.graph.nodes, source.graph.activate, clock) : 1;
    return Math.sin(phase * Math.PI) * lit;
  }
  return instance.card?.opacity ? sampleTrack(instance.card.opacity, clock) : 1;
}
export function resolveAnchor(scene: WorldScene | WorldSampleScene, id: string, clock: ClockSample): Vec3 | undefined {
  "worklet";
  const stage = scene.stages?.find(item => `stage:${item.stage.id}` === id);
  if (stage) return stageOffset([...stage.parents, stage.stage], clock);
  const instances = "lookupInstances" in scene ? scene.lookupInstances : scene.instances;
  const row = instances.find(instance => instance.rows && id.startsWith(`${instance.rows.options.id}:row:`));
  if (row) return instancePosition({ ...row, rows: { ...row.rows!, logical: Number(id.slice(id.lastIndexOf(":") + 1)) } }, clock);
  const instance = instances.find(instance => instance.id === id || instance.id === `node:${id}`);
  if (instance) return instancePosition(instance, clock);
  const voxel = instances.find(instance => instance.voxel?.options.id === id);
  if (voxel) {
    const center = voxel.voxel!.options.position ?? [0, 0, 0], offset = stageOffset(voxel.stages, clock);
    return [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]];
  }
}
export function sampleWorldCamera(scene: WorldScene | WorldSampleScene, clock: ClockSample, previous?: CameraPose | null, enterDuration = 1): CameraPose {
  "worklet";
  return evaluateCamera(scene.camera ?? {}, clock, (id, sample) => resolveAnchor(scene, id, sample), previous, enterDuration);
}
function focusDepth(value: number | string | undefined, scene: WorldScene | WorldSampleScene, clock: ClockSample, camera: CameraPose): number {
  "worklet";
  if (typeof value === "number") return Math.max(0.05, value);
  const anchor = value ? resolveAnchor(scene, value, clock) : camera.target;
  if (!anchor) return 18;
  const forward: Vec3 = [camera.target[0] - camera.position[0], camera.target[1] - camera.position[1], camera.target[2] - camera.position[2]];
  const length = Math.max(0.001, Math.hypot(...forward));
  return Math.max(0.05, ((anchor[0] - camera.position[0]) * forward[0] + (anchor[1] - camera.position[1]) * forward[1] + (anchor[2] - camera.position[2]) * forward[2]) / length);
}
export function sampleFocus(scene: PreparedWorldScene | WorldSampleScene, clock: ClockSample, camera: CameraPose): number {
  "worklet";
  const track = scene.focusTrack;
  if (!track) return focusDepth(cameraFocus(scene.camera ?? {}, clock), scene, clock, camera);
  return sampleTrack({ initial: focusDepth(track.initial, scene, clock, camera),
    frames: track.frames.map(frame => ({ ...frame, value: focusDepth(frame.value, scene, clock, camera) })) }, clock);
}
type UniformCache = { values: Float32Array<ArrayBuffer>; keys: Float64Array; labels: Float64Array;
  inputs: Float64Array; trackKeys: Float64Array; changed: Uint8Array };
type UniformInputs = { initial: Float32Array<ArrayBuffer>; inputs: number[];
  tracks: { track: Track<number | Vec3>; at: number; span: NonNullable<Instance["settle"]> }[];
  copies: { from: number; to: number; size: number }[];
  positions: { to: number; position: number; home?: Vec3; offset?: number; stages: number[]; end?: Vec3 }[];
  glows: { to: number; sources: number[] }[];
  drifts: { to: number; position: Vec3; drift: number; seed: number }[]; live: number[] };

function prepareUniformInputs(scene: PreparedWorldScene): UniformInputs {
  const initial = Float32Array.from(sampleWorldUniforms(scene, { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } }));
  const plan: UniformInputs = { initial, inputs: [], tracks: [], copies: [], positions: [], glows: [], drifts: [], live: [] };
  const sources = new Map<string, number>();
  function source(track: Track<number | Vec3>) {
    const key = JSON.stringify(track);
    let at = sources.get(key);
    if (at === undefined) {
      at = plan.inputs.length;
      sources.set(key, at);
      plan.inputs.push(...typeof track.initial === "number" ? [track.initial] : track.initial);
      if (track.frames.length) plan.tracks.push({ track, at, span: keyframeSpans([track]) });
    }
    return at;
  }
  function copy(track: Track<number | Vec3>, to: number) {
    if (track.frames.length) plan.copies.push({ from: source(track), to, size: typeof track.initial === "number" ? 1 : 3 });
  }
  scene.instances.forEach((instance, slot) => {
    if (instance.motion === "static") return;
    if (instance.motion === "drift") {
      plan.drifts.push({ to: worldHeaderSize + slot * worldInstanceSize, position: instancePosition({ ...instance, drift: 0 },
        { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } }), drift: instance.drift!, seed: instance.seed ?? 0 });
      return;
    }
    if (instance.motion !== "tracks" || instance.label) { plan.live.push(slot); return; }
    const at = worldHeaderSize + slot * worldInstanceSize, glyph = instance.glyph, stages = instance.stages ?? [];
    if ([instance.position, ...glyph ? [glyph.offset] : [], ...stages.map(stage => stage.position)].some(track => track.frames.length)) {
      plan.positions.push({ to: at, position: source(instance.position), home: glyph?.home, offset: glyph ? source(glyph.offset) : undefined,
        stages: stages.map(stage => source(stage.position)), end: glyph ? undefined : instance.end });
    }
    copy(instance.size, at + I.radius); copy(instance.scale, at + I.scale);
    if (instance.rotation) copy(instance.rotation, at + I.rotation);
    copy(instance.color, at + I.color);
    if ([instance.emissive, ...stages.map(stage => stage.glow)].some(track => track.frames.length)) {
      plan.glows.push({ to: at + I.emissive, sources: [source(instance.emissive), ...stages.map(stage => source(stage.glow))] });
    }
    const material = instance.materialTracks!;
    copy(instance.material ? material.albedo : instance.color, at + I.albedo);
    copy(material.roughness, at + I.roughness); copy(material.metal, at + I.metal); copy(material.rim, at + I.rim);
    if (glyph) { copy(glyph.opacity, at + I.opacity); copy(glyph.rotation, at + 12); }
    else if (instance.card?.opacity) copy(instance.card.opacity, at + I.opacity);
  });
  return plan;
}

/** Per-step keyframe spans of a set of tracks, for skipping instances whose tracks have all settled. */
export function keyframeSpans(tracks: Track<unknown>[]): NonNullable<Instance["settle"]> {
  const steps = new Map<number, [number, number]>(), at: number[] = [];
  for (const track of tracks) for (const frame of track.frames) {
    const duration = frame.loop ? Infinity : frame.duration ?? 0.65;
    if (frame.at !== undefined) { at.push(frame.at, frame.at + duration); continue; }
    const step = frame.step ?? 0, start = frame.delay ?? 0, span = steps.get(step);
    steps.set(step, span ? [Math.min(span[0], start), Math.max(span[1], start + duration)] : [start, start + duration]);
  }
  const order = [...steps.keys()].sort((a, b) => a - b);
  return { steps: order, first: order.map(step => steps.get(step)![0]), last: order.map(step => steps.get(step)![1]), at };
}
/** Cache key of a "tracks" instance: NaN while any keyframe can still be moving (mirrors sampleTrackFrames' frame selection),
 * else the last step with keyframes plus the number of finished spans, which changes whenever a settled value may have changed. */
export function settledKey(settle: NonNullable<Instance["settle"]>, clock: ClockSample) {
  "worklet";
  let finished = 0, settledStep = 0;
  for (let k = 0; k < settle.at.length; k += 2) {
    if (clock.slideTime >= settle.at[k + 1]) finished++;
    else if (clock.slideTime >= settle.at[k]) return NaN;
  }
  for (let k = 0; k < settle.steps.length; k++) {
    const step = settle.steps[k];
    if (step > clock.stepIndex) break;
    settledStep = step;
    const origin = clock.stepOrigins[step];
    if (origin === undefined && step < clock.stepIndex) { finished++; continue; }
    const elapsed = clock.slideTime - (origin ?? clock.slideTime - clock.stepTime);
    if (elapsed >= settle.last[k]) finished++;
    else if (elapsed >= settle.first[k]) return NaN;
  }
  return settledStep * 4096 + finished;
}
const I = instanceField;
function sampleUniformInputs(plan: UniformInputs, cache: UniformCache, clock: ClockSample) {
  "worklet";
  const inputs = cache.inputs, values = cache.values, changed = cache.changed;
  for (const { to, position, drift, seed } of plan.drifts) {
    values[to] = position[0] + Math.sin(clock.slideTime * 0.27 + seed) * drift;
    values[to + 1] = position[1] + Math.cos(clock.slideTime * 0.31 + seed * 2) * drift;
    values[to + 2] = position[2] + Math.sin(clock.slideTime * 0.19 + seed * 3) * drift;
  }
  changed.fill(0);
  for (let i = 0; i < plan.tracks.length; i++) {
    const { track, at, span } = plan.tracks[i], key = settledKey(span, clock);
    if (cache.trackKeys[i] === key) continue;
    cache.trackKeys[i] = key;
    const value = sampleTrack(track, clock);
    if (typeof value === "number") { changed[at] = Number(inputs[at] !== value); inputs[at] = value; }
    else for (let axis = 0; axis < 3; axis++) { changed[at] |= Number(inputs[at + axis] !== value[axis]); inputs[at + axis] = value[axis]; }
  }
  for (const { from, to, size } of plan.copies) if (changed[from]) for (let axis = 0; axis < size; axis++) values[to + axis] = inputs[from + axis];
  for (const { to, position, home, offset, stages, end } of plan.positions) {
    let moving = !!changed[position] || (offset !== undefined && !!changed[offset]);
    for (let i = 0; i < stages.length; i++) moving ||= !!changed[stages[i]];
    if (!moving) continue;
    for (let axis = 0; axis < 3; axis++) {
      let stage = 0;
      for (let i = 0; i < stages.length; i++) stage += inputs[stages[i] + axis];
      let value = inputs[position + axis];
      if (home) value = value + home[axis] + inputs[offset! + axis];
      values[to + axis] = value + stage;
      if (end) values[to + I.endpoint + axis] = end[axis] + stage;
    }
  }
  for (const { to, sources } of plan.glows) {
    let moving = false;
    for (let i = 0; i < sources.length; i++) moving ||= !!changed[sources[i]];
    if (!moving) continue;
    let value = inputs[sources[0]];
    for (let i = 1; i < sources.length; i++) value *= inputs[sources[i]];
    values[to] = value;
  }
}
export function sampleWorldUniforms(scene: PreparedWorldScene | WorldSampleScene, clock: ClockSample, previous?: CameraPose | null, enterDuration = 1, renderScale = 1, reuse = false): number[] | Float32Array<ArrayBuffer> {
  "worklet";
  const count = scene.instances.length;
  let cache: UniformCache | undefined;
  if (reuse || "lookupInstances" in scene) {
    const caches = (globalThis as { __worldUniforms?: WeakMap<PreparedWorldScene | WorldSampleScene, UniformCache> }).__worldUniforms ??= new WeakMap();
    cache = caches.get(scene);
    if (!cache) {
      cache = { values: new Float32Array(scene.uniformInputs.initial), keys: new Float64Array(count).fill(NaN), labels: new Float64Array(count).fill(NaN),
        inputs: Float64Array.from(scene.uniformInputs.inputs), trackKeys: new Float64Array(scene.uniformInputs.tracks.length).fill(NaN), changed: new Uint8Array(scene.uniformInputs.inputs.length) };
      caches.set(scene, cache);
    }
  }
  const values = cache?.values ?? new Array<number>(scene.uniformCount).fill(0);
  if (cache) sampleUniformInputs(scene.uniformInputs, cache, clock);
  const objects: Record<string, Vec3> = {};
  for (const instance of scene.instances) if (instance.anchor) objects[instance.id!] = instancePosition(instance as Instance, clock);
  values[worldClockOffset] = clock.slideTime; values[worldClockOffset + 1] = clock.stepTime; values[worldClockOffset + 2] = clock.stepIndex; values[worldClockOffset + 3] = clock.time ?? clock.slideTime;
  const camera = sampleWorldCamera(scene, clock, previous, enterDuration);
  values[0] = camera.position[0]; values[1] = camera.position[1]; values[2] = camera.position[2]; values[3] = Math.tan(camera.fov * Math.PI / 360);
  values[4] = camera.target[0]; values[5] = camera.target[1]; values[6] = camera.target[2]; values[7] = camera.roll;
  values[8] = sampleTrack(scene.exposureTrack, clock);
  for (const field of scene.postTracks) values[field.index] = sampleTrack(field.track, clock);
  values[17] = scene.scrim ?? 0;
  const fog = sampleTrack(scene.fogTrack, clock);
  values[20] = fog[0]; values[21] = fog[1]; values[22] = fog[2];
  values[32] = sampleFocus(scene, clock, camera);
  values[35] = renderScale;
  for (const field of scene.colorTracks) {
    const color = sampleTrack(field.track, clock);
    values[field.index] = color[0]; values[field.index + 1] = color[1]; values[field.index + 2] = color[2];
  }
  values[worldLightCountSlot] = scene.lightTracks.length;
  scene.lightTracks.forEach((light, index) => {
    const base = 64 + index * 12, position = sampleTrack(light.position, clock), color = sampleTrack(light.color, clock), target = sampleTrack(light.target, clock);
    const direction: Vec3 = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
    const length = Math.max(0.001, Math.hypot(...direction));
    for (let axis = 0; axis < 3; axis++) { values[base + axis] = position[axis]; values[base + 4 + axis] = color[axis]; values[base + 8 + axis] = direction[axis] / length; }
    values[base + 3] = sampleTrack(light.intensity, clock); values[base + 7] = sampleTrack(light.range, clock);
    values[base + 11] = light.spot ? Math.cos(sampleTrack(light.angle, clock)) : -1;
  });
  if (scene.counter) {
    values[53] = 1;
    values[56] = Math.round(voxelRemaining(scene.instances[scene.counterIndex!] as Instance, clock));
    values[57] = scene.counter.position?.[0] ?? 0.8; values[58] = scene.counter.position?.[1] ?? 0.12; values[59] = scene.counter.size ?? 0.07;
    const color = scene.counterColor!; values[60] = color[0]; values[61] = color[1]; values[62] = color[2];
  }
  const live = cache ? scene.uniformInputs.live : undefined;
  for (let slot = 0; slot < (live?.length ?? count); slot++) {
    const i = live ? live[slot] : slot;
    const instance = scene.instances[i] as Instance;
    if (cache) {
      const key = instance.motion === "voxel" ? collapseProgress(instance.voxel!.options.collapse, clock)
        : instance.motion === "tracks" ? settledKey(instance.settle!, clock)
        // Shaders discard transparent instances, so a hidden live instance (an idle tube pulse bead) is written once, then skipped.
        : instanceOpacity(instance, clock) * stageOpacity(instance.stages, clock) === 0 ? -1 : NaN;
      if (cache.keys[i] === key) continue;
      cache.keys[i] = key;
    }
    const index = worldHeaderSize + i * worldInstanceSize;
    const part = instance.choreography ? samplePartMotion(instance.choreography, clock) : undefined;
    if (instance.label) {
      const label = instance.label, position = instancePosition(instance, clock), color = part?.color ?? sampleTrack(instance.color, clock);
      values[index] = position[0]; values[index + 1] = position[1]; values[index + 2] = position[2]; values[index + 3] = sampleTrack(instance.size, clock) * (part ? Math.max(part.scale[0], part.scale[1]) : 1);
      values[index + 4] = color[0]; values[index + 5] = color[1]; values[index + 6] = color[2];
      let emissive = sampleTrack(instance.emissive, clock) * (label.parent?.rows ? 1 - 0.6 * rowOutside(label.parent, clock) : 1);
      for (const stage of instance.stages ?? []) emissive *= stageGlow(stage, clock);
      values[index + 7] = emissive;
      values[index + 23] = instanceOpacity(instance, clock) * stageOpacity(instance.stages, clock);
      const logical = label.row ? rowLabelLogical(instance, clock) : 0;
      if (!cache || cache.labels[i] !== logical) {
        if (cache) cache.labels[i] = logical;
        const text = label.row ? formatRowLabel(label.text, label.parent!.rows!.options.items, logical, label.parent!.rows!.slot) : label.text;
        values[index + 8] = labelWidth(text, label.mono, label.weight); values[index + 9] = Math.min(text.length, labelCapacity);
        values[index + 10] = label.align === "center" ? 0.5 : label.align === "right" ? 1 : 0; values[index + 11] = labelFace(label.mono, label.weight);
        packLabelText(text, values, index);
      }
      continue;
    }
    const position = instance.endpoints ? objects[instance.endpoints[0]] : instance.anchor ? objects[instance.id!] : instancePosition(instance, clock);
    const offset = stageOffset(instance.stages, clock);
    let endpoint = instance.pulse?.tail ? objects[instance.pulse.options.id] : instance.endpoints ? objects[instance.endpoints[1]]
      : !instance.stages?.length ? instance.end : [instance.end[0] + offset[0], instance.end[1] + offset[1], instance.end[2] + offset[2]];
    if (instance.route && !instance.route.pulse) {
      const route = instance.route, segment = route.segment!, drawn = sampleTrack(route.draw, clock) * route.lengths[route.lengths.length - 1];
      // Hidden segments still need a valid tangent in the tube vertex shader.
      const distance = drawn <= route.lengths[segment] ? route.lengths[segment + 1] : Math.min(route.lengths[segment + 1], drawn);
      const end = routePoint(route.points, route.lengths, distance);
      endpoint = [end[0] + offset[0], end[1] + offset[1], end[2] + offset[2]];
    }
    const baseScale = sampleTrack(instance.scale, clock);
    let scale: Vec3 = part ? [baseScale[0] * part.scale[0], baseScale[1] * part.scale[1], baseScale[2] * part.scale[2]] : baseScale;
    if (instance.pillar?.role === "body") {
      // A constant track returns the scene's own array; write a copy so the frozen scene stays shared.
      const pillar = instance.pillar;
      scale = [scale[0], Math.max(0.0001, pillar.height * Math.max(0, sampleTrack(pillar.value, clock) / pillar.maximum)), scale[2]];
    }
    if (part) {
      for (let axis = 0; axis < 3; axis++) values[index + I.rotation + axis] = part.rotation[axis];
      const end = instance.choreography!.endOffset;
      endpoint = [position[0] + end[0], position[1] + end[1], position[2] + end[2]];
    } else if (instance.burst) {
      const rotation = sampleBurst(instance.burst, clock).rotation;
      for (let axis = 0; axis < 3; axis++) values[index + I.rotation + axis] = rotation[axis];
    } else if (instance.rotation) {
      const rotation = sampleTrack(instance.rotation, clock);
      for (let axis = 0; axis < 3; axis++) values[index + I.rotation + axis] = rotation[axis];
    }
    let color = part?.color ?? sampleTrack(instance.color, clock);
    const activation = instance.graph ? activationAt(instance.graph.node, instance.graph.nodes, instance.graph.activate, clock) : 1;
    const dim = instance.graph?.dim ?? color;
    values[index + I.position] = position[0]; values[index + I.position + 1] = position[1]; values[index + I.position + 2] = position[2];
    values[index + I.radius] = sampleTrack(instance.size, clock) * (instance.voxel ? instanceOpacity(instance, clock) : 1);
    let emissive = sampleTrack(instance.emissive, clock) * activation;
    if (instance.pulse?.tail) emissive *= 0.3;
    if (instance.rows && !instance.rows.ghost) {
      const highlight = rowHighlight(instance, clock);
      if (highlight.changed) { color = instance.rows.flashColor; emissive += 0.5 + highlight.flash * 4; }
      else if (highlight.dimmed) color = mixVector(color, [0, 0, 0], 0.8);
    }
    if (instance.rows?.recycleColor) {
      const glow = recycleGlow(instance, clock), outside = rowOutside(instance, clock);
      color = mixVector(mixVector(color, [0, 0, 0], 0.55 * outside), instance.rows.recycleColor, glow);
      emissive = emissive * (1 - 0.6 * outside) + glow * (instance.rows.ghost ? 0.5 : 0.35) * (instance.rows.options.recycle?.glow ?? 1);
    }
    for (const stage of instance.stages ?? []) emissive *= stageGlow(stage, clock);
    values[index + I.color] = dim[0] + (color[0] - dim[0]) * activation;
    values[index + I.color + 1] = dim[1] + (color[1] - dim[1]) * activation;
    values[index + I.color + 2] = dim[2] + (color[2] - dim[2]) * activation;
    values[index + I.emissive] = emissive;
    values[index + I.scale] = scale[0]; values[index + I.scale + 1] = scale[1]; values[index + I.scale + 2] = scale[2];
    values[index + I.endpoint] = endpoint[0]; values[index + I.endpoint + 1] = endpoint[1]; values[index + I.endpoint + 2] = endpoint[2];
    let curve = instance.curve;
    if (instance.pulse?.tail) {
      const pulse = instance.pulse, range = pulseRange(pulse, clock);
      const from = instancePosition(pulse.anchors[range.segment], clock), to = instancePosition(pulse.anchors[range.segment + 1], clock);
      const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      const chord = Math.hypot(endpoint[0] - position[0], endpoint[1] - position[1], endpoint[2] - position[2]);
      curve = chord > 0 ? length * pulse.curves[range.segment] * Math.pow(range.head - range.tail, 2) / chord : 0;
    }
    values[index + I.curve] = curve; values[index + I.thickness] = instance.thickness;
    if (instance.card) { values[index + 11] = instance.card.radius; values[index + 16] = instance.card.glow; values[index + 17] = instance.card.edge; values[index + 18] = instance.card.avatar; values[index + I.thickness] = instance.card.fill; values[index + 15] = instance.card.line; }
    values[index + I.opacity] = instanceOpacity(instance, clock) * stageOpacity(instance.stages, clock);
    const material = instance.materialTracks!;
    if (instance.material) {
      const sampledAlbedo = part?.color && !("glyph" in instance) ? part.color : sampleTrack(material.albedo, clock);
      const albedo = instance.graph ? mixVector(dim, sampledAlbedo, activation) : sampledAlbedo;
      values[index + I.albedo] = albedo[0]; values[index + I.albedo + 1] = albedo[1]; values[index + I.albedo + 2] = albedo[2];
    } else { values[index + I.albedo] = values[index + I.color]; values[index + I.albedo + 1] = values[index + I.color + 1]; values[index + I.albedo + 2] = values[index + I.color + 2]; }
    values[index + I.roughness] = sampleTrack(material.roughness, clock); values[index + I.metal] = sampleTrack(material.metal, clock); values[index + I.rim] = sampleTrack(material.rim, clock) * activation;
    values[index + I.activation] = activation;
    if (instance.glyph) {
      const glyph = instance.glyph, rotation = sampleTrack(glyph.rotation, clock);
      values[index + 11] = glyph.index; values[index + 12] = rotation[0]; values[index + 13] = rotation[1]; values[index + 14] = rotation[2];
      values[index + 15] = glyph.pivot[1]; values[index + 16] = glyph.depth; values[index + 17] = glyph.bevel; values[index + 18] = glyph.bevelWidth; values[index + 19] = glyph.pivot[0];
    }
    values[index + I.geometry] = instance.card?.flat ? 1 : instance.choreography && instance.customIndex !== undefined ? instance.customIndex + 1 : 0;
    // Text3D's published instance layout stores its local Euler degrees in fields 12–14.
    // Keep this after shape-specific fields so the glyph and rigid pose compose once.
    if (part && "glyph" in instance) {
      const rotation = composePartRotation([values[index + 12], values[index + 13], values[index + 14]], part.rotation);
      for (let axis = 0; axis < 3; axis++) values[index + 12 + axis] = rotation[axis];
    }
  }
  for (let i = 0; i < count; i++) {
    const instance = scene.instances[i];
    const sharp = instance.sharp;
    values[worldHeaderSize + i * worldInstanceSize + I.sharp] = sharp ? sampleTrack(sharp, clock) : -1;
  }
  return values;
}

export type PreparedWorldScene = WorldScene & { exposureTrack: Track<number>; fogTrack: Track<Vec3>; backgroundVector: Vec3;
  uniformInputs: UniformInputs;
  postTracks: { index: number; track: Track<number> }[]; colorTracks: { index: number; track: Track<Vec3> }[];
  focusTrack?: Track<number | string>; counterColor?: Vec3; counterIndex?: number;
  /** Each effect's params occupy `size` floats from `base`, after the instances; `uniformCount` covers them. */
  effectUses: (WorldEffectUse & { before?: WorldEffectStage; after?: WorldEffectStage; base: number })[]; uniformCount: number;
  lightTracks: { position: Track<Vec3>; target: Track<Vec3>; color: Track<Vec3>; intensity: Track<number>; range: Track<number>; angle: Track<number>; spot: boolean }[] };
export type WorldSampleScene = Omit<PreparedWorldScene, "instances"> & {
  instances: (Instance | Pick<Instance, "sharp" | "anchor" | "id">)[]; lookupInstances: Instance[];
};
const samples = new WeakMap<PreparedWorldScene, WorldSampleScene>();
const bakedInstance: Pick<Instance, "sharp" | "anchor" | "id"> = {};
/** Baked uniform slots need no instance data on UI; retain live sampling and declared camera/focus anchors. */
export function prepareWorldSample(scene: PreparedWorldScene): WorldSampleScene {
  const cached = samples.get(scene);
  if (cached) return cached;
  const references = new Set<string>();
  const remember = (value: unknown) => { if (typeof value === "string") references.add(value); };
  for (const shot of scene.camera?.shots ?? []) { remember(shot.follow); remember(shot.focus); }
  remember(scene.focusTrack?.initial);
  function focusFrames(frames: Keyframe<number | string>[]) {
    for (const frame of frames) { remember(frame.value); if (frame.loop) focusFrames(frame.loop.frames); }
  }
  focusFrames(scene.focusTrack?.frames ?? []);
  const ids = [...references], keep = new Set(scene.uniformInputs.live);
  if (scene.counterIndex !== undefined) keep.add(scene.counterIndex);
  const lookupInstances = scene.instances.filter(instance => ids.some(id => instance.id === id || instance.id === `node:${id}`
    || instance.voxel?.options.id === id || instance.rows && id.startsWith(`${instance.rows.options.id}:row:`)));
  const sample = { ...scene, lookupInstances, instances: scene.instances.map((instance, index) => keep.has(index) || instance.anchor ? instance
    : instance.sharp ? { sharp: instance.sharp } : bakedInstance) };
  samples.set(scene, sample);
  return sample;
}
function keyLightFields({ keyLight: key, environment }: WorldScene): [number, Animated<number>][] {
  return [[115, key ? key.intensity ?? 2.2 : 0], [119, key?.shadowSize ?? 20], [123, key?.softness ?? 2], [124, environment ? environment.intensity ?? 1 : 0], [125, key?.shadowStrength ?? 0.85]];
}
/** Key position and target share the color-track sampler: both are plain vectors. */
function keyLightVectors({ keyLight: key }: WorldScene): { index: number; track: Track<Vec3> }[] {
  if (!key) return [];
  return [{ index: 112, track: compileTrack<Vec3>(key.position ?? [6, 16, 12]) }, { index: 116, track: compileTrack(key.color ?? "#ffffff", colorVector) },
    { index: 120, track: compileTrack<Vec3>(key.target ?? [0, 0, 0]) }];
}
export function prepareWorldScene(scene: WorldScene): PreparedWorldScene {
  if ((scene.lights?.length ?? 0) > 4) throw new Error("World supports at most four point or spot lights");
  for (const effect of [scene.bloom, scene.dof, scene.shafts]) if (effect) {
    if (effect.scale !== undefined && (!Number.isFinite(effect.scale) || effect.scale <= 0 || effect.scale > 1)) throw new Error("World effect scale must be greater than zero and at most one");
    if ("samples" in effect && effect.samples !== undefined && (!Number.isInteger(effect.samples) || effect.samples < 1 || effect.samples > 64)) throw new Error("World effect samples must be an integer between one and 64");
  }
  const ids = new Set<string>();
  for (const instance of scene.instances) if (instance.id) {
    if (ids.has(instance.id)) throw new Error(`World instance id is duplicated: ${instance.id}. Give each instance or orb field a unique id.`);
    ids.add(instance.id);
  }
  // Prepared tracks are immutable; equal constants need only one UI serialization.
  const constants = new Map<number | string, Track<number | Vec3>>();
  function constant<T extends number | Vec3>(track: Track<T>): Track<T> {
    if (track.frames.length) return track;
    const value = track.initial;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Object.is(value, -0)) return track;
    } else if (value.some(n => !Number.isFinite(n) || Object.is(n, -0))) return track;
    const key = typeof value === "number" ? value : value.join(",");
    const cached = constants.get(key);
    if (cached) return cached as Track<T>;
    constants.set(key, track);
    return track;
  }
  const instances: Instance[] = scene.instances.map(instance => {
    const material = typeof instance.material === "string" ? scene.materials?.[instance.material] : instance.material;
    if (typeof instance.material === "string" && !material) throw new Error(`Unknown world material: ${instance.material}`);
    const color = constant(instance.color);
    return { ...instance, position: constant(instance.position), size: constant(instance.size), color, scale: constant(instance.scale),
      rotation: instance.rotation && constant(instance.rotation), sharp: instance.sharp && constant(instance.sharp),
      emissive: constant(material?.emissive === undefined ? instance.emissive : compileTrack(material.emissive)), materialTracks: {
      albedo: material?.albedo === undefined ? color : constant(compileTrack(material.albedo, colorVector)), roughness: constant(compileTrack(material?.roughness ?? 0.5)),
      metal: constant(compileTrack(material?.metal ?? 0)), rim: constant(compileTrack(material?.rim ?? 1)),
    } };
  });
  const byId = new Map(instances.filter(instance => instance.id).map(instance => [instance.id!, instance]));
  for (const instance of instances) {
    if (instance.pulse) {
      const anchors = instance.pulse.options.path.map(point => {
        if (typeof point !== "string") return { ...primitive("sphere", { position: point }), stages: instance.stages };
        const anchor = byId.get(point) ?? byId.get(`node:${point}`);
        if (!anchor) throw new Error(`Unknown world pulse anchor: ${point}`);
        return anchor;
      });
      const curves = anchors.slice(1).map((target, index) => instances.find(edge =>
        edge.endpoints?.[0] === anchors[index].id && edge.endpoints?.[1] === target.id ||
        edge.endpoints?.[1] === anchors[index].id && edge.endpoints?.[0] === target.id)?.curve ?? 0);
      instance.pulse = { ...instance.pulse, anchors, curves };
    }
    const parentId = instance.label?.attach ?? instance.label?.parent?.id;
    if (parentId) {
      const parent = byId.get(parentId);
      if (!parent) throw new Error(`Unknown world label parent: ${parentId}`);
      instance.label = { ...instance.label!, parent };
    }
    if (instance.spray) {
      const under = instance.spray.options.under;
      const sources = under === "leaves:lit" ? instances.filter(item => item.kind === "sphere" && item.graph &&
        !item.graph.nodes.some(node => node.parent === item.graph!.node.id)) : under ? [byId.get(under) ?? byId.get(`node:${under}`)].filter((item): item is typeof instances[number] => !!item) : [];
      if (under && sources.length === 0) throw new Error(`Unknown world spray source: ${under}`);
      // Keep only the source this particle samples; serializing every candidate per particle multiplies the scene copied to the UI.
      instance.spray = { ...instance.spray, source: sources[Math.floor(instance.spray.phase * sources.length) % sources.length] };
    }
  }
  const visiting = new Set<Instance>(), visited = new Set<Instance>();
  function verifyAnchors(instance: Instance) {
    if (visiting.has(instance)) throw new Error("World motion anchors cannot form a cycle");
    if (visited.has(instance)) return;
    visiting.add(instance);
    for (const anchor of instance.pulse?.anchors ?? (instance.spray?.source ? [instance.spray.source] : instance.label?.parent ? [instance.label.parent] : [])) verifyAnchors(anchor);
    visiting.delete(instance); visited.add(instance);
  }
  instances.forEach(verifyAnchors);
  for (const instance of instances) instance.sharp = instance.stages?.find(stage => stage.sharp)?.sharp ?? instance.sharp ?? instance.label?.parent?.sharp;
  if (scene.counter && !instances.some(instance => instance.voxel?.options.id === scene.counter!.source)) throw new Error(`Unknown world counter source: ${scene.counter.source}`);
  const order = (instance: Instance) => instance.label ? "3" : instance.card ? "2c" : instance.glyph ? `1g:${instance.glyph.font}:${instance.glyph.segments}` : instance.custom ? customGeometryKeys(instance.custom).order
    : instance.sdf ? `2:${instance.sdf.wgsl}` : `0:${instance.kind}`;
  instances.sort((a, b) => { const x = order(a), y = order(b); return x === y ? 0 : x < y ? -1 : 1; });
  const anchorIds = new Set(instances.flatMap(instance => [...instance.endpoints ?? [], ...instance.pulse?.tail ? [instance.pulse.options.id] : []]));
  const still = (track: Track<unknown>) => track.frames.length === 0;
  for (const instance of instances) {
    if (instance.id && anchorIds.has(instance.id)) instance.anchor = true;
    const material = instance.materialTracks!;
    if ([instance.position, instance.size, instance.color, instance.emissive, instance.scale, ...instance.rotation ? [instance.rotation] : [], material.albedo, material.roughness, material.metal, material.rim].every(still) &&
      (!instance.label || still(instance.label.offset) && still(instance.label.opacity) && !instance.label.parent) &&
      (!instance.glyph || still(instance.glyph.offset) && still(instance.glyph.rotation) && still(instance.glyph.opacity)) &&
      (!instance.card?.opacity || still(instance.card.opacity)) &&
      (instance.stages ?? []).every(stage => still(stage.position) && still(stage.glow) && !stage.opacity && !stage.wave) &&
      !instance.choreography && !instance.burst && !instance.route && !instance.pillar && !instance.pulse && !instance.spray && !instance.rows && !instance.graph && !instance.endpoints) {
      const collapses = !!instance.voxel?.options.collapse;
      if (!instance.drift) instance.motion = collapses ? "voxel" : "static";
      else if (!collapses) instance.motion = "drift";
    }
    else if (!instance.choreography && !instance.burst && !instance.route && !instance.pillar && !instance.drift && !instance.pulse && !instance.spray && !instance.rows && !instance.graph &&
      !instance.endpoints && !instance.voxel && !instance.label?.parent && !instance.label?.attach && !instance.anchor && !instance.stages?.some(stage => stage.wave || stage.opacity)) {
      instance.motion = "tracks";
      instance.settle = keyframeSpans([instance.position, instance.size, instance.color, instance.emissive, instance.scale, ...instance.rotation ? [instance.rotation] : [], material.albedo, material.roughness, material.metal, material.rim,
        ...instance.label ? [instance.label.offset, instance.label.opacity] : [], ...instance.glyph ? [instance.glyph.offset, instance.glyph.rotation, instance.glyph.opacity] : [],
        ...instance.card?.opacity ? [instance.card.opacity] : [],
        ...(instance.stages ?? []).flatMap(stage => [stage.position, stage.glow])]);
    }
  }
  const fields: [number, Animated<number>][] = [[18, scene.emissiveScale ?? 1], [19, scene.floor?.emissive ?? 0], [9, scene.bloom?.intensity ?? 0], [10, scene.bloom?.threshold ?? 1], [11, scene.bloom?.radius ?? 0.8],
    [12, scene.fog?.density ?? 0], [13, scene.fog?.height ?? 0], [14, scene.fog?.falloff ?? 0.15], [15, scene.vignette ?? 0.25], [16, scene.grain ?? 0.015],
    [54, scene.dof?.focusRange ?? 0], [33, scene.dof ? scene.dof.aperture ?? 0.6 : 0], [34, scene.dof?.maxBlur ?? 12], [36, scene.floor?.y ?? -5], [37, scene.floor?.roughness ?? 0.06],
    [39, scene.floor?.size ?? 40], [43, scene.floor?.metal ?? 0.8], [44, scene.chromatic ?? 0],
    [45, scene.shafts?.intensity ?? 0], [46, scene.shafts?.density ?? 0.03], [47, scene.shafts?.anisotropy ?? 0.3], [51, scene.rim ? scene.rim.intensity ?? 0.8 : 0], [52, scene.ambient ?? 0.12],
    ...keyLightFields(scene)];
  const colorTracks = [{ index: 40, track: compileTrack(scene.floor?.color ?? "#101827", colorVector) }, { index: 48, track: compileTrack(scene.rim?.color ?? "#ffffff", colorVector) },
    ...keyLightVectors(scene)];
  let uniformCount = worldHeaderSize + instances.length * worldInstanceSize;
  const effectUses = (scene.effects ?? []).map(({ use, before, after }) => {
    const effect = worldEffect(use.effect), base = uniformCount;
    for (const [key, offset] of Object.entries(effect.offsets)) {
      if (effect.definition.params[key].type === "vec3f") colorTracks.push({ index: base + offset, track: compileTrack(use.values[key] as Animated<Vec3 | string>, value => typeof value === "string" ? colorVector(value) : value) });
      else fields.push([base + offset, use.values[key] as Animated<number>]);
    }
    uniformCount += effect.size;
    return { ...use, before, after, base };
  });
  const prepared = { ...scene, instances, exposureTrack: compileTrack(scene.exposure ?? 1), fogTrack: compileTrack(scene.fog?.color ?? scene.backgroundColor ?? "#05060a", colorVector),
    backgroundVector: colorVector(scene.backgroundColor ?? "#05060a"), postTracks: fields.map(([index, value]) => ({ index, track: compileTrack(value) })),
    focusTrack: scene.dof?.focus === undefined ? undefined : compileTrack<number | string>(scene.dof.focus),
    colorTracks, effectUses, uniformCount,
    counterColor: scene.counter ? colorVector(scene.counter.color ?? "#ffffff") : undefined,
    counterIndex: scene.counter ? instances.findIndex(instance => instance.voxel?.options.id === scene.counter!.source) : undefined,
    lightTracks: (scene.lights ?? []).map(light => ({ position: compileTrack<Vec3>(light.position ?? [0, 8, 0]), target: compileTrack<Vec3>(light.target ?? [0, 0, 0]),
      color: compileTrack(light.color ?? "#ffffff", colorVector), intensity: compileTrack(light.intensity ?? 4), range: compileTrack(light.range ?? 25),
      angle: compileTrack(light.angle ?? 0.45), spot: light.kind === "spot" })),
  } as PreparedWorldScene;
  prepared.uniformInputs = prepareUniformInputs(prepared);
  return prepared;
}
