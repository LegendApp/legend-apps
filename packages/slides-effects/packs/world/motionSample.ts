import { easeProgress, mixVector, type ClockSample, type Vec3 } from "./camera";
import type { Instance } from "./scene";

export type PartPose = { position: Vec3; rotation?: Vec3; scale?: Vec3; color?: string };
export type ChoreographyPart = { id: string; instances: Instance[]; home: PartPose; origin?: Vec3 };
export type ChoreographyLayout = { id: string; parts: ChoreographyPart[] };
export type BurstStyle = { count?: number; lifetime?: number; color?: string; colors?: string[]; emissive?: number; size?: number; speed?: number; spread?: Vec3; gravity?: Vec3; seed?: number };
export type BurstOptions = BurstStyle & { id?: string; position: Vec3; step?: number; at?: number; delay?: number };
export type PartRoute = { from: string; to: string; via?: [Vec3, Vec3]; delay?: number; swapAt?: number };
export type ChoreographyTransition = { from: string; to: string; step?: number; at?: number; duration?: number; stagger?: number; swapAt?: number; overshoot?: number; mapping?: PartRoute[]; onLand?: BurstStyle };
export type ChoreographyOptions = { id: string; layouts: ChoreographyLayout[]; transitions: ChoreographyTransition[] };
type Pose = { position: Vec3; rotation: Vec3; scale: Vec3; color?: Vec3 };
export type Trigger = { step?: number; at?: number; delay?: number };
export type Route = { from: number; to: number; via: [Vec3, Vec3]; delay: number; swapAt: number; merge: boolean };
type Transition = Trigger & { from: number; to: number; duration: number; overshoot: number; routes: Route[] };
export type Model = { layouts: Pose[][]; transitions: Transition[] };
export type HomeWindow = { transition: number; depart?: number; land?: number };
type Flight = Omit<Route, "from" | "to"> & { transition: number; from: Pose; to: Pose; duration: number; overshoot: number };
export type ChoreographyMotion = { timeline: Trigger[]; home?: { pose: Pose; initial: boolean; windows: HomeWindow[] }; flight?: Flight;
  side?: "from" | "to"; local: Vec3; endOffset: Vec3; opacity: number };
export type BurstMotion = { options: BurstOptions; velocity: Vec3; gravity: Vec3; until?: Trigger };
export type SampledPart = Pose & { opacity: number };

