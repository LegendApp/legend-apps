import { NativeEventEmitter, Platform } from "react-native";
import NativeFileSystemWatcher from "./NativeFileSystemWatcher";

export type DirectoryChangeEvent = {
  path: string;
  filePath: string;
  type: "add" | "change" | "delete";
};

type WatchDirectoriesSubscription = {
  directories: string[];
  listener: (event: DirectoryChangeEvent) => void;
};

let nextSubscriptionId = 1;
const watchDirectoriesSubscriptions = new Map<number, WatchDirectoriesSubscription>();
let watchDirectoriesNativeSubscription: { remove(): void } | undefined;

function normalizePath(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function getDirectoryPath(path: string) {
  const normalized = normalizePath(path);
  const separatorIndex = normalized.lastIndexOf("/");
  if (separatorIndex > 0) {
    return normalized.slice(0, separatorIndex);
  }
  return separatorIndex === 0 ? "/" : "";
}

function uniqueNormalizedPaths(paths: string[]) {
  return Array.from(new Set(paths.map((path) => normalizePath(path)).filter(Boolean)));
}

function isPathInDirectory(path: string, directory: string) {
  if (directory === "/") {
    return path.startsWith("/");
  }
  return path === directory || path.startsWith(`${directory}/`);
}

function syncManagedWatchedDirectories() {
  const directories = new Set<string>();
  for (const subscription of watchDirectoriesSubscriptions.values()) {
    subscription.directories.forEach((directory) => directories.add(directory));
  }
  setWatchedDirectories(Array.from(directories));
}

function ensureManagedWatcherSubscription() {
  if (watchDirectoriesNativeSubscription) {
    return;
  }

  watchDirectoriesNativeSubscription = addDirectoryChangeListener((event) => {
    const normalizedFilePath = normalizePath(event.filePath);
    for (const subscription of watchDirectoriesSubscriptions.values()) {
      if (subscription.directories.some((directory) => isPathInDirectory(normalizedFilePath, directory))) {
        subscription.listener({
          ...event,
          filePath: normalizedFilePath,
        });
      }
    }
  });
}

export function setWatchedDirectories(directories: string[]) {
  if (Platform.OS === "macos") {
    NativeFileSystemWatcher.setWatchedDirectories(JSON.stringify(directories));
  }
}

export function isWatchingDirectory(directory: string) {
  if (Platform.OS !== "macos") {
    return Promise.resolve(false);
  }

  return NativeFileSystemWatcher.isWatchingDirectory(directory);
}

export function addDirectoryChangeListener(listener: (event: DirectoryChangeEvent) => void) {
  if (Platform.OS !== "macos") {
    return { remove() {} };
  }

  const emitter = new NativeEventEmitter(NativeFileSystemWatcher as never);
  return emitter.addListener("onDirectoryChanged", listener);
}

export function watchDirectories(directories: string[], listener: (event: DirectoryChangeEvent) => void) {
  if (Platform.OS !== "macos") {
    return { remove() {} };
  }

  const normalizedDirectories = uniqueNormalizedPaths(directories);
  if (normalizedDirectories.length === 0) {
    return { remove() {} };
  }

  const subscriptionId = nextSubscriptionId;
  nextSubscriptionId += 1;
  watchDirectoriesSubscriptions.set(subscriptionId, {
    directories: normalizedDirectories,
    listener,
  });
  ensureManagedWatcherSubscription();
  syncManagedWatchedDirectories();

  return {
    remove() {
      watchDirectoriesSubscriptions.delete(subscriptionId);
      if (watchDirectoriesSubscriptions.size === 0) {
        watchDirectoriesNativeSubscription?.remove();
        watchDirectoriesNativeSubscription = undefined;
        setWatchedDirectories([]);
      } else {
        syncManagedWatchedDirectories();
      }
    },
  };
}

export function watchFiles(filePaths: string[], listener: (event: DirectoryChangeEvent) => void) {
  if (Platform.OS !== "macos") {
    return { remove() {} };
  }

  const normalizedFilePaths = uniqueNormalizedPaths(filePaths);
  const watchedFilePaths = new Set(normalizedFilePaths);
  const directories = uniqueNormalizedPaths(normalizedFilePaths.map(getDirectoryPath));

  return watchDirectories(directories, (event) => {
    if (watchedFilePaths.has(normalizePath(event.filePath))) {
      listener(event);
    }
  });
}

export { default as NativeFileSystemWatcher } from "./NativeFileSystemWatcher";
