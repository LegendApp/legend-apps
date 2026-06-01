import { type Observable, observable } from "@legendapp/state";
import { type SyncTransform, synced } from "@legendapp/state/sync";

import { type ExpoFSPersistPluginOptions, observablePersistExpoFS } from "@/utils/ExpoFSPersistPlugin";

type PersistPlugin = ReturnType<typeof observablePersistExpoFS>;
const observablePersistPlugins = new WeakMap<Observable<unknown>, PersistPlugin>();

/**
 * Creates a manager for a JSON file with observable state
 * @param filename The name of the JSON file (without path)
 * @param initialValue The initial value for the observable
 * @returns An object with the observable and utility functions
 */
export function createJSONManager<T extends object>(params: {
    basePath?: ExpoFSPersistPluginOptions["basePath"];
    filename: string;
    initialValue: T;
    saveDefaultToFile?: boolean;
    transform?: SyncTransform<any, any>;
    format?: "json";
    preload?: boolean | string[];
    saveTimeout?: number;
}): Observable<T> {
    const {
        basePath,
        filename,
        format = "json",
        preload = [filename],
        initialValue,
        saveDefaultToFile,
        saveTimeout = 300,
        transform,
    } = params;
    const plugin = observablePersistExpoFS({
        basePath,
        preload: preload === false ? undefined : Array.isArray(preload) ? preload : [filename],
        saveTimeout,
        format,
    });
    // Create an observable with the initial value and make sure it has the correct type
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
        // TODO: save default to file
        // Need a feature in Legend State first
    }

    observablePersistPlugins.set(data$ as unknown as Observable<unknown>, plugin);

    return data$ as unknown as Observable<T>;
}

export function getPersistPlugin(obs$: Observable<unknown>): PersistPlugin | undefined {
    return observablePersistPlugins.get(obs$);
}