/** Missing epochs on an earlier step mean a direct jump: previous events are already finished. */
export function eventElapsed(event: Trigger, clock: ClockSample) {
  "worklet";
  if (event.at !== undefined) return clock.slideTime - event.at - (event.delay ?? 0);
  const step = event.step ?? 0;
  if (clock.stepIndex < step) return -Infinity;
  if (clock.stepIndex > step && clock.stepOrigins[step] === undefined) return Infinity;
  return clock.slideTime - (clock.stepOrigins[step] ?? (step === 0 ? 0 : clock.slideTime - clock.stepTime)) - (event.delay ?? 0);
}
export function rotatePart(point: Vec3, rotation: Vec3): Vec3 {
  "worklet";
  const [x, y, z] = point, [rx, ry, rz] = rotation;
  const a = y * Math.cos(rx) - z * Math.sin(rx), b = y * Math.sin(rx) + z * Math.cos(rx);
  const c = x * Math.cos(ry) + b * Math.sin(ry), d = -x * Math.sin(ry) + b * Math.cos(ry);
  return [c * Math.cos(rz) - a * Math.sin(rz), c * Math.sin(rz) + a * Math.cos(rz), d];
}
/** Compose a rigid pose with Text3D's local Euler rotation (degrees). */
export function composePartRotation(localDegrees: Vec3, pose: Vec3): Vec3 {
  "worklet";
  const local: Vec3 = [localDegrees[0] * Math.PI / 180, localDegrees[1] * Math.PI / 180, localDegrees[2] * Math.PI / 180];
  const x = rotatePart(rotatePart([1, 0, 0], local), pose), y = rotatePart(rotatePart([0, 1, 0], local), pose), z = rotatePart(rotatePart([0, 0, 1], local), pose);
  const ry = Math.asin(Math.max(-1, Math.min(1, -x[2])));
  const rx = Math.abs(x[2]) < 0.9999999 ? Math.atan2(y[2], z[2]) : Math.atan2(-z[1], y[1]);
  const rz = Math.abs(x[2]) < 0.9999999 ? Math.atan2(x[1], x[0]) : 0;
  return [rx * 180 / Math.PI, ry * 180 / Math.PI, rz * 180 / Math.PI];
}
/** Cubic rails: controls are explicit World points; defaults keep each handle axis-aligned. */
export function railPoint(from: Vec3, to: Vec3, via: [Vec3, Vec3], progress: number): Vec3 {
  "worklet";
  const t = progress, u = 1 - t;
  return [0, 1, 2].map(axis => u * u * u * from[axis] + 3 * u * u * t * via[0][axis] + 3 * u * t * t * via[1][axis] + t * t * t * to[axis]) as Vec3;
}
/** A bounded travel phase, a small push past the seat, and an exact, quiet resting pose. */
export function settleProgress(progress: number, overshoot = 0.08) {
  "worklet";
  const t = Math.max(0, Math.min(1, progress));
  if (t < 0.78) return easeProgress(t / 0.78, "cubic");
  return 1 + overshoot * Math.sin((t - 0.78) / 0.22 * Math.PI);
}
function activeTransition(timeline: Trigger[], clock: ClockSample) {
  "worklet";
  let active = -1;
  for (let i = 0; i < timeline.length; i++) if (eventElapsed(timeline[i], clock) >= 0) active = i;
  return active;
}
export function samplePartMotion(motion: ChoreographyMotion, clock: ClockSample): SampledPart {
  "worklet";
  const active = activeTransition(motion.timeline, clock);
  if (motion.home) {
    const home = motion.home, window = home.windows.find(item => item.transition === active);
    let visible = active < 0 && home.initial;
    if (window) {
      const elapsed = eventElapsed(motion.timeline[active], clock);
      visible = window.depart !== undefined ? elapsed < window.depart : elapsed >= window.land!;
    }
    return { ...home.pose, opacity: visible ? 1 : 0 };
  }
  const route = motion.flight!, from = route.from, to = route.to;
  const elapsed = eventElapsed(motion.timeline[route.transition], clock);
  const progress = Math.max(0, Math.min(1, (elapsed - route.delay) / route.duration));
  const t = settleProgress(progress, route.overshoot);
  const point = progress <= 0.78 ? railPoint(from.position, to.position, route.via, t) : to.position;
  // Overshoot follows the arrival tangent, rather than extrapolating a cubic back off its rail.
  const tangent: Vec3 = [to.position[0] - route.via[1][0], to.position[1] - route.via[1][1], to.position[2] - route.via[1][2]];
  const position: Vec3 = [point[0] + tangent[0] * Math.max(0, t - 1), point[1] + tangent[1] * Math.max(0, t - 1), point[2] + tangent[2] * Math.max(0, t - 1)];
  const blend = easeProgress(progress, "smoothstep");
  const weight = route.merge && progress >= route.swapAt ? 1 - easeProgress((progress - route.swapAt) / Math.max(0.0001, 1 - route.swapAt), "smoothstep") : 1;
  const visible = active === route.transition && elapsed >= route.delay && progress < 1 &&
    (motion.side === "from" ? route.merge || progress < route.swapAt : !route.merge && progress >= route.swapAt);
  const scale = mixVector(from.scale, to.scale, blend);
  return { position, rotation: mixVector(from.rotation, to.rotation, blend), scale: route.merge ? [scale[0] * weight, scale[1] * weight, scale[2] * weight] : scale,
    color: from.color && to.color ? mixVector(from.color, to.color, blend) : motion.side === "from" ? from.color : to.color, opacity: visible ? weight : 0 };
}
export function sampleBurst(motion: BurstMotion, clock: ClockSample) {
  "worklet";
  const elapsed = eventElapsed(motion.options, clock), lifetime = motion.options.lifetime ?? 0.55;
  const age = Math.max(0, Math.min(lifetime, elapsed));
  const origin = motion.options.position, v = motion.velocity, g = motion.gravity;
  const position: Vec3 = [origin[0] + v[0] * age + g[0] * age * age * 0.5, origin[1] + v[1] * age + g[1] * age * age * 0.5, origin[2] + v[2] * age + g[2] * age * age * 0.5];
  const vx = v[0] + g[0] * age, vy = v[1] + g[1] * age, vz = v[2] + g[2] * age;
  const rotation: Vec3 = [Math.atan2(vz, Math.hypot(vx, vy)), 0, -Math.atan2(vx, vy)];
  const interrupted = motion.until ? eventElapsed(motion.until, clock) : -Infinity;
  const cancelled = interrupted >= 0 && elapsed < interrupted;
  return { position, rotation, opacity: !cancelled && elapsed >= 0 && elapsed < lifetime ? Math.pow(1 - age / lifetime, 1.5) : 0 };
}
