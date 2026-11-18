import type { GitSettings } from "./schema";
import type { SettingsIssue } from "./validate";

const fileListPanels = ["fileList", "unstaged", "staged", "changes"] as const;

/**
 * Info-level issues for valid settings the app draws differently until a native piece lands: checkboxes (Spark ask
 * A9) fall back to Stage/Unstage buttons, and the diff rows' fixed heights and single gutter can't wrap or show the
 * new line numbers alone. Git writes three context lines, so more show three. The toolbar and context menus fall back
 * where Spark lacks a piece: display modes, fixed spaces and context submenus.
 */
export function capabilityIssues(settings: GitSettings, file: string): SettingsIssue[] {
  const issues: SettingsIssue[] = [];
  const info = (path: string, message: string) => issues.push({ file, path, level: "info", message });
  for (const panel of fileListPanels) {
    if (settings.panels[panel].stagingControl === "checkboxes") info(`panels.${panel}.stagingControl`, "Checkboxes need a native checkbox in Spark (ask A9); Stage and Unstage buttons are shown until then.");
  }
  const diff = settings.panels.diff;
  if (diff.wrap) info("panels.diff.wrap", "Wrapped diff lines need variable row heights in the native diff rows; lines are not wrapped yet.");
  if (diff.lineNumbers === "new") info("panels.diff.lineNumbers", "The diff gutter shows old and new line numbers together; \"new\" shows both until the rows can draw one.");
  if (diff.contextLines > 3) info("panels.diff.contextLines", "Git's patches have 3 context lines; more than 3 shows 3.");
  if (diff.ignoreWhitespace === "trailing") info("panels.diff.ignoreWhitespace", "The diff parser ignores all whitespace changes; \"trailing\" ignores all of them.");
  const { toolbar } = settings;
  if (toolbar.displayMode !== "iconOnly") info("toolbar.displayMode", "Spark's toolbar shows icons only until it has NSToolbar display modes (ask S2); labels show in tooltips and the overflow menu.");
  toolbar.items.forEach((entry, index) => {
    if (entry === "space") info(`toolbar.items.${index}`, "Spark's toolbar has no fixed space (ask S2); skipped.");
    else if (entry === "flexibleSpace" && toolbar.items.indexOf("flexibleSpace") !== index) info(`toolbar.items.${index}`, "Spark's toolbar has one flexible space, between its leading and trailing items (ask S2); skipped.");
  });
  for (const [target, entries] of Object.entries(settings.contextMenus) as [string, readonly unknown[] | undefined][]) (entries ?? []).forEach((entry, index) => {
    if (typeof entry !== "string") info(`contextMenus.${target}.${index}`, "Spark context menus have no submenus; the items show under the submenu's title.");
  });
  return issues;
}
