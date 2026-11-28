import type { DataSourceOperation } from "@legendapp/list/react-native";
import { batch, observable } from "@legendapp/state";
import { MarkdownBlockDataSource } from "./MarkdownBlockDataSource";
import { isMarkdownFileConflictError } from "./fileConflict";
import type { DocumentState, HistoryEntry, UpdateBlockHistoryEntry } from "./internalTypes";
import type {
  MarkdownDocumentAdapter,
  MarkdownSavePolicy,
  MarkdownSaveState,
  MarkdownTransactionResult,
} from "./types";

type Conflict = "changed" | "missing" | null;
type RetainedBlock = { blockId: string; index: number };
type DocumentView = {
  onLoad: () => void;
  onTransaction: (result: MarkdownTransactionResult, fromPeer: boolean) => void;
  onError: (error: Error) => void;
  flushDraft: () => Promise<void>;
  hasDraft: () => boolean;
};

const openFiles = new WeakMap<MarkdownDocumentAdapter, Map<string, MarkdownDocumentBacking>>();
let nextBackingId = 0;
let nextLoadVersion = 0;

export class MarkdownDocumentBacking {
  readonly id = ++nextBackingId;
  readonly state$ = observable<DocumentState>({ status: "loading" });
  readonly status$ = observable({ dirty: false, conflict: null as Conflict, save: "idle" as MarkdownSaveState });
  readonly history$ = observable({ canUndo: false, canRedo: false });
  readonly views = new Set<DocumentView>();
  readonly undoStackRef = { current: [] as HistoryEntry[] };
  readonly redoStackRef = { current: [] as HistoryEntry[] };
  readonly typingHistoryGroupRef = { current: undefined as { entry: UpdateBlockHistoryEntry; updatedAt: number; view: object } | undefined };
  readonly suppressHistoryRef = { current: false };
  readonly loadVersionRef = { current: 0 };
  readonly currentRevisionRef = { current: 0 };
  private queue: Promise<unknown> = Promise.resolve();
  private leases = 0;
  private disposed = false;
  private mutationCount = 0;
  private saveInFlight: { promise: Promise<void>; ordinary: boolean } | undefined;
  private fileCheck: Promise<void> | undefined;
  private fileCheckRequest = 0;
  private reloadRequested = false;
  private saveGeneration = 0;
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private autosavePaused = false;
  private savePolicy: MarkdownSavePolicy | undefined;
  dataSource: MarkdownBlockDataSource | null = null;
  private readonly nativeSessions = new WeakMap<MarkdownBlockDataSource, { documentId: string; refs: number }>();

  static acquire(adapter: MarkdownDocumentAdapter, filename: string, shareFile: boolean) {
    if (!shareFile) return new MarkdownDocumentBacking(adapter, filename);
    let files = openFiles.get(adapter);
    if (!files) openFiles.set(adapter, files = new Map());
    const key = adapter.resolveFilePath?.(filename) ?? filename;
    let backing = files.get(key);
    if (!backing) {
      backing = new MarkdownDocumentBacking(adapter, key, files);
      files.set(key, backing);
    }
    return backing;
  }

  private constructor(
    readonly adapter: MarkdownDocumentAdapter,
    public filename: string,
    private readonly files?: Map<string, MarkdownDocumentBacking>,
  ) {}

  retain() {
    this.leases += 1;
    if (!this.loadVersionRef.current) this.load();
    return () => {
      this.leases -= 1;
      if (this.leases > 0) return;
      // A pane move unmounts and mounts in the same commit. Keep the backing
      // available through that commit and let queued edits finish before closing.
      void this.queue.then(() => {
        if (this.leases > 0 || this.disposed) return;
        this.disposed = true;
        this.clearAutosaveTimer();
        this.loadVersionRef.current = ++nextLoadVersion;
        this.files?.delete(this.filename);
        this.closeLoadedDocument();
        this.state$.set({ status: "loading" });
      });
    };
  }

