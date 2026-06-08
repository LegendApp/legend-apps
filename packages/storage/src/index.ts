import { applyChanges, internal, isArray, observable, type Change, type Observable } from "@legendapp/state";
import {
  synced,
  type ObservablePersistPlugin,
  type ObservablePersistPluginOptions,
  type PersistMetadata,
  type PersistOptions,
  type SyncTransform,
} from "@legendapp/state/sync";
import { Directory, File, Paths } from "expo-file-system/next";

import NativeStorage from "./NativeStorage";

const metadataSuffix = "__m";
const { safeParse, safeStringify } = internal;

export type StorageRoot = "applicationSupport" | "cache" | "document";
export type StorageFormat = "json" | "m3u" | "text";

export type StorageOptions = {
  root?: StorageRoot;
  subfolder?: string;
};

export type StorageListOptions = {
  extension?: string;
};

export type StorageReadOptions<Format extends StorageFormat = StorageFormat> = {
  format: Format;
};

export type StorageWriteOptions<Format extends StorageFormat = StorageFormat> = {
  format: Format;
};

export type Storage = {
  root: Directory;
  delete(relativePath: string): void;
  directory(relativePath?: string): Directory;
  ensureDirectory(relativePath?: string): Directory;
  file(relativePath: string): File;
  list(relativePath?: string, options?: StorageListOptions): (Directory | File)[];
  read<T = unknown>(relativePath: string, options: StorageReadOptions<"json">): T | undefined;
  read(relativePath: string, options: StorageReadOptions<"m3u" | "text">): string | undefined;
  write(relativePath: string, value: unknown, options: StorageWriteOptions<"json">): void;
  write(relativePath: string, value: string, options: StorageWriteOptions<"m3u" | "text">): void;
};

type ManagedPersistPlugin = ObservablePersistPlugin & {
  flush: () => Promise<void>;
};

export type StoragePersistPluginOptions = {
  extension?: string;
  format?: "json" | "m3u" | "text";
  preload?: string[];
  saveTimeout?: number;
  storage: Storage;
};

export type CreateObservableFileOptions<T extends object> = {
  filename: string;
  format?: "json";
  initialValue: T;
  preload?: boolean | string[];
  root?: StorageRoot;
  saveDefaultToFile?: boolean;
  saveTimeout?: number;
  storage?: Storage;
  subfolder?: string;
  transform?: SyncTransform<any, any>;
};

const observablePersistPlugins = new WeakMap<Observable<unknown>, ManagedPersistPlugin>();
const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const pendingCallbacks = new Map<string, () => void>();

function timeoutOnce(name: string, callback: () => void, delayMs: number) {
  const existingTimeout = pendingTimeouts.get(name);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  pendingCallbacks.set(name, callback);
  pendingTimeouts.set(
    name,
    setTimeout(() => {
      pendingTimeouts.delete(name);
      const pendingCallback = pendingCallbacks.get(name);
      pendingCallbacks.delete(name);
      pendingCallback?.();
    }, delayMs),
  );
}

function flushTimeoutsWhere(predicate: (name: string) => boolean) {
  for (const [name, timeout] of [...pendingTimeouts.entries()]) {
    if (predicate(name)) {
      clearTimeout(timeout);
      pendingTimeouts.delete(name);
      const callback = pendingCallbacks.get(name);
      pendingCallbacks.delete(name);
      callback?.();
    }
  }
}

function normalizeExtension(extension: string) {
  return extension.startsWith(".") ? extension : `.${extension}`;
}

function extensionForFormat(format: StorageFormat) {
  return format === "m3u" ? "m3u" : format === "text" ? "txt" : "json";
}

function splitRelativePath(relativePath = "") {
  return relativePath.split("/").filter((segment) => segment.length > 0);
}

function fileNameForTable(table: string, extension: string) {
  return `${table}.${extension.replace(/^\./, "")}`;
}

function readFileValue(file: File, format: StorageFormat) {
  const content = file.textSync();
  if (format === "json") {
    try {
      return safeParse(content);
    } catch {
      if (file.exists) {
        file.delete();
      }
      return undefined;
    }
  }

  return content;
}

function writeFileValue(file: File, value: unknown, format: StorageFormat) {
  const output = format === "json" ? safeStringify(value) : typeof value === "string" ? value : String(value);
  file.parentDirectory.create({ idempotent: true, intermediates: true });
  file.write(output);
}

export function getApplicationSupportDirectory() {
  return new Directory(NativeStorage.getApplicationSupportDirectory());
}

function getRootDirectory(root: StorageRoot) {
  if (root === "applicationSupport") {
    return getApplicationSupportDirectory();
  }
  if (root === "cache") {
    return Paths.cache;
  }
  return Paths.document;
}

export function createStorage({ root = "applicationSupport", subfolder }: StorageOptions = {}): Storage {
  const rootDirectory = subfolder
    ? new Directory(getRootDirectory(root), ...splitRelativePath(subfolder))
    : getRootDirectory(root);

  const directory = (relativePath = "") => new Directory(rootDirectory, ...splitRelativePath(relativePath));
  const file = (relativePath: string) => new File(rootDirectory, ...splitRelativePath(relativePath));

  const ensureDirectory = (relativePath = "") => {
    const targetDirectory = directory(relativePath);
    targetDirectory.create({ idempotent: true, intermediates: true });
    return targetDirectory;
  };

  return {
    root: rootDirectory,
    delete(relativePath) {
      const targetFile = file(relativePath);
      if (targetFile.exists) {
        targetFile.delete();
      }
    },
    directory,
    ensureDirectory,
    file,
    list(relativePath = "", options = {}) {
      const targetDirectory = ensureDirectory(relativePath);
      const entries = targetDirectory.list();
      const extension = options.extension ? normalizeExtension(options.extension).toLowerCase() : undefined;
      return extension
        ? entries.filter((entry) => entry instanceof File && entry.name.toLowerCase().endsWith(extension))
        : entries;
    },
    read(relativePath: string, options: StorageReadOptions) {
      const targetFile = file(relativePath);
      if (!targetFile.exists) {
        return undefined;
      }
      return readFileValue(targetFile, options.format);
    },
    write(relativePath: string, value: unknown, options: StorageWriteOptions) {
      writeFileValue(file(relativePath), value, options.format);
    },
  };
}

