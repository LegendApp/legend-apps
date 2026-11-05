import type { PlaybackState } from "@legend-apps/presentation";
import { contentClearance, easeProgress, type CameraPose, type Ease, type Vec3 } from "./camera";
import { instanceField, prepareWorldScene, travelSpeedSlot, worldClockOffset, worldHeaderSize, worldInstanceSize, type PreparedWorldScene } from "./scene";

/** How matched parts fly between poses: `lift` and `spread` bow the path, `spin` tumbles it, `stagger` is the share of the move spent waiting. */
export type WorldCarry = { lift?: number; spread?: number; spin?: number; stagger?: number };
/** Camera points are local to the incoming station; via points bend the eased path.
 * `frame: "world"` authors parts and lights in fixed world coordinates, so slides can share one retained scene. */
export type WorldTrack = {
  /** `duration` and `ease` (default 1.7 s, quintic) time the flight into this station; `via`/`viaTarget` bend its curve. */
  spacing?: number; duration?: number; ease?: Ease;
  position?: Vec3; target?: Vec3; via?: Vec3; viaTarget?: Vec3;
  frame?: "station" | "world"; carry?: WorldCarry;
  /** Raw part-id prefixes that keep fixed world coordinates inside a station-frame scene, so the camera travels past them (default `["tunnel:", "trails:"]`; `[]` moves everything with the station). */
  fixed?: string[];
  /** Radial motion blur toward the frame's centre at peak travel speed (default 1; 0 turns it off). */
  blur?: number;
  /** DOF focus distance in world units; defaults to the camera target and can be overridden per step. */
  focus?: number;
  /** Share of full speed that `continuousTime()` scenery, such as trails and tunnel lights, keeps while the camera holds at a station (default 1). */
  heldMotion?: number;
  /** Extra DOF blur radius while the camera holds, as a share of `maxBlur` (default 0). Both ease back to full motion and base blur during flights. */
  heldBlur?: number;
  /** World units past the camera target beyond which lit scenery, lights and floor fade to black, so the background stays calm and far lights fade instead of aliasing (default 0, off). */
  depthFade?: number;
  /** Steepens that falloff while the camera holds, from 0 to 1 (default 0); it eases back during flights like `heldBlur`. */
  heldFade?: number;
  /** Peak rail banking in degrees, leaning into the curve; stations hold level (default 12% of `turn`). */
  bank?: number;
  /** Peak heading in degrees the track swings through between the previous station and this one: positive curves right, negative left. */
  turn?: number;
  /** World units the camera's path lifts at mid-travel into this station; negative dips. */
  rise?: number;
  /** Segments by slide index, so every station sits on one track even before it is visited. Unset fields get varied per-slide defaults. */
  course?: (WorldSegment | undefined)[];
  /** Camera moves within the station, by local step index. */
  steps?: Record<number, WorldStepCamera>;
};
/** Orbits about the target, scales distance by `dolly`, moves both by `shift`, and pulls `focus` to a distance in world units over the same `duration` and `ease`. */
export type WorldStepCamera = { orbit?: number; dolly?: number; shift?: Vec3; fov?: number; focus?: number; duration?: number; ease?: Ease };
/** One slide's leg of the track, from the previous station into this one. */
export type WorldSegment = Pick<WorldTrack, "spacing" | "duration" | "ease" | "bank" | "turn" | "rise" | "position">;
type Station = { offset: number; track: WorldTrack; step?: WorldStepCamera; stepIndex?: number; pose?: CameraPose };
const defaultFixed = ["tunnel:", "trails:"];
/** Longest flight, in seconds, for a jump across more than one station. */
const jumpDuration = 1.5;
export type TrackFrame = {
  key: string; slideKey: string; stepIndex: number; origin: number; cursor: number; morphDuration: number;
  reversed: boolean; carry?: WorldCarry; moving: number[]; seeds: number[]; output?: Float32Array;
  stations: Record<number, Station>; ids: string[]; declared: string[]; declaredSlots: boolean[]; fixedSlots: boolean[];
  visible: string[];
  from: number[]; sources: number[]; retired: Record<string, number[]>; values: number[];
  /** The live camera minus the incoming rail or step pose when the move began (position, tan half-fov, target, bank); it fades out over the move. */
  cameraDelta?: number[]; entering?: boolean;
  /** The camera before the track bend, so later moves start from the same unbent coordinates. */
  straight?: number[]; course?: Course;
  /** The scenery clock written to `continuousTime()` under `heldMotion`, and the timestamp it was last advanced at. */
  scenery: number; stamp: number;
};

