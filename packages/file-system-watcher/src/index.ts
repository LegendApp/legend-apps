import { NativeEventEmitter, Platform } from "react-native";
import NativeFileSystemWatcher from "./NativeFileSystemWatcher";

export type DirectoryChangeEvent = {
  path: string;
  filePath: string;
  type: "add" | "change" | "delete";
};

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

export { default as NativeFileSystemWatcher } from "./NativeFileSystemWatcher";
