import { z } from "zod";
import { commandIds, menuTargets } from "../commandMeta";

/**
 * The settings contract (spec decision D1): these zod definitions are the single source of truth. The checked-in JSON
 * Schema (`apps/git/settings/git-settings.v1.schema.json`) and the types are generated from them.
 *
 * `gitSettingsSchema` is the effective shape (every key resolved); `gitSettingsFileSchema` is a settings file, the same
 * shape with every object key optional. Objects are loose: unknown keys are allowed and kept on save.
 */

export const settingsVersion = 1;
export const schemaUrl = `https://legend.so/git/git-settings.v${settingsVersion}.schema.json`;
export const presetIds = ["sourcetree", "fork", "gitkraken"] as const;
export type PresetId = (typeof presetIds)[number];
export const defaultPreset: PresetId = "sourcetree";

const describe = <T extends z.ZodType>(schema: T, description: string, extra: Record<string, unknown> = {}) => schema.meta({ description, ...extra });
const choice = <const T extends readonly [string, ...string[]]>(values: T, meanings: { [K in T[number]]: string }, description: string) =>
  describe(z.enum(values), description, { "x-enumDescriptions": meanings });
const obj = <S extends z.ZodRawShape>(shape: S, description: string) => describe(z.looseObject(shape), description);

export const density = choice(["compact", "regular", "comfortable"], {
  compact: "File/commit rows 20 pt, sidebar rows 24 pt.",
  regular: "File/commit rows 24 pt, sidebar rows 28 pt.",
  comfortable: "File/commit rows 28 pt, sidebar rows 32 pt.",
}, "Row height. Panels without their own density use the global one.");
export type Density = z.infer<typeof density>;

