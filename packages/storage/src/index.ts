import { applyChanges, internal, isArray, observable, type Change, type Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import {
  synced,
  type ObservablePersistPlugin,
  type ObservablePersistPluginOptions,
  type PersistMetadata,
  type PersistOptions,
  type SyncTransform,
} from "@legendapp/state/sync";
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

export type StoragePath = {
  isDirectory: boolean;
  name: string;
  uri: string;
};

export type StorageDirectory = StoragePath & { isDirectory: true };
export type StorageFile = StoragePath & { isDirectory: false };

export type StorageReadOptions<Format extends StorageFormat = StorageFormat> = {
  format: Format;
};

export type StorageWriteOptions<Format extends StorageFormat = StorageFormat> = {
  format: Format;
};

export type Storage = {
  root: StorageDirectory;
  delete(relativePath: string): void;
  directory(relativePath?: string): StorageDirectory;
  ensureDirectory(relativePath?: string): StorageDirectory;
  file(relativePath: string): StorageFile;
  list(relativePath?: string, options?: StorageListOptions): StoragePath[];
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

export type CreateObservableFileOptions<T> = {
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

export type ObservableSettingsField<TValue> = {
  defaultValue: TValue;
  normalize?: (value: unknown) => TValue;
};

export type ObservableSettingsFields = Record<string, ObservableSettingsField<any>>;

export type ObservableSettingsValues<TFields extends ObservableSettingsFields> = {
  [K in keyof TFields]: TFields[K] extends ObservableSettingsField<infer TValue> ? TValue : never;
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

function normalizeRelativePath(relativePath = "") {
  if (relativePath.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(relativePath)) {
    throw new Error(`Storage paths must be relative: ${relativePath}`);
  }

  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Storage paths cannot traverse outside their root: ${relativePath}`);
  }
  return segments.filter(Boolean).join("/");
}

function joinRelativePaths(...paths: (string | undefined)[]) {
  return normalizeRelativePath(paths.filter(Boolean).join("/"));
}

function storagePathName(relativePath: string, root: StorageRoot) {
  const segments = relativePath.split("/");
  return segments.at(-1) || root;
}

function createStoragePath(root: StorageRoot, relativePath: string, isDirectory: boolean): StoragePath {
  const uri = NativeStorage.getStoragePathUri(root, relativePath);
  if (!uri) {
    throw new Error(`Could not resolve ${root} storage path: ${relativePath}`);
  }
  return {
    isDirectory,
    name: storagePathName(relativePath, root),
    uri,
  };
}

function fileNameForTable(table: string, extension: string) {
  return `${table}.${extension.replace(/^\./, "")}`;
}

function parseFileValue(content: string, format: StorageFormat) {
  if (format === "json") {
    try {
      return safeParse(content);
    } catch {
      return undefined;
    }
  }

  return content;
}

export function getApplicationSupportDirectory() {
  return createStoragePath("applicationSupport", "", true) as StorageDirectory;
}

export function readTextFile(pathOrUri: string) {
  return NativeStorage.readTextFile(pathOrUri) ?? undefined;
}

export function createStorage({ root = "applicationSupport", subfolder }: StorageOptions = {}): Storage {
  const rootPath = normalizeRelativePath(subfolder);
  const resolvePath = (relativePath = "") => joinRelativePaths(rootPath, relativePath);
  const directory = (relativePath = "") => createStoragePath(root, resolvePath(relativePath), true) as StorageDirectory;
  const file = (relativePath: string) => createStoragePath(root, resolvePath(relativePath), false) as StorageFile;

  const ensureDirectory = (relativePath = "") => {
    const path = resolvePath(relativePath);
    if (!NativeStorage.ensureStorageDirectory(root, path)) {
      throw new Error(`Could not create ${root} storage directory: ${path}`);
    }
    return createStoragePath(root, path, true) as StorageDirectory;
  };

  return {
    root: directory(),
    delete(relativePath) {
      NativeStorage.deleteStoragePath(root, resolvePath(relativePath));
    },
    directory,
    ensureDirectory,
    file,
    list(relativePath = "", options = {}) {
      const path = resolvePath(relativePath);
      const entries = JSON.parse(NativeStorage.listStorageDirectoryJson(root, path)) as Array<{
        isDirectory: boolean;
        name: string;
      }>;
      const extension = options.extension ? normalizeExtension(options.extension).toLowerCase() : undefined;
      return entries
        .filter((entry) => !extension || (!entry.isDirectory && entry.name.toLowerCase().endsWith(extension)))
        .map((entry) => createStoragePath(root, joinRelativePaths(path, entry.name), entry.isDirectory));
    },
    read(relativePath: string, options: StorageReadOptions) {
      const path = resolvePath(relativePath);
      const content = NativeStorage.readStorageText(root, path);
      if (content === null) {
        return undefined;
      }
      const value = parseFileValue(content, options.format);
      if (options.format === "json" && value === undefined) {
        NativeStorage.deleteStoragePath(root, path);
      }
      return value;
    },
    write(relativePath: string, value: unknown, options: StorageWriteOptions) {
      const path = resolvePath(relativePath);
      const output = options.format === "json"
        ? safeStringify(value)
        : typeof value === "string" ? value : String(value);
      if (!NativeStorage.writeStorageText(root, path, output)) {
        throw new Error(`Could not write ${root} storage file: ${path}`);
      }
    },
  };
}

function readStorageValue(storage: Storage, relativePath: string, format: StorageFormat) {
  return (storage.read as (path: string, options: StorageReadOptions) => unknown)(relativePath, { format });
}

function writeStorageValue(storage: Storage, relativePath: string, value: unknown, format: StorageFormat) {
  (storage.write as (path: string, nextValue: unknown, options: StorageWriteOptions) => void)(
    relativePath,
    value,
    { format },
  );
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
      const value = readStorageValue(this.storage, fileNameForTable(table, this.extension), this.format);
      if (value !== undefined) {
        this.data[table] = value;
      }

      const metadataValue = readStorageValue(
        this.storage,
        fileNameForTable(`${table}${metadataSuffix}`, this.extension),
        this.format,
      );
      if (metadataValue !== undefined) {
        this.data[`${table}${metadataSuffix}`] = metadataValue;
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
    const relativePath = fileNameForTable(table, this.extension);

    if (value !== undefined && value !== null) {
      writeStorageValue(this.storage, relativePath, value, this.format);
    } else {
      this.storage.delete(relativePath);
    }
  }
}

export function observablePersistStorage(options: StoragePersistPluginOptions) {
  return new ObservablePersistStorage(options);
}

export function createObservableFile<T>({
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

  const data$ = observable(
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
    const defaultPath = `${filename}.json`;
    if (targetStorage.read(defaultPath, { format: "text" }) === undefined) {
      targetStorage.write(`${filename}.json`, initialValue, { format: "json" });
    }
  }

  observablePersistPlugins.set(data$ as unknown as Observable<unknown>, plugin);
  return data$ as Observable<T>;
}

function getObservableSettingsInitialValue<TFields extends ObservableSettingsFields>(
  fields: TFields,
): ObservableSettingsValues<TFields> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.defaultValue]),
  ) as ObservableSettingsValues<TFields>;
}

function normalizeObservableSettingsValue<TValue>(
  field: ObservableSettingsField<TValue>,
  value: unknown,
): TValue {
  if (field.normalize) {
    return field.normalize(value);
  }

  return value === undefined || value === null ? field.defaultValue : value as TValue;
}

export function createObservableSettings<const TFields extends ObservableSettingsFields>({
  fields,
  ...options
}: Omit<CreateObservableFileOptions<ObservableSettingsValues<TFields>>, "initialValue"> & {
  fields: TFields;
}) {
  const settings$ = createObservableFile<ObservableSettingsValues<TFields>>({
    ...options,
    initialValue: getObservableSettingsInitialValue(fields),
  });

  function field<TKey extends keyof TFields & string>(key: TKey): {
    get: () => ObservableSettingsValues<TFields>[TKey];
    set: (value: ObservableSettingsValues<TFields>[TKey]) => void;
    use: () => ObservableSettingsValues<TFields>[TKey];
  } {
    type TValue = ObservableSettingsValues<TFields>[TKey];
    const settingField = fields[key] as ObservableSettingsField<TValue>;
    let setting$: any;
    const getSetting = () => {
      setting$ ??= (settings$ as any)[key];
      return setting$;
    };

    return {
      get: () => normalizeObservableSettingsValue(settingField, getSetting().get()),
      set: (value: TValue) => {
        getSetting().set(normalizeObservableSettingsValue(settingField, value));
      },
      use: () => normalizeObservableSettingsValue(settingField, useValue(getSetting())),
    };
  }

  return {
    field,
    settings$,
  };
}

export function getPersistPlugin<T>(obs$: Observable<T>): ManagedPersistPlugin | undefined {
  return observablePersistPlugins.get(obs$ as unknown as Observable<unknown>);
}
