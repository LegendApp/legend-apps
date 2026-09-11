import { useCallback, useSyncExternalStore } from "react";
import { treeGrammarManager } from "./treeGrammarService";

// Shared external-store adapter: high-frequency byte updates only reach the
// small progress surface, never the document or virtualized rows.
export function useGrammarProgress(languages: readonly string[]) {
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribe = languages.map((language) => treeGrammarManager.subscribe(language, listener));
    return () => unsubscribe.forEach((fn) => fn());
  }, [languages]);
  const snapshot = useCallback(() => languages.map((language) => treeGrammarManager.getSnapshot(language))
    .find((state) => state.phase !== "ready" && state.phase !== "idle") ?? null, [languages]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
