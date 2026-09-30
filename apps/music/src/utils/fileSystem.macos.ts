import {
    createStorage,
    pathExists,
    readTextFile,
    writeStorageBytes,
    type StoragePath,
} from "@legend-apps/storage";

const cacheStorage = createStorage({ root: "cache" });
const cacheRootUri = cacheStorage.root.uri.replace(/\/+$/, "");

const toUri = (value: string | Directory): string =>
    typeof value === "string" ? value : value.uri;

const joinUri = (parent: string, child?: string): string => {
    if (!child) {
        return parent;
    }
    return `${parent.replace(/\/+$/, "")}/${encodeURIComponent(child)}`;
};

const relativeCachePath = (uri: string): string | null => {
    if (uri === cacheRootUri) {
        return "";
    }
    const prefix = `${cacheRootUri}/`;
    return uri.startsWith(prefix) ? decodeURIComponent(uri.slice(prefix.length)) : null;
};

const fileName = (uri: string): string => {
    const withoutSlash = uri.replace(/\/+$/, "");
    const separator = withoutSlash.lastIndexOf("/");
    return decodeURIComponent(separator === -1 ? withoutSlash : withoutSlash.slice(separator + 1));
};

export class Directory {
    readonly uri: string;

    constructor(parent: string | Directory, child?: string) {
        this.uri = joinUri(toUri(parent), child);
    }

    get exists(): boolean {
        return pathExists(this.uri, true);
    }

    create(_options?: { intermediates?: boolean }): void {
        const relativePath = relativeCachePath(this.uri);
        if (relativePath === null) {
            throw new Error(`Cannot create a directory outside the app cache: ${this.uri}`);
        }
        cacheStorage.ensureDirectory(relativePath);
    }

    list(): Array<Directory | File> {
        const relativePath = relativeCachePath(this.uri);
        if (relativePath === null) {
            throw new Error(`Cannot list a directory outside the app cache: ${this.uri}`);
        }
        return cacheStorage.list(relativePath).map((entry: StoragePath) =>
            entry.isDirectory ? new Directory(entry.uri) : new File(entry.uri),
        );
    }
}

export class File {
    readonly uri: string;

    constructor(parent: string | Directory, child?: string) {
        this.uri = joinUri(toUri(parent), child);
    }

    get exists(): boolean {
        return pathExists(this.uri, false);
    }

    get name(): string {
        return fileName(this.uri);
    }

    get parentDirectory(): Directory {
        const separator = this.uri.lastIndexOf("/");
        return new Directory(separator > "file://".length ? this.uri.slice(0, separator) : this.uri);
    }

    delete(): void {
        const relativePath = relativeCachePath(this.uri);
        if (relativePath === null || relativePath.length === 0) {
            throw new Error(`Cannot delete a file outside the app cache: ${this.uri}`);
        }
        cacheStorage.delete(relativePath);
    }

    text(): Promise<string> {
        return Promise.resolve(this.textSync());
    }

    textSync(): string {
        return readTextFile(this.uri) ?? "";
    }

    write(value: string | Uint8Array): void {
        const relativePath = relativeCachePath(this.uri);
        if (relativePath === null || relativePath.length === 0) {
            throw new Error(`Cannot write a file outside the app cache: ${this.uri}`);
        }
        if (typeof value === "string") {
            cacheStorage.write(relativePath, value, { format: "text" });
        } else if (!writeStorageBytes("cache", relativePath, value)) {
            throw new Error(`Could not write ${this.uri}`);
        }
    }
}

export const Paths = {
    cache: cacheRootUri,
} as const;
