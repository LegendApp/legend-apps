export type NotesDraft = { text: string; base?: string };
type Save = (markdown: string, base: string | undefined) => Promise<void>;
/** Drafts outlive a slide's view; failed writes remain available for recovery. */
export function createNotesDrafts(persistence?: { read(): Record<string, NotesDraft | string>; write(drafts: Record<string, NotesDraft>): void }) {
  // Legacy drafts have no baseline; retain them for recovery, never assume the current disk notes.
  const drafts = new Map<string, NotesDraft>(Object.entries(persistence?.read() ?? {}).map(([key, value]) =>
    [key, typeof value === "string" ? { text: value } : value]));
  const saves = new Map<string, Save>();
  const pending = new Map<string, Promise<boolean>>();
  const persist = () => persistence?.write(Object.fromEntries(drafts));
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
    bind(key: string, save: Save) { saves.set(key, save); },
    update(key: string, text: string, base?: string) {
      drafts.set(key, { text, base: drafts.has(key) ? drafts.get(key)!.base : base });
      persist();
    },
    flush,
    entries: () => [...drafts.entries()],
    persist,
    async flushAll() { return (await Promise.all([...drafts.keys()].map(flush))).every(Boolean); },
  };
}
export type NotesDrafts = ReturnType<typeof createNotesDrafts>;
