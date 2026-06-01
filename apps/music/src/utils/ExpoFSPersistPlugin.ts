import type { Change } from "@legendapp/state";
import { applyChanges, internal, isArray } from "@legendapp/state";
import type { ObservablePersistPlugin, ObservablePersistPluginOptions, PersistMetadata } from "@legendapp/state/sync";
import * as FileSystemNext from "expo-file-system/next";
import { ensureCacheDirectory, getCacheDirectory } from "@/utils/cacheDirectories";
import { isPerfLoggingEnabled, perfLog } from "@/utils/perfLogger";
import { flushTimeoutOnce, timeoutOnce } from "@/utils/timeoutOnce";

declare global {
    // eslint-disable-next-line no-var
    var __LEGEND_PERF_START__: number | undefined;
}

const MetadataSuffix = "__m";
const { safeParse, safeStringify } = internal;

/**
 * Configuration options for the ReactNativeFS plugin
 */
export interface ExpoFSPersistPluginOptions {
    /**
     * Base directory path. Defaults to Cache
     */
    basePath?: "Cache";

    format: "json" | "m3u";

    /**
     * Preload all tables on startup. Can be true to load all, or an array of table names
     */
    preload?: string[];

    saveTimeout?: number;
}

class ObservablePersistExpoFS implements ObservablePersistPlugin {
    private data: Record<string, any> = {};
    private tablesLoaded: Record<string, boolean> = {};
    private configuration: ExpoFSPersistPluginOptions;
    private directory: FileSystemNext.Directory;
    private extension: string;
    private readonly timeoutPrefix: string;
    private isFlushing = false;

    constructor(configuration: ExpoFSPersistPluginOptions) {
        this.configuration = configuration;
        this.directory = getCacheDirectory("data");
        this.extension = configuration.format === "m3u" ? "m3u" : "json";
        this.timeoutPrefix = `save_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }

    private getStartDelta(): number | undefined {
        const start = globalThis.__LEGEND_PERF_START__;
        return typeof start === "number" ? Date.now() - start : undefined;
    }

    public initialize(_configOptions: ObservablePersistPluginOptions) {
        const storageConfig = this.configuration;
        let tables: string[] = [];
        const shouldLogPerf = isPerfLoggingEnabled();

        try {
            // Ensure base directory exists
            ensureCacheDirectory(this.directory);

            if (isArray(storageConfig.preload)) {
                // If preloadKeys, preload the tables on startup
                const metadataTables = storageConfig.preload.map((table) =>
                    table.endsWith(MetadataSuffix) ? undefined : table + MetadataSuffix,
                );
                tables = [...storageConfig.preload, ...(metadataTables.filter(Boolean) as string[])];

                if (shouldLogPerf && tables.length > 0) {
                    perfLog("Persist.preload.start", { tables, sinceStartMs: this.getStartDelta() });
                }

                tables.map((table) => this.loadTable(table));

                if (shouldLogPerf && tables.length > 0) {
                    perfLog("Persist.preload.end", { tables, sinceStartMs: this.getStartDelta() });
                }
            }
        } catch (e) {
            console.error("[legend-state] ObservablePersistReacExpoFS failed to initialize", e);
        }
    }

    private readFile(file: FileSystemNext.File) {
        const content = file.textSync();

        if (this.configuration.format === "json") {
            try {
                return safeParse(content);
            } catch {
                if (file.exists) {
                    file.delete();
                }
                return undefined;
            }
        }
        // For M3U format, just return the plain text content
        return content;
    }

    public loadTable(table: string) {
        if (!this.tablesLoaded[table]) {
            this.tablesLoaded[table] = true;
            const start = isPerfLoggingEnabled() ? Date.now() : undefined;
            try {
                const mainTableFile = new FileSystemNext.File(this.directory, `${table}.${this.extension}`);
                const metadataTableFile = new FileSystemNext.File(
                    this.directory,
                    `${table}${MetadataSuffix}.${this.extension}`,
                );

                if (mainTableFile.exists) {
                    const value = this.readFile(mainTableFile);
                    if (value !== undefined) {
                        this.data[table] = value;
                    }
                }

                if (metadataTableFile.exists) {
                    const value = this.readFile(metadataTableFile);
                    if (value !== undefined) {
                        this.data[table + MetadataSuffix] = value;
                    }
                }
            } catch (err) {
                console.error("[legend-state] ObservablePersistReacExpoFS failed to load table", table, err);
            } finally {
                if (start !== undefined) {
                    perfLog("Persist.loadTable", {
                        table,
                        durationMs: Date.now() - start,
                        sinceStartMs: this.getStartDelta(),
                    });
                }
            }
        }
    }

    // Gets
    public getTable(table: string, init: object) {
        return this.data[table] ?? init ?? {};
    }

    public getMetadata(table: string): PersistMetadata {
        return this.getTable(table + MetadataSuffix, {});
    }

    // Sets
    public set(table: string, changes: Change[]): Promise<void> {
        if (!this.data[table]) {
            this.data[table] = {};
        }

        this.data[table] = applyChanges(this.data[table], changes);
        return this.save(table);
    }

    public setMetadata(table: string, metadata: PersistMetadata) {
        return this.setValue(table + MetadataSuffix, metadata);
    }

    public deleteTable(table: string) {
        const filePath = new FileSystemNext.File(this.directory, table);
        if (filePath.exists) {
            filePath.delete();
        }
        delete this.data[table];
    }

    public deleteMetadata(table: string) {
        return this.deleteTable(table + MetadataSuffix);
    }

    // Private
    private async setValue(table: string, value: any) {
        this.data[table] = value;
        await this.save(table);
    }

    private async save(table: string) {
        if (this.isFlushing) {
            this.saveDebounced(table);
        } else {
            timeoutOnce(
                this.getTimeoutName(table),
                () => this.saveDebounced(table),
                this.configuration.saveTimeout || 100,
            );
        }
    }

    private getTimeoutName(table: string): string {
        return `${this.timeoutPrefix}_${table}`;
    }

    public async flush(): Promise<void> {
        this.isFlushing = true;
        await flushTimeoutOnce((name) => name.startsWith(this.timeoutPrefix));
    }

    private async saveDebounced(table: string) {
        const v = this.data[table];
        const file = new FileSystemNext.File(this.directory, `${table}.${this.extension}`);

        ensureCacheDirectory(file.parentDirectory);

        if (v !== undefined && v !== null) {
            const out = this.configuration.format === "json" ? safeStringify(v) : typeof v === "string" ? v : String(v);
            return file.write(out);
        }

        if (file.exists) {
            return file.delete();
        }

        return Promise.resolve();
    }
}

export function observablePersistExpoFS(configuration: ExpoFSPersistPluginOptions = { format: "json" }) {
    return new ObservablePersistExpoFS(configuration);
}
