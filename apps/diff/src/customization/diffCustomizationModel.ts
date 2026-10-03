export const editableDiffFiles = [
  "DiffViewerWindow.tsx",
  "viewer/DiffRows.tsx",
  "viewer/DiffGrammarProgress.tsx",
  "viewer/diffViewerConstants.ts",
  "start-screen/DiffStartScreen.tsx",
  "start-screen/diffStartScreenModel.ts",
  "diffPalette.ts",
  "GlassToast.tsx",
] as const;

export type DiffCustomizationEdit = { path: string; before: string; after: string };
export type DiffCustomizationChange = {
  id: string;
  prompt: string;
  title: string;
  summary: string;
  createdAt: number;
  enabled: boolean;
  edits: DiffCustomizationEdit[];
};
export type DiffCustomizationVersion = {
  id: string;
  baseId: string;
  createdAt: number;
  title: string;
  changes: DiffCustomizationChange[];
  code: string;
};
export type DiffCustomizationHistory = {
  schema: 1;
  tool: "codex" | "claude";
  autoKeep: boolean;
  activeId: string | null;
  versions: DiffCustomizationVersion[];
};
export type DiffCustomizationBaseline = { baseId: string; files: Record<string, string> };

export function emptyCustomizationHistory(): DiffCustomizationHistory {
  return { schema: 1, tool: "codex", autoKeep: false, activeId: null, versions: [] };
}

export function parseCustomizationEdits(value: unknown): DiffCustomizationEdit[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) throw new Error("Expected 1–50 code edits.");
  return value.map((edit) => {
    if (!edit || typeof edit.path !== "string" || !editableDiffFiles.includes(edit.path as typeof editableDiffFiles[number]) ||
      typeof edit.before !== "string" || !edit.before || typeof edit.after !== "string" || edit.before === edit.after ||
      edit.before.length + edit.after.length > 500_000) throw new Error("The response contains an unsupported or empty code edit.");
    return { path: edit.path, before: edit.before, after: edit.after };
  });
}

export function replayCustomizationChanges(baseline: DiffCustomizationBaseline, changes: readonly DiffCustomizationChange[]) {
  const files = { ...baseline.files };
  for (const change of changes) {
    if (!change.enabled) continue;
    for (const edit of parseCustomizationEdits(change.edits)) {
      const source = files[edit.path];
      const index = source?.indexOf(edit.before) ?? -1;
      if (index < 0 || source!.indexOf(edit.before, index + 1) >= 0) {
        throw new Error(`“${change.title}” needs adjustment in ${edit.path}. Its original code ${index < 0 ? "is missing" : "matches more than once"}. Your saved version is unchanged.`);
      }
      files[edit.path] = source!.slice(0, index) + edit.after + source!.slice(index + edit.before.length);
    }
  }
  return files;
}

export function readCustomizationHistory(value: unknown): DiffCustomizationHistory {
  if (value === undefined) return emptyCustomizationHistory();
  const history = value as DiffCustomizationHistory;
  if (!history || history.schema !== 1 || !Array.isArray(history.versions) || history.versions.length > 30 ||
    !["codex", "claude"].includes(history.tool) || typeof history.autoKeep !== "boolean" ||
    (history.activeId !== null && typeof history.activeId !== "string")) throw new Error("The customization history cannot be read. Reset customizations to recover.");
  const ids = new Set<string>();
  for (const version of history.versions) {
    if (!version || typeof version.id !== "string" || ids.has(version.id) || typeof version.baseId !== "string" ||
      typeof version.code !== "string" || version.code.length > 2_000_000 || typeof version.title !== "string" ||
      !Number.isFinite(version.createdAt) || !Array.isArray(version.changes) || version.changes.length > 50) throw new Error("Invalid saved customization version.");
    ids.add(version.id);
    for (const change of version.changes) {
      if (!change || typeof change.id !== "string" || typeof change.prompt !== "string" || typeof change.title !== "string" ||
        typeof change.summary !== "string" || typeof change.enabled !== "boolean" || !Number.isFinite(change.createdAt)) throw new Error("Invalid saved customization change.");
      parseCustomizationEdits(change.edits);
    }
  }
  if (history.activeId !== null && !ids.has(history.activeId)) throw new Error("The active customization version is missing.");
  return history;
}

export function keepCustomizationVersion(history: DiffCustomizationHistory, version: DiffCustomizationVersion): DiffCustomizationHistory {
  return { ...history, activeId: version.id, versions: [...history.versions.filter((item) => item.id !== version.id), version].slice(-30) };
}
