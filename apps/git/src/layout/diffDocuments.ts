import { createContext } from "react";
import { loadUnifiedDiff, type DiffDocument } from "@legend-apps/diff-parser";

type Loaded = Awaited<ReturnType<typeof loadUnifiedDiff>>;
type Entry = { promise: Promise<Loaded>; refs: number; release: ReturnType<typeof setTimeout> | null; document: DiffDocument | null };

/**
 * A window's diff documents by patch identity, shared by reference count (spec §7 item 3). A diff pane that remounts
 * because the layout moved it acquires its patch again before the old pane's release lands, so the native document is
 * loaded once. The last release frees it after a tick.
 */
export function createDiffDocumentCache() {
  const entries = new Map<string, Entry>();
  const key = (path: string, text: string, ignoreWhitespace: boolean) => `${ignoreWhitespace ? "w" : ""}\0${path}\0${text}`;
  return {
    acquire(path: string, text: string, maxRows: number, ignoreWhitespace = false): Promise<Loaded> {
      const id = key(path, text, ignoreWhitespace);
      let entry = entries.get(id);
      if (!entry) {
        const created: Entry = { promise: loadUnifiedDiff(text, path, maxRows, ignoreWhitespace), refs: 0, release: null, document: null };
        created.promise.then(result => { created.document = result.document; }, () => { if (entries.get(id) === created) entries.delete(id); });
        entries.set(id, created);
        entry = created;
      }
      if (entry.release) { clearTimeout(entry.release); entry.release = null; }
      entry.refs += 1;
      return entry.promise;
    },
    release(path: string, text: string, ignoreWhitespace = false) {
      const id = key(path, text, ignoreWhitespace), entry = entries.get(id);
      if (!entry || --entry.refs > 0) return;
      entry.release = setTimeout(() => {
        if (entries.get(id) !== entry || entry.refs > 0) return;
        entries.delete(id);
        void entry.promise.then(result => result.document.releaseNativeResources(), () => {});
      }, 0);
    },
    get size() { return entries.size; },
  };
}
export type DiffDocumentCache = ReturnType<typeof createDiffDocumentCache>;

/** The window's cache; without a provider each pane gets documents of its own (released with the pane). */
export const DiffDocumentCacheContext = createContext<DiffDocumentCache | null>(null);
