import { useSyncExternalStore } from "react";

export const maxRecentRepositories = 10;

/** Puts `path` (a repository root as Git resolved it) first, without duplicates, keeping at most ten. */
export function addRecent(list: readonly string[], path: string) {
  const entry = path.replace(/\/+$/, "") || "/";
  return [entry, ...list.filter(item => item !== entry)].slice(0, maxRecentRepositories);
}

/** Folder names, with the parent folder added where two recents share a name. */
export function recentLabels(list: readonly string[]) {
  const name = (path: string) => path.split("/").pop() || path;
  return list.map(path => list.some(other => other !== path && name(other) === name(path)) ? `${name(path)} — ${path.split("/").slice(-2, -1)[0] ?? ""}` : name(path));
}

/** The system's recent documents (File ▸ Open Recent), which keep the order and the list across launches. */
export type RecentsBackend = { list(): Promise<string[]>; note(path: string): Promise<void> };

/**
 * The recent repositories for the sidebar, read once from `backend` and kept in step with every repository opened since.
 * AppKit's Clear Menu clears only its menu: Spark's recent list, which this reads, keeps its entries (Spark ask).
 */
export function createRecents(backend: () => RecentsBackend) {
  let list: string[] = [];
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  const load = () => pending ??= backend().list().then(paths => {
    list = paths.reduceRight<string[]>((current, path) => addRecent(current, path), []);
    emit();
  }).catch(console.error);
  const update = (change: (current: string[]) => string[], write: () => Promise<void>) => {
    pending = load().then(async () => {
      list = change(list);
      emit();
      await write();
    }).catch(console.error);
    return pending;
  };
  return {
    get: () => list,
    subscribe(listener: () => void) { listeners.add(listener); void load(); return () => { listeners.delete(listener); }; },
    note: (path: string) => update(current => addRecent(current, path), () => backend().note(path)),
    /** Waits for the load and every change made so far. */
    settled: () => load(),
  };
}

// Required on first use, so code that never shows recents doesn't load the native module.
const spark = () => require("@legendapp/spark/app/documents") as typeof import("@legendapp/spark/app/documents");
export const recentRepositories = createRecents(() => ({
  list: async () => (await spark().getRecentDocuments()).map(document => document.path),
  note: path => spark().noteRecentDocument(path),
}));

export function useRecentRepositories() {
  return useSyncExternalStore(recentRepositories.subscribe, recentRepositories.get);
}
