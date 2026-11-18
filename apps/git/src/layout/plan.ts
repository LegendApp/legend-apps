import { activeLayout, isPresetId, presetLayout, viewFor } from "../settings/presets";
import { presetIds, switchConditions, type GitSettings, type LayoutNode, type PanelId, type PresetId, type SplitChild, type ViewKind } from "../settings/schema";

export type LayoutDefinition = GitSettings["layout"]["layouts"][string];
export type SwitchCondition = (typeof switchConditions)[number];
export type LayoutConditions = Partial<Record<SwitchCondition, boolean>>;

/** What a pane renders: one panel instance, or panes along one axis with fixed sizes (D3 interim: no dividers inside the content). */
export type RenderPlan =
  | { type: "panel"; id: string; panel: PanelId; options?: Record<string, unknown> }
  | { type: "split"; direction: "row" | "column"; children: { plan: RenderPlan; size?: number; minSize?: number; maxSize?: number }[] };

/** The sidebar section a window shows, as the view kind whose tree lays it out. */
export function viewKindFor(section: string): ViewKind {
  if (section === "changes") return "changes";
  if (section === "history") return "history";
  if (section.startsWith("ref:")) return "ref";
  if (section.startsWith("stash:")) return "stash";
  if (section.startsWith("worktree:")) return "worktree";
  if (section === "review" || section.startsWith("review:")) return "review";
  if (section.startsWith("pr:")) return "pullRequest";
  return "history";
}

export const instanceId = (node: Extract<LayoutNode, { type: "panel" }>) => node.id ?? node.panel;

/**
 * A layout tree as panes for one moment: switches resolved by `conditions`, panels the view can't show dropped (a stash
 * has no commit list), and splits left with one pane replaced by it. null when nothing in the tree can show.
 */
