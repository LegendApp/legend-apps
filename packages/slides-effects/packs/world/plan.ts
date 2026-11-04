import { trackIds } from "./track";
import { worldGraphTopology, type WorldGraphTopology } from "./render";
import { worldHeaderSize, worldInstanceSize, type Instance, type PreparedWorldScene } from "./scene";

/** Draw families share a pipeline and a contiguous uniform range. */
function family(part: Instance): string {
  return part.label ? "label" : part.card ? "card" : part.glyph ? `glyph:${part.glyph.font}:${part.glyph.segments}`
    : part.custom ? `custom:${part.custom.wgsl}:${part.custom.vertexCount}` : part.sdf ? `sdf:${JSON.stringify(part.sdf)}` : part.kind;
}
export type WorldPlan = { topology: WorldGraphTopology; slots: Record<string, number>; size: number };

/** Reserve room for an incoming declaration and one outgoing declaration; compatible slides keep one GPU graph. */
export function prepareWorldPlans(scenes: PreparedWorldScene[]): Map<PreparedWorldScene, WorldPlan> {
  const groups = new Map<string, { scenes: PreparedWorldScene[]; topology: WorldGraphTopology }>();
  const topologies = scenes.map(worldGraphTopology);
  for (const [i, scene] of scenes.entries()) {
    if (scene.effectUses.length) continue;
    const { counts, customs, sdfs, glyphs, cards, labels, ...appearance } = topologies[i];
    const key = JSON.stringify(appearance), group = groups.get(key);
    if (group) group.scenes.push(scene);
    else groups.set(key, { scenes: [scene], topology: topologies[i] });
  }
  // An outgoing declaration can have a different look, so every group reserves the same geometry families.
  const templates = new Map<string, Instance>(), capacities = new Map<string, number>();
  for (const scene of scenes) {
    const counts = new Map<string, number>();
    for (const part of scene.instances) {
      const key = family(part);
      templates.set(key, part);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) capacities.set(key, Math.max(capacities.get(key) ?? 0, count));
  }
  const glyphDraws = topologies.flatMap(topology => topology.glyphs ?? []);
  const plans = new Map<PreparedWorldScene, WorldPlan>();
  for (const { scenes: members, topology } of groups.values()) {
    const slots: Record<string, number> = {};
    let offset = 0;
    const reserve = (key: string) => {
      slots[key] = offset;
      const count = (capacities.get(key) ?? 0) * 2;
      offset += count;
      return count;
    };
    // Keep the same family order as prepareWorldScene and buildWorldGraph.
    topology.counts = { box: reserve("box"), ring: reserve("ring"), sphere: reserve("sphere"), tube: reserve("tube") };
    topology.customs = []; topology.sdfs = []; topology.glyphs = [];
    for (const key of [...templates.keys()].filter(key => key.startsWith("custom:")).sort()) {
      const start = offset, count = reserve(key);
      topology.customs.push({ ...templates.get(key)!.custom!, offset: start, count });
    }
    for (const key of [...templates.keys()].filter(key => key.startsWith("glyph:")).sort()) {
      const part = templates.get(key)!.glyph!, start = offset, count = reserve(key);
      const vertexCount = Math.max(...glyphDraws
        .filter(draw => draw.font === part.font && draw.segments === part.segments).map(draw => draw.vertexCount));
      topology.glyphs.push({ font: part.font, segments: part.segments, offset: start, count, vertexCount });
    }
    for (const key of [...templates.keys()].filter(key => key.startsWith("sdf:")).sort()) {
      const start = offset, count = reserve(key);
      topology.sdfs.push({ ...templates.get(key)!.sdf!, offset: start, count });
    }
    const cards = offset, cardCount = reserve("card"), labels = offset, labelCount = reserve("label");
    topology.cards = cardCount ? { offset: cards, count: cardCount } : undefined;
    topology.labels = labelCount ? { offset: labels, count: labelCount } : undefined;
    const plan = { topology, slots, size: worldHeaderSize + offset * worldInstanceSize };
    for (const scene of members) plans.set(scene, plan);
  }
  return plans;
}

/** Rapid navigation can retain more than the two declarations reserved by a pool. */
export function worldPlanFits(scene: PreparedWorldScene, plan: WorldPlan): boolean {
  const entries = Object.entries(plan.slots), cursors = { ...plan.slots };
  const limits = Object.fromEntries(entries.map(([key], i) => [key, entries[i + 1]?.[1] ?? (plan.size - worldHeaderSize) / worldInstanceSize]));
  return scene.instances.every(part => { const key = family(part); return cursors[key] !== undefined && cursors[key]++ < limits[key]; });
}

/** Coalesce the sorted source instances into contiguous copies to the shared draw ranges. */
export function worldPlanCopies(scene: PreparedWorldScene, plan: WorldPlan): [number, number, number][] {
  const cursors = { ...plan.slots }, copies: [number, number, number][] = [[0, worldHeaderSize, 0]];
  scene.instances.forEach((part, i) => {
    const key = family(part), target = worldHeaderSize + cursors[key]++ * worldInstanceSize;
    const source = worldHeaderSize + i * worldInstanceSize, last = copies.at(-1)!;
    if (last[0] + last[1] === source && last[2] + last[1] === target) last[1] += worldInstanceSize;
    else copies.push([source, worldInstanceSize, target]);
  });
  return copies;
}
/** The shared graph's empty draw slots have no identity; omitted parts retain their old uniforms by id. */
export function worldPlanIds(scene: PreparedWorldScene, plan: WorldPlan): string[] {
  const ids = new Array<string>((plan.size - worldHeaderSize) / worldInstanceSize).fill("");
  const cursors = { ...plan.slots }, source = trackIds(scene);
  scene.instances.forEach((part, i) => { ids[cursors[family(part)]++] = source[i]; });
  return ids;
}
export function sampleWorldPlan(values: number[] | Float32Array<ArrayBuffer>, copies: [number, number, number][], output: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  "worklet";
  output.fill(0);
  for (const [source, count, target] of copies) output.set(values instanceof Float32Array ? values.subarray(source, source + count) : values.slice(source, source + count), target);
  return output;
}
