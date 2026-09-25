type Save = (markdown: string) => Promise<void>;
/** Drafts outlive a slide's view; failed writes remain available for recovery. */
export function createNotesDrafts(persistence?: { read(): Record<string, string>; write(drafts: Record<string, string>): void }) {
  const drafts = new Map(Object.entries(persistence?.read() ?? {}));
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
        const text = drafts.get(key)!;
        try { await save(text); } catch { return false; }
        if (drafts.get(key) === text) { drafts.delete(key); persist(); }
      }
      return true;
    }).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
  return {
    key: (prefix: string, target: string) => [...drafts.keys()].find(key => key.startsWith(prefix)) ?? prefix + target,
    get: (key: string, fallback: string) => drafts.get(key) ?? fallback,
    bind(key: string, save: Save) { saves.set(key, save); },
    update(key: string, text: string) { drafts.set(key, text); persist(); },
    flush,
    async flushAll() { return (await Promise.all([...drafts.keys()].map(flush))).every(Boolean); },
  };
}
export type NotesDrafts = ReturnType<typeof createNotesDrafts>;
