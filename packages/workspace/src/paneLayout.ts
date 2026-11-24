import { closeDocumentTab, openDocumentTab, renameDocumentTab, type DocumentTabs } from "./workspaceState";

/** Side by side splits put the new pane on the right; vertical splits put it below. */
export type PaneAxis = "horizontal" | "vertical";

export type PaneNode =
  | { kind: "pane"; id: string }
  | { kind: "split"; id: string; axis: PaneAxis; fraction: number; first: PaneNode; second: PaneNode };

/** The document panes of one window: a binary split tree, each pane's tabs and the focused pane. */
export type PaneLayout = {
  focused: string;
  nextId: number;
  panes: Record<string, DocumentTabs>;
  root: PaneNode;
};

export type PaneRect = { height: number; width: number; x: number; y: number };

export type PaneFrame = PaneRect & { id: string };

/** A split's whole rect, plus the strip between its sides that resizes it. */
export type SplitFrame = PaneRect & { axis: PaneAxis; divider: PaneRect; id: string };

export const paneGap = 6;
export const paneMinWidth = 220;
export const paneMinHeight = 156;

export function createPaneLayout(tabs: DocumentTabs = { active: null, paths: [] }): PaneLayout {
  return { focused: "p0", nextId: 1, panes: { p0: tabs }, root: { kind: "pane", id: "p0" } };
}

/** Panes in reading order: a split's first side before its second. */
export function getPaneIds(node: PaneNode): string[] {
  return node.kind === "pane" ? [node.id] : [...getPaneIds(node.first), ...getPaneIds(node.second)];
}

