import type { MacOSToolbarItem } from "@legendapp/spark/windows/macos";
import { commandIds, commandMeta, resolveCommandId, type MenuTarget } from "./commandMeta";
import { commandEnabled, commandLabel, commandMenuItem, defaultShortcut, type CommandContext, type CommandId } from "./commands";
import { queuePushTarget, type QueueEntry } from "./gitQueue";
import type { GitSettings, MenuEntry } from "./settings/schema";
import type { SettingsIssue } from "./settings/validate";

type ToolbarWidget = "branchPicker" | "viewSwitcher" | "search" | "networkProgress";

// ── Key bindings ─────────────────────────────────────────────────────────────

const modifierOrder = ["Cmd", "Ctrl", "Alt", "Shift", "Fn"] as const;
const modifierNames: Record<string, (typeof modifierOrder)[number]> = { cmd: "Cmd", command: "Cmd", ctrl: "Ctrl", control: "Ctrl", alt: "Alt", option: "Alt", shift: "Shift", fn: "Fn" };
/** One spelling per key combination ("Ctrl+Cmd+G" and "cmd+ctrl+g" are the same keys), for finding conflicts. */
export function normalizeAccelerator(accelerator: string) {
  const parts = accelerator.split("+").map(part => part.trim());
  const key = parts.pop()!.toLowerCase();
  const modifiers = new Set(parts.map(part => modifierNames[part.toLowerCase()] ?? part));
  return [...modifierOrder.filter(modifier => modifiers.has(modifier)), key].join("+");
}

export type KeyBindings = {
  /** Each command's bindings, first = its menu key equivalent; commands without one are absent. */
  keys: ReadonlyMap<CommandId, readonly string[]>;
  /** Commands whose bindings come from settings (the window's hotkey router adds the ones menus can't carry). */
  custom: ReadonlySet<CommandId>;
  issues: SettingsIssue[];
};

/**
 * Settings bindings over the registry's defaults. `[]` unbinds; an unknown id is skipped (it stays in the file). A
 * combination bound twice keeps its first owner: settings bindings in file order, then the defaults in registry order.
 */
export function resolveKeyBindings(keybindings: GitSettings["keybindings"], file = "settings.json"): KeyBindings {
  const issues: SettingsIssue[] = [];
  const lists = new Map<CommandId, readonly string[]>(), custom = new Set<CommandId>();
  for (const [id, bindings] of Object.entries(keybindings)) {
    const command = resolveCommandId(id);
    if (!command) { issues.push({ file, path: `keybindings.${id}`, level: "warning", message: `unknown command "${id}"; skipped` }); continue; }
    lists.set(command, bindings);
    custom.add(command);
  }
  for (const id of commandIds) if (!lists.has(id)) { const shortcut = defaultShortcut(id); if (shortcut) lists.set(id, [shortcut]); }
  const owners = new Map<string, CommandId>(), keys = new Map<CommandId, string[]>();
  for (const [id, bindings] of lists) for (const binding of bindings) {
    const normalized = normalizeAccelerator(binding);
    const owner = owners.get(normalized);
    if (owner === id) continue;
    if (owner) {
      issues.push({ file, path: `keybindings.${id}`, level: "warning", message: `${binding} is bound to "${owner}" already; not bound to "${id}"` });
      continue;
    }
    owners.set(normalized, id);
    keys.set(id, [...keys.get(id) ?? [], binding]);
  }
  return { keys, custom, issues };
}

/**
 * Bindings menus can't carry, for the window's hotkey router: a settings command's extra bindings, and every binding of
 * a settings command the menu bar doesn't list. Default bindings stay with the menu bar (and AppKit's own items).
 */
export function routedBindings(bindings: KeyBindings, menuCommands: ReadonlySet<string>) {
  const routed: Partial<Record<CommandId, readonly string[]>> = {};
  for (const id of bindings.custom) {
    const keys = bindings.keys.get(id) ?? [];
    const extra = menuCommands.has(id) ? keys.slice(1) : keys;
    if (extra.length) routed[id] = extra;
  }
  return routed;
}

