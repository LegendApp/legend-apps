import type { Vec3 } from "./camera";
import type { TreeNode } from "./graph";
import { labelInstance, type Animated, type Instance, type Keyframe } from "./scene";
import { roundedBoxInstances, routedTubeInstances } from "./stage";

/** One step's renders: every node, a list of ids, or a node with all its descendants. */
export type RenderSelection = "all" | string[] | { subtree: string };
export type RenderFlash = RenderSelection | { nodes: RenderSelection; type?: string; color?: string };
export type RenderTreeOptions = {
  id?: string; data: TreeNode; flashes: (RenderFlash | undefined)[]; labels?: Record<string, string>;
  position?: Vec3; spacing?: [column: number, row: number]; card?: [width: number, height: number];
  color?: string; edgeColor?: string; flashColors?: Record<string, string>; depth?: number; radius?: number;
  routing?: "direct" | "orthogonal"; draw?: Animated<number>; pulses?: boolean; pulseDuration?: number; total?: { position: Vec3; size?: number } | false;
};

type Placed = { node: TreeNode; x: number; depth: number; parent?: Placed; ids: string[] };

/** Flat tidy tree facing the camera: leaves in consecutive columns, parents centered above their children. */
function place(data: TreeNode) {
  const placed: Placed[] = [];
  let column = 0, depth = 0;
  const visit = (node: TreeNode, level: number, parent?: Placed): Placed => {
    if (placed.some(item => item.node.id === node.id)) throw new Error(`Journey render tree has duplicate node id: ${node.id}`);
    const item: Placed = { node, x: 0, depth: level, parent, ids: [] };
    placed.push(item);
    depth = Math.max(depth, level);
    const kids = (node.children ?? []).map(child => visit(child, level + 1, item));
    item.x = kids.length ? (kids[0].x + kids[kids.length - 1].x) / 2 : column++;
    item.ids = [node.id, ...kids.flatMap(kid => kid.ids)];
    return item;
  };
  visit(data, 0);
  return { placed, columns: column, depth: depth + 1 };
}

function selected(flash: RenderSelection | undefined, placed: Placed[]) {
  if (!flash) return new Set<string>();
  if (flash === "all") return new Set(placed.map(item => item.node.id));
  if (Array.isArray(flash)) return new Set(flash);
  return new Set(placed.find(item => item.node.id === flash.subtree)?.ids ?? []);
}

/** A rise to `peak`, a slow settle to `rest`, and back to `idle` on the next step without a render. */
function pulseFrames(steps: boolean[], idle: number, peak: number, rest: number, delay: number) {
  const frames: Keyframe<number>[] = [{ step: 0, value: idle, duration: 0 }];
  steps.forEach((on, step) => {
    if (on) frames.push({ step, value: peak, duration: 0.25, delay, ease: "cubic" }, { step, value: rest, duration: 1.4, delay: delay + 0.25, ease: "smoothstep" });
    else if (step > 0 && steps[step - 1]) frames.push({ step, value: idle, duration: 0.9, ease: "smoothstep" });
  });
  return frames;
}

/** A step map that shows a label only on the steps where `visible` holds. */
function visibility(steps: boolean[]) {
  return Object.fromEntries(steps.map((on, step) => [step, on ? 1 : 0]));
}

/** Cards, edges and count labels for a render tree; flashes per step glow, and counts accumulate. */
export function renderTreeInstances({ id = "tree", data, flashes, labels = {}, position = [0, 0, 0], spacing = [2.4, 1.7], card = [2, 0.56], color = "#ffb547",
  edgeColor = "#2b3a4e", flashColors = {}, depth = 0.35, radius = 0.1, routing = "orthogonal", draw = 1, pulses = true, pulseDuration = 0.14, total = false }: RenderTreeOptions): Instance[] {
  const { placed, columns } = place(data);
  const at = (item: Placed): Vec3 => [position[0] + (item.x - (columns - 1) / 2) * spacing[0], position[1] - item.depth * spacing[1], position[2]];
  const current = flashes.map(flash => selected(flash && typeof flash === "object" && "nodes" in flash ? flash.nodes : flash, placed));
  const colors = flashes.map(flash => flash && typeof flash === "object" && "nodes" in flash ? flash.color ?? flashColors[flash.type ?? "render"] ?? color : flashColors.render ?? color);
  const instances: Instance[] = [];
  const totals = current.map((_, step) => current.slice(0, step + 1).reduce((sum, set) => sum + set.size, 0));
  for (const item of placed) {
    const nodeId = `${id}:${item.node.id}`, renders = current.map(set => set.has(item.node.id)), delay = item.depth * pulseDuration;
    const nodeColors = [{ step: 0, value: color, duration: 0 }, ...renders.flatMap((on, step) => on ? [{ step, value: colors[step], delay, duration: 0.08 }] : [])];
    const [x, y, z] = at(item);
    instances.push(...roundedBoxInstances({ id: nodeId, position: [x, y, z], scale: [card[0], card[1], depth], radius, color: nodeColors,
      emissive: pulseFrames(renders, 0.025, 0.42, 0.11, delay) }));
    instances.push(labelInstance({ id: `${nodeId}:label`, attach: nodeId, text: labels[item.node.id] ?? item.node.id, mono: true, align: "center",
      position: [0, 0, depth / 2 + 0.015], size: card[1] * 0.34, color: "#c9d5e3", emissive: 0.9 }));
    const counts = renders.map((_, step) => renders.slice(0, step + 1).filter(Boolean).length);
    for (const count of new Set(counts.filter(Boolean))) instances.push(labelInstance({ id: `${nodeId}:count:${count}`, attach: nodeId, text: String(count), mono: true,
      align: "right", position: [card[0] / 2 - 0.1, card[1] / 2 + 0.2, depth / 2 + 0.015], size: card[1] * 0.42, color, emissive: 2.2,
      opacity: visibility(counts.map(value => value === count)) }));
    if (item.parent) {
      const [px, py] = at(item.parent);
      const from: Vec3 = [px, py - card[1] / 2, z], to: Vec3 = [x, y + card[1] / 2, z];
      const middle = (from[1] + to[1]) / 2;
      instances.push(...routedTubeInstances({ id: `${nodeId}:edge`, path: routing === "direct" ? [from, to] : [from, [px, middle, z], [x, middle, z], to], draw,
        thickness: 0.018, color: edgeColor, emissive: 0.5,
        pulses: pulses ? renders.flatMap((on, step) => on ? [{ step, delay: 0.25 + (item.depth - 1) * pulseDuration, duration: pulseDuration, color: colors[step] }] : []) : [] }));
    }
  }
  if (total) for (const value of new Set(totals)) instances.push(labelInstance({ id: `${id}:total:${value}`, text: String(value), mono: true, align: "right",
    position: total.position, size: total.size ?? 0.6, color: "#e8eef6", emissive: 1.2, opacity: visibility(totals.map(sum => sum === value)) }));
  return instances;
}