function mapNode(node: PaneNode, change: (node: PaneNode) => PaneNode | undefined): PaneNode {
  const changed = change(node);
  if (changed) return changed;
  if (node.kind === "pane") return node;
  const first = mapNode(node.first, change);
  const second = mapNode(node.second, change);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

/** How many panes share the run along `axis`, looking through nested splits on the same axis. */
function runLength(node: PaneNode, axis: PaneAxis): number {
  return node.kind === "split" && node.axis === axis ? runLength(node.first, axis) + runLength(node.second, axis) : 1;
}

/** Shares a same-axis run evenly between its panes, so a third split column gets a third. */
function evenRun(node: PaneNode, axis: PaneAxis): PaneNode {
  if (node.kind !== "split" || node.axis !== axis) return node;
  const first = evenRun(node.first, axis);
  const second = evenRun(node.second, axis);
  const firstCount = runLength(first, axis);
  return { ...node, first, second, fraction: firstCount / (firstCount + runLength(second, axis)) };
}

/** Finds the outermost split of the same-axis run that contains `id`. */
function findRunRoot(node: PaneNode, id: string, axis: PaneAxis, runRoot?: PaneNode): PaneNode | undefined {
  const root = node.kind === "split" && node.axis === axis ? runRoot ?? node : undefined;
  if (node.id === id) return root ?? node;
  if (node.kind === "pane") return undefined;
  return findRunRoot(node.first, id, axis, root) ?? findRunRoot(node.second, id, axis, root);
}

/** Splits `paneId` (the focused pane by default); the new pane shows the same active document and takes focus. */
export function splitPane(layout: PaneLayout, axis: PaneAxis, paneId = layout.focused): PaneLayout {
  const tabs = layout.panes[paneId];
  if (!tabs) return layout;
  const newId = `p${layout.nextId}`;
  const splitId = `s${layout.nextId}`;
  let root = mapNode(layout.root, node => node.kind === "pane" && node.id === paneId
    ? { kind: "split", id: splitId, axis, fraction: 0.5, first: node, second: { kind: "pane", id: newId } }
    : undefined);
  const runRoot = findRunRoot(root, splitId, axis);
  if (runRoot) root = mapNode(root, node => node.id === runRoot.id ? evenRun(node, axis) : undefined);
  const newTabs = tabs.active ? { active: tabs.active, paths: [tabs.active] } : { active: null, paths: [] };
  return { focused: newId, nextId: layout.nextId + 1, panes: { ...layout.panes, [newId]: newTabs }, root };
}

function removeNode(node: PaneNode, paneId: string): { heir?: string; node: PaneNode } {
  if (node.kind === "pane") return { node };
  for (const [side, other] of [[node.first, node.second], [node.second, node.first]] as const) {
    if (side.kind === "pane" && side.id === paneId) return { heir: getPaneIds(other).at(side === node.first ? 0 : -1), node: other };
  }
  const first = removeNode(node.first, paneId);
  if (first.heir) return { heir: first.heir, node: { ...node, first: first.node } };
  const second = removeNode(node.second, paneId);
  return second.heir ? { heir: second.heir, node: { ...node, second: second.node } } : { node };
}

/** The pane that takes a closing pane's room, or undefined for the last pane. */
export function getPaneHeir(layout: PaneLayout, paneId: string) {
  return removeNode(layout.root, paneId).heir;
}

/**
 * Closes a pane; its room and tabs go to the neighbour that inherits it, so no file closes.
 * The heir keeps its own active tab unless the closed pane had focus, in which case focus and
 * the closed pane's active document move to the heir.
 */
export function closePane(layout: PaneLayout, paneId = layout.focused): PaneLayout {
  const { heir, node } = removeNode(layout.root, paneId);
  const closing = layout.panes[paneId];
  if (!heir || !closing) return layout;
  const heirTabs = layout.panes[heir];
  const paths = [...heirTabs.paths, ...closing.paths.filter(path => !heirTabs.paths.includes(path))];
  const wasFocused = layout.focused === paneId;
  const active = wasFocused && closing.active ? closing.active : heirTabs.active ?? closing.active;
  const panes = { ...layout.panes, [heir]: { active, paths } };
  delete panes[paneId];
  return { ...layout, focused: wasFocused ? heir : layout.focused, panes, root: node };
}

/** Moves every other pane's tabs into `paneId` and leaves it alone in the window. */
export function closeOtherPanes(layout: PaneLayout, paneId = layout.focused): PaneLayout {
  const tabs = layout.panes[paneId];
  if (!tabs) return layout;
  const paths = [...tabs.paths];
  for (const id of getPaneIds(layout.root)) {
    for (const path of layout.panes[id].paths) if (!paths.includes(path)) paths.push(path);
  }
  return { ...layout, focused: paneId, panes: { [paneId]: { active: tabs.active, paths } }, root: { kind: "pane", id: paneId } };
}

export function setSplitFraction(layout: PaneLayout, splitId: string, fraction: number): PaneLayout {
  return { ...layout, root: mapNode(layout.root, node => node.id === splitId && node.kind === "split" ? { ...node, fraction } : undefined) };
}

export function focusPane(layout: PaneLayout, paneId: string): PaneLayout {
  return layout.panes[paneId] && layout.focused !== paneId ? { ...layout, focused: paneId } : layout;
}

/** Focuses the next (or previous) pane in reading order, wrapping around. */
export function focusAdjacentPane(layout: PaneLayout, step: 1 | -1): PaneLayout {
  const ids = getPaneIds(layout.root);
  return focusPane(layout, ids[(ids.indexOf(layout.focused) + step + ids.length) % ids.length]);
}

function updateTabs(layout: PaneLayout, paneId: string, change: (tabs: DocumentTabs) => DocumentTabs): PaneLayout {
  const tabs = layout.panes[paneId];
  return tabs ? { ...layout, panes: { ...layout.panes, [paneId]: change(tabs) } } : layout;
}

export function openPaneTab(layout: PaneLayout, paneId: string, path: string) {
  return updateTabs(layout, paneId, tabs => openDocumentTab(tabs, path));
}

export function renamePaneTab(layout: PaneLayout, paneId: string, from: string, to: string) {
  return updateTabs(layout, paneId, tabs => renameDocumentTab(tabs, from, to));
}

/** Closes a tab; a split pane left with no tabs closes too. */
export function closePaneTab(layout: PaneLayout, paneId: string, path: string): PaneLayout {
  const next = updateTabs(layout, paneId, tabs => closeDocumentTab(tabs, path));
  return next.panes[paneId]?.paths.length === 0 ? closePane(next, paneId) : next;
}

/** Lays the tree out in `rect`: side-by-side panes keep a gap between them; stacked panes share an edge. */
export function layoutPanes(node: PaneNode, rect: PaneRect, frames: { panes: PaneFrame[]; splits: SplitFrame[] } = { panes: [], splits: [] }) {
  if (node.kind === "pane") {
    frames.panes.push({ id: node.id, ...rect });
    return frames;
  }
  const horizontal = node.axis === "horizontal";
  const gap = horizontal ? paneGap : 0;
  // As in Silica, each side counts with the gap that follows it, so evenly split panes come out the same width.
  const size = (horizontal ? rect.width : rect.height) - gap;
  const firstSize = Math.round((size + 2 * gap) * node.fraction) - gap;
  const first = horizontal ? { ...rect, width: firstSize } : { ...rect, height: firstSize };
  const second = horizontal
    ? { ...rect, width: size - firstSize, x: rect.x + firstSize + gap }
    : { ...rect, height: size - firstSize, y: rect.y + firstSize };
  // Stacked panes share an edge, so their handle straddles it.
  const divider = horizontal
    ? { height: rect.height, width: paneGap, x: rect.x + firstSize, y: rect.y }
    : { height: paneGap, width: rect.width, x: rect.x, y: rect.y + firstSize - paneGap / 2 };
  frames.splits.push({ axis: node.axis, divider, id: node.id, ...rect });
  layoutPanes(node.first, first, frames);
  layoutPanes(node.second, second, frames);
  return frames;
}

function minimumSize(node: PaneNode, axis: PaneAxis): number {
  if (node.kind === "pane") return axis === "horizontal" ? paneMinWidth : paneMinHeight;
  const first = minimumSize(node.first, axis);
  const second = minimumSize(node.second, axis);
  return node.axis === axis ? first + second + (axis === "horizontal" ? paneGap : 0) : Math.max(first, second);
}

/** Clamps a split's fraction so both sides keep their minimum size inside `size`. */
export function clampSplitFraction(node: Extract<PaneNode, { kind: "split" }>, size: number, fraction: number) {
  const gap = node.axis === "horizontal" ? paneGap : 0;
  const available = size + gap;
  if (size <= 0) return 0.5;
  const low = (minimumSize(node.first, node.axis) + gap) / available;
  const high = 1 - minimumSize(node.second, node.axis) / available;
  return low > high ? 0.5 : Math.min(high, Math.max(low, fraction));
}

export function findSplit(node: PaneNode, splitId: string): Extract<PaneNode, { kind: "split" }> | undefined {
  if (node.kind === "pane") return undefined;
  return node.id === splitId ? node : findSplit(node.first, splitId) ?? findSplit(node.second, splitId);
}

/** Whether the pane's frame has room for two minimum panes along `axis`. */
export function canSplitPane(frame: PaneRect | undefined, axis: PaneAxis) {
  if (!frame) return false;
  return axis === "horizontal" ? frame.width >= paneMinWidth * 2 + paneGap : frame.height >= paneMinHeight * 2;
}

function parseTabs(value: unknown): DocumentTabs | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { active, paths } = value as { active?: unknown; paths?: unknown };
  if (!Array.isArray(paths) || !paths.every(path => typeof path === "string")) return undefined;
  if (active !== null && (typeof active !== "string" || !paths.includes(active))) return undefined;
  return { active, paths: [...new Set(paths as string[])] };
}

