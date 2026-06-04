import { applyChanges, internal, observable, type Change, type Observable } from "@legendapp/state";
import {
  synced,
  type ObservablePersistPlugin,
  type PersistMetadata,
  type PersistOptions,
  type SyncTransform,
} from "@legendapp/state/sync";
import { Settings } from "react-native";

const metadataSuffix = "__m";
const { safeParse, safeStringify } = internal;

type ManagedPersistPlugin = ObservablePersistPlugin & {
  flush: () => Promise<void>;
};

const observablePersistPlugins = new WeakMap<Observable<unknown>, ManagedPersistPlugin>();

export type CreateJSONManagerOptions<T extends object> = {
  filename: string;
  format?: "json";
  initialValue: T;
  persistPlugin: ManagedPersistPlugin;
  saveDefaultToFile?: boolean;
  transform?: SyncTransform<any, any>;
};

export function createJSONManager<T extends object>({
  filename,
  initialValue,
  persistPlugin,
  saveDefaultToFile,
  transform,
}: CreateJSONManagerOptions<T>): Observable<T> {
  const data$ = observable<Record<string, any>>(
    synced({
      initial: initialValue,
      persist: {
        name: filename,
        plugin: persistPlugin,
        transform,
      },
    }),
  );

  if (saveDefaultToFile) {
    // TODO: save default to file once Legend State exposes a stable hook for it.
  }

  observablePersistPlugins.set(data$ as unknown as Observable<unknown>, persistPlugin);

  return data$ as unknown as Observable<T>;
}

export function getPersistPlugin(obs$: Observable<unknown>): ManagedPersistPlugin | undefined {
  return observablePersistPlugins.get(obs$);
}

export type NativeSettingsValueOptions<T> = {
  afterSet?: (value: T) => void;
  defaultValue: T;
  isValue: (value: unknown) => value is T;
  key: string;
  notify?: () => void;
};

export function createNativeSettingsValue<T>({
  afterSet,
  defaultValue,
  isValue,
  key,
  notify,
}: NativeSettingsValueOptions<T>) {
  return {
    get(): T {
      const value = Settings.get(key);
      return isValue(value) ? value : defaultValue;
    },
    set(value: T) {
      Settings.set({ [key]: value });
      afterSet?.(value);
      notify?.();
    },
  };
}

export function createSettingsSubscription() {
  const subscribers = new Set<() => void>();

  return {
    notify() {
      subscribers.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
  };
}

export type NativeSettingsPersistPluginOptions = {
  prefix: string;
};

class NativeSettingsPersistPlugin implements ObservablePersistPlugin {
  private data: Record<string, unknown> = {};
  private prefix: string;

  constructor({ prefix }: NativeSettingsPersistPluginOptions) {
    this.prefix = prefix;
  }

  private key(table: string) {
    return `${this.prefix}${table}`;
  }

  private loadTableValue(table: string, init: object) {
    if (Object.prototype.hasOwnProperty.call(this.data, table)) {
      return this.data[table];
    }

    const value = Settings.get(this.key(table));
    if (typeof value === "string") {
      this.data[table] = safeParse(value);
    } else if (value !== undefined && value !== null) {
      this.data[table] = value;
    } else {
      this.data[table] = init;
    }

    return this.data[table];
  }

  getTable<T = unknown>(table: string, init: object, _config: PersistOptions): T {
    return this.loadTableValue(table, init) as T;
  }

  set(table: string, changes: Change[], config: PersistOptions): void {
    const current = this.getTable(table, {}, config);
    const next = applyChanges(typeof current === "object" && current !== null ? current : {}, changes);
    this.data[table] = next;
    Settings.set({ [this.key(table)]: safeStringify(next) });
  }

  deleteTable(table: string, _config: PersistOptions): void {
    delete this.data[table];
    Settings.set({ [this.key(table)]: null });
  }

  getMetadata(table: string, config: PersistOptions): PersistMetadata {
    return this.getTable<PersistMetadata>(`${table}${metadataSuffix}`, {}, config);
  }

  setMetadata(table: string, metadata: PersistMetadata, _config: PersistOptions): void {
    const metadataTable = `${table}${metadataSuffix}`;
    this.data[metadataTable] = metadata;
    Settings.set({ [this.key(metadataTable)]: safeStringify(metadata) });
  }

  deleteMetadata(table: string, config: PersistOptions): void {
    this.deleteTable(`${table}${metadataSuffix}`, config);
  }
}

export function createNativeSettingsPersistPlugin(options: NativeSettingsPersistPluginOptions) {
  return new NativeSettingsPersistPlugin(options);
}
