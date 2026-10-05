export type NotesDraft = { text: string; base?: string };
type Save = (markdown: string, base: string | undefined) => Promise<void>;
/** Drafts outlive a slide's view; failed writes remain available for recovery. */
export function createNotesDrafts(persistence?: { read(): Record<string, NotesDraft | string>; write(drafts: Record<string, NotesDraft>): void }) {
  // Legacy drafts have no baseline; retain them for recovery, never assume the current disk notes.
  const drafts = new Map<string, NotesDraft>(Object.entries(persistence?.read() ?? {}).map(([key, value]) =>
    [key, typeof value === "string" ? { text: value } : value]));
  const saves = new Map<string, Save>();
  const sessionKeys = new Set<string>();
  const pending = new Map<string, Promise<boolean>>();
  const persist = () => persistence?.write(Object.fromEntries(drafts));
  const sessionEntries = () => [...drafts.entries()].filter(([key]) => sessionKeys.has(key));
  const flush = (key: string): Promise<boolean> => {
    const running = pending.get(key);
    if (running) return running;
    const work = Promise.resolve().then(async () => {
      while (drafts.has(key)) {
        const save = saves.get(key);
        if (!save) return false;
        const draft = drafts.get(key)!;
        try { await save(draft.text, draft.base); } catch { return false; }
        const latest = drafts.get(key);
        if (latest === draft) drafts.delete(key);
        else if (latest) drafts.set(key, { ...latest, base: draft.text });
        persist();
      }
      return true;
    }).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
  return {
    key: (prefix: string, target: string) => [...drafts.keys()].find(key => key.startsWith(prefix)) ?? prefix + target,
    get: (key: string, fallback: string) => drafts.get(key)?.text ?? fallback,
    bind(key: string, save: Save) { saves.set(key, save); sessionKeys.add(key); },
    update(key: string, text: string, base?: string) {
      sessionKeys.add(key);
      drafts.set(key, { text, base: drafts.has(key) ? drafts.get(key)!.base : base });
      persist();
    },
    flush,
    entries: () => [...drafts.entries()],
    sessionEntries,
    persist,
    async flushAll() {
      // A user can edit another slide while an earlier write is pending.
      // Re-snapshot after each batch, and report failure rather than retrying forever.
      // Unopened drafts from earlier sessions are already durable recovery copies.
      while (sessionEntries().length > 0) {
        if (!(await Promise.all(sessionEntries().map(([key]) => flush(key)))).every(Boolean)) return false;
      }
      return true;
    },
  };
}
export type NotesDrafts = ReturnType<typeof createNotesDrafts>;
