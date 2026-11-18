import { z } from "zod";
import { resolveCommandId } from "../commandMeta";
import { gitSettingsFileSchema, panelSchemas, settingsVersion, toolbarWidgets, type LayoutNode, type PanelId } from "./schema";

export type IssueLevel = "error" | "warning" | "info";
/** `path` is dotted (`panels.diff.mode`); `file` is the layer's file path or name. */
export type SettingsIssue = { file: string; path: string; level: IssueLevel; message: string };

export type ValidateOptions = {
  file: string;
  /** The base preset's tree for a view kind (`default` included), used in place of an invalid view. */
  fallbackView?: (kind: string) => LayoutNode | undefined;
};

export type ValidatedFile = {
  /** The file with every invalid leaf and unknown key left out (unknown keys stay in the file on disk). */
  value: Record<string, unknown>;
  issues: SettingsIssue[];
  /** Written by a newer app: known keys load, but the app never writes it. */
  readOnly: boolean;
};

/** The smallest window Legend Git allows, minus the toolbar; the sidebar collapses before panes shrink. */
export const minimumContent = { width: 960, height: 542 };
const defaultMinSize = 120;

export const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const join = (path: readonly string[]) => path.join(".");
const firstMessage = (error: z.ZodError) => {
  const issue = error.issues[0]!;
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
};

const optionSchemas = new Map<PanelId, z.ZodType>();
/** A panel's options with every key optional, for layout `options` overrides. */
function partialOptions(panel: PanelId) {
  let schema = optionSchemas.get(panel);
  if (!schema) {
    const shape = (panelSchemas[panel] as z.ZodObject).shape as Record<string, z.ZodType>;
    schema = z.looseObject(Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, (value instanceof z.ZodOptional ? value : value.optional())])));
    optionSchemas.set(panel, schema);
  }
  return schema;
}

/**
 * Rules a JSON Schema cannot express: each panel instance appears once per view, a diff is reachable, panel options
 * fit their panel, and the panes fit the minimum window. Returns the first broken rule, or null.
 */
export function layoutProblem(node: LayoutNode): string | null {
  const seen = new Set<string>();
  let hasDiff = false;
  const visit = (current: LayoutNode, at: string): string | null => {
    if (current.type === "panel") {
      const id = current.id ?? current.panel;
      if (seen.has(id)) return `${at}: panel "${id}" appears twice; give one an "id"`;
      seen.add(id);
      if (current.panel === "diff") hasDiff = true;
      if (current.options) {
        const result = partialOptions(current.panel).safeParse(current.options);
        if (!result.success) return `${at}.options: ${firstMessage(result.error)}`;
      }
      return null;
    }
    if (current.type === "split") {
      for (const [index, child] of current.children.entries()) {
        const problem = visit(child.node, `${at}.children.${index}.node`);
        if (problem) return problem;
      }
      return null;
    }
    // A switch shows one branch at a time, so the same panel may appear in several branches.
    const before = new Set(seen);
    const branches = [...current.cases.map((entry, index) => [entry.node, `${at}.cases.${index}.node`] as const), [current.otherwise, `${at}.otherwise`] as const];
    const union = new Set(before);
    for (const [branch, path] of branches) {
      seen.clear();
      before.forEach(id => seen.add(id));
      const problem = visit(branch, path);
      if (problem) return problem;
      seen.forEach(id => union.add(id));
    }
    seen.clear();
    union.forEach(id => seen.add(id));
    return null;
  };
  const problem = visit(node, "");
  if (problem) return problem.replace(/^\./, "").replace(/^: /, "");
  if (!hasDiff) return "no diff panel in this view";
  const width = minExtent(node, "row"), height = minExtent(node, "column");
  if (width > minimumContent.width) return `minimum sizes need ${width} pt of width; the window can be ${minimumContent.width} pt`;
  if (height > minimumContent.height) return `minimum sizes need ${height} pt of height; the window can be ${minimumContent.height} pt`;
  return null;
}

/** The least room a node needs along a split direction (`row` = width, `column` = height). */
function minExtent(node: LayoutNode, axis: "row" | "column"): number {
  if (node.type === "panel") return 0;
  if (node.type === "switch") return Math.max(...[...node.cases.map(entry => entry.node), node.otherwise].map(child => minExtent(child, axis)));
  if (node.direction !== axis) return Math.max(...node.children.map(child => minExtent(child.node, axis)));
  return node.children.reduce((sum, child) => sum + Math.max(child.minSize ?? defaultMinSize, minExtent(child.node, axis)), 0);
}

