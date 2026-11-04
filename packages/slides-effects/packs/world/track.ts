import type { PlaybackState } from "@legend-apps/presentation";
import { easeProgress, type CameraPose, type Vec3 } from "./camera";
import { prepareWorldScene, worldHeaderSize, worldInstanceSize, type PreparedWorldScene } from "./scene";

/** How matched parts fly between poses: `lift` and `spread` bow the path, `spin` tumbles it, `stagger` is the share of the move spent waiting. */
export type WorldCarry = { lift?: number; spread?: number; spin?: number; stagger?: number };
/** Camera points are local to the incoming station; via points are quadratic controls.
 * `frame: "world"` authors parts and lights in fixed world coordinates, so slides can share one retained scene. */
export type WorldTrack = {
  spacing?: number; duration?: number;
  position?: Vec3; target?: Vec3; via?: Vec3; viaTarget?: Vec3;
  frame?: "station" | "world"; carry?: WorldCarry;
  /** Raw part-id prefixes that use fixed world coordinates inside a station-frame scene. */
  fixed?: string[];
  /** Peak rail banking in degrees. Signed values choose the lean; stations always hold level. */
  bank?: number;
  /** Camera moves within the station, by local step index. */
  steps?: Record<number, WorldStepCamera>;
};
/** Orbits the station camera `orbit` degrees about its target, scales its distance by `dolly`, moves both by `shift` and sets `fov`, over `duration` seconds. */
export type WorldStepCamera = { orbit?: number; dolly?: number; shift?: Vec3; fov?: number; duration?: number };
type Station = { offset: number; track: WorldTrack; step?: WorldStepCamera };
export type TrackFrame = {
  key: string; slideKey: string; stepIndex: number; origin: number; cursor: number; morphDuration: number;
  reversed: boolean; carry?: WorldCarry; moving: number[]; seeds: number[]; output?: Float32Array;
  stations: Record<number, Station>; ids: string[]; declared: string[]; declaredSlots: boolean[]; fixedSlots: boolean[];
  visible: string[]; retiredVisible: string[];
  from: number[]; sources: number[]; retired: Record<string, number[]>; values: number[];
  /** The live camera minus the step pose when the move began (position, tan half-fov, target); it fades out over the move. */
  cameraDelta?: number[]; entering?: boolean;
};

export function createTrackFrame(): TrackFrame {
  "worklet";
  return { key: "", slideKey: "", stepIndex: 0, origin: 0, cursor: 0, morphDuration: 0, reversed: false, moving: [], seeds: [],
    stations: {}, ids: [], declared: [], declaredSlots: [], fixedSlots: [], visible: [], retiredVisible: [], from: [], sources: [], retired: {}, values: [] };
}

/** Geometry families are matched separately: packed label data must never become mesh data. */
export function trackIds(scene: PreparedWorldScene): string[] {
  return scene.instances.map(part => `${part.label ? "label" : part.card ? "card" : part.glyph ? "glyph" : part.kind}:${part.id ?? ""}`);
}

/** Keep draw descriptors so an omitted object can remain visible, then return on reverse.
 * Keep the previous declaration plus older parts still visible in the live frame. */
export function retainTrackScene(scene: PreparedWorldScene, previous: PreparedWorldScene, declared = previous, visible: string[] = []): PreparedWorldScene {
  const ids = new Set(trackIds(scene)), oldIds = trackIds(previous), last = new Set([...trackIds(declared), ...visible]);
  const omitted = previous.instances.filter((part, index) => part.id && !ids.has(oldIds[index]) && last.has(oldIds[index]));
  return omitted.length ? prepareWorldScene({ ...scene, instances: [...scene.instances, ...omitted] }) : scene;
}

