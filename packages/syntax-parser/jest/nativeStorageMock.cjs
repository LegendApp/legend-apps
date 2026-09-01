const fileContents = new Map();
const directories = new Set();
const directoryCreateCounts = new Map();
const fileReadCounts = new Map();

const roots = {
  applicationSupport: "/tmp/application-support",
  cache: "/tmp/cache",
  document: "/tmp/document",
};

function normalizePath(input) {
  const withoutProtocol = String(input || "/").replace(/^file:\/\//, "");
  const collapsed = withoutProtocol.replace(/\/+/g, "/");
  return collapsed.length > 1 && collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function resolveStoragePath(root, relativePath = "") {
  const rootPath = roots[root];
  if (!rootPath || relativePath.startsWith("/") || relativePath.split("/").some((part) => part === "." || part === "..")) {
    return null;
  }
  return normalizePath(relativePath ? `${rootPath}/${relativePath}` : rootPath);
}

function parentPath(input) {
  const path = normalizePath(input);
  const separator = path.lastIndexOf("/");
  return separator <= 0 ? "/" : path.slice(0, separator);
}

function ensureParents(input) {
  let path = parentPath(input);
  while (path !== "/") {
    directories.add(path);
    path = parentPath(path);
  }
  directories.add("/");
}

function readPath(input) {
  const path = normalizePath(input);
  fileReadCounts.set(path, (fileReadCounts.get(path) ?? 0) + 1);
  return fileContents.get(path) ?? null;
}

const NativeStorage = {
  deleteStoragePath(root, relativePath) {
    const path = resolveStoragePath(root, relativePath);
    if (!path || !relativePath) {
      return false;
    }
    fileContents.delete(path);
    for (const candidate of [...fileContents.keys()]) {
      if (candidate.startsWith(`${path}/`)) {
        fileContents.delete(candidate);
      }
    }
    for (const candidate of [...directories]) {
      if (candidate === path || candidate.startsWith(`${path}/`)) {
        directories.delete(candidate);
      }
    }
    return true;
  },
  ensureStorageDirectory(root, relativePath) {
    const path = resolveStoragePath(root, relativePath);
    if (!path) {
      return false;
    }
    directoryCreateCounts.set(path, (directoryCreateCounts.get(path) ?? 0) + 1);
    ensureParents(`${path}/placeholder`);
    directories.add(path);
    return true;
  },
  getStoragePathUri(root, relativePath) {
    const path = resolveStoragePath(root, relativePath);
    return path ? `file://${path}` : "";
  },
  listStorageDirectoryJson(root, relativePath) {
    const path = resolveStoragePath(root, relativePath);
    if (!path || !directories.has(path)) {
      return "[]";
    }
    const entries = [];
    for (const directory of directories) {
      if (directory !== path && parentPath(directory) === path) {
        entries.push({ isDirectory: true, name: directory.slice(path.length + 1) });
      }
    }
    for (const filePath of fileContents.keys()) {
      if (parentPath(filePath) === path) {
        entries.push({ isDirectory: false, name: filePath.slice(path.length + 1) });
      }
    }
    return JSON.stringify(entries.sort((left, right) => left.name.localeCompare(right.name)));
  },
  readStorageText(root, relativePath) {
    const path = resolveStoragePath(root, relativePath);
    return path ? readPath(path) : null;
  },
  readTextFile(pathOrUri) {
    return readPath(pathOrUri);
  },
  writeStorageText(root, relativePath, value) {
    const path = resolveStoragePath(root, relativePath);
    if (!path || !relativePath) {
      return false;
    }
    ensureParents(path);
    fileContents.set(path, value);
    return true;
  },
};

module.exports = {
  __esModule: true,
  default: NativeStorage,
  __getDirectoryCreateCount(path) {
    return directoryCreateCounts.get(normalizePath(path)) ?? 0;
  },
  __getFileReadCount(path) {
    return fileReadCounts.get(normalizePath(path)) ?? 0;
  },
  __mockDirectoryExists(path) {
    return directories.has(normalizePath(path));
  },
  __mockFileExists(path) {
    return fileContents.has(normalizePath(path));
  },
  __resetMockFileSystem() {
    fileContents.clear();
    directories.clear();
    directoryCreateCounts.clear();
    fileReadCounts.clear();
    Object.values(roots).forEach((root) => directories.add(root));
  },
  __setMockFile(path, content) {
    const normalized = normalizePath(path);
    ensureParents(normalized);
    fileContents.set(normalized, content);
  },
};