  connect(view: DocumentView) {
    this.views.add(view);
    view.onLoad();
    return () => { this.views.delete(view); };
  }

  get isShared() {
    return this.files !== undefined;
  }

  retainDataSource(dataSource: MarkdownBlockDataSource) {
    const session = this.nativeSessions.get(dataSource);
    if (!session) return;
    session.refs += 1;
    return () => this.releaseDataSource(dataSource);
  }

  private releaseDataSource(dataSource: MarkdownBlockDataSource) {
    const session = this.nativeSessions.get(dataSource)!;
    session.refs -= 1;
    if (session.refs === 0) {
      queueMicrotask(() => {
        if (session.refs === 0 && this.nativeSessions.delete(dataSource)) {
          void this.adapter.close(session.documentId).catch(this.reportError);
        }
      });
    }
  }

  private closeLoadedDocument() {
    if (!this.dataSource) return;
    const dataSource = this.dataSource;
    this.dataSource = null;
    this.releaseDataSource(dataSource);
  }

  private reportError = (error: Error) => {
    this.views.forEach(view => view.onError(error));
  };

  reload = () => {
    if (this.reloadRequested) return;
    this.reloadRequested = true;
    void this.mutate(() => this.load()).catch(this.reportError).finally(() => { this.reloadRequested = false; });
  };

  private load() {
    const generation = this.loadVersionRef.current = ++nextLoadVersion;
    this.clearAutosaveTimer();
    this.closeLoadedDocument();
    this.currentRevisionRef.current = 0;
    this.autosavePaused = false;
    this.undoStackRef.current = [];
    this.redoStackRef.current = [];
    this.suppressHistoryRef.current = false;
    this.typingHistoryGroupRef.current = undefined;
    batch(() => {
      this.status$.set({ dirty: false, conflict: null, save: "idle" });
      this.publishHistory();
      this.state$.set({ status: "loading" });
      this.views.forEach(view => view.onLoad());
    });
    void this.adapter.load(this.filename).then(async snapshot => {
      try {
        const indexed = !!this.adapter.getBlockIdAtIndexSync && !!this.adapter.getBlockIndexForIdSync;
        const ids = !indexed && this.adapter.getBlockIds
          ? await this.adapter.getBlockIds(snapshot.documentId, 0, snapshot.blockCount)
          : undefined;
        if (generation !== this.loadVersionRef.current) {
          await this.adapter.close(snapshot.documentId);
          return;
        }
        if (ids && ids.length !== snapshot.blockCount) {
          throw new Error(`Markdown adapter returned ${ids.length} block ids for ${snapshot.blockCount} blocks.`);
        }
        this.dataSource = new MarkdownBlockDataSource(this.adapter, snapshot.documentId, snapshot, ids);
        this.nativeSessions.set(this.dataSource, { documentId: snapshot.documentId, refs: 1 });
      } catch (error) {
        if (generation === this.loadVersionRef.current) await this.adapter.close(snapshot.documentId);
        throw error;
      }
      batch(() => {
        this.state$.set({ status: "loaded", snapshot });
        this.views.forEach(view => view.onLoad());
      });
    }).catch((error: unknown) => {
      if (generation !== this.loadVersionRef.current) return;
      const nextError = error instanceof Error ? error : new Error(String(error));
      batch(() => {
        this.state$.set({ status: "error", error: nextError });
        this.views.forEach(view => view.onLoad());
      });
    });

  };

  get canMutateSynchronously() {
    return !this.isShared || this.mutationCount === 0;
  }

  mutate<T>(run: () => T | Promise<T>): Promise<T | undefined> {
    if (!this.isShared) return Promise.resolve(run());
    this.mutationCount += 1;
    const generation = this.loadVersionRef.current;
    const result = this.queue.then(() => {
      if (generation === this.loadVersionRef.current) return run();
    }).finally(() => { this.mutationCount -= 1; });
    this.queue = result.catch(() => {});
    return result;
  }

