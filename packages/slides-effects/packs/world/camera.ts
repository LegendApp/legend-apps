export type Vec3 = [number, number, number];
export type Ease = "linear" | "cubic" | "smoothstep" | "expo" | "spring";
export type ClockSample = { slideTime: number; stepTime: number; stepIndex: number; stepOrigins: Record<number, number> };
export type CameraPose = { position: Vec3; target: Vec3; fov: number; roll: number };
export type Shot = {
  step?: number; at?: number; position?: Vec3; target?: Vec3; fov?: number; roll?: number;
  orbit?: { center: Vec3; radius: number; speed?: number; height?: number; phase?: number };
  dolly?: number; follow?: string; duration?: number; ease?: Ease;
};
export type CameraOptions = { shots?: Shot[]; duration?: number; ease?: Ease };
type ObjectPositions = Record<string, Vec3> | ((id: string, clock: ClockSample) => Vec3 | undefined);
export const defaultPose: CameraPose = { position: [0, 5, 18], target: [0, 0, 0], fov: 42, roll: 0 };

export function easeProgress(value: number, ease: Ease = "cubic") {
  "worklet";
  const p = Math.max(0, Math.min(1, value));
  if (ease === "linear") return p;
  if (ease === "smoothstep") return p * p * (3 - 2 * p);
  if (ease === "expo") return p === 0 || p === 1 ? p : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2;
  if (ease === "spring") return p === 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(p * 10);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
export function mixVector(a: Vec3, b: Vec3, t: number): Vec3 {
  "worklet";
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function shotOrigin(shot: { step?: number; at?: number }, clock: ClockSample) {
  "worklet";
  return shot.at ?? clock.stepOrigins[shot.step ?? 0] ?? ((shot.step ?? 0) === 0 ? 0 : clock.slideTime - clock.stepTime);
}
export function clockAtTime(clock: ClockSample, slideTime: number): ClockSample {
  "worklet";
  return { ...clock, slideTime, stepTime: clock.stepTime - (clock.slideTime - slideTime) };
}
function destination(shot: Shot, base: CameraPose, elapsed: number, objects: ObjectPositions, clock: ClockSample): CameraPose {
  "worklet";
  let position = shot.position ?? base.position;
  const followed = shot.follow ? typeof objects === "function" ? objects(shot.follow, clock) : objects[shot.follow] : undefined;
  let target = followed ?? shot.target ?? base.target;
  if (shot.orbit) {
    const orbit = shot.orbit;
    const angle = (orbit.phase ?? 0) + elapsed * (orbit.speed ?? 0.12);
    position = [orbit.center[0] + Math.sin(angle) * orbit.radius, orbit.center[1] + (orbit.height ?? 4), orbit.center[2] + Math.cos(angle) * orbit.radius];
    target = followed ?? orbit.center;
  }
  if (shot.dolly !== undefined) {
    const dx = position[0] - target[0], dy = position[1] - target[1], dz = position[2] - target[2];
    const scale = Math.max(0.05, shot.dolly) / Math.max(0.001, Math.sqrt(dx * dx + dy * dy + dz * dz));
    position = [target[0] + dx * scale, target[1] + dy * scale, target[2] + dz * scale];
  }
  return { position, target, fov: shot.fov ?? base.fov, roll: shot.roll ?? base.roll };
}

function evaluateShots(options: CameraOptions, clock: ClockSample, objects: ObjectPositions, count: number): CameraPose {
  "worklet";
  const shots = options.shots ?? [];
  let index = -1;
  for (let i = 0; i < count; i++) if (shots[i].at !== undefined ? clock.slideTime >= shots[i].at! : clock.stepIndex >= (shots[i].step ?? 0)) index = i;
  if (index < 0) return defaultPose;
  const shot = shots[index];
  const start = shotOrigin(shot, clock);
  const elapsed = Math.max(0, clock.slideTime - start);
  const from = index === 0 ? defaultPose : evaluateShots(options, clockAtTime(clock, start), objects, index);
  const end = destination(shot, from, elapsed, objects, clock);
  const duration = shot.duration ?? options.duration ?? 1.2;
  const completed = shot.at === undefined && (shot.step ?? 0) < clock.stepIndex && clock.stepOrigins[shot.step ?? 0] === undefined;
  const t = index === 0 || completed ? 1 : easeProgress(duration <= 0 ? 1 : elapsed / duration, shot.ease ?? options.ease);
  return { position: mixVector(from.position, end.position, t), target: mixVector(from.target, end.target, t),
    fov: from.fov + (end.fov - from.fov) * t, roll: from.roll + (end.roll - from.roll) * t };
}
/** Stateless evaluation also handles direct step jumps and backwards scrubbing. */
export function evaluateCamera(options: CameraOptions, clock: ClockSample, objects: ObjectPositions = {}, previous?: CameraPose | null, enterDuration = 1): CameraPose {
  "worklet";
  let pose = evaluateShots(options, clock, objects, options.shots?.length ?? 0);
  if (previous) {
    const t = easeProgress(enterDuration <= 0 ? 1 : clock.slideTime / enterDuration, options.ease);
    pose = { position: mixVector(previous.position, pose.position, t), target: mixVector(previous.target, pose.target, t),
      fov: previous.fov + (pose.fov - previous.fov) * t, roll: previous.roll + (pose.roll - previous.roll) * t };
  }
  return pose;
}
