import { Buffer } from "buffer";
import * as files from "@legendapp/spark/files";
import { getApplicationSupportDirectory } from "@legend-apps/storage";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { useEffect, useState } from "react";
import { createSkillLibrary, type SkillLibrary } from "./skillLibrary";

const libraries = new Map<string, { library: SkillLibrary; users: number }>();
export const skillEditorContext$ = observable<{ windowId?: string; skillName?: string; skillId?: string }>({});

export const skillPreviewTargets = new Map<string, (skill: import("./storySkill").StorySkill) => boolean>();
export const skillViewerContexts$ = observable<Record<string, { repoRoot?: string; hasDiff: boolean }>>({});

export function useSkillLibrary(repoRoot?: string, enabled = true) {
  const [library, setLibrary] = useState<SkillLibrary>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    setLibrary(undefined); setError(undefined);
    if (!enabled) return;
    void (async () => {
      const key = repoRoot ?? "";
      let entry = libraries.get(key);
      if (!entry) {
        const support = decodeURIComponent(getApplicationSupportDirectory().uri.replace(/^file:\/\//, "")).replace(/\/+$/, "");
        const userDirectory = `${support}/skills`;
        await files.mkdir(userDirectory);
        if (cancelled) return;
        entry = libraries.get(key);
        if (!entry) {
          entry = { library: createSkillLibrary({
            userDirectory, repoRoot, watch: watchDirectories,
            files: { ...files, writeNewText: async (path, text) => { await files.writeChunks(path, [Buffer.from(text, "utf8")], { mode: "createNew" }); } },
          }), users: 0 };
          libraries.set(key, entry);
          try { void entry.library.start(); }
          catch (error) { entry.library.stop(); libraries.delete(key); throw error; }
        }
      }
      if (cancelled) return;
      entry.users++;
      const owned = entry;
      release = () => { if (--owned.users === 0) { owned.library.stop(); libraries.delete(key); } };
      setLibrary(entry.library);
    })().catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; release?.(); };
  }, [repoRoot, enabled]);
  const state = useValue(() => enabled && library?.repoRoot === repoRoot ? library?.state$.get() : undefined);
  return { library, state, error };
}
