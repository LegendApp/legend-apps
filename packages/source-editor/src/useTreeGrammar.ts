import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { canonicalGrammar, isKnownGrammar, treeGrammarManager } from "@legend-apps/syntax-parser";
export { useGrammarProgress } from "@legend-apps/syntax-parser";

// Shared external-source adapter. Only this boundary observes readiness; byte
// progress is subscribed independently by the small banner, never by editor rows.
export function useTreeGrammar(language: string, enabled: boolean) {
  const name = canonicalGrammar(language);
  const known = isKnownGrammar(name);
  const subscribe = useCallback((listener: () => void) => treeGrammarManager.subscribe(name, listener), [name]);
  const snapshot = useCallback(() => !enabled || !name || treeGrammarManager.getSnapshot(name).phase === "ready", [name, enabled]);
  const ready = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (enabled && known && name) void treeGrammarManager.ensure(name).catch(() => {});
  }, [name, enabled, known]);
  return { ready, name, known };
}
export function useEmbeddedGrammars(documentKey: string) {
  const [revision, setRevision] = useState(0);
  const [languages, setLanguages] = useState<string[]>([]);
  const session = useRef<{ active: boolean; requested: Set<string>; cleanup: Set<() => void> }>({ active: true, requested: new Set(), cleanup: new Set() });
  useEffect(() => {
    const current = { active: true, requested: new Set<string>(), cleanup: new Set<() => void>() };
    session.current = current;
    setLanguages([]);
    return () => { current.active = false; current.cleanup.forEach((fn) => fn()); };
  }, [documentKey]);
  const request = useCallback((language: string) => {
    if (!isKnownGrammar(language)) return;
    const name = canonicalGrammar(language), current = session.current;
    if (current.requested.has(name)) return;
    current.requested.add(name);
    setLanguages((names) => [...names, name]);
    // Subscription also observes a successful Retry from the banner.
    const unsubscribe = treeGrammarManager.subscribe(name, () => {
      if (treeGrammarManager.getSnapshot(name).phase === "ready") {
        unsubscribe();
        current.cleanup.delete(unsubscribe);
        if (current.active) setRevision((revision) => revision + 1);
      }
    });
    current.cleanup.add(unsubscribe);
    void treeGrammarManager.ensure(name).catch(() => {});
  }, []);
  return { revision, languages, request };
}
