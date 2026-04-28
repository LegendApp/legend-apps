import { NativeEventEmitter } from "react-native";
import NativeFileScanner from "./NativeFileScanner";

export type FileScannerSkipEntry = Readonly<{
  relativePath: string;
  rootIndex: number;
}>;

export type FileScannerOptions = Readonly<{
  allowedExtensions?: readonly string[];
  batchSize?: number;
  includeHidden?: boolean;
  includeStats?: boolean;
  skip?: readonly FileScannerSkipEntry[];
}>;

export type ScannedFile = Readonly<{
  absolutePath?: string;
  extension?: string;
  fileName: string;
  modifiedTime?: number;
  relativePath: string;
  rootIndex: number;
  size?: number;
  skipped?: boolean;
}>;

export type FileScanBatchEvent = Readonly<{
  completedRoots: number;
  files: ScannedFile[];
  rootIndex: number;
  totalRoots: number;
}>;

export type FileScanProgressEvent = Readonly<{
  completedRoots: number;
  rootIndex: number;
  totalRoots: number;
}>;

export type FileScanResult = Readonly<{
  errors?: string[];
  totalFiles: number;
  totalRoots: number;
}>;

export type FileScannerEvents = {
  onFileScanBatch: (event: FileScanBatchEvent) => void;
  onFileScanComplete: (event: FileScanResult) => void;
  onFileScanProgress: (event: FileScanProgressEvent) => void;
};

const emitter = new NativeEventEmitter(NativeFileScanner);

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function scanFiles(paths: readonly string[], options: FileScannerOptions = {}) {
  return NativeFileScanner.scanFiles(JSON.stringify(paths), JSON.stringify(options)).then((json) =>
    parseJson<FileScanResult>(json, { totalFiles: 0, totalRoots: 0 }),
  );
}

export function addFileScannerListener<T extends keyof FileScannerEvents>(
  eventName: T,
  listener: FileScannerEvents[T],
) {
  const subscription = emitter.addListener(eventName, listener);
  return { remove: () => subscription.remove() };
}

export { NativeFileScanner };