class ObservablePersistStorage implements ManagedPersistPlugin {
  private data: Record<string, unknown> = {};
  private extension: string;
  private format: StorageFormat;
  private isFlushing = false;
  private preload?: string[];
  private saveTimeout: number;
  private storage: Storage;
  private tablesLoaded: Record<string, boolean> = {};
  private readonly timeoutPrefix: string;

  constructor({ extension, format = "json", preload, saveTimeout = 100, storage }: StoragePersistPluginOptions) {
    this.extension = extension ?? extensionForFormat(format);
    this.format = format;
    this.preload = preload;
    this.saveTimeout = saveTimeout;
    this.storage = storage;
    this.timeoutPrefix = `save_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  initialize(_configOptions: ObservablePersistPluginOptions) {
    this.storage.ensureDirectory();
    if (isArray(this.preload)) {
      const metadataTables = this.preload
        .map((table) => table.endsWith(metadataSuffix) ? undefined : `${table}${metadataSuffix}`)
        .filter((table): table is string => Boolean(table));
      for (const table of [...this.preload, ...metadataTables]) {
        this.loadTable(table);
      }
    }
  }

  loadTable(table: string) {
    if (!this.tablesLoaded[table]) {
      this.tablesLoaded[table] = true;
      const mainTableFile = this.storage.file(fileNameForTable(table, this.extension));
      const metadataTableFile = this.storage.file(fileNameForTable(`${table}${metadataSuffix}`, this.extension));

      if (mainTableFile.exists) {
        const value = readFileValue(mainTableFile, this.format);
        if (value !== undefined) {
          this.data[table] = value;
        }
      }

      if (metadataTableFile.exists) {
        const value = readFileValue(metadataTableFile, this.format);
        if (value !== undefined) {
          this.data[`${table}${metadataSuffix}`] = value;
        }
      }
    }
  }

  getTable<T = unknown>(table: string, init: object): T {
    return (this.data[table] ?? init ?? {}) as T;
  }

  getMetadata(table: string): PersistMetadata {
    return this.getTable<PersistMetadata>(`${table}${metadataSuffix}`, {});
  }

  set(table: string, changes: Change[]): Promise<void> {
    const current = this.data[table];
    this.data[table] = applyChanges(typeof current === "object" && current !== null ? current : {}, changes);
    return this.save(table);
  }

  setMetadata(table: string, metadata: PersistMetadata) {
    return this.setValue(`${table}${metadataSuffix}`, metadata);
  }

  deleteTable(table: string) {
    this.storage.delete(fileNameForTable(table, this.extension));
    delete this.data[table];
  }

  deleteMetadata(table: string) {
    return this.deleteTable(`${table}${metadataSuffix}`);
  }

  private async setValue(table: string, value: unknown) {
    this.data[table] = value;
    await this.save(table);
  }

  private async save(table: string) {
    if (this.isFlushing) {
      this.saveDebounced(table);
    } else {
      timeoutOnce(this.getTimeoutName(table), () => this.saveDebounced(table), this.saveTimeout);
    }
  }

  private getTimeoutName(table: string) {
    return `${this.timeoutPrefix}_${table}`;
  }

  async flush(): Promise<void> {
    this.isFlushing = true;
    flushTimeoutsWhere((name) => name.startsWith(this.timeoutPrefix));
  }

  private saveDebounced(table: string) {
    const value = this.data[table];
    const file = this.storage.file(fileNameForTable(table, this.extension));

    if (value !== undefined && value !== null) {
      writeFileValue(file, value, this.format);
    } else if (file.exists) {
      file.delete();
    }
  }
}

export function observablePersistStorage(options: StoragePersistPluginOptions) {
  return new ObservablePersistStorage(options);
}

export function createObservableFile<T extends object>({
  filename,
  format = "json",
  initialValue,
  preload = [filename],
  root = "applicationSupport",
  saveDefaultToFile,
  saveTimeout = 300,
  storage,
  subfolder,
  transform,
}: CreateObservableFileOptions<T>): Observable<T> {
  const targetStorage = storage ?? createStorage({ root, subfolder });
  const plugin = observablePersistStorage({
    format,
    preload: preload === false ? undefined : Array.isArray(preload) ? preload : [filename],
    saveTimeout,
    storage: targetStorage,
  });

  const data$ = observable<Record<string, any>>(
    synced({
      initial: initialValue,
      persist: {
        name: filename,
        plugin,
        transform,
      },
    }),
  );

  if (saveDefaultToFile) {
    targetStorage.write(`${filename}.json`, initialValue, { format: "json" });
  }

  observablePersistPlugins.set(data$ as unknown as Observable<unknown>, plugin);
  return data$ as unknown as Observable<T>;
}

export function getPersistPlugin(obs$: Observable<unknown>): ManagedPersistPlugin | undefined {
  return observablePersistPlugins.get(obs$);
}
