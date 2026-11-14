import { createStorage, type Storage } from "@legend-apps/storage";
import { createOutputCache } from "../story/storyCache";
import { storyHash } from "../story/storyHash";
import { validateWorkflow } from "./workflowContract";
import type { WorkflowRunResult } from "./workflowRunner";

export type WorkflowPreset = { name: string; skills: string[] };
export function createWorkflowCache(storage: Pick<Storage, "read" | "write"> = createStorage({ subfolder: "workflows" })) {
  const results = createOutputCache(storage, (result: WorkflowRunResult, input) => ({ ...result,
    ...validateWorkflow(result.output, result.output.kind, input.hunks), issues: result.issues }));
  const presetPath = (scope: string) => `${storyHash(scope)}/presets.json`;
  function presets(scope: string): WorkflowPreset[] {
    const raw = storage.read(presetPath(scope), { format: "text" });
    if (!raw) return [];
    try {
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return [];
      return value.filter((entry): entry is WorkflowPreset => !!entry && typeof entry.name === "string" && !!entry.name.trim() &&
        Array.isArray(entry.skills) && entry.skills.every((name: unknown) => typeof name === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)));
    } catch (error) { if (error instanceof SyntaxError) return []; throw error; }
  }
  return { ...results, presets,
    savePreset(scope: string, name: string, skills: string[]) {
      name = name.trim();
      if (!name || !skills.length || skills.some(skill => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill))) throw new Error("Name the preset and select at least one workflow.");
      const next = [...presets(scope).filter(preset => preset.name !== name), { name, skills: [...new Set(skills)] }];
      storage.write(presetPath(scope), JSON.stringify(next), { format: "text" });
    },
    deletePreset(scope: string, name: string) {
      storage.write(presetPath(scope), JSON.stringify(presets(scope).filter(preset => preset.name !== name)), { format: "text" });
    },
  };
}