function quadratic(a: Vec3, control: Vec3, b: Vec3, t: number): Vec3 {
  "worklet";
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
    u * u * a[2] + 2 * u * t * control[2] + t * t * b[2]];
}
function stationAt(stations: Record<number, Station>, index: number, spacing: number): Station {
  "worklet";
  return stations[index] ?? { offset: index * spacing, track: {} };
}
function worldPoint(point: Vec3, offset: number): Vec3 {
  "worklet";
  return [point[0], point[1], point[2] - offset];
}
function stepCamera(pose: CameraPose, step: WorldStepCamera | undefined): CameraPose {
  "worklet";
  if (!step) return pose;
  const angle = (step.orbit ?? 0) * Math.PI / 180, scale = step.dolly ?? 1, shift = step.shift ?? [0, 0, 0];
  const dx = pose.position[0] - pose.target[0], dy = pose.position[1] - pose.target[1], dz = pose.position[2] - pose.target[2];
  const target: Vec3 = [pose.target[0] + shift[0], pose.target[1] + shift[1], pose.target[2] + shift[2]];
  return { position: [target[0] + (dx * Math.cos(angle) + dz * Math.sin(angle)) * scale, target[1] + dy * scale, target[2] + (dz * Math.cos(angle) - dx * Math.sin(angle)) * scale],
    target, fov: step.fov ?? pose.fov, roll: pose.roll };
}


/** The rail is sampled by station coordinate, so reversing retraces the same curve. */
function sampleTrackCamera(stations: Record<number, Station>, cursor: number, spacing: number): CameraPose {
  "worklet";
  const endIndex = Math.max(1, Math.ceil(cursor)), t = cursor - (endIndex - 1);
  const start = stationAt(stations, endIndex - 1, spacing), end = stationAt(stations, endIndex, spacing);
  const a = { position: worldPoint(start.track.position ?? [0, 3.6, 14], start.offset), target: worldPoint(start.track.target ?? [0, 0, 0], start.offset), fov: 40, roll: 0 };
  const b = { position: worldPoint(end.track.position ?? [0, 3.6, 14], end.offset), target: worldPoint(end.track.target ?? [0, 0, 0], end.offset), fov: 40, roll: 0 };
  const position = quadratic(a.position,
    worldPoint(end.track.via ?? [2.5, 5.5, (end.offset - start.offset) * 0.6875], end.offset),
    b.position, t);
  const target = quadratic(a.target,
    worldPoint(end.track.viaTarget ?? [0, 0, (end.offset - start.offset) * 0.3125], end.offset),
    b.target, t);
  const from = stepCamera(a, start.step), to = stepCamera(b, end.step);
  // A held step pose belongs to the station, so Previous follows the same unwind in reverse.
  const leave = 1 - easeProgress(t / .125, "cubic"), arrive = 1 - easeProgress((1 - t) / .125, "cubic");
  for (let axis = 0; axis < 3; axis++) {
    // Depth keeps the rail's progress; unwinding it early could pull backward at takeoff.
    const u = axis === 2 ? 1 - t : leave, v = axis === 2 ? t : arrive;
    position[axis] += (from.position[axis] - a.position[axis]) * u + (to.position[axis] - b.position[axis]) * v;
    target[axis] += (from.target[axis] - a.target[axis]) * u + (to.target[axis] - b.target[axis]) * v;
  }
  return { position, target, fov: 40 + (from.fov - 40) * leave + (to.fov - 40) * arrive,
    roll: (end.track.bank ?? 0) * Math.PI / 180 * Math.sin(2 * Math.PI * t) };
}

