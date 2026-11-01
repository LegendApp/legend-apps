import type { ClockSample, Vec3 } from "./camera";
import { colorVector, instanceOpacity, instancePosition, primitive, type Instance } from "./scene";
import type { BurstOptions, ChoreographyMotion, ChoreographyOptions, ChoreographyPart, Model, PartRoute, Route, Trigger } from "./motionSample";

export * from "./motionSample";

const templateClock: ClockSample = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };

/** Turn an existing mesh/instance array into independently moving parts, centered at their original homes. */
export function partsFromInstances(instances: Instance[]): ChoreographyPart[] {
  return instances.map((instance, index) => {
    const position = instancePosition(instance, templateClock);
    return { id: instance.id ?? `part:${index}`, instances: [instance], home: { position }, origin: position };
  });
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
      return { from: a, to: b, via: route.via ?? [[start[0], start[1] + 3, start[2]], [end[0], end[1], end[2] + 3]], delay: i * stagger + (route.delay ?? 0), swapAt, merge: false };
    });
    routes.forEach((route, i) => { route.merge = routes.some((candidate, j) => candidate.to === route.to && (candidate.delay < route.delay || candidate.delay === route.delay && j < i)); });
    if (source.some((_, part) => !routes.some(route => route.from === part)) || target.some((_, part) => !routes.some(route => route.to === part))) throw new Error("World choreography mapping must cover every source and target part");
    return { from, to, step: transition.step, at: transition.at, duration, overshoot, routes };
  });
  const instances: Instance[] = [];
  const clone = (part: ChoreographyPart, prefix: string, motion: Omit<ChoreographyMotion, "model" | "local" | "endOffset" | "opacity">) => {
    const names = new Map(part.instances.filter(instance => instance.id).map(instance => [instance.id!, `${prefix}:${instance.id}`]));
    const parents = new Map(part.instances.filter(instance => instance.id).map(instance => [instance.id!, instance]));
    for (let i = 0; i < part.instances.length; i++) {
      const template = part.instances[i];
      const local = template.label?.attach ? { ...template, label: { ...template.label, parent: parents.get(template.label.attach) } } : template;
      const position = instancePosition(local, templateClock), origin = part.origin ?? [0, 0, 0];
      instances.push({ ...template, id: template.id ? names.get(template.id) : `${prefix}:${i}`, motion: undefined,
        label: template.label ? { ...template.label, attach: template.label.attach ? names.get(template.label.attach) : undefined,
          parent: template.label.parent?.id ? { ...template.label.parent, id: names.get(template.label.parent.id) } : undefined } : undefined,
        choreography: { model, ...motion, local: [position[0] - origin[0], position[1] - origin[1], position[2] - origin[2]],
          endOffset: [template.end[0] - position[0], template.end[1] - position[1], template.end[2] - position[2]], opacity: instanceOpacity(local, templateClock) } });
    }
  };
  options.layouts.forEach((layout, layoutIndex) => layout.parts.forEach((part, partIndex) => clone(part, `${options.id}:home:${layout.id}:${part.id}`, { layout: layoutIndex, part: partIndex })));
  model.transitions.forEach((transition, index) => transition.routes.forEach((route, routeIndex) => {
    for (const side of ["from", "to"] as const) {
      const part = options.layouts[transition[side]].parts[route[side]];
      clone(part, `${options.id}:flight:${index}:${routeIndex}:${side}`, { transition: index, route: routeIndex, side });
    }
    const style = options.transitions[index].onLand;
    if (style) {
      const sparks = burstInstances({ ...style, id: `${options.id}:land:${index}:${routeIndex}`, step: transition.step, at: transition.at,
        delay: route.delay + transition.duration, position: model.layouts[transition.to][route.to].position, seed: (style.seed ?? 1) + routeIndex });
      const next = options.transitions[index + 1];
      if (next) for (const spark of sparks) spark.burst!.until = { step: next.step, at: next.at };
      instances.push(...sparks);
    }
  }));
  return instances;
}
