import { clockAtTime, easeProgress, evaluateCamera, mixVector, type CameraOptions, type CameraPose, type ClockSample, type Ease, type Vec3 } from "./camera";
import { activationAt, layoutTree, type Activation, type LayoutNode, type TreeNode } from "./graph";

export type Keyframe<T> = { step?: number; at?: number; value: T; duration?: number; ease?: Ease };
export type Animated<T> = T | Record<number, T> | Keyframe<T>[];
export type PrimitiveKind = "sphere" | "box" | "tube" | "ring";
type Track<T> = { initial: T; frames: Keyframe<T>[] };
export type PrimitiveOptions = {
  id?: string; position?: Animated<Vec3>; size?: Animated<number>; color?: Animated<string>;
  emissive?: Animated<number>; scale?: Animated<Vec3>; end?: Vec3; curve?: number; thickness?: number;
};
export type Instance = {
  id?: string; kind: PrimitiveKind; position: Track<Vec3>; size: Track<number>; color: Track<Vec3>;
  emissive: Track<number>; scale: Track<Vec3>; end: Vec3; curve: number; thickness: number;
  drift?: number; seed?: number;
  endpoints?: [string, string];
  graph?: { node: LayoutNode; nodes: LayoutNode[]; activate: Activation[]; dim: Vec3 };
};
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
  camera?: CameraOptions; instances: Instance[]; exposure?: Animated<number>; quality?: "auto" | "low" | "medium" | "high";
  backgroundColor?: string; fog?: { density?: Animated<number>; color?: Animated<string>; height?: Animated<number>; falloff?: Animated<number> };
  bloom?: { intensity?: Animated<number>; threshold?: Animated<number>; radius?: Animated<number> }; vignette?: Animated<number>; grain?: Animated<number>; scrim?: number;
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
  return { initial: transform(frames[0].value), frames: frames.map(frame => ({ ...frame, value: transform(frame.value) })) };
}
function sampleTrackFrames<T extends number | Vec3>(track: Track<T>, clock: ClockSample, count: number): T {
  "worklet";
  let index = -1;
  for (let i = 0; i < count; i++) if (track.frames[i].at !== undefined ? clock.slideTime >= track.frames[i].at! : clock.stepIndex >= (track.frames[i].step ?? 0)) index = i;
  if (index < 0) return track.initial;
  const frame = track.frames[index];
  const origin = frame.at ?? clock.stepOrigins[frame.step ?? 0] ?? clock.slideTime - clock.stepTime;
  const value = sampleTrackFrames(track, clockAtTime(clock, origin), index);
  const elapsed = Math.max(0, clock.slideTime - origin);
  const completed = frame.at === undefined && (frame.step ?? 0) < clock.stepIndex && clock.stepOrigins[frame.step ?? 0] === undefined;
  const t = completed ? 1 : easeProgress((frame.duration ?? 0.65) <= 0 ? 1 : elapsed / (frame.duration ?? 0.65), frame.ease);
  return (typeof value === "number" ? value + ((frame.value as number) - value) * t : mixVector(value, frame.value as Vec3, t)) as T;
}
export function sampleTrack<T extends number | Vec3>(track: Track<T>, clock: ClockSample): T {
  "worklet";
  return sampleTrackFrames(track, clock, track.frames.length);
}
export function primitive(kind: PrimitiveKind, options: PrimitiveOptions = {}): Instance {
  return { id: options.id, kind, position: compileTrack<Vec3>(options.position ?? [0, 0, 0]), size: compileTrack(options.size ?? 0.5),
    color: compileTrack(options.color ?? "#22d3ee", colorVector), emissive: compileTrack(options.emissive ?? 1.5),
    scale: compileTrack<Vec3>(options.scale ?? [1, 1, 1]), end: options.end ?? [0, 2, 0], curve: options.curve ?? 0,
    thickness: options.thickness ?? (kind === "ring" ? 0.04 : 0.025) };
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

export const worldHeaderSize = 32;
export const worldInstanceSize = 24;
export function instancePosition(instance: Instance, clock: ClockSample): Vec3 {
  "worklet";
  const position = sampleTrack(instance.position, clock);
  const drift = instance.drift ?? 0, seed = instance.seed ?? 0;
  return [position[0] + Math.sin(clock.slideTime * 0.27 + seed) * drift,
    position[1] + Math.cos(clock.slideTime * 0.31 + seed * 2) * drift,
    position[2] + Math.sin(clock.slideTime * 0.19 + seed * 3) * drift];
}
export function sampleWorldCamera(scene: WorldScene, clock: ClockSample, previous?: CameraPose | null, enterDuration = 1): CameraPose {
  "worklet";
  return evaluateCamera(scene.camera ?? {}, clock, (id, sample) => {
    const instance = scene.instances.find(instance => instance.id === id);
    return instance ? instancePosition(instance, sample) : undefined;
  }, previous, enterDuration);
}
export function sampleWorldUniforms(scene: PreparedWorldScene, clock: ClockSample, previous?: CameraPose | null, enterDuration = 1): number[] {
  "worklet";
  const values = new Array<number>(worldHeaderSize + scene.instances.length * worldInstanceSize).fill(0);
  const objects: Record<string, Vec3> = {};
  for (const instance of scene.instances) if (instance.id) objects[instance.id] = instancePosition(instance, clock);
  const camera = sampleWorldCamera(scene, clock, previous, enterDuration);
  values[0] = camera.position[0]; values[1] = camera.position[1]; values[2] = camera.position[2]; values[3] = Math.tan(camera.fov * Math.PI / 360);
  values[4] = camera.target[0]; values[5] = camera.target[1]; values[6] = camera.target[2]; values[7] = camera.roll;
  values[8] = sampleTrack(scene.exposureTrack, clock);
  for (const field of scene.postTracks) values[field.index] = sampleTrack(field.track, clock);
  values[17] = scene.scrim ?? 0;
  const fog = sampleTrack(scene.fogTrack, clock);
  values[20] = fog[0]; values[21] = fog[1]; values[22] = fog[2];
  for (let i = 0; i < scene.instances.length; i++) {
    const instance = scene.instances[i];
    const index = worldHeaderSize + i * worldInstanceSize;
    const position = instance.endpoints ? objects[instance.endpoints[0]] : instance.id ? objects[instance.id] : instancePosition(instance, clock);
    const endpoint = instance.endpoints ? objects[instance.endpoints[1]] : instance.end;
    const scale = sampleTrack(instance.scale, clock);
    const color = sampleTrack(instance.color, clock);
    const activation = instance.graph ? activationAt(instance.graph.node, instance.graph.nodes, instance.graph.activate, clock) : 1;
    const dim = instance.graph?.dim ?? color;
    values[index] = position[0]; values[index + 1] = position[1]; values[index + 2] = position[2];
    values[index + 3] = sampleTrack(instance.size, clock);
    values[index + 4] = dim[0] + (color[0] - dim[0]) * activation;
    values[index + 5] = dim[1] + (color[1] - dim[1]) * activation;
    values[index + 6] = dim[2] + (color[2] - dim[2]) * activation;
    values[index + 7] = sampleTrack(instance.emissive, clock) * activation;
    values[index + 8] = scale[0]; values[index + 9] = scale[1]; values[index + 10] = scale[2];
    values[index + 12] = endpoint[0]; values[index + 13] = endpoint[1]; values[index + 14] = endpoint[2];
    values[index + 15] = instance.curve; values[index + 19] = instance.thickness;
  }
  return values;
}

export type PreparedWorldScene = WorldScene & { exposureTrack: Track<number>; fogTrack: Track<Vec3>; backgroundVector: Vec3; postTracks: { index: number; track: Track<number> }[] };
export function prepareWorldScene(scene: WorldScene): PreparedWorldScene {
  const ids = new Set<string>();
  for (const instance of scene.instances) if (instance.id) {
    if (ids.has(instance.id)) throw new Error(`World instance id is duplicated: ${instance.id}. Give each instance or orb field a unique id.`);
    ids.add(instance.id);
  }
  const instances = [...scene.instances].sort((a, b) => a.kind.localeCompare(b.kind));
  const fields: [number, Animated<number>][] = [[9, scene.bloom?.intensity ?? 0], [10, scene.bloom?.threshold ?? 1], [11, scene.bloom?.radius ?? 0.8],
    [12, scene.fog?.density ?? 0], [13, scene.fog?.height ?? 0], [14, scene.fog?.falloff ?? 0.15], [15, scene.vignette ?? 0.25], [16, scene.grain ?? 0.015]];
  return { ...scene, instances, exposureTrack: compileTrack(scene.exposure ?? 1), fogTrack: compileTrack(scene.fog?.color ?? scene.backgroundColor ?? "#05060a", colorVector),
    backgroundVector: colorVector(scene.backgroundColor ?? "#05060a"), postTracks: fields.map(([index, value]) => ({ index, track: compileTrack(value) })) };
}
