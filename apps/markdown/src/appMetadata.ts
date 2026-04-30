import { applyChanges, internal, observable, type Change } from "@legendapp/state";
import { synced, type ObservablePersistPlugin, type PersistMetadata, type PersistOptions } from "@legendapp/state/sync";
import { Settings } from "react-native";

const metadataSuffix = "__m";
const settingsPrefix = "legend.markdown.";
const maxRecentFiles = 20;
const { safeParse, safeStringify } = internal;

export type RecentMarkdownFile = {
  path: string;
  title: string;
  lastOpenedAt: number;
};

type MarkdownAppMetadata = {
  recentFiles: RecentMarkdownFile[];
};

class SettingsPersistPlugin implements ObservablePersistPlugin {
  private data: Record<string, unknown> = {};

  private key(table: string) {
    return `${settingsPrefix}${table}`;
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

export const markdownAppMetadata$ = observable<MarkdownAppMetadata>(
  synced({
    initial: {
      recentFiles: [],
    },
    persist: {
      name: "app-metadata",
      plugin: new SettingsPersistPlugin(),
    },
  }),
);

export function getMarkdownFileTitle(path: string) {
  return path.split("/").pop() ?? path;
}

export function getRecentMarkdownFiles() {
  return markdownAppMetadata$.recentFiles.peek() ?? [];
}

export function addRecentMarkdownFile(path: string) {
  const title = getMarkdownFileTitle(path);
  const existing = getRecentMarkdownFiles().filter((file) => file.path !== path);
  markdownAppMetadata$.recentFiles.set([
    {
      path,
      title,
      lastOpenedAt: Date.now(),
    },
    ...existing,
  ].slice(0, maxRecentFiles));
}

export function removeRecentMarkdownFile(path: string) {
  markdownAppMetadata$.recentFiles.set(getRecentMarkdownFiles().filter((file) => file.path !== path));
}