/** The command ids a menu bar lists, for `routedBindings`. */
export function menuCommandIds(items: readonly unknown[], into = new Set<string>()) {
  for (const item of items as { id?: string; items?: unknown[] }[]) {
    if (item.items) menuCommandIds(item.items, into);
    else if (item.id && resolveCommandId(item.id) === item.id) into.add(item.id);
  }
  return into;
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

export type ToolbarSlot =
  | { kind: "command"; id: CommandId; label?: string; symbol?: string; placement: "leading" | "trailing" }
  | { kind: "widget"; widget: ToolbarWidget; placement: "leading" | "trailing" };

/**
 * The toolbar's items in order. Spark's toolbar has one flexible space, between its leading and trailing items: what
 * comes before the first `flexibleSpace` leads, the rest trails (all of it without one). Fixed spaces, later flexible
 * spaces, unknown ids and repeats are skipped (capabilityIssues and validation report them).
 */
export function toolbarSlots(toolbar: GitSettings["toolbar"]): ToolbarSlot[] {
  const split = toolbar.items.indexOf("flexibleSpace");
  const slots: ToolbarSlot[] = [], seen = new Set<string>();
  toolbar.items.forEach((entry, index) => {
    const placement = index < split ? "leading" : "trailing";
    if (entry === "space" || entry === "flexibleSpace") return;
    if (entry === "branchPicker" || entry === "viewSwitcher" || entry === "search" || entry === "networkProgress") {
      if (!seen.has(entry)) slots.push({ kind: "widget", widget: entry, placement });
      seen.add(entry);
      return;
    }
    const command = resolveCommandId(typeof entry === "string" ? entry : entry.command);
    if (!command || seen.has(command)) return;
    seen.add(command);
    const { label, symbol } = typeof entry === "string" ? {} : entry;
    slots.push({ kind: "command", id: command, placement, ...label ? { label } : {}, ...symbol ? { symbol } : {} });
  });
  return slots;
}

/**
 * The window's toolbar items. A command is a button with its symbol and label; without a repository only the commands
 * that work without one show. Widgets need a repository and come from the window (`widgets`).
 */
export function toolbarItems(slots: readonly ToolbarSlot[], context: CommandContext, widgets: Record<ToolbarWidget, () => MacOSToolbarItem[]>): MacOSToolbarItem[] {
  return slots.flatMap((slot): MacOSToolbarItem[] => {
    if (slot.kind === "widget") return context.hasRepository ? widgets[slot.widget]().map(item => ({ ...item, placement: slot.placement })) : [];
    const enabled = commandEnabled(slot.id, context);
    if (!context.hasRepository && !enabled) return [];
    const meta = commandMeta[slot.id] as { symbol?: string; toolbarLabel?: string };
    const tooltip = commandLabel(slot.id, context);
    return [{ type: "button", id: slot.id, label: slot.label ?? meta.toolbarLabel ?? tooltip, symbol: slot.symbol ?? meta.symbol ?? "questionmark.square", tooltip, disabled: !enabled,
      ...slot.placement === "leading" ? { placement: "leading" as const } : {} }];
  });
}

// ── Context menus ────────────────────────────────────────────────────────────

/** Today's menus. Entries that don't apply to what was clicked (Merge on the current branch) are left out when shown. */
export const defaultContextMenus: Record<MenuTarget, readonly MenuEntry[]> = {
  commit: ["compare-with-selected", "separator", "new-branch", "separator", "cherry-pick-commit", "revert-commit", "interactive-rebase-commit", "separator", "copy-sha", "open-github"],
  file: ["use-ours", "use-theirs", "use-both", "mark-resolved", "separator", "show-file-history"],
  branch: ["checkout-ref", "new-branch", "separator", "merge-ref", "rebase-ref", "interactive-rebase-ref", "separator", "rename-branch", "delete-branch", "separator", "create-pull-request", "separator", "copy-ref-name"],
  remoteBranch: ["checkout-ref", "new-branch", "separator", "merge-ref", "rebase-ref", "interactive-rebase-ref", "separator", "copy-ref-name"],
  tag: ["new-branch", "separator", "copy-ref-name"],
  stash: ["apply-stash", "pop-stash", "separator", "drop-stash"],
  worktree: ["open-worktree", "reveal-worktree", "separator", "remove-worktree"],
  diffLine: ["blame-line"],
  pullRequest: ["checkout-pull-request", "pull-request-worktree"],
  reviewEntry: ["open-worktree", "push-review", "separator", "reveal-worktree"],
};

/** What a context menu was opened on. */
export type MenuSubject =
  | { target: "commit"; oid: string }
  | { target: "file"; path: string }
  | { target: "branch" | "remoteBranch" | "tag"; ref: string; name: string; current: boolean }
  | { target: "stash"; oid: string }
  | { target: "worktree"; path: string }
  | { target: "diffLine" }
  | { target: "pullRequest"; number: number }
  | { target: "reviewEntry"; entry: QueueEntry };

/** The target a command runs with from this menu (a Review Queue worktree's commands take its path, Push its id). */
export function menuCommandTarget(subject: MenuSubject, id: string): string | undefined {
  switch (subject.target) {
    case "commit": case "stash": return subject.oid;
    case "file": case "worktree": return subject.path;
    case "branch": case "remoteBranch": case "tag": return subject.ref;
    case "pullRequest": return String(subject.number);
    case "reviewEntry": return id === "push-review" ? subject.entry.id : subject.entry.kind === "worktree" ? subject.entry.path : undefined;
    case "diffLine": return undefined;
  }
}

/** The command can act on what a `target` menu was opened on. */
const actsOn = (id: CommandId, target: MenuTarget) => !!(commandMeta[id] as { targets?: readonly MenuTarget[] }).targets?.includes(target);

const conflictPicks = new Set<string>(["use-ours", "use-theirs", "use-both"]);
const mergeCommands = new Set<string>(["merge-ref", "rebase-ref", "interactive-rebase-ref"]);
/** Entries left out of the menu for what was clicked, as the hand-built menus did. */
function hidden(subject: MenuSubject, id: CommandId, context: CommandContext, target: string | undefined) {
  if (subject.target === "file") {
    if (conflictPicks.has(id)) return !context.conflicts.some(entry => entry.path === subject.path) || !commandEnabled(id, context, target);
    if (id === "mark-resolved") return !context.conflicts.some(entry => entry.path === subject.path);
  }
  if (subject.target === "branch") {
    if (mergeCommands.has(id)) return subject.current;
    if (id === "create-pull-request") return !subject.current;
  }
  if (subject.target === "reviewEntry" && (id === "open-worktree" || id === "reveal-worktree")) return subject.entry.kind !== "worktree";
  return false;
}

/** Labels that name what was clicked. */
function menuLabel(subject: MenuSubject, id: CommandId, context: CommandContext): string | undefined {
  const current = context.currentBranch ?? "the current branch";
  if (subject.target === "commit" && id === "new-branch") return "New Branch from Commit…";
  if (subject.target === "branch" || subject.target === "remoteBranch" || subject.target === "tag") {
    if (id === "new-branch") return `New Branch from “${subject.name}”…`;
    if (id === "merge-ref") return `Merge “${subject.name}” into “${current}”…`;
    if (id === "rebase-ref") return `Rebase “${current}” onto “${subject.name}”…`;
    if (id === "interactive-rebase-ref") return `Rebase “${current}” Interactively onto “${subject.name}”…`;
  }
  if ((subject.target === "worktree" || subject.target === "reviewEntry") && id === "open-worktree") return "Open in New Window";
  if (subject.target === "worktree" && id === "remove-worktree") return "Remove…";
  if (subject.target === "reviewEntry" && id === "push-review") return queuePushTarget(subject.entry)?.publish ? "Publish Branch…" : "Push";
  return undefined;
}

type ContextMenuItem = { type: "separator" } | { type: "action"; id: string; label: string; shortcut?: string; disabled: boolean };

/**
 * A context menu's items, built when it opens: the settings' list for the target, or the default one (a list replaces
 * the default whole). Commands that can't act on the target and unknown ids are skipped; Spark context menus have no
 * submenus, so a submenu's items follow its title (a disabled row) between separators. Separators never lead, trail or
 * repeat.
 */
export function contextMenuItems(subject: MenuSubject, menus: GitSettings["contextMenus"], context: CommandContext): ContextMenuItem[] {
  const items: ContextMenuItem[] = [], seen = new Set<string>();
  const separator = () => { if (items.length && items.at(-1)!.type !== "separator") items.push({ type: "separator" }); };
  const visit = (entries: readonly MenuEntry[]) => {
    for (const entry of entries) {
      if (entry === "separator") { separator(); continue; }
      if (typeof entry !== "string") {
        const start = items.length;
        separator();
        items.push({ type: "action", id: `submenu:${entry.submenu}`, label: entry.submenu, disabled: true });
        const heading = items.length;
        visit(entry.items);
        if (items.length === heading) items.length = start;
        else separator();
        continue;
      }
      const id = resolveCommandId(entry);
      if (!id || seen.has(id) || !actsOn(id, subject.target)) continue;
      const target = menuCommandTarget(subject, id);
      if (hidden(subject, id, context, target)) continue;
      seen.add(id);
      const item = commandMenuItem(id, context, { target, shortcut: false });
      const label = menuLabel(subject, id, context);
      items.push(label ? { ...item, label } : item);
    }
  };
  visit(menus[subject.target] ?? defaultContextMenus[subject.target]);
  while (items.at(-1)?.type === "separator") items.pop();
  return items;
}

/** Context menu entries that name a command which can't act on that menu's target; they are skipped. */
export function contextMenuIssues(menus: GitSettings["contextMenus"], file = "settings.json"): SettingsIssue[] {
  const issues: SettingsIssue[] = [];
  const visit = (target: MenuTarget, entries: readonly MenuEntry[], path: string) => entries.forEach((entry, index) => {
    if (typeof entry !== "string") { visit(target, entry.items, `${path}.${index}.items`); return; }
    const id = entry === "separator" ? null : resolveCommandId(entry);
    if (id && !actsOn(id, target)) {
      issues.push({ file, path: `${path}.${index}`, level: "warning", message: `"${entry}" can't act on a ${target}; skipped` });
    }
  });
  for (const [target, entries] of Object.entries(menus) as [MenuTarget, readonly MenuEntry[] | undefined][]) if (entries) visit(target, entries, `contextMenus.${target}`);
  return issues;
}