export function renderPlan(node: LayoutNode, conditions: LayoutConditions, available: (panel: PanelId) => boolean): RenderPlan | null {
  if (node.type === "panel") return available(node.panel) ? { type: "panel", id: instanceId(node), panel: node.panel, ...node.options ? { options: node.options } : {} } : null;
  if (node.type === "switch") return renderPlan(node.cases.find(entry => conditions[entry.when])?.node ?? node.otherwise, conditions, available);
  const children = node.children.flatMap(child => {
    const plan = renderPlan(child.node, conditions, available);
    return plan ? [{ plan, ...pick(child) }] : [];
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!.plan;
  // The last pane flexes when every pane has a size, so the content always fills the window.
  if (children.every(child => child.size !== undefined)) delete children.at(-1)!.size;
  return { type: "split", direction: node.direction, children };
}

const pick = ({ size, minSize, maxSize }: SplitChild) => ({ ...size !== undefined ? { size } : {}, ...minSize !== undefined ? { minSize } : {}, ...maxSize !== undefined ? { maxSize } : {} });

/** Used when a view's tree has no panel the selection can show: files beside the diff. */
const fallbackTree: LayoutNode = { type: "split", direction: "row", children: [
  { node: { type: "panel", panel: "fileList" }, size: 320, minSize: 240 },
  { node: { type: "panel", panel: "diff" } },
] };

/** The plan for a window: the active layout's tree for `kind`, else the fallback, else a blank pane. */
export function windowPlan(settings: GitSettings, base: PresetId, kind: ViewKind, conditions: LayoutConditions, available: (panel: PanelId) => boolean): RenderPlan {
  return renderPlan(viewFor(activeLayout(settings, base), kind), conditions, available)
    ?? renderPlan(fallbackTree, conditions, available)
    ?? { type: "panel", id: "empty", panel: "empty" };
}

/** Panel instance ids in a plan, in order. */
export function planPanels(plan: RenderPlan): string[] {
  return plan.type === "panel" ? [plan.id] : plan.children.flatMap(child => planPanels(child.plan));
}

// ── Editing (View ▸ Layout) ─────────────────────────────────────────────────────

/** The name `layout.active` resolves to: a saved layout, a preset, or the base preset when it names neither. */
export function activeLayoutName(settings: GitSettings, base: PresetId): string {
  const { active, layouts } = settings.layout;
  return (Object.hasOwn(layouts, active) && layouts[active]?.views?.default) || isPresetId(active) ? active : base;
}

/** Layouts for View ▸ Layout: the presets, then saved layouts by name. */
export function layoutChoices(settings: GitSettings): { presets: PresetId[]; saved: string[] } {
  return { presets: [...presetIds], saved: Object.keys(settings.layout.layouts).filter(name => !isPresetId(name)).sort((a, b) => a.localeCompare(b)) };
}

/** Save Layout As…: the active layout as a named one, with the current sidebar width and collapse from window state. */
export function layoutSnapshot(settings: GitSettings, base: PresetId, state: { sidebarWidth?: number; sidebarCollapsed?: boolean }): LayoutDefinition {
  const current = activeLayout(settings, base);
  const copy = JSON.parse(JSON.stringify(current)) as LayoutDefinition;
  if (copy.sidebar !== null) {
    copy.sidebar = { ...copy.sidebar };
    if (state.sidebarWidth !== undefined) copy.sidebar.width = Math.round(state.sidebarWidth);
    if (state.sidebarCollapsed !== undefined) copy.sidebar.collapsed = state.sidebarCollapsed;
  }
  delete copy.description;
  return copy;
}

/** The preset a layout resets to: its own definition when it is a preset, else the base preset's. */
export const resetTarget = (name: string, base: PresetId): PresetId => isPresetId(name) ? name : base;
export const presetDefinition = (id: PresetId) => presetLayout(id);

export type MoveDirection = "left" | "right" | "up" | "down";

/**
 * Move Pane: swaps the pane holding panel `id` (or the ancestor pane along the move's axis) with its neighbor in
 * `direction`. Sizes stay with their positions' panes, so a moved panel keeps the size it had. null when it can't move.
 */
export function movePane(tree: LayoutNode, id: string, direction: MoveDirection): LayoutNode | null {
  const axis = direction === "left" || direction === "right" ? "row" : "column";
  const step = direction === "left" || direction === "up" ? -1 : 1;
  const path = pathTo(tree, id);
  if (!path) return null;
  // The nearest split along the axis where the pane has a neighbor that way.
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const { split, index } = path[depth]!;
    if (split.direction !== axis) continue;
    const target = index + step;
    if (target < 0 || target >= split.children.length) continue;
    const children = split.children.map(child => ({ ...child }));
    const moving = children[index]!.node;
    children[index]!.node = children[target]!.node;
    children[target]!.node = moving;
    // Sizes follow the panes, so the moved panel keeps its size.
    const swap = <K extends "size" | "minSize" | "maxSize" | "collapsible" | "holdingPriority">(key: K) => {
      const a = split.children[index]![key], b = split.children[target]![key];
      if (b === undefined) delete children[index]![key]; else children[index]![key] = b;
      if (a === undefined) delete children[target]![key]; else children[target]![key] = a;
    };
    (["size", "minSize", "maxSize", "collapsible", "holdingPriority"] as const).forEach(swap);
    return replaceAt(tree, path.slice(0, depth), { ...split, children });
  }
  return null;
}

type Step = { split: Extract<LayoutNode, { type: "split" }>; index: number };
/** The splits from the root down to the pane showing `id`; a switch is followed into the branch holding it. */
function pathTo(node: LayoutNode, id: string): Step[] | null {
  if (node.type === "panel") return instanceId(node) === id ? [] : null;
  // A switch moves as one pane: its parent split treats it as the pane holding `id`.
  if (node.type === "switch") return null;
  for (const [index, child] of node.children.entries()) {
    const inner = child.node.type === "switch" && containsPanel(child.node, id) ? [] : pathTo(child.node, id);
    if (inner) return [{ split: node, index }, ...inner];
  }
  return null;
}

function containsPanel(node: LayoutNode, id: string): boolean {
  if (node.type === "panel") return instanceId(node) === id;
  if (node.type === "switch") return [...node.cases.map(entry => entry.node), node.otherwise].some(branch => containsPanel(branch, id));
  return node.children.some(child => containsPanel(child.node, id));
}

function replaceAt(node: LayoutNode, path: Step[], replacement: LayoutNode): LayoutNode {
  if (path.length === 0) return replacement;
  const [{ split, index }, ...rest] = path;
  return { ...split!, children: split!.children.map((child, at) => at === index ? { ...child, node: replaceAt(child.node, rest, replacement) } : child) };
}