function hidden(values: ArrayLike<number>, at: number) {
  "worklet";
  return values[at + 23] <= 0.002 || Math.max(Math.abs(values[at + 8]), Math.abs(values[at + 9]), Math.abs(values[at + 10])) <= 0.002;
}
function reveal(from: number, to: number, value: number) {
  "worklet";
  const u = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return u * u * (3 - 2 * u);
}
function blend(values: Float32Array | number[], at: number, from: ArrayLike<number>, old: number, start: number, end: number, amount: number) {
  "worklet";
  for (let field = start; field < end; field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * amount;
}
/** Carries one part along a bowed path. Reversed travel mirrors its delay, so Previous retraces the same flight. */
function carrySlot(values: Float32Array | number[], at: number, from: ArrayLike<number>, old: number, time: number, carry: WorldCarry, id: string, seed: number, reversed: boolean) {
  "worklet";
  const stagger = Math.min(0.9, carry.stagger ?? 0), delay = stagger * (reversed ? 1 - seed : seed);
  const p = easeProgress(Math.min(1, Math.max(0, (time - delay) / (1 - stagger))), "cubic");
  const dx = values[at] - from[old], dy = values[at + 1] - from[old + 1], dz = values[at + 2] - from[old + 2];
  // Short hops stay flat; the seed picks the side, so a group and both directions share one path.
  const reach = Math.min(1, Math.hypot(dx, dy, dz) / 8), side = seed < 0.5 ? -1 : 1, bow = 2 * p * (1 - p) * reach;
  blend(values, at, from, old, 0, 3, p);
  values[at] += bow * side * (carry.spread ?? 0) * (0.5 + seed / 2);
  values[at + 1] += bow * (carry.lift ?? 0) * (0.8 + seed * 0.4);
  // A part that ends hidden shrinks on landing; one that starts hidden appears on takeoff.
  const shrink = hidden(values, at), appear = hidden(from, old);
  const presence = shrink ? reveal(0.8, 1, p) : appear ? reveal(0, 0.2, p) : p;
  blend(values, at, from, old, 3, 8, p);
  blend(values, at, from, old, 23, 24, presence);
  // Labels pack their text into the fields below.
  if (id.startsWith("label:")) return;
  blend(values, at, from, old, 8, 11, presence);
  blend(values, at, from, old, 24, 27, p);
  const spin = Math.sin(p * Math.PI) * (carry.spin ?? 0) * reach;
  const glyph = id.startsWith("glyph:"), tube = id.startsWith("tube:");
  if (glyph || tube) blend(values, at, from, old, 12, 15, p);
  // A grouped glyph is lettering on a part: it tilts with it instead of tumbling on its own.
  if (glyph && id.includes("/")) values[at + 14] += spin * side * 0.25;
  else if (glyph) { values[at + 12] += spin * 0.6; values[at + 13] += spin * side; }
  else if (!tube) values[at + 22] += spin * side * 0.0044;
}
/** Ids sharing a prefix before `/` fly as one object. */
function seedOf(id: string) {
  "worklet";
  const group = id.indexOf("/");
  let hash = 7;
  for (let i = id.indexOf(":") + 1, end = group < 0 ? id.length : group; i < end; i++) hash = (hash * 31 + id.charCodeAt(i)) % 65521;
  return ((hash * 40503) % 65521) / 65521;
}

/** World-frame scenes keep their cached uniforms intact: only parts whose pose changes are written, into a separate output. */
function sampleWorldFrame(frame: TrackFrame, values: Float32Array, changed: boolean, elapsed: number) {
  "worklet";
  const { ids, from, sources, carry, reversed } = frame;
  if (changed) {
    frame.moving = []; frame.seeds = [];
    if (elapsed < 1) for (let slot = 0; slot < ids.length; slot++) {
      if (!frame.declaredSlots[slot]) continue;
      const source = sources[slot];
      if (source < 0) continue;
      const at = worldHeaderSize + slot * worldInstanceSize, old = worldHeaderSize + source * worldInstanceSize;
      const was = hidden(from, old), is = hidden(values, at);
      let moved = Math.abs(values[at] - from[old]) + Math.abs(values[at + 1] - from[old + 1]) + Math.abs(values[at + 2] - from[old + 2]) > 0.001;
      if (ids[slot].startsWith("tube:")) moved ||= Math.abs(values[at + 12] - from[old + 12]) + Math.abs(values[at + 13] - from[old + 13]) + Math.abs(values[at + 14] - from[old + 14]) > 0.001;
      // A part hidden or shown in place swaps at once, so successive states of one label never overlap.
      if (moved && !(was && is)) { frame.moving.push(slot); frame.seeds.push(seedOf(ids[slot])); }
    }
  }
  // The next change reads this frame as its source, and the cache will have moved on by then.
  const output = frame.output?.length === values.length ? frame.output : new Float32Array(values.length);
  output.set(values);
  frame.output = output; frame.values = output as unknown as number[];
  if (elapsed >= 1) return frame;
  for (let i = 0; i < frame.moving.length; i++) {
    const slot = frame.moving[i];
    carrySlot(output, worldHeaderSize + slot * worldInstanceSize, from, worldHeaderSize + sources[slot] * worldInstanceSize, elapsed, carry ?? {}, ids[slot], frame.seeds[i], reversed);
  }
  return frame;
}

/** Retired parts stay at their last world pose until their bounds are entirely behind the camera. */
function restoreRetired(values: Float32Array | number[], at: number, id: string, saved: number[] | undefined) {
  "worklet";
  if (saved) {
    for (let field = 0; field < worldInstanceSize; field++) values[at + field] = saved[field];
    const dx = saved[0] - values[0], dy = saved[1] - values[1], dz = saved[2] - values[2];
    const depth = dx * (values[4] - values[0]) + dy * (values[5] - values[1]) + dz * (values[6] - values[2]);
    let radius = Math.abs(saved[3]) * (id.startsWith("label:") ? Math.hypot(1, saved[8]) : Math.hypot(saved[8], saved[9], saved[10]));
    if (id.startsWith("tube:")) radius += Math.hypot(saved[12] - saved[0], saved[13] - saved[1], saved[14] - saved[2]) *
      (1 + Math.abs(saved[15])) * Math.max(Math.abs(saved[8]), Math.abs(saved[9]), Math.abs(saved[10]));
    if (depth < -radius * values[32]) values[at + 23] = 0;
  } else values[at + 23] = 0;
  return values[at + 23] > .002;
}

/** Publish only identity changes to JS; uniform buffers stay on the UI runtime. */
function visibleTrackFrame(frame: TrackFrame, previous: TrackFrame): TrackFrame {
  "worklet";
  const visible: string[] = [];
  if (frame.declared.length < frame.ids.length) for (let slot = 0; slot < frame.ids.length; slot++) if (!frame.declaredSlots[slot]) {
    const id = frame.ids[slot];
    if (restoreRetired(frame.values, worldHeaderSize + slot * worldInstanceSize, id, frame.retired[id])) visible.push(id);
  }
  const same = visible.length === previous.retiredVisible.length && visible.every((id, i) => id === previous.retiredVisible[i]);
  frame.retiredVisible = same ? previous.retiredVisible : visible;
  frame.visible = same && frame.declared === previous.declared ? previous.visible : [...frame.declared, ...visible];
  return frame;
}

/** UI-thread sampling. The caller supplies a fresh uniform buffer, keeping the scene cache untouched. */
export function sampleTrackFrame(previous: TrackFrame, values: number[], ids: string[], playback: PlaybackState,
  options: WorldTrack, declared = ids): TrackFrame {
  "worklet";
  const preview = playback.phase === "preview" || playback.phase === "preparing";
  if (!preview && (playback.phase === "paused" || playback.phase === "outgoing")) return previous;
  const key = `${playback.slideKey}/${playback.stepKey}`;
  const changed = key !== previous.key, slideChanged = playback.slideKey !== previous.slideKey;
  const first = !previous.key || preview;
  // Activation epochs change on re-entry; the slide's numeric index is its stable station identity.
  const world = options.frame === "world";
  const index = preview && !world ? 0 : Number(playback.slideKey.split(":")[0]);
  const spacing = options.spacing ?? 32;
  const stations = first ? {} : changed ? { ...previous.stations } : previous.stations;
  if (first || slideChanged && !stations[index]) stations[index] = { offset: index * spacing, track: options };
  if (changed) stations[index] = { ...stations[index], step: options.steps?.[playback.stepIndex] };
  const origin = first ? index : slideChanged ? previous.cursor : previous.origin;
  const duration = options.duration ?? 1.7;
  const travelDuration = Math.max(1, Math.abs(index - origin)) * (stations[Math.max(index, Math.ceil(origin))]?.track.duration ?? duration);
  const travel = first ? 1 : easeProgress(playback.slideTime / travelDuration, "cubic");
  const cursor = origin + (index - origin) * travel;
  const camera = sampleTrackCamera(stations, cursor, spacing);
  const station = world ? 0 : stations[index].offset;
  const reversed = changed ? slideChanged ? index < origin : playback.stepIndex < previous.stepIndex : previous.reversed;
  // Travel back keeps the carry of the segment being retraced.
  const carry = changed ? (slideChanged ? stations[Math.max(index, Math.ceil(origin))]?.track.carry : options.carry) ?? options.carry : previous.carry;
  const retired = changed ? { ...previous.retired } : previous.retired;
  const from = changed ? previous.values.slice() : previous.from;
  // Reuse draw slots only while their ids keep the same order.
  const same = world && previous.ids.length === ids.length && (previous.ids === ids || ids.every((id, slot) => id === previous.ids[slot]));
  const declaredSet = changed || ids !== previous.ids || declared !== previous.declared ? new Set(declared) : null;
  const declaredSlots = declaredSet ? ids.map(id => declaredSet.has(id)) : previous.declaredSlots;
  const fixedSlots = changed || ids !== previous.ids ? options.fixed ? ids.map(id => {
    const name = id.slice(id.indexOf(":") + 1);
    return options.fixed!.some(prefix => name.startsWith(prefix));
  }) : [] : previous.fixedSlots;
  const previousDeclared = changed ? new Set(previous.declared) : null;
  if (changed) for (let slot = 0; slot < previous.ids.length; slot++) {
    const id = previous.ids[slot], at = worldHeaderSize + slot * worldInstanceSize;
    if (previousDeclared!.has(id) && !declaredSet!.has(id)) retired[id] = previous.values.slice(at, at + worldInstanceSize);
    if (previousDeclared!.has(id) && declaredSet!.has(id)) delete retired[id];
    const saved = retired[id];
    if (saved) for (let field = 0; field < worldInstanceSize; field++) from[at + field] = saved[field];
  }
  const morphDuration = changed ? slideChanged ? travelDuration : duration : previous.morphDuration;
  const elapsed = first || from.length === 0 ? 1 : Math.min(1, playback.stepTime / morphDuration);
  const progress = elapsed >= 1 ? 1 : easeProgress(elapsed, "cubic");
  const sources = changed ? ids.map((id, slot) => id.slice(id.indexOf(":") + 1) ? same ? slot : previous.ids.indexOf(id) : -1) : previous.sources;
  // A step camera eases from wherever the camera was when navigation began, including mid-move.
  const posed = [camera.position[0], camera.position[1], camera.position[2], Math.tan(camera.fov * Math.PI / 360), camera.target[0], camera.target[1], camera.target[2]];
  const cameraDelta = !changed ? previous.cameraDelta : !first && from.length > 7 && (options.steps || previous.cameraDelta) ? posed.map((value, i) => from[i] - value) : undefined;
  const entering = changed ? slideChanged : previous.entering;
  const moveDuration = options.steps?.[playback.stepIndex]?.duration ?? duration;
  const settle = cameraDelta ? 1 - (entering ? travel : easeProgress(Math.min(1, playback.stepTime / moveDuration), "cubic")) : 0;
  const frame: TrackFrame = { key, slideKey: playback.slideKey, stepIndex: playback.stepIndex, origin, cursor, morphDuration, reversed, carry, moving: previous.moving, seeds: previous.seeds, output: previous.output,
    stations, ids, declared, declaredSlots, fixedSlots, visible: previous.visible, retiredVisible: previous.retiredVisible, from, sources, retired, values, cameraDelta, entering };
  for (let i = 0; i < 7; i++) values[i] = posed[i] + (cameraDelta ? cameraDelta[i] * settle : 0);
  values[7] = camera.roll;
  values[32] = Math.hypot(values[0] - values[4], values[1] - values[5], values[2] - values[6]);
  if (world) {
    sampleWorldFrame(frame, values as unknown as Float32Array, changed, elapsed);
    return visibleTrackFrame(frame, previous);
  }
  // Lights travel with the station; floor markings stay in world space.
  for (let light = 0; light < 4; light++) values[64 + light * 12 + 2] -= station;
  values[114] -= station;
  values[122] -= station;
  for (let slot = 0; slot < ids.length; slot++) {
    const at = worldHeaderSize + slot * worldInstanceSize, id = ids[slot];
    if (!declaredSlots[slot]) continue;
    if (fixedSlots[slot]) continue;
    values[at + 2] -= station;
    // Hidden titles must not expand to the height of their destination column.
    const label = id.startsWith("label:");
    if (label && values[at + 23] === 0) values[at + 3] = 0;
    if (id.startsWith("tube:")) values[at + 14] -= station;
    // Local step tracks already own their motion and flash timing.
    if (!entering) continue;
    const source = sources[slot] ?? -1;
    if (progress < 1 && source >= 0) {
      const old = worldHeaderSize + source * worldInstanceSize;
      if (carry) {
        carrySlot(values, at, from, old, elapsed, carry, id, seedOf(id), reversed);
        continue;
      }
      for (let field = 0; field < (label ? 8 : 11); field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      if (!label) for (let field = 24; field < 27; field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      if (id.startsWith("tube:")) for (let field = 12; field < 15; field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      values[at + 23] = from[old + 23] + (values[at + 23] - from[old + 23]) * progress;
    } else if (!first && progress < 1) values[at + 23] *= progress;
  }
  return visibleTrackFrame(frame, previous);
}
