import type { DeckEditorSession } from "./deckEditorSession";

/** Debounce disk writes, serialize saves, and drain edits received during a write. */
export function createDeckEditorAutosave(session: DeckEditorSession, delay = 700) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<boolean> | undefined;
  let disposed = false;
  let revision = session.getSnapshot().eventCount;
  let document = session.getSnapshot().documentVersion;
  const flush = (): Promise<boolean> => {
    clearTimeout(timer);
    if (pending) return pending;
    pending = (async () => {
      while (!disposed && session.getSnapshot().dirty) {
        if (!await session.save()) return false;
      }
      return !session.getSnapshot().dirty;
    })().finally(() => { pending = undefined; });
    return pending;
  };
  const unsubscribe = session.subscribe(() => {
    const state = session.getSnapshot();
    if (revision === state.eventCount && document === state.documentVersion) return;
    revision = state.eventCount;
    document = state.documentVersion;
    clearTimeout(timer);
    if (state.dirty) timer = setTimeout(() => { void flush(); }, delay);
  });
  return { flush, dispose() { disposed = true; clearTimeout(timer); unsubscribe(); } };
}