export function createTrackFrame(): TrackFrame {
  "worklet";
  return { key: "", slideKey: "", stepIndex: 0, origin: 0, cursor: 0, morphDuration: 0, reversed: false, moving: [], seeds: [],
    stations: {}, ids: [], declared: [], declaredSlots: [], fixedSlots: [], visible: [], from: [], sources: [], retired: {}, values: [], scenery: NaN, stamp: NaN };
}

/** Geometry families are matched separately: packed label data must never become mesh data. */
export function trackIds(scene: PreparedWorldScene): string[] {
  return scene.instances.map(part => `${part.label ? "label" : part.card ? "card" : part.glyph ? "glyph" : part.custom ? "custom" : part.kind}:${part.id ?? ""}`);
}

/** Keep draw descriptors so an omitted object can remain visible, then return on reverse.
 * Keep the previous declaration plus older parts still visible in the live frame. */
export function retainTrackScene(scene: PreparedWorldScene, previous: PreparedWorldScene, declared = previous, layoutOnly = false, visible: string[] = []): PreparedWorldScene {
  const ids = new Set(trackIds(scene)), oldIds = trackIds(previous), last = new Set([...trackIds(declared), ...visible]);
  const omitted = previous.instances.filter((part, index) => part.id && !ids.has(oldIds[index]) && last.has(oldIds[index]));
  if (!omitted.length) return scene;
  const combined = { ...scene, instances: [...scene.instances, ...omitted] };
  return layoutOnly ? combined : prepareWorldScene(combined);
}

