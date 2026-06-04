import {
    createJSONManager as createSharedJSONManager,
    getPersistPlugin,
    type CreateJSONManagerOptions,
} from "@legend-desktop/app-settings";
import type { Observable } from "@legendapp/state";
import type { SyncTransform } from "@legendapp/state/sync";

import { type ExpoFSPersistPluginOptions, observablePersistExpoFS } from "@/utils/ExpoFSPersistPlugin";

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
    return createSharedJSONManager<T>({
        filename,
        initialValue,
        persistPlugin: observablePersistExpoFS({
            basePath,
            preload: preload === false ? undefined : Array.isArray(preload) ? preload : [filename],
            saveTimeout,
            format,
        }),
        saveDefaultToFile,
        transform,
    } satisfies CreateJSONManagerOptions<T>);
}

export { getPersistPlugin };