function parseNode(value: unknown, ids: Set<string>): PaneNode | undefined {
  if (!value || typeof value !== "object") return undefined;
  const node = value as Record<string, unknown>;
  if (typeof node.id !== "string" || ids.has(node.id)) return undefined;
  ids.add(node.id);
  if (node.kind === "pane") return { kind: "pane", id: node.id };
  if (node.kind !== "split" || (node.axis !== "horizontal" && node.axis !== "vertical")) return undefined;
  if (typeof node.fraction !== "number" || !(node.fraction > 0 && node.fraction < 1)) return undefined;
  const first = parseNode(node.first, ids);
  if (!first) return undefined;
  const second = parseNode(node.second, ids);
  return second ? { kind: "split", id: node.id, axis: node.axis, fraction: node.fraction, first, second } : undefined;
}

/** Reads a saved layout; anything missing or inconsistent gives undefined, so the window falls back to one pane. */
export function parsePaneLayout(value: unknown): PaneLayout | undefined {
  if (!value || typeof value !== "object") return undefined;
  const saved = value as Record<string, unknown>;
  const nodeIds = new Set<string>();
  const root = parseNode(saved.root, nodeIds);
  if (!root || typeof saved.focused !== "string" || typeof saved.nextId !== "number" || !saved.panes || typeof saved.panes !== "object") return undefined;
  const ids = getPaneIds(root);
  const panes: Record<string, DocumentTabs> = {};
  for (const id of ids) {
    const tabs = parseTabs((saved.panes as Record<string, unknown>)[id]);
    if (!tabs) return undefined;
    panes[id] = tabs;
  }
  if (!ids.includes(saved.focused)) return undefined;
  let highestId = 0;
  for (const id of nodeIds) {
    const match = /^[ps](\d+)$/.exec(id);
    if (match) highestId = Math.max(highestId, Number(match[1]));
  }
  return { focused: saved.focused, nextId: Math.max(saved.nextId, highestId + 1), panes, root };
}

/** Which side of which axis a pane sits on, so it can grow from and shrink into its outer edge. */
export function getPanePlacement(node: PaneNode, paneId: string): { axis: PaneAxis; side: "first" | "second" } | undefined {
  if (node.kind === "pane") return undefined;
  if (node.first.kind === "pane" && node.first.id === paneId) return { axis: node.axis, side: "first" };
  if (node.second.kind === "pane" && node.second.id === paneId) return { axis: node.axis, side: "second" };
  return getPanePlacement(node.first, paneId) ?? getPanePlacement(node.second, paneId);
}

/** The zero-size rect at a pane's outer edge: trailing or bottom for a second side, leading or top for a first. */
export function collapsePaneRect(rect: PaneRect, placement: { axis: PaneAxis; side: "first" | "second" }): PaneRect {
  const trailing = placement.side === "second";
  return placement.axis === "horizontal"
    ? { ...rect, width: 0, x: trailing ? rect.x + rect.width : rect.x }
    : { ...rect, height: 0, y: trailing ? rect.y + rect.height : rect.y };
}