  publishHistory() {
    this.history$.assign({
      canUndo: this.undoStackRef.current.length > 0,
      canRedo: this.redoStackRef.current.length > 0,
    });
  }

  applyTransactionResult(result: MarkdownTransactionResult, origin: DocumentView | undefined,
    move?: Extract<DataSourceOperation, { type: "move" }>, retainedBlock?: RetainedBlock) {
    if (!this.dataSource) throw new Error("Markdown block data source is not loaded.");
    batch(() => {
      this.currentRevisionRef.current = result.revision;
      const state = this.state$.peek();
      if (state.status === "loaded") {
        this.state$.set({
          status: "loaded",
          snapshot: {
            ...state.snapshot,
            blockCount: state.snapshot.blockCount - result.changedRange.deleteCount + result.changedRange.blockIds.length,
            sourceSize: result.sourceLength,
          },
        });
      }
      this.views.forEach(view => view.onTransaction(result, view !== origin));
      this.dataSource!.applyTransactionResult(result, move, retainedBlock);
    });
  }

  private clearAutosaveTimer() {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
  }

  configureSave(policy: MarkdownSavePolicy | undefined) {
    this.savePolicy = policy;
    if (policy?.autosave === false) this.clearAutosaveTimer();
  }

  private scheduleAutosave() {
    this.clearAutosaveTimer();
    if (this.savePolicy?.autosave === false || this.autosavePaused || this.status$.conflict.peek()) return;
    const debounce = Math.min(Math.max(this.savePolicy?.debounceMs ?? 2000, 0), 2000);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = undefined;
      void this.save().catch(() => {});
    }, debounce);
  }

  markDirty = () => {
    this.autosavePaused = false;
    this.status$.dirty.set(true);
    this.scheduleAutosave();
  };

  markClean = () => {
    this.clearAutosaveTimer();
    this.status$.dirty.set(false);
  };

  async flushDrafts() {
    for (const view of this.views) await view.flushDraft();
  }

  save = (saveFilename?: string, overwrite = false, requireDifferentFile = false): Promise<void> => {
    const previousSave = this.saveInFlight;
    const ordinary = !saveFilename && !overwrite;
    if (this.isShared && previousSave?.ordinary && ordinary) {
      return previousSave.promise.then(() => {
        if (this.status$.dirty.peek()) return this.save();
      });
    }
    const generation = this.loadVersionRef.current;
    const perform = async () => {
      const state = this.state$.peek();
      if (state.status !== "loaded" || generation !== this.loadVersionRef.current) return;
      const { documentId } = state.snapshot;
      const destination = saveFilename && this.files
        ? this.adapter.resolveFilePath?.(saveFilename) ?? saveFilename : saveFilename;
      if (requireDifferentFile && destination === this.filename) {
        throw new Error("Choose a different filename to save your local version separately.");
      }
      const changesPath = this.isShared && !!destination && destination !== this.filename;
      this.saveGeneration += 1;
      if (changesPath) {
        do { await this.flushDrafts(); }
        while ([...this.views].some(view => view.hasDraft()));
        if (this.files?.has(destination)) throw new Error("Close the destination document before saving to it.");
        if (this.leases > 1 || !this.adapter.saveAsSync) {
          if (!this.adapter.saveCopy) throw new Error("This document adapter does not support saving a copy.");
          this.adapter.saveCopy(documentId, destination);
          return;
        }
        this.adapter.saveAsSync(documentId, destination);
        this.files?.delete(this.filename);
        this.filename = destination;
        this.files?.set(destination, this);
        const current = this.state$.peek();
        if (current.status === "loaded") {
          this.state$.set({ status: "loaded", snapshot: { ...current.snapshot, filename: destination } });
        }
      }
      this.clearAutosaveTimer();
      this.autosavePaused = false;
      this.status$.save.set("saving");
      try {
        let savingRevision = this.currentRevisionRef.current;
        if (!changesPath) {
          do {
            await this.flushDrafts();
            if (generation !== this.loadVersionRef.current) return;
            savingRevision = this.currentRevisionRef.current;
            if (overwrite) {
              if (!this.adapter.overwrite) throw new Error("This document does not support overwriting conflicts.");
              await this.adapter.overwrite(documentId);
            } else if (saveFilename && !this.isShared) {
              await this.adapter.saveAs(documentId, saveFilename);
            } else {
              await this.adapter.save(documentId);
            }
            if (generation !== this.loadVersionRef.current) return;
          } while (this.currentRevisionRef.current !== savingRevision || [...this.views].some(view => view.hasDraft()));
        }
        this.status$.save.set("idle");
        this.status$.conflict.set(null);
        if (saveFilename && !this.isShared) this.filename = saveFilename;
        this.typingHistoryGroupRef.current = undefined;
        for (const entry of [...this.undoStackRef.current, ...this.redoStackRef.current]) {
          entry.savedBefore = false;
          entry.savedAfter = false;
        }
        const lastUndo = this.undoStackRef.current.at(-1);
        const lastRedo = this.redoStackRef.current.at(-1);
        if (lastUndo) lastUndo.savedAfter = true;
        if (lastRedo) lastRedo.savedAfter = true;
        this.markClean();
      } catch (error: unknown) {
        const nextError = error instanceof Error ? error : new Error(String(error));
        if (generation === this.loadVersionRef.current) {
          this.clearAutosaveTimer();
          this.autosavePaused = true;
          this.status$.save.set("error");
          if (isMarkdownFileConflictError(nextError)) {
            this.status$.conflict.set(String(nextError).includes("MARKDOWN_FILE_CONFLICT: missing") ? "missing" : "changed");
          }
          this.reportError(nextError);
        }
        throw nextError;
      }
    };
    // Only file-backed shared views need to exclude work initiated by another view.
    // Standalone views keep accepting edits while an asynchronous write is pending.
    const start = this.isShared ? this.mutate(perform)
      : previousSave ? previousSave.promise.catch(() => {}).then(perform) : perform();
    const saving = start.finally(() => {
      if (this.saveInFlight?.promise === saving) this.saveInFlight = undefined;
    });
    this.saveInFlight = { ordinary, promise: saving };
    return saving;
  };

  checkForExternalChanges = () => {
    this.fileCheckRequest += 1;
    if (this.fileCheck) return this.fileCheck;
    const check = this.checkFile().finally(() => { this.fileCheck = undefined; });
    this.fileCheck = check;
    return check;
  };

  private async checkFile() {
    if (!this.adapter.getFileStatus) return;
    const generation = this.loadVersionRef.current;
    for (;;) {
      try { await this.saveInFlight?.promise; } catch { /* Inspect failed saves too. */ }
      if (generation !== this.loadVersionRef.current) return;
      const state = this.state$.peek();
      if (state.status !== "loaded") return;
      const saveGeneration = this.saveGeneration;
      const request = this.fileCheckRequest;
      const status = await this.adapter.getFileStatus(state.snapshot.documentId);
      if (generation !== this.loadVersionRef.current) return;
      if (saveGeneration !== this.saveGeneration || this.saveInFlight || request !== this.fileCheckRequest) continue;
      if (status === "unchanged") {
        if (this.status$.conflict.peek()) {
          this.status$.conflict.set(null);
          this.autosavePaused = false;
          this.status$.save.set("idle");
          if (this.status$.dirty.peek()) this.scheduleAutosave();
        }
      } else {
        await this.mutate(() => {
          if (status === "changed" && !this.status$.dirty.peek()) this.load();
          else {
            this.clearAutosaveTimer();
            this.status$.conflict.set(status === "missing" ? "missing" : "changed");
          }
        });
      }
      return;
    }
  }
}