const viewPath = (path: readonly string[]) => path.length === 5 && path[0] === "layout" && path[1] === "layouts" && path[3] === "views" ? path[4]! : null;

/**
 * Validates one settings file leaf by leaf (spec §3.3): an invalid leaf is left out so the layer below wins, an unknown
 * key is reported at info level, an invalid layout view falls back to the base preset's view. Migrate before validating.
 */
export function validateSettingsFile(raw: unknown, { file, fallbackView }: ValidateOptions): ValidatedFile {
  const issues: SettingsIssue[] = [];
  const issue = (path: readonly string[] | string, level: IssueLevel, message: string) => issues.push({ file, path: typeof path === "string" ? path : join(path), level, message });
  if (!isPlainObject(raw)) {
    issue("", "error", "a settings file must be a JSON object; the file is skipped");
    return { value: {}, issues, readOnly: false };
  }
  let readOnly = false;
  const version = raw.version;
  if (version === undefined) issue("version", "error", `missing "version"; read as version ${settingsVersion}`);
  else if (typeof version !== "number" || !Number.isInteger(version) || version < 1) issue("version", "error", `"version" must be a whole number; read as version ${settingsVersion}`);
  else if (version > settingsVersion) {
    readOnly = true;
    issue("version", "warning", `written by a newer Legend Git (version ${version}); known keys load and the app will not write this file`);
  }

  const walk = (schema: z.ZodType, value: unknown, path: string[]): unknown => {
    const kind = viewPath(path);
    if (kind) {
      const result = (schema as z.ZodType).safeParse(value);
      const problem = !result.success ? firstMessage(result.error) : value === null ? null : layoutProblem(result.data as LayoutNode);
      if (!problem) return result.data;
      const fallback = fallbackView?.(kind);
      issue(path, "error", `invalid layout: ${problem}; ${fallback ? "using the base preset's view" : "view ignored"}`);
      return fallback;
    }
    if (schema instanceof z.ZodOptional) return walk(schema.unwrap() as z.ZodType, value, path);
    if (schema instanceof z.ZodObject) {
      if (!isPlainObject(value)) {
        issue(path, "error", `expected an object; ignored`);
        return undefined;
      }
      const shape = schema.shape as Record<string, z.ZodType>;
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        if (path.length === 0 && key === "version") continue;
        if (!Object.hasOwn(shape, key)) {
          issue([...path, key], "info", "unknown key; ignored and kept in the file");
          continue;
        }
        const result = walk(shape[key]!, child, [...path, key]);
        if (result !== undefined) out[key] = result;
      }
      return out;
    }
    if (schema instanceof z.ZodRecord) {
      if (!isPlainObject(value)) {
        issue(path, "error", `expected an object; ignored`);
        return undefined;
      }
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        const result = walk(schema.valueType as z.ZodType, child, [...path, key]);
        if (result !== undefined) out[key] = result;
      }
      return out;
    }
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    issue(path, "error", `${firstMessage(result.error)}; ignored`);
    return undefined;
  };
  const value = walk(gitSettingsFileSchema, raw, []) as Record<string, unknown>;
  commandIssues(value, issue);
  return { value, issues, readOnly };
}

const widgets = new Set<string>(toolbarWidgets);
/** Unknown command ids stay in the file and are skipped at render time (C4). */
function commandIssues(value: Record<string, unknown>, issue: (path: string, level: IssueLevel, message: string) => void) {
  const unknown = (id: string) => `unknown command "${id}"; skipped`;
  const toolbar = isPlainObject(value.toolbar) && Array.isArray(value.toolbar.items) ? value.toolbar.items : [];
  toolbar.forEach((entry, index) => {
    const id = typeof entry === "string" ? (widgets.has(entry) ? null : entry) : (entry as { command: string }).command;
    if (id !== null && !resolveCommandId(id)) issue(`toolbar.items.${index}`, "warning", unknown(id));
  });
  const visitMenu = (entries: unknown[], path: string) => entries.forEach((entry, index) => {
    if (typeof entry === "string") {
      if (entry !== "separator" && !resolveCommandId(entry)) issue(`${path}.${index}`, "warning", unknown(entry));
    } else if (isPlainObject(entry) && Array.isArray(entry.items)) visitMenu(entry.items, `${path}.${index}.items`);
  });
  if (isPlainObject(value.contextMenus)) for (const [target, entries] of Object.entries(value.contextMenus)) if (Array.isArray(entries)) visitMenu(entries, `contextMenus.${target}`);
  if (isPlainObject(value.keybindings)) for (const id of Object.keys(value.keybindings)) if (!resolveCommandId(id)) issue(`keybindings.${id}`, "warning", unknown(id));
}
