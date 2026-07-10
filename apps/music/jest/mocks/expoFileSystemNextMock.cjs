const fileContents = new Map();
const directories = new Set();
const directoryCreateCounts = new Map();
const fileReadCounts = new Map();

const normalizePath = (input) => {
    if (!input) {
        return "/";
    }
    const withoutProtocol = String(input).startsWith("file://") ? String(input).replace("file://", "") : String(input);
    const collapsed = withoutProtocol.replace(/\/+/g, "/");
    if (collapsed === "/") {
        return "/";
    }
    const trimmed = collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const parentPath = (path) => {
    const normalized = normalizePath(path);
    if (normalized === "/") {
        return "/";
    }
    const parts = normalized.split("/").filter(Boolean);
    return parts.length <= 1 ? "/" : `/${parts.slice(0, -1).join("/")}`;
};

const resolvePath = (...segments) => {
    let resolved = "/";
    for (const segment of segments.flat()) {
        if (!segment) {
            continue;
        }
        const value = typeof segment === "object" && "path" in segment ? segment.path : String(segment);
        if (value.startsWith("file://") || value.startsWith("/")) {
            resolved = normalizePath(value);
        } else {
            resolved = normalizePath(resolved === "/" ? `/${value}` : `${resolved}/${value}`);
        }
    }
    return resolved;
};

class Directory {
    constructor(...segments) {
        this.path = resolvePath(segments);
        this.uri = `file://${this.path}`;
        this.name = this.path === "/" ? "/" : this.path.split("/").pop();
        this.exists = directories.has(this.path);
    }

    create() {
        directoryCreateCounts.set(this.path, (directoryCreateCounts.get(this.path) ?? 0) + 1);
        directories.add(this.path);
        this.exists = true;
    }

    list() {
        const entries = [];
        for (const directory of directories) {
            if (directory !== this.path && parentPath(directory) === this.path) {
                entries.push(new Directory(directory));
            }
        }
        for (const filePath of fileContents.keys()) {
            if (parentPath(filePath) === this.path) {
                entries.push(new File(filePath));
            }
        }
        return entries;
    }
}

class File {
    constructor(...segments) {
        this.path = resolvePath(segments);
        this.uri = `file://${this.path}`;
        this.name = this.path.split("/").pop();
        this.exists = fileContents.has(this.path);
    }

    get parentDirectory() {
        return new Directory(parentPath(this.path));
    }

    create() {
        directories.add(parentPath(this.path));
        fileContents.set(this.path, fileContents.get(this.path) ?? "");
        this.exists = true;
    }

    write(content = "") {
        directories.add(parentPath(this.path));
        fileContents.set(this.path, String(content));
        this.exists = true;
    }

    text() {
        return fileContents.get(this.path) ?? "";
    }

    textSync() {
        fileReadCounts.set(this.path, (fileReadCounts.get(this.path) ?? 0) + 1);
        return this.text();
    }

    bytes() {
        return new Uint8Array();
    }

    delete() {
        fileContents.delete(this.path);
        this.exists = false;
    }
}

const cache = new Directory("/tmp/cache");
cache.create();
const document = new Directory("/tmp/document");
document.create();

module.exports = {
    __esModule: true,
    Directory,
    File,
    Paths: {
        cache,
        document,
    },
    __setMockFile(path, content) {
        new File(path).write(content);
    },
    __getDirectoryCreateCount(path) {
        return directoryCreateCounts.get(normalizePath(path)) ?? 0;
    },
    __getFileReadCount(path) {
        return fileReadCounts.get(normalizePath(path)) ?? 0;
    },
    __mockDirectoryExists(path) {
        return directories.has(normalizePath(path));
    },
    __setMockFileSystem(data) {
        fileContents.clear();
        directories.clear();
        cache.create();
        document.create();
        for (const [rawPath, entry] of Object.entries(data)) {
            const directoryPath = normalizePath(rawPath);
            directories.add(directoryPath);
            for (const directory of entry.directories ?? []) {
                directories.add(resolvePath(directoryPath, directory));
            }
            for (const file of entry.files ?? []) {
                fileContents.set(resolvePath(directoryPath, file), "");
            }
        }
    },
    __resetMockFileSystem() {
        fileContents.clear();
        directories.clear();
        directoryCreateCounts.clear();
        fileReadCounts.clear();
        cache.create();
        document.create();
    },
};
