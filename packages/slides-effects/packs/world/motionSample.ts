import { easeProgress, mixVector, type ClockSample, type Vec3 } from "./camera";
import type { Instance } from "./scene";

export type PartPose = { position: Vec3; rotation?: Vec3; scale?: Vec3; color?: string };
export type ChoreographyPart = { id: string; instances: Instance[]; home: PartPose; origin?: Vec3 };
export type ChoreographyLayout = { id: string; parts: ChoreographyPart[] };
export type BurstStyle = { count?: number; lifetime?: number; color?: string; size?: number; speed?: number; spread?: Vec3; gravity?: Vec3; seed?: number };
export type BurstOptions = BurstStyle & { id?: string; position: Vec3; step?: number; at?: number; delay?: number };
export type PartRoute = { from: string; to: string; via?: [Vec3, Vec3]; delay?: number; swapAt?: number };
export type ChoreographyTransition = { from: string; to: string; step?: number; at?: number; duration?: number; stagger?: number; swapAt?: number; overshoot?: number; mapping?: PartRoute[]; onLand?: BurstStyle };
export type ChoreographyOptions = { id: string; layouts: ChoreographyLayout[]; transitions: ChoreographyTransition[] };
type Pose = { position: Vec3; rotation: Vec3; scale: Vec3; color?: Vec3 };
export type Trigger = { step?: number; at?: number; delay?: number };
export type Route = { from: number; to: number; via: [Vec3, Vec3]; delay: number; swapAt: number };
type Transition = Trigger & { from: number; to: number; duration: number; overshoot: number; routes: Route[] };
export type Model = { layouts: Pose[][]; transitions: Transition[] };
export type ChoreographyMotion = { model: Model; layout?: number; part?: number; transition?: number; route?: number; side?: "from" | "to"; local: Vec3; endOffset: Vec3; opacity: number };
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
function activeTransition(model: Model, clock: ClockSample) {
  "worklet";
  let active = -1;
  for (let i = 0; i < model.transitions.length; i++) if (eventElapsed(model.transitions[i], clock) >= 0) active = i;
  return active;
}
export function samplePartMotion(motion: ChoreographyMotion, clock: ClockSample): SampledPart {
  "worklet";
  const model = motion.model, active = activeTransition(model, clock), transition = model.transitions[active];
  if (motion.layout !== undefined) {
    const pose = model.layouts[motion.layout][motion.part!];
    let visible = active < 0 ? motion.layout === (model.transitions[0]?.from ?? 0) : false;
    if (transition) {
      const elapsed = eventElapsed(transition, clock);
      if (motion.layout === transition.from) visible = !transition.routes.some(route => route.from === motion.part && elapsed >= route.delay);
      if (motion.layout === transition.to) visible = transition.routes.some(route => route.to === motion.part && elapsed >= route.delay + transition.duration);
    }
    return { ...pose, opacity: visible ? 1 : 0 };
  }
  const own = model.transitions[motion.transition!], route = own.routes[motion.route!];
  const from = model.layouts[own.from][route.from], to = model.layouts[own.to][route.to];
  const progress = Math.max(0, Math.min(1, (eventElapsed(own, clock) - route.delay) / own.duration));
  const t = settleProgress(progress, own.overshoot);
  const point = progress <= 0.78 ? railPoint(from.position, to.position, route.via, t) : to.position;
  // Overshoot follows the arrival tangent, rather than extrapolating a cubic back off its rail.
  const tangent: Vec3 = [to.position[0] - route.via[1][0], to.position[1] - route.via[1][1], to.position[2] - route.via[1][2]];
  const position: Vec3 = [point[0] + tangent[0] * Math.max(0, t - 1), point[1] + tangent[1] * Math.max(0, t - 1), point[2] + tangent[2] * Math.max(0, t - 1)];
  const blend = easeProgress(progress, "smoothstep");
  const visible = active === motion.transition && eventElapsed(own, clock) >= route.delay && progress < 1 && (motion.side === "from" ? progress < route.swapAt : progress >= route.swapAt);
  return { position, rotation: mixVector(from.rotation, to.rotation, blend), scale: mixVector(from.scale, to.scale, blend),
    color: from.color && to.color ? mixVector(from.color, to.color, blend) : motion.side === "from" ? from.color : to.color, opacity: visible ? 1 : 0 };
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