function smooth(value: number) {
  "worklet";
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (10 + t * (-15 + 6 * t));
}
function travelEase(value: number, ease?: Ease) {
  "worklet";
  return ease ? easeProgress(value, ease) : smooth(value);
}
function stationAt(stations: Record<number, Station>, index: number, course: Course): Station {
  "worklet";
  return stations[index] ?? { offset: course.offset[index], track: course.tracks[index] ?? {} };
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

/** Station depths along the straight track, and the curves that bend it: curve k shifts the centreline by `dx` between depths `from` and `to`. */
type Course = { offset: number[]; from: number[]; to: number[]; dx: number[]; x: number[]; bank: number[]; rise: number[]; duration: number[]; ease: (Ease | undefined)[]; tracks: WorldSegment[] };
/** Header slots for WGSL `trackX`: the centreline's x before the window, the curve count, then from/to/dx per curve. */
export const trackBendSlot = 128, trackBendCurves = 8;
/** Header slot after the bend window holding the held DOF blur, as a share of `maxBlur`. */
export const heldBlurSlot = trackBendSlot + 2 + trackBendCurves * 3;
/** Header slots holding `depthFade` and the held `heldFade`. */
export const depthFadeSlot = heldBlurSlot + 1;
/** How far content may reach past its station before the next curve begins. */
const contentDepth = 4;
function hash(index: number, salt: number) {
  "worklet";
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
/** Each curve sits between one station's content and the next station's camera, so settled slides stay rigid.
 * Without a `course`, visited stations keep their own track and the rest use `options`.
 * Unset fields vary by slide: gentle curves run in pairs, separated by straights before changing sides. */
export function buildCourse(options: WorldTrack, count: number, stations: Record<number, Station> = {}): Course {
  "worklet";
  const world = options.frame === "world", base = options.spacing ?? (world ? 32 : 48);
  const course: Course = { offset: [0], from: [0], to: [0], dx: [0], x: [0], bank: [0], rise: [0], duration: [options.duration ?? 1.7], ease: [options.ease],
    tracks: [options.course?.[0] ?? {}] };
  for (let k = 1; k < count; k++) {
    const seg: WorldSegment = options.course ? options.course[k] ?? {} : stations[k]?.track ?? options;
    const spacing = seg.spacing ?? (world ? base : base * (1 + 0.15 * hash(k, 4)));
    const side = [1, 1, 0, -1, -1, 0][(k - 1) % 6];
    const turn = seg.turn ?? (world ? 0 : side * (6 + 4 * hash(k, 2)));
    const offset = course.offset[k - 1] + spacing, from = -course.offset[k - 1] - contentDepth, to = -offset + (seg.position?.[2] ?? 14) + 1;
    const dx = from - to > 2 ? Math.tan(turn * Math.PI / 180) * (from - to) / 1.875 : 0;
    course.offset.push(offset); course.from.push(from); course.to.push(to); course.dx.push(dx); course.x.push(course.x[k - 1] + dx);
    course.bank.push(seg.bank ?? Math.abs(turn) * 0.12);
    course.rise.push(seg.rise ?? (world || turn === 0 ? 0 : 0.3 * hash(k, 3)));
    course.duration.push(seg.duration ?? (world ? 1.7 : 1.7 * Math.sqrt(spacing / 32) * (0.9 + 0.2 * hash(k, 5))));
    course.ease.push(seg.ease);
    course.tracks.push(options.course ? seg : {});
  }
  return course;
}
function curveProgress(course: Course, k: number, z: number) {
  "worklet";
  return Math.min(1, Math.max(0, (course.from[k] - z) / (course.from[k] - course.to[k])));
}
/** The centreline's x at straight-track depth `z`; WGSL `trackX` evaluates the same sum over the header window. */
export function trackX(course: Course, z: number) {
  "worklet";
  let x = 0;
  for (let k = 1; k < course.dx.length; k++) if (course.dx[k]) {
    const u = curveProgress(course, k, z);
    x += course.dx[k] * smooth(u);
  }
  return x;
}
/** A broad eased lean per leg, with zero first and second derivatives at the stations. */
function trackRoll(course: Course, cursor: number) {
  "worklet";
  const k = Math.max(1, Math.ceil(cursor)), u = cursor - (k - 1);
  if (u === 0 || u === 1 || course.dx[k] === 0) return 0;
  return -Math.sign(course.dx[k]) * course.bank[k] * Math.PI / 180 * 64 * u * u * u * (1 - u) * (1 - u) * (1 - u);
}
/** Content, lights and the camera are sampled on a straight track; this writes the bend window and moves the camera and lights onto the curve. */
function bendTrack(frame: TrackFrame, course: Course, look: number, focus?: number) {
  "worklet";
  const values = frame.values;
  frame.straight = values.slice(0, 7);
  const first = Math.max(1, Math.floor(frame.cursor) - 2), last = Math.min(course.dx.length, first + trackBendCurves);
  values[trackBendSlot] = course.x[first - 1]; values[trackBendSlot + 1] = Math.max(0, last - first);
  for (let i = 0; i < trackBendCurves; i++) {
    const k = first + i, at = trackBendSlot + 2 + i * 3, live = k < last;
    values[at] = live ? course.from[k] : 1; values[at + 1] = live ? course.to[k] : 0; values[at + 2] = live ? course.dx[k] : 0;
  }
  const bend = trackX(course, values[2]);
  values[0] += bend; values[4] += bend + (trackX(course, values[6]) - bend) * look;
  values[32] = focus ?? Math.hypot(values[0] - values[4], values[1] - values[5], values[2] - values[6]);
  for (let light = 0; light < 4; light++) values[64 + light * 12] += trackX(course, values[64 + light * 12 + 2]);
  values[112] += trackX(course, values[114]); values[120] += trackX(course, values[122]);
  return frame;
}

/** The rail is sampled by station coordinate, so reversing retraces the same curve. */
function sampleTrackCamera(stations: Record<number, Station>, cursor: number, course: Course, look: number): CameraPose {
  "worklet";
  const endIndex = Math.max(1, Math.ceil(cursor)), t = cursor - (endIndex - 1);
  const start = stationAt(stations, endIndex - 1, course), end = stationAt(stations, endIndex, course);
  const a = { position: worldPoint(start.track.position ?? [0, 3.6, 14], start.offset), target: worldPoint(start.track.target ?? [0, 0, 0], start.offset), fov: 40, roll: 0 };
  const b = { position: worldPoint(end.track.position ?? [0, 3.6, 14], end.offset), target: worldPoint(end.track.target ?? [0, 0, 0], end.offset), fov: 40, roll: 0 };
  // Quintic Hermite depth keeps a shared tangent and zero acceleration through skipped stations.
  const point = (key: "position" | "target", fallback: Vec3): Vec3 => {
    "worklet";
    const p = key === "position" ? a.position : a.target, q = key === "position" ? b.position : b.target;
    const before = stationAt(stations, Math.max(0, endIndex - 2), course), after = stationAt(stations, endIndex + 1, course);
    const z0 = (before.track[key] ?? fallback)[2] - before.offset, z3 = (after.track[key] ?? fallback)[2] - after.offset;
    const depth = q[2] - p[2];
    const m0 = endIndex === 1 ? depth : -Math.min(Math.abs(depth), Math.abs(p[2] - z0));
    const m1 = -Math.min(Math.abs(depth), Math.abs(z3 - q[2]));
    const t3 = t * t * t, t4 = t3 * t, t5 = t4 * t, u = smooth(t);
    const result: Vec3 = [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u,
      p[2] + depth * u + m0 * (t - 6 * t3 + 8 * t4 - 3 * t5) + m1 * (-4 * t3 + 7 * t4 - 3 * t5)];
    const via = key === "position" ? end.track.via : end.track.viaTarget;
    const bump = 64 * t3 * (1 - t) * (1 - t) * (1 - t);
    if (via) {
      const control = worldPoint(via, end.offset);
      for (let axis = 0; axis < 3; axis++) result[axis] += (control[axis] - (p[axis] + q[axis]) / 2) * bump / 2;
    } else if (key === "position") result[1] += Math.max(course.rise[endIndex] ?? 0, 1.2 - (p[1] + q[1]) / 2) * bump * look;
    return result;
  };
  const position = point("position", [0, 3.6, 14]), target = point("target", [0, 0, 0]);
  const from = start.pose ?? stepCamera(a, start.step), to = end.pose ?? stepCamera(b, end.step);
  // A held step pose belongs to the station, so Previous follows the same unwind in reverse.
  const arrive = smooth(t), leave = 1 - arrive;
  for (let axis = 0; axis < 3; axis++) {
    position[axis] += (from.position[axis] - a.position[axis]) * leave + (to.position[axis] - b.position[axis]) * arrive;
    target[axis] += (from.target[axis] - a.target[axis]) * leave + (to.target[axis] - b.target[axis]) * arrive;
  }
  return { position, target, fov: 40 + (from.fov - 40) * leave + (to.fov - 40) * arrive,
    roll: trackRoll(course, cursor) * look };
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
/** Opacity of a fixed part by its depth past the camera target, so scenery never stands in front of the content. */
function clearance(values: ArrayLike<number>, at: number) {
  "worklet";
  const distance = values[32], depth = ((values[at] - values[0]) * (values[4] - values[0]) + (values[at + 1] - values[1]) * (values[5] - values[1]) +
    (values[at + 2] - values[2]) * (values[6] - values[2])) / distance;
  return reveal(distance + contentClearance.near, distance + contentClearance.far, depth);
}
function blend(values: Float32Array | number[], at: number, from: ArrayLike<number>, old: number, start: number, end: number, amount: number) {
  "worklet";
  for (let field = start; field < end; field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * amount;
}
/** Carries one part along a bowed path. Reversed travel mirrors its delay, so Previous retraces the same flight. */
function carrySlot(values: Float32Array | number[], at: number, from: ArrayLike<number>, old: number, time: number, carry: WorldCarry, id: string, seed: number, reversed: boolean, ease: Ease) {
  "worklet";
  const stagger = Math.min(0.9, carry.stagger ?? 0), delay = stagger * (reversed ? 1 - seed : seed);
  const p = easeProgress(Math.min(1, Math.max(0, (time - delay) / (1 - stagger))), ease);
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
function sampleWorldFrame(frame: TrackFrame, values: Float32Array, changed: boolean, elapsed: number, ease: Ease) {
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
    carrySlot(output, worldHeaderSize + slot * worldInstanceSize, from, worldHeaderSize + sources[slot] * worldInstanceSize, elapsed, carry ?? {}, ids[slot], frame.seeds[i], reversed, ease);
  }
  return frame;
}

/** Retired parts keep their last world pose while the departure fades. */
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
    // The camera flies at full speed through the station it leaves, so departed parts fade out before they reach the lens.
    else values[at + 23] *= reveal(0.25, 0.6, depth / (values[32] * values[32]));
  } else values[at + 23] = 0;
}

/** Publish only identity changes to JS; uniform buffers stay on the UI runtime. */
function visibleTrackFrame(frame: TrackFrame, previous: TrackFrame, progress: number): TrackFrame {
  "worklet";
  const visible: string[] = [];
  if (frame.declared.length < frame.ids.length) for (let slot = 0; slot < frame.ids.length; slot++) if (!frame.declaredSlots[slot]) {
    const id = frame.ids[slot];
    const at = worldHeaderSize + slot * worldInstanceSize;
    restoreRetired(frame.values, at, id, frame.retired[id]);
    frame.values[at + instanceField.sharp] = 0;
    frame.values[at + 23] *= 1 - progress;
    if (progress === 1) delete frame.retired[id];
    if (frame.values[at + 23] > .002) visible.push(id);
  }
  const same = frame.declared === previous.declared && frame.declared.length + visible.length === previous.visible.length &&
    visible.every((id, i) => id === previous.visible[frame.declared.length + i]);
  frame.visible = same ? previous.visible : [...frame.declared, ...visible];
  return frame;
}

/** UI-thread sampling. Cached inputs are copied before station transforms, keeping the scene cache untouched. */
export function sampleTrackFrame(previous: TrackFrame, values: number[], ids: string[], playback: PlaybackState,
  options: WorldTrack, declared = ids): TrackFrame {
  "worklet";
  const preview = playback.phase === "preview" || playback.phase === "preparing";
  if (!preview && (playback.phase === "paused" || playback.phase === "outgoing")) return previous;
  const prior = previous.values;
  const pulled = prior.length > 7 && Math.abs(prior[32] - Math.hypot(prior[0] - prior[4], prior[1] - prior[5], prior[2] - prior[6])) > .0001;
  const key = `${playback.slideKey}/${playback.stepKey}`;
  const changed = key !== previous.key, slideChanged = playback.slideKey !== previous.slideKey;
  const first = !previous.key || preview;
  // Activation epochs change on re-entry; the slide's numeric index is its stable station identity.
  const world = options.frame === "world";
  const index = preview && !world ? 0 : Number(playback.slideKey.split(":")[0]);
  const count = Math.max(index, Math.ceil(first ? 0 : previous.cursor)) + trackBendCurves + 2;
  const course = !changed && previous.course && previous.course.offset.length >= count ? previous.course : buildCourse(options, count, first ? {} : previous.stations);
  const stations = first ? {} : changed ? { ...previous.stations } : previous.stations;
  if (first || slideChanged && !stations[index]) stations[index] = { offset: course.offset[index], track: options };
  if (!first && slideChanged) {
    const departure = Number(previous.slideKey.split(":")[0]);
    if (Math.abs(previous.cursor - departure) < 1e-9 && (stations[departure]?.step || previous.cameraDelta)) {
      const live = previous.straight ?? previous.values;
      stations[departure] = { ...stations[departure], pose: { position: [live[0], live[1], live[2]],
        target: [live[4], live[5], live[6]], fov: Math.atan(live[3]) * 360 / Math.PI, roll: previous.values[7] } };
    }
  }
  if (changed) stations[index] = { ...stations[index], step: options.steps?.[playback.stepIndex], stepIndex: playback.stepIndex,
    pose: slideChanged && stations[index].stepIndex === playback.stepIndex ? stations[index].pose : undefined };
  const origin = first ? index : slideChanged ? previous.cursor : previous.origin;
  const duration = options.duration ?? 1.7;
  const leg = Math.max(index, Math.ceil(origin)), span = Math.abs(index - origin);
  // Jumps across several stations rush the whole way in one short flight.
  const travelDuration = span > 1.5 ? Math.min(jumpDuration, span * course.duration[leg]) : Math.max(1, span) * course.duration[leg];
  const travel = first ? 1 : travelEase(playback.slideTime / travelDuration, course.ease[leg]);
  const cursor = origin + (index - origin) * travel;
  // A fast jump keeps a steady forward gaze instead of whipping through every intervening turn.
  const look = span > 1.5 ? 1 / (span * span) : 1;
  const camera = sampleTrackCamera(stations, cursor, course, look);
  const station = world ? 0 : stations[index].offset;
  const reversed = changed ? slideChanged ? index < origin : playback.stepIndex < previous.stepIndex : previous.reversed;
  // Travel back keeps the carry of the segment being retraced.
  const carry = changed ? (slideChanged ? stations[Math.max(index, Math.ceil(origin))]?.track.carry : options.carry) ?? options.carry : previous.carry;
  const retired = changed ? { ...previous.retired } : previous.retired;
  const from = changed ? previous.values.slice() : previous.from;
  if (changed && previous.straight) {
    const bend = trackX(course, from[2]);
    from[0] -= bend;
    from[4] -= bend + (trackX(course, from[6]) - bend) * look;
  }
  if (span > 1.5 && !first) {
    // Blend framing once across the jump; skipped layouts must not steer the gaze.
    const end = sampleTrackCamera(stations, index, course, 1);
    for (let axis = 0; axis < 3; axis++) {
      if (axis < 2) camera.position[axis] = from[axis] + (end.position[axis] - from[axis]) * travel;
      const view = from[4 + axis] - from[axis], goal = end.target[axis] - end.position[axis];
      camera.target[axis] = camera.position[axis] + view + (goal - view) * travel;
    }
    const fov = Math.atan(from[3]) * 360 / Math.PI;
    camera.fov = fov + (end.fov - fov) * travel;
  }
  // Reuse draw slots only while their ids keep the same order.
  const same = world && previous.ids.length === ids.length && (previous.ids === ids || ids.every((id, slot) => id === previous.ids[slot]));
  const declaredSet = changed || ids !== previous.ids || declared !== previous.declared ? new Set(declared) : null;
  const previousDeclared = changed ? new Set(previous.declared) : null;
  if (changed) for (let slot = 0; slot < previous.ids.length; slot++) {
    const id = previous.ids[slot], at = worldHeaderSize + slot * worldInstanceSize;
    if (!declaredSet!.has(id) && (previousDeclared!.has(id) || retired[id])) retired[id] = previous.values.slice(at, at + worldInstanceSize);
    if (declaredSet!.has(id)) delete retired[id];
    const saved = retired[id];
    if (saved) for (let field = 0; field < worldInstanceSize; field++) from[at + field] = saved[field];
  }
  const morphDuration = changed ? slideChanged ? travelDuration : duration : previous.morphDuration;
  const elapsed = first || from.length === 0 ? 1 : Math.min(1, playback.stepTime / morphDuration);
  const entering = changed ? slideChanged : previous.entering;
  // Parts carried into a station follow the camera's ease, so a fast flight never overtakes them.
  const morphEase = entering && course.ease[leg] || "cubic";
  const progress = elapsed >= 1 ? 1 : easeProgress(elapsed, morphEase);
  const previousSlots = changed && !same ? new Map(previous.ids.map((id, slot) => [id, slot])) : null;
  const sources = changed ? ids.map((id, slot) => {
    const source = id.slice(id.indexOf(":") + 1) ? same ? slot : previousSlots!.get(id) ?? -1 : -1;
    // A retired draw slot is storage, not a live pose to carry into the next station.
    return source >= 0 && !previous.declaredSlots[source] && hidden(previous.values, worldHeaderSize + source * worldInstanceSize) ? -1 : source;
  }) : previous.sources;
  // A step camera eases from wherever the camera was when navigation began, including mid-move.
  const posed = [camera.position[0], camera.position[1], camera.position[2], Math.tan(camera.fov * Math.PI / 360), camera.target[0], camera.target[1], camera.target[2], camera.roll];
  const cameraDelta = !changed ? previous.cameraDelta : !first && from.length > 7 && (slideChanged || options.steps || previous.cameraDelta) ? posed.map((value, i) => from[i] - value) : undefined;
  const move = options.steps?.[playback.stepIndex], moveDuration = move?.duration ?? duration;
  const settle = cameraDelta ? 1 - (entering ? travel : travelEase(playback.stepTime / moveDuration, move?.ease ?? options.ease)) : 0;
  // Sampling into a cached scene buffer requires a separate station output: transforms must never accumulate in the cache.
  const input = values;
  const cached = input instanceof Float32Array;
  const output = cached && !world ? previous.output?.length === input.length ? previous.output : new Float32Array(input.length) : previous.output;
  if (cached && !world) { output!.set(input); values = output as unknown as number[]; }
  const declaredSlots = declaredSet ? ids.map(id => declaredSet.has(id)) : previous.declaredSlots;
  const fixed = options.fixed ?? defaultFixed;
  const fixedSlots = changed || ids !== previous.ids ? ids.map(id => fixed.some(prefix => id.startsWith(prefix, id.indexOf(":") + 1))) : previous.fixedSlots;
  const frame: TrackFrame = { key, slideKey: playback.slideKey, stepIndex: playback.stepIndex, origin, cursor, morphDuration, reversed, carry, moving: previous.moving, seeds: previous.seeds, output,
    stations, ids, declared, declaredSlots, fixedSlots, visible: previous.visible, from, sources, retired, values, cameraDelta, entering, course,
    scenery: previous.scenery, stamp: previous.stamp };
  for (let i = 0; i < 8; i++) values[i] = posed[i] + (cameraDelta ? cameraDelta[i] * settle : 0);
  values[32] = Math.hypot(values[0] - values[4], values[1] - values[5], values[2] - values[6]);
  const destination = sampleTrackCamera(stations, index, course, 1);
  const fx = destination.target[0] - destination.position[0], fy = destination.target[1] - destination.position[1], fz = destination.target[2] - destination.position[2];
  const focusDistance = Math.hypot(fx, fy, fz);
  const focusTarget = Math.max(.05, move?.focus ?? options.focus ?? focusDistance);
  const focus = move?.focus !== undefined || options.focus !== undefined || pulled ? focusTarget + (cameraDelta ? (from[32] - focusTarget) * settle : 0) : undefined;
  for (let slot = 0; slot < ids.length; slot++) {
    const at = worldHeaderSize + slot * worldInstanceSize;
    if (!declaredSlots[slot] || fixedSlots[slot]) values[at + instanceField.sharp] = 0;
    else if (values[at + instanceField.sharp] < 0) {
      const depth = ((values[at] - destination.position[0]) * fx + (values[at + 1] - destination.position[1]) * fy +
        (values[at + 2] - station - destination.position[2]) * fz) / focusDistance;
      values[at + instanceField.sharp] = Math.abs(depth - focusTarget) <= Math.max(1, values[54]) ? 1 : 0;
    }
  }
  // Travel speed as a share of the eased move's peak, for speed effects in WGSL (`travelSpeed()`).
  const u = Math.min(1, playback.slideTime / travelDuration);
  const ease = course.ease[leg];
  // An ease-out flight is fastest as it leaves; a short ramp keeps speed effects from popping on.
  values[travelSpeedSlot] = first || origin === index ? 0 : !ease ? 16 * u * u * (1 - u) * (1 - u)
    : ease === "out" ? Math.min(1, 8 * u) * (1 - u) * (1 - u) : u < 0.5 ? 4 * u * u : 4 * (1 - u) * (1 - u);
  values[travelSpeedSlot + 1] = values[travelSpeedSlot] * (options.blur ?? 1);
  const flying = Math.min(1, values[travelSpeedSlot] * 2), held = 1 - flying * flying * (3 - 2 * flying);
  values[heldBlurSlot] = (options.heldBlur ?? 0) * held;
  values[depthFadeSlot] = options.depthFade ?? 0;
  values[depthFadeSlot + 1] = (options.heldFade ?? 0) * held;
  if (options.heldMotion !== undefined) {
    const stamp = playback.lastTimestamp ?? NaN, step = Math.min(0.1, Math.max(0, (stamp - previous.stamp) / 1000));
    frame.scenery = first || !(step >= 0) || !Number.isFinite(previous.scenery) ? values[worldClockOffset + 3]
      : (previous.scenery + step * (1 + (options.heldMotion - 1) * held)) % 3600;
    frame.stamp = stamp;
    values[worldClockOffset + 3] = frame.scenery;
  }
  if (world) {
    sampleWorldFrame(frame, values as unknown as Float32Array, changed, elapsed, morphEase);
    return bendTrack(visibleTrackFrame(frame, previous, progress), course, look, focus);
  }
  // Lights travel with the station; floor markings stay in world space.
  for (let light = 0; light < 4; light++) values[64 + light * 12 + 2] -= station;
  values[114] -= station;
  values[122] -= station;
  for (let slot = 0; slot < ids.length; slot++) {
    const at = worldHeaderSize + slot * worldInstanceSize, id = ids[slot];
    if (!declaredSlots[slot]) continue;
    if (fixedSlots[slot]) {
      // Custom draws place their own geometry; their instance position says nothing about where it is.
      if (!id.startsWith("custom:")) values[at + 23] *= clearance(values, at);
      continue;
    }
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
        carrySlot(values, at, from, old, elapsed, carry, id, seedOf(id), reversed, morphEase);
        continue;
      }
      for (let field = 0; field < (label ? 8 : 11); field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      if (!label) for (let field = 24; field < 27; field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      if (id.startsWith("tube:")) for (let field = 12; field < 15; field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      values[at + 23] = from[old + 23] + (values[at + 23] - from[old + 23]) * progress;
    } else if (!first && progress < 1) values[at + 23] *= progress;
  }
  return bendTrack(visibleTrackFrame(frame, previous, progress), course, look, focus);
}
