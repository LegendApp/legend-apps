import {
    createObservableFile,
    createStorage,
    getPersistPlugin,
    type StorageRoot,
} from "@legend-desktop/storage";
import type { Observable } from "@legendapp/state";
import type { SyncTransform } from "@legendapp/state/sync";

type StorageBasePath = "Cache";

const storageByRoot = new Map<StorageRoot, ReturnType<typeof createStorage>>();

function getMusicStorage(basePath?: StorageBasePath) {
    const root: StorageRoot = basePath === "Cache" ? "cache" : "applicationSupport";
    const cachedStorage = storageByRoot.get(root);
    if (cachedStorage) {
        return cachedStorage;
    }

    const storage = createStorage({ namespace: "data", root });
    storageByRoot.set(root, storage);
    return storage;
}

export function createJSONManager<T extends object>(params: {
    basePath?: StorageBasePath;
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
    return createObservableFile<T>({
        filename,
        initialValue,
        preload,
        saveDefaultToFile,
        saveTimeout,
        storage: getMusicStorage(basePath),
        transform,
        format,
    });
}

export { getPersistPlugin };
