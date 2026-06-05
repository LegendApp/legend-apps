import { Platform } from "react-native";
import NativeFileDialog from "./NativeFileDialog";

export type FileDialogOpenOptions = {
  canChooseFiles?: boolean;
  canChooseDirectories?: boolean;
  allowsMultipleSelection?: boolean;
  directoryURL?: string | null;
  allowedFileTypes?: string[];
};

export type FileDialogSaveOptions = {
  defaultName?: string;
  directory?: string;
  allowedFileTypes?: string[];
};

function parseJsonResult<T>(value: string, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function openFileDialog(options: FileDialogOpenOptions = {}) {
  if (Platform.OS !== "macos") {
    return null;
  }

  const result = await NativeFileDialog.open(JSON.stringify(options));
  return parseJsonResult<string[] | null>(result, null);
}

export async function saveFileDialog(options: FileDialogSaveOptions = {}) {
  if (Platform.OS !== "macos") {
    return null;
  }

  const result = await NativeFileDialog.save(JSON.stringify(options));
  return parseJsonResult<string | null>(result, null);
}

export function revealInFinder(path: string) {
  if (Platform.OS !== "macos") {
    return Promise.resolve(false);
  }

  return NativeFileDialog.revealInFinder(path);
}

export function writeTextFile(path: string, contents: string) {
  if (Platform.OS !== "macos") {
    return Promise.resolve();
  }

  return NativeFileDialog.writeTextFile(path, contents);
}

export { default as NativeFileDialog } from "./NativeFileDialog";
