/** Pure layout and scale helpers shared by the data visuals; nothing here renders or animates. */

export type NumberFormat = { decimals?: number; prefix?: string; suffix?: string; separator?: string };

/** Worklet-safe grouping formatter: Intl is not available on every UI runtime. */
export function formatNumber(value: number, { decimals = 0, prefix = "", suffix = "", separator = "," }: NumberFormat = {}) {
  "worklet";
  const fixed = Math.abs(value).toFixed(decimals);
  const dot = fixed.indexOf(".");
  const whole = dot < 0 ? fixed : fixed.slice(0, dot);
  let grouped = "";
  for (let i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += separator;
    grouped += whole[i];
  }
  const sign = value < 0 && Number(fixed) !== 0 ? "-" : "";
  return sign + prefix + grouped + (dot < 0 ? "" : fixed.slice(dot)) + suffix;
}

/** Short tick labels: 1, 10, 100, 1k, 10k, 1M. */
export function compactNumber(value: number) {
  const units: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "k"]];
  for (const [size, unit] of units) if (Math.abs(value) >= size) return `${+(value / size).toFixed(1)}${unit}`;
  return `${+value.toFixed(value < 1 ? 2 : 1)}`;
}

export type TreeNode = { id: string; label?: string };
export type TreeEdge = readonly [parent: string, child: string];
export type PlacedNode = TreeNode & { x: number; depth: number; children: string[]; parent?: string };

/** Tidy layout: leaves take consecutive columns, parents center over their children. `x` is in leaf columns. */
export function layoutTree(nodes: readonly TreeNode[], edges: readonly TreeEdge[]) {
  const byId = new Map<string, PlacedNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) throw new Error(`Duplicate tree node "${node.id}"`);
    byId.set(node.id, { ...node, x: 0, depth: 0, children: [] });
  }
  for (const [parent, child] of edges) {
    const from = byId.get(parent), to = byId.get(child);
    if (!from || !to) throw new Error(`Tree edge ${parent} → ${child} names an unknown node`);
    if (to.parent !== undefined) throw new Error(`Tree node "${child}" has two parents`);
    to.parent = parent;
    from.children.push(child);
  }
  const roots = [...byId.values()].filter(node => node.parent === undefined);
  if (!roots.length) throw new Error("Tree has no root");
  let column = 0, depth = 0, visited = 0;
  const place = (node: PlacedNode, level: number) => {
    if (++visited > byId.size) throw new Error("Tree edges form a cycle");
    node.depth = level;
    depth = Math.max(depth, level);
    if (!node.children.length) { node.x = column++; return; }
    const kids = node.children.map(id => byId.get(id)!);
    for (const kid of kids) place(kid, level + 1);
    node.x = (kids[0].x + kids[kids.length - 1].x) / 2;
  };
  for (const root of roots) place(root, 0);
  if (visited !== byId.size) throw new Error("Tree edges form a cycle");
  return { nodes: nodes.map(node => byId.get(node.id)!), columns: column, depth: depth + 1 };
}

/** One step's renders: every node, a list of ids, or a node with all its descendants. */
export type TreeFlash = "all" | readonly string[] | { subtree: string };

export function flashedNodes(flash: TreeFlash | undefined, placed: readonly PlacedNode[]) {
  if (!flash) return new Set<string>();
  if (flash === "all") return new Set(placed.map(node => node.id));
  if (Array.isArray(flash)) return new Set(flash as readonly string[]);
  const byId = new Map(placed.map(node => [node.id, node]));
  const result = new Set<string>();
  const visit = (id: string) => { const node = byId.get(id); if (!node) return; result.add(id); node.children.forEach(visit); };
  visit((flash as { subtree: string }).subtree);
  return result;
}

/** Render counts accumulate over steps 0…step; `current` holds the ids rendering on `step` itself. */
export function renderCounts(flashes: readonly (TreeFlash | undefined)[], step: number, placed: readonly PlacedNode[]) {
  const counts: Record<string, number> = Object.fromEntries(placed.map(node => [node.id, 0]));
  let current = new Set<string>();
  for (let i = 0; i <= Math.min(step, flashes.length - 1); i++) {
    current = flashedNodes(flashes[i], placed);
    for (const id of current) if (id in counts) counts[id]++;
  }
  if (step >= flashes.length) current = new Set();
  return { counts, current, total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
}

/** Round up to 1, 2 or 5 times a power of ten. */
export function niceMaximum(value: number) {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find(step => step * power >= value * (1 - 1e-9)) ?? 10) * power;
}

export type AxisScale = "linear" | "log" | { break: readonly [from: number, to: number] };
export type Axis = { position(value: number): number; ticks: number[]; gap?: readonly [start: number, end: number] };

/** Map values to 0…1 along an axis. Broken axes give `[0, from]` and `[to, maximum]` 47% each around a 6% gap. */
export function createAxis(scale: AxisScale, maximum: number, minimum = 1): Axis {
  if (scale === "log") {
    const low = Math.log10(minimum), high = Math.log10(Math.max(maximum, minimum * 10));
    const ticks: number[] = [];
    for (let power = Math.ceil(low); power <= Math.floor(high); power++) ticks.push(10 ** power);
    return { ticks, position: value => value <= 0 ? 0 : Math.max(0, Math.min(1, (Math.log10(value) - low) / (high - low))) };
  }
  if (scale === "linear") {
    const top = maximum;
    return { ticks: [0, top / 4, top / 2, (top * 3) / 4, top], position: value => Math.max(0, Math.min(1, value / top)) };
  }
  const [from, to] = scale.break;
  if (!(from > 0 && to > from && maximum > to)) throw new Error("A broken axis needs 0 < from < to < maximum");
  const part = 0.47, gap: [number, number] = [part, 1 - part];
  return {
    gap,
    ticks: [0, from, to, maximum],
    position: value => value <= from ? Math.max(0, value / from) * part
      : value < to ? part + ((value - from) / (to - from)) * (gap[1] - part)
        : gap[1] + Math.min(1, (value - to) / (maximum - to)) * part,
  };
}
