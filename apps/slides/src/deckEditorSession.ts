import { SourceSnapshot } from "@legend-apps/source-editor/snapshots";

export type DeckEditorSnapshot = {
  path: string | null;
  source: string;
  savedSource: string;
  eventCount: number;
  documentVersion: number;
  selection: number;
  status: "empty" | "loading" | "building" | "ready" | "error";
  error: string;
  conflict: boolean;
  saving: boolean;
  dirty: boolean;
  slideEnds: readonly number[];
};

type EditorIO = {
  read(path: string): Promise<string>;
  write(path: string, expected: string, source: string): Promise<boolean>;
  preview(path: string, source: string): Promise<boolean | { success: boolean; slideEnds?: number[] }>;
  invalidate(): void;
  opened(path: string): void;
};

export function createDeckEditorSession(io: EditorIO) {
  let state: DeckEditorSnapshot = { path: null, source: "", savedSource: "", eventCount: 0,
    documentVersion: 0, selection: 0, status: "empty", error: "", conflict: false, saving: false, dirty: false, slideEnds: [] };
  let snapshot = new SourceSnapshot("");
  const listeners = new Set<() => void>();
  let version = 0;
  let validVersion = -1;
  let refreshPending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let compiling: { version: number; promise: Promise<boolean> } | undefined;
  const emit = (patch: Partial<DeckEditorSnapshot>) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()); };
  const invalidate = () => { version += 1; validVersion = -1; clearTimeout(timer); io.invalidate(); };
  const materialize = () => {
    const source = snapshot.materialize();
    if (source !== state.source) emit({ source, dirty: source !== state.savedSource });
    else if (state.dirty && source === state.savedSource) emit({ dirty: false });
  };

  const compile = (): Promise<boolean> => {
    clearTimeout(timer);
    if (!state.path || state.status === "loading" || state.status === "empty") return Promise.resolve(false);
    if (validVersion === version) return Promise.resolve(true);
    if (compiling?.version === version) return compiling.promise;
    materialize();
    const currentVersion = version;
    const { path, source } = state;
    emit({ status: "building" });
    const promise = io.preview(path, source).then((result) => {
      if (currentVersion !== version) return false;
      const ok = typeof result === "boolean" ? result : result.success;
      if (ok) validVersion = currentVersion;
      emit({ status: ok ? "ready" : "error", slideEnds: typeof result === "boolean" ? state.slideEnds : result.slideEnds ?? state.slideEnds });
      return ok;
    }).catch((error) => {
      if (currentVersion === version) emit({ status: "error", error: String(error) });
      return false;
    });
    compiling = { version: currentVersion, promise };
    void promise.finally(() => { if (compiling?.promise === promise) compiling = undefined; });
    return promise;
  };

  const session = {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async open(path: string) {
      refreshPending = false;
      invalidate();
      const currentVersion = version;
      snapshot = new SourceSnapshot("");
      emit({ path, source: "", savedSource: "", eventCount: 0, selection: 0,
        documentVersion: state.documentVersion + 1, status: "loading", error: "", conflict: false, dirty: false, slideEnds: [], saving: false });
      try {
        const source = await io.read(path);
        if (currentVersion !== version) return;
        io.opened(path);
        snapshot = new SourceSnapshot(source);
        emit({ source, savedSource: source, status: "building", slideEnds: [source.length] });
        await compile();
      } catch (error) {
        if (currentVersion === version) emit({ status: "empty", error: String(error) });
      } finally {
        if (currentVersion === version && refreshPending) {
          refreshPending = false;
          await session.refresh();
        }
      }
    },
    edit(source: string, eventCount: number) {
      if (source === state.source || eventCount < state.eventCount) return;
      invalidate();
      snapshot = new SourceSnapshot(source);
      emit({ source, eventCount, status: "building", error: "", dirty: source !== state.savedSource, slideEnds: [source.length] });
      timer = setTimeout(() => { void compile(); }, 350);
    },
    applyEdit(edit: { offset: number; removedLength: number; insertedText: string; revision: number }) {
      if (edit.revision <= state.eventCount || !snapshot.apply(edit)) return;
      invalidate();
      // Rebase known boundaries cheaply while the next MDX snapshot is pending.
      const delta = edit.insertedText.length - edit.removedLength;
      const slideEnds = state.slideEnds.map((end) => end <= edit.offset ? end
        : end >= edit.offset + edit.removedLength ? end + delta : edit.offset + edit.insertedText.length);
      emit({ eventCount: edit.revision, dirty: true, status: "building", error: "", slideEnds });
      timer = setTimeout(() => { void compile(); }, 350);
    },
    select(selection: number) {
      if (state.selection !== selection) emit({ selection });
    },
    ensurePreview: compile,
    async save() {
      materialize();
      const { path, source, savedSource, documentVersion, eventCount } = state;
      if (!path || state.saving || state.status === "loading" || state.status === "empty") return false;
      if (source === savedSource) return true;
      emit({ saving: true, error: "" });
      try {
        const saved = await io.write(path, savedSource, source);
        if (state.path !== path || state.documentVersion !== documentVersion) return false;
        if (!saved) {
          emit({ conflict: true, error: "The file changed on disk. Reload it before saving; your draft has not been overwritten." });
          return false;
        }
        emit({ savedSource: source, conflict: false, dirty: state.eventCount !== eventCount || state.source !== source });
        return true;
      } catch (error) {
        if (state.documentVersion === documentVersion) emit({ error: String(error) });
        return false;
      } finally {
        if (state.documentVersion === documentVersion) {
          emit({ saving: false });
          if (refreshPending) {
            refreshPending = false;
            await session.refresh();
          }
        }
      }
    },
    async refresh() {
      const { path, documentVersion } = state;
      if (path && (state.status === "loading" || state.saving)) {
        refreshPending = true;
      }
      if (!path || state.status === "loading" || state.saving) return;
      try {
        const disk = await io.read(path);
        if (state.path !== path || state.documentVersion !== documentVersion || state.saving) return;
        if (disk !== state.savedSource) {
          if (state.dirty) {
            emit({ conflict: true, error: "The file changed on disk. Save is protected; reload to discard your draft and use the disk version." });
          } else {
            const selection = state.selection;
            await session.open(path);
            session.select(Math.min(selection, state.source.length));
            return;
          }
        }
        // Local imports may have changed even when the MDX file did not.
        invalidate();
        await compile();
      } catch (error) {
        if (state.documentVersion === documentVersion) emit({ error: String(error) });
      }
    },
    dispose() { refreshPending = false; clearTimeout(timer); invalidate(); listeners.clear(); },
  };
  return session;
}

export type DeckEditorSession = ReturnType<typeof createDeckEditorSession>;