export const color = describe(z.string().regex(/^(#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?|system:[A-Za-z]+)$/),
  "\"#RRGGBB\", \"#RRGGBBAA\", or \"system:<NSColor name>\" such as \"system:systemGreen\".");

export const accelerator = describe(z.string().regex(/^((Cmd|Ctrl|Alt|Shift|Fn)\+)*[^+]+$/),
  "A key equivalent in Spark's format, such as \"Cmd+Shift+l\" or \"Cmd+Enter\".");

/** Any string is accepted (an unknown id is reported and skipped at render time, but kept in the file); editors suggest the known ids. */
export const commandId = z.union([z.enum(commandIds as [string, ...string[]]), z.string()]).meta({
  id: "commandId", description: "A command id from the command registry (see docs/settings/commands.md).",
});

// ── Layout ─────────────────────────────────────────────────────────────────────

export const panelIds = ["commitList", "commitDetails", "fileList", "unstaged", "staged", "changes", "composer", "diff", "prDetails", "empty"] as const;
export type PanelId = (typeof panelIds)[number];
export const viewKinds = ["changes", "history", "ref", "stash", "worktree", "review", "pullRequest"] as const;
export type ViewKind = (typeof viewKinds)[number];
export const switchConditions = ["fileSelected", "commitSelected", "operationInProgress"] as const;

export type SplitChild = { node: LayoutNode; size?: number; minSize?: number; maxSize?: number; collapsible?: boolean; holdingPriority?: "low" | "normal" | "high" };
export type SplitNode = { type: "split"; direction: "row" | "column"; children: SplitChild[] };
export type PanelNode = { type: "panel"; panel: PanelId; id?: string; options?: Record<string, unknown> };
export type SwitchNode = { type: "switch"; cases: { when: (typeof switchConditions)[number]; node: LayoutNode }[]; otherwise: LayoutNode };
export type LayoutNode = SplitNode | PanelNode | SwitchNode;

const size = z.number().min(0).max(10000);
export const layoutNode: z.ZodType<LayoutNode> = z.lazy(() => z.discriminatedUnion("type", [splitNode, panelNode, switchNode])).meta({
  id: "layoutNode", description: "A split, a panel or a switch. A node replaces whole when layers merge.",
});
const splitChild = z.looseObject({
  node: layoutNode,
  size: describe(size, "Initial points along the split axis; omitted = share the rest.").optional(),
  minSize: describe(size, "Smallest size in points (default 120).").optional(),
  maxSize: describe(size, "Largest size in points.").optional(),
  collapsible: describe(z.boolean(), "The pane can collapse (default false).").optional(),
  holdingPriority: choice(["low", "normal", "high"], { low: "Gives up size first.", normal: "Default.", high: "Keeps its size on window resize." },
    "Which pane keeps its size when the window resizes (NSSplitView holding priority).").optional(),
});
const splitNode = obj({
  type: z.literal("split"),
  direction: choice(["row", "column"], { row: "Children side by side.", column: "Children stacked." }, "Split axis."),
  children: z.array(splitChild).min(2).max(4),
}, "Two to four panes divided along one axis.");
const panelNode = obj({
  type: z.literal("panel"),
  panel: choice(panelIds, {
    commitList: "Graph and columns (History, refs, review branches).", commitDetails: "Subject, body, author, parents, SHA.",
    fileList: "Files of the selected commit, stash, worktree or pull request.", unstaged: "Changes: unstaged files.", staged: "Changes: staged files.",
    changes: "Changes: one list with a checkbox per file.", composer: "Commit message, amend, sign-off, generate, commit.", diff: "The diff.",
    prDetails: "Pull request header, checks and review actions.", empty: "A deliberately blank pane.",
  }, "The panel this pane shows."),
  id: describe(z.string().min(1), "Instance id when one panel appears twice in a layout; default = the panel id.").optional(),
  options: describe(z.record(z.string(), z.unknown()), "Per-instance overrides of panels.<panel>, validated against that panel's options.").optional(),
}, "One panel.");
const switchNode = obj({
  type: z.literal("switch"),
  cases: z.array(z.looseObject({
    when: choice(switchConditions, { fileSelected: "A file is selected.", commitSelected: "A commit is selected.", operationInProgress: "A merge, rebase, cherry-pick or revert is paused." }, "Condition."),
    node: layoutNode,
  })).min(1),
  otherwise: layoutNode,
}, "Shows the first case whose condition holds, else `otherwise` (GitKraken's diff replacing the graph while a file is open).");

export const layoutDefinition = obj({
  description: z.string().optional(),
  sidebar: describe(z.looseObject({
    width: describe(size, "Initial sidebar width.").optional(),
    minWidth: describe(size, "Smallest sidebar width.").optional(),
    collapsed: describe(z.boolean(), "Starts collapsed.").optional(),
  }).nullable(), "The left source list (the window's native sidebar slot); null = no sidebar.").optional(),
  views: obj({
    default: layoutNode,
    ...Object.fromEntries(viewKinds.map(kind => [kind, layoutNode.nullable().optional()])) as Record<ViewKind, z.ZodOptional<z.ZodNullable<typeof layoutNode>>>,
  }, "One tree per kind of sidebar selection; a missing or null kind uses `default`."),
}, "A named window layout.");

// ── Panels ─────────────────────────────────────────────────────────────────────

const fileListOptions = obj({
  density: density.optional(),
  style: choice(["flat", "tree"], { flat: "One row per file.", tree: "Files grouped in folders." }, "List shape."),
  sort: choice(["path", "name", "status"], { path: "By full path.", name: "By file name.", status: "By status, then path." }, "Sort order."),
  showFolder: describe(z.boolean(), "Show the folder after the name (flat style)."),
  stagingControl: choice(["buttons", "checkboxes"], { buttons: "Stage/Unstage buttons.", checkboxes: "A checkbox per file (falls back to buttons until Spark has native checkboxes)." }, "How files are staged."),
}, "File list options.");

const commitColumn = z.looseObject({
  id: choice(["graph", "refs", "subject", "author", "date", "sha", "committer"], {
    graph: "Branch graph.", refs: "Branch and tag labels.", subject: "Commit subject.", author: "Author name.", date: "Author date.", sha: "Short SHA.", committer: "Committer name.",
  }, "Column."),
  width: describe(size, "Width in points; the subject flexes when omitted.").optional(),
  visible: describe(z.boolean(), "Shown (default true).").optional(),
});

export const panelSchemas = {
  commitList: obj({
    density: density.optional(),
    columns: describe(z.array(commitColumn), "Columns in display order."),
    graph: obj({
      style: choice(["compact", "wide"], { compact: "Narrow lanes.", wide: "Wide lanes." }, "Graph style."),
      laneWidth: describe(z.number().min(8).max(24), "Lane width in points (8–24)."),
      nodeStyle: choice(["dot", "ring"], { dot: "Filled dot.", ring: "Hollow ring." }, "Commit node shape."),
      lineWidth: describe(z.number().min(1).max(3), "Line width in points (1–3)."),
      maxLanes: describe(z.number().int().min(4).max(24), "Lanes past this fold into the overflow color (4–24)."),
      colorBy: choice(["lane", "branch"], { lane: "Color by lane position.", branch: "A ref keeps its color across rows." }, "Lane coloring."),
    }, "Graph drawing."),
    refs: choice(["inline", "column", "hidden"], { inline: "Before the subject.", column: "In the refs column.", hidden: "Not shown." }, "Where branch and tag labels go."),
    refStyle: choice(["text", "tinted"], { text: "Plain text.", tinted: "Theme ref color with a small SF Symbol." }, "Ref label style."),
    showRemoteRefs: describe(z.boolean(), "Show remote branches."),
    showTags: describe(z.boolean(), "Show tags."),
    dateFormat: choice(["relative", "short", "medium", "iso"], { relative: "\"3 days ago\".", short: "System short date.", medium: "System medium date and time.", iso: "ISO 8601." }, "Date format."),
    highlightPulled: describe(z.boolean(), "Mark the commits the last pull brought in."),
  }, "The commit list (History, refs, review branches)."),
  commitDetails: obj({
    showBody: describe(z.boolean(), "Show the message body."),
    showCommitter: describe(z.boolean(), "Show the committer when it differs from the author."),
    fileListPlacement: choice(["below", "beside", "none"], { below: "Below the details.", beside: "Beside the details.", none: "Not inside the details." }, "Where the details panel puts its own file list."),
  }, "Commit details."),
  fileList: fileListOptions,
  unstaged: fileListOptions,
  staged: fileListOptions,
  changes: fileListOptions,
  composer: obj({
    bodyLines: describe(z.number().int().min(1).max(40), "Visible message lines."),
    showAmend: describe(z.boolean(), "Show Amend."),
    showSignOff: describe(z.boolean(), "Show Sign Off."),
    showGenerate: describe(z.boolean(), "Show Generate Commit Message."),
  }, "The commit composer."),
  diff: obj({
    mode: choice(["unified", "sideBySide"], { unified: "One column.", sideBySide: "Old and new side by side." }, "Diff mode."),
    sideBySideSplit: choice(["vertical", "horizontal"], { vertical: "Old | new columns.", horizontal: "Old above new." }, "Side-by-side orientation."),
    wrap: describe(z.boolean(), "Wrap long lines."),
    contextLines: describe(z.number().int().min(0).max(20), "Unchanged lines around each change (0–20)."),
    showWhitespace: describe(z.boolean(), "Draw whitespace characters."),
    ignoreWhitespace: choice(["none", "trailing", "all"], { none: "Show every change.", trailing: "Ignore trailing whitespace.", all: "Ignore all whitespace changes." }, "Whitespace changes to ignore."),
    lineNumbers: choice(["both", "new", "none"], { both: "Old and new.", new: "New only.", none: "None." }, "Line number gutters."),
    hunkActions: choice(["header", "none"], { header: "Stage/Discard Hunk in hunk headers.", none: "No hunk buttons." }, "Hunk actions."),
    density: density.optional(),
  }, "The diff."),
  prDetails: obj({ showChecks: describe(z.boolean(), "Show CI checks.") }, "Pull request details."),
  empty: obj({}, "A blank pane; no options."),
} satisfies Record<PanelId, z.ZodType>;

// ── Sidebar, toolbar, menus ───────────────────────────────────────────────────

export const sidebarSectionIds = ["workspace", "reviewQueue", "branches", "remotes", "tags", "stashes", "worktrees", "pullRequests"] as const;
const sidebar = obj({
  sections: describe(z.array(z.looseObject({
    id: z.enum(sidebarSectionIds),
    visible: describe(z.boolean(), "Shown (default true).").optional(),
    expanded: describe(z.boolean(), "Starts expanded (default: true, but a section with more than 20 items starts collapsed). Clicking its header expands or collapses it, and the window remembers that.").optional(),
  })), "Sections in display order; a section left out is hidden."),
  showCounts: describe(z.boolean(), "Show item counts."),
}, "The sidebar.");

export const toolbarWidgets = ["branchPicker", "viewSwitcher", "search", "networkProgress", "space", "flexibleSpace"] as const;
const toolbarEntry = describe(z.union([
  z.enum(toolbarWidgets),
  commandId,
  z.looseObject({ command: commandId, label: z.string().optional(), symbol: describe(z.string(), "SF Symbol name.").optional() }),
]), "A command id, a command with its own label or SF Symbol, or a built-in widget.");
const toolbar = obj({
  displayMode: choice(["iconAndLabel", "iconOnly", "labelOnly"], { iconAndLabel: "Icon and label.", iconOnly: "Icon only.", labelOnly: "Label only." }, "Toolbar display mode."),
  items: describe(z.array(toolbarEntry), "Items in order."),
}, "The window toolbar.");

export type MenuEntry = string | { submenu: string; items: MenuEntry[] };
const menuEntry: z.ZodType<MenuEntry> = z.lazy(() => z.union([commandId, z.looseObject({ submenu: z.string(), items: z.array(menuEntry) })])).meta({
  id: "menuEntry", description: "A command id, \"separator\", or a submenu.",
});
const contextMenus = obj(Object.fromEntries(menuTargets.map(target => [target, describe(z.array(menuEntry), `The ${target} context menu.`).optional()])) as Record<(typeof menuTargets)[number], z.ZodOptional<z.ZodArray<typeof menuEntry>>>,
  "Context menus by target; each list replaces the default whole.");

// ── Theme ─────────────────────────────────────────────────────────────────────

const themeTokens = obj({
  accent: color,
  status: obj(Object.fromEntries(["added", "modified", "deleted", "renamed", "typeChanged", "untracked", "conflicted"].map(key => [key, color])) as Record<"added" | "modified" | "deleted" | "renamed" | "typeChanged" | "untracked" | "conflicted", typeof color>, "File status colors."),
  diff: obj(Object.fromEntries(["addedLine", "removedLine", "addedWord", "removedWord", "hunkHeader", "gutter", "selection"].map(key => [key, color])) as Record<"addedLine" | "removedLine" | "addedWord" | "removedWord" | "hunkHeader" | "gutter" | "selection", typeof color>, "Diff colors."),
  lanes: describe(z.array(color).min(3), "Graph lane colors; the last one is the overflow color."),
  refs: obj({ localBranch: color, remoteBranch: color, tag: color, head: color }, "Ref label colors (refStyle \"tinted\")."),
}, "Colors for one appearance.");
const theme = obj({
  name: z.string(),
  fonts: obj({
    code: describe(z.string().min(1), "Code font family; \"system-mono\" is the system monospaced font."),
    codeSize: describe(z.number().min(8).max(32), "Code font size."),
  }, "Code fonts; the UI font always follows macOS."),
  light: themeTokens,
  dark: themeTokens,
}, "Colors and code fonts.");

// ── Root ──────────────────────────────────────────────────────────────────────

export const gitSettingsSchema = obj({
  appearance: choice(["system", "light", "dark"], { system: "Follow macOS.", light: "Always light.", dark: "Always dark." }, "Window appearance."),
  density,
  theme,
  layout: obj({
    active: describe(z.string().min(1), "A name in `layouts` or a preset id."),
    layouts: describe(z.record(z.string(), layoutDefinition), "Named layouts; the presets' layouts are named after them."),
  }, "Window layout."),
  panels: obj(panelSchemas, "Options per panel."),
  sidebar,
  toolbar,
  contextMenus,
  keybindings: describe(z.record(z.string(), z.array(accelerator)), "Key equivalents by command id; [] unbinds."),
}, "Effective Legend Git settings.");

export type GitSettings = z.infer<typeof gitSettingsSchema>;
export type PanelOptions = { [P in PanelId]: z.infer<(typeof panelSchemas)[P]> };

/** Objects become partial all the way down; everything else (arrays, records' values, layout nodes, enums) is a leaf. */
function deepPartial(schema: z.ZodType): z.ZodType {
  if (!(schema instanceof z.ZodObject)) return schema;
  const shape = Object.fromEntries(Object.entries(schema.shape as Record<string, z.ZodType>).map(([key, value]) => {
    const inner = value instanceof z.ZodOptional ? value.unwrap() as z.ZodType : value;
    return [key, deepPartial(inner).optional()];
  }));
  const meta = z.globalRegistry.get(schema);
  const partial = z.looseObject(shape);
  return meta ? partial.meta(meta) : partial;
}

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

const fileOnly = {
  $schema: describe(z.string(), "The schema URL; editors use it for completion.").optional(),
  version: describe(z.number().int().min(1), "File format version; this app writes 1."),
  name: describe(z.string(), "Shown in Import and the preset list.").optional(),
  description: describe(z.string(), "Human notes.").optional(),
  author: z.string().optional(),
  root: describe(z.string(), "The repository root a repository layer applies to (written by the app).").optional(),
  extends: choice(presetIds, { sourcetree: "SourceTree (default).", fork: "Fork.", gitkraken: "GitKraken." }, "The base preset.").optional(),
};
export const gitSettingsFileSchema = (() => {
  const partial = deepPartial(gitSettingsSchema) as z.ZodObject;
  return z.looseObject({ ...fileOnly, ...partial.shape }).meta({ title: "Legend Git settings", description: "A Legend Git settings file: user, repository, preset or shared. Every key is optional except version." });
})();

export type GitSettingsFile = DeepPartial<GitSettings> & {
  $schema?: string; version: number; name?: string; description?: string; author?: string; root?: string; extends?: PresetId;
} & Record<string, unknown>;

/** The keys of a settings file that describe the file itself, not settings. */
export const fileOnlyKeys = Object.keys(fileOnly) as (keyof typeof fileOnly)[];
