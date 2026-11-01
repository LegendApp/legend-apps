import { easeProgress, mixVector, type ClockSample, type Vec3 } from "./camera";
import { colorVector, instancePosition, primitive, type Instance } from "./scene";

export type PartPose = { position: Vec3; rotation?: Vec3; scale?: Vec3; color?: string };
export type ChoreographyPart = { id: string; instances: Instance[]; home: PartPose };
export type ChoreographyLayout = { id: string; parts: ChoreographyPart[] };
export type BurstStyle = { count?: number; lifetime?: number; color?: string; size?: number; speed?: number; spread?: Vec3; gravity?: Vec3; seed?: number };
export type BurstOptions = BurstStyle & { id?: string; position: Vec3; step?: number; at?: number; delay?: number };
export type PartRoute = { from: string; to: string; via?: [Vec3, Vec3]; delay?: number; swapAt?: number };
export type ChoreographyTransition = { from: string; to: string; step?: number; at?: number; duration?: number; stagger?: number; swapAt?: number; overshoot?: number; mapping?: PartRoute[]; onLand?: BurstStyle };
export type ChoreographyOptions = { id: string; layouts: ChoreographyLayout[]; transitions: ChoreographyTransition[] };
type Pose = { position: Vec3; rotation: Vec3; scale: Vec3; color?: Vec3 };
type Trigger = { step?: number; at?: number; delay?: number };
type Route = { from: number; to: number; via: [Vec3, Vec3]; delay: number; swapAt: number };
type Transition = Trigger & { from: number; to: number; duration: number; overshoot: number; routes: Route[] };
type Model = { layouts: Pose[][]; transitions: Transition[] };
export type ChoreographyMotion = { model: Model; layout?: number; part?: number; transition?: number; route?: number; side?: "from" | "to"; local: Vec3 };
export type BurstMotion = { options: BurstOptions; velocity: Vec3; gravity: Vec3 };
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
function positive(value: number, name: string, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error(`World ${name} must be ${allowZero ? "nonnegative" : "positive"}`);
}
function unit(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`World ${name} must be between zero and one`);
}
function verifyTrigger(trigger: Trigger) {
  if (trigger.step !== undefined && (!Number.isInteger(trigger.step) || trigger.step < 0)) throw new Error("World event step must be a nonnegative integer");
  if (trigger.at !== undefined) positive(trigger.at, "event time", true);
  if (trigger.at !== undefined && trigger.step !== undefined) throw new Error("World events use either at or step");
  positive(trigger.delay ?? 0, "event delay", true);
}
export function burstInstances(options: BurstOptions): Instance[] {
  verifyTrigger(options);
  const count = options.count ?? 18, speed = options.speed ?? 5, spread = options.spread ?? [1, 1, 1];
  if (!Number.isInteger(count) || count < 0 || count > 10000) throw new Error("World burst count must be between zero and 10000");
  positive(options.lifetime ?? 0.55, "burst lifetime"); positive(options.size ?? 0.025, "burst size"); positive(speed, "burst speed", true);
  let seed = (options.seed ?? 1) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: count }, (_, index) => {
    const angle = random() * Math.PI * 2, elevation = 0.15 + random() * 0.85, magnitude = speed * (0.4 + random() * 0.6);
    const velocity: Vec3 = [Math.cos(angle) * Math.sqrt(1 - elevation * elevation) * magnitude * spread[0], elevation * magnitude * spread[1], Math.sin(angle) * Math.sqrt(1 - elevation * elevation) * magnitude * spread[2]];
    return { ...primitive("box", { id: `${options.id ?? "burst"}:${index}`, position: options.position, size: options.size ?? 0.025,
      scale: [0.6, 2.5, 0.6], color: options.color ?? "#ffc76b", emissive: 12 }),
      burst: { options, velocity, gravity: options.gravity ?? [0, -9.8, 0] } };
  });
}
export function sampleBurst(motion: BurstMotion, clock: ClockSample) {
  "worklet";
  const elapsed = eventElapsed(motion.options, clock), lifetime = motion.options.lifetime ?? 0.55;
  const age = Math.max(0, Math.min(lifetime, elapsed));
  const origin = motion.options.position, v = motion.velocity, g = motion.gravity;
  const position: Vec3 = [origin[0] + v[0] * age + g[0] * age * age * 0.5, origin[1] + v[1] * age + g[1] * age * age * 0.5, origin[2] + v[2] * age + g[2] * age * age * 0.5];
  return { position, opacity: elapsed >= 0 && elapsed < lifetime ? Math.pow(1 - age / lifetime, 1.5) : 0 };
}
export function choreographyInstances(options: ChoreographyOptions): Instance[] {
  if (!options.layouts.length) throw new Error("World choreography needs at least one layout");
  const ids = new Set<string>();
  for (const layout of options.layouts) {
    if (ids.has(layout.id)) throw new Error(`World choreography layout id is duplicated: ${layout.id}`);
    ids.add(layout.id);
    const parts = new Set<string>();
    for (const part of layout.parts) {
      if (parts.has(part.id)) throw new Error(`World choreography part id is duplicated: ${part.id}`);
      parts.add(part.id);
    }
    if (!parts.size) throw new Error("World choreography layouts need parts");
  }
  const model: Model = { layouts: options.layouts.map(layout => layout.parts.map(part => ({ position: part.home.position,
    rotation: part.home.rotation ?? [0, 0, 0], scale: part.home.scale ?? [1, 1, 1], color: part.home.color ? colorVector(part.home.color) : undefined }))), transitions: [] };
  model.transitions = options.transitions.map((transition, index) => {
    verifyTrigger(transition);
    const from = options.layouts.findIndex(layout => layout.id === transition.from), to = options.layouts.findIndex(layout => layout.id === transition.to);
    if (from < 0 || to < 0 || from === to) throw new Error("World choreography transition needs two distinct known layouts");
    if (index > 0 && transition.from !== options.transitions[index - 1].to) throw new Error("World choreography transitions must form a continuous itinerary");
    const source = options.layouts[from].parts, target = options.layouts[to].parts;
    const mapping: PartRoute[] = transition.mapping ?? Array.from({ length: Math.max(source.length, target.length) }, (_, i) => ({ from: source[i % source.length].id, to: target[i % target.length].id }));
    const duration = transition.duration ?? 1.4, stagger = transition.stagger ?? 0.05, overshoot = transition.overshoot ?? 0.08;
    positive(duration, "choreography duration"); positive(stagger, "choreography stagger", true); positive(overshoot, "choreography overshoot", true);
    const routes = mapping.map((route, i): Route => {
      const a = source.findIndex(part => part.id === route.from), b = target.findIndex(part => part.id === route.to);
      if (a < 0 || b < 0) throw new Error("World choreography route references an unknown part");
      const start = source[a].home.position, end = target[b].home.position, swapAt = route.swapAt ?? transition.swapAt ?? 0.5;
      unit(swapAt, "geometry swap point"); positive(route.delay ?? 0, "route delay", true);
      return { from: a, to: b, via: route.via ?? [[start[0], start[1] + 3, start[2]], [end[0], end[1] + 3, end[2]]], delay: i * stagger + (route.delay ?? 0), swapAt };
    });
    if (source.some((_, part) => !routes.some(route => route.from === part)) || target.some((_, part) => !routes.some(route => route.to === part))) throw new Error("World choreography mapping must cover every source and target part");
    return { from, to, step: transition.step, at: transition.at, duration, overshoot, routes };
  });
  const instances: Instance[] = [], initialClock: ClockSample = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };
  const clone = (part: ChoreographyPart, prefix: string, motion: Omit<ChoreographyMotion, "model" | "local">) => {
    const names = new Map(part.instances.filter(instance => instance.id).map(instance => [instance.id!, `${prefix}:${instance.id}`]));
    for (let i = 0; i < part.instances.length; i++) {
      const template = part.instances[i];
      instances.push({ ...template, id: template.id ? names.get(template.id) : `${prefix}:${i}`, motion: undefined,
        label: template.label ? { ...template.label, attach: template.label.attach ? names.get(template.label.attach) : undefined,
          parent: template.label.parent?.id ? { ...template.label.parent, id: names.get(template.label.parent.id) } : undefined } : undefined,
        choreography: { model, ...motion, local: instancePosition(template, initialClock) } });
    }
  };
  options.layouts.forEach((layout, layoutIndex) => layout.parts.forEach((part, partIndex) => clone(part, `${options.id}:home:${layout.id}:${part.id}`, { layout: layoutIndex, part: partIndex })));
  model.transitions.forEach((transition, index) => transition.routes.forEach((route, routeIndex) => {
    for (const side of ["from", "to"] as const) {
      const part = options.layouts[transition[side]].parts[route[side]];
      clone(part, `${options.id}:flight:${index}:${routeIndex}:${side}`, { transition: index, route: routeIndex, side });
    }
    const style = options.transitions[index].onLand;
    if (style) instances.push(...burstInstances({ ...style, id: `${options.id}:land:${index}:${routeIndex}`, step: transition.step, at: transition.at,
      delay: route.delay + transition.duration, position: model.layouts[transition.to][route.to].position, seed: (style.seed ?? 1) + routeIndex }));
  }));
  return instances;
}
