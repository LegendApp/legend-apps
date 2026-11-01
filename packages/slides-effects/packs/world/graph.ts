import { clockAtTime, easeProgress, type ClockSample, type Vec3 } from "./camera";

export type TreeNode = { id: string; children?: TreeNode[] };
export type TreeBranch = string | [string, TreeBranch[]];
export function tree(id: string, children: TreeBranch[] = []): TreeNode {
  return { id, children: children.map(child => typeof child === "string" ? { id: child } : tree(child[0], child[1])) };
}
export type LayoutNode = { id: string; parent?: string; depth: number; position: Vec3; ancestors: string[] };
export type GraphLayout = { nodes: LayoutNode[]; edges: { source: string; target: string }[] };
export type Activation = { kind: "wave"; from: string; step: number; speed: number; intensity?: number; duration?: number }
  | { kind: "subset"; branches: string[]; step: number; intensity?: number; duration?: number };
export function wave({ from, step, speed = 0.35, intensity = 1, duration = 0.5 }: { from: string; step: number; speed?: number; intensity?: number; duration?: number }): Activation {
  return { kind: "wave", from, step, speed, intensity, duration };
}
export function subset({ branches, step, intensity = 1, duration = 0.5 }: { branches: string[]; step: number; intensity?: number; duration?: number }): Activation {
  return { kind: "subset", branches, step, intensity, duration };
}

export function layoutTree(data: TreeNode, { radius = 7, levelHeight = 2.4, position = [0, 3, 0] as Vec3 } = {}): GraphLayout {
  const nodes: LayoutNode[] = [], edges: GraphLayout["edges"] = [];
  const ids = new Set<string>();
  function visit(node: TreeNode, parent: LayoutNode | undefined, start: number, end: number) {
    if (ids.has(node.id)) throw new Error(`World graph has duplicate node id: ${node.id}`);
    ids.add(node.id);
    const depth = parent ? parent.depth + 1 : 0;
    const angle = (start + end) / 2;
    const r = depth === 0 ? 0 : radius * (1 - Math.exp(-depth * 0.55));
    const current: LayoutNode = { id: node.id, parent: parent?.id, depth,
      position: [position[0] + Math.sin(angle) * r, position[1] - depth * levelHeight, position[2] + Math.cos(angle) * r],
      ancestors: parent ? [...parent.ancestors, parent.id] : [] };
    nodes.push(current);
    if (parent) edges.push({ source: parent.id, target: node.id });
    const children = node.children ?? [];
    children.forEach((child, i) => visit(child, current, start + (end - start) * i / children.length, start + (end - start) * (i + 1) / children.length));
  }
  visit(data, undefined, 0, Math.PI * 2);
  return { nodes, edges };
}

function activationFrames(node: LayoutNode, nodes: LayoutNode[], activations: Activation[], clock: ClockSample, count: number): number {
  "worklet";
  let index = -1;
  for (let i = 0; i < count; i++) if (activations[i].step <= clock.stepIndex) index = i;
  if (index < 0) return 0;
  const activation = activations[index];
  let selected = false, delay = 0;
  if (activation.kind === "subset") selected = activation.branches.some(branch => node.id === branch || node.ancestors.includes(branch));
  else {
    const source = nodes.find(item => item.id === activation.from);
    selected = !!source && (node.id === source.id || node.ancestors.includes(source.id));
    if (selected && source) delay = Math.max(0, node.depth - source.depth) * activation.speed;
  }
  const origin = clock.stepOrigins[activation.step] ?? clock.slideTime - clock.stepTime;
  const previous = activationFrames(node, nodes, activations, clockAtTime(clock, origin), index);
  const elapsed = clock.slideTime - origin - delay;
  const completed = activation.step < clock.stepIndex && clock.stepOrigins[activation.step] === undefined;
  const t = completed ? 1 : easeProgress((activation.duration ?? 0.5) <= 0 ? elapsed >= 0 ? 1 : 0 : elapsed / (activation.duration ?? 0.5));
  return previous + ((selected ? activation.intensity ?? 1 : 0) - previous) * t;
}
export function activationAt(node: LayoutNode, nodes: LayoutNode[], activations: Activation[], clock: ClockSample) {
  "worklet";
  return activationFrames(node, nodes, activations, clock, activations.length);
}
