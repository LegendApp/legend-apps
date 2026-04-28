import { NativeEventEmitter } from "react-native";
import NativeDocumentScanner from "./NativeDocumentScanner";
import type { FileScannerOptions, ScannedFile } from "@legend-desktop/file-scanner";

export type DocumentScannerOptions = FileScannerOptions;
export type ScannedDocument = ScannedFile;

export type DocumentScanBatchEvent = Readonly<{
  completedRoots: number;
  documents: ScannedDocument[];
  rootIndex: number;
  totalRoots: number;
}>;

export type DocumentScanProgressEvent = Readonly<{
  completedRoots: number;
  rootIndex: number;
  totalRoots: number;
}>;

export type DocumentScanResult = Readonly<{
  errors?: string[];
  totalDocuments: number;
  totalRoots: number;
}>;

export type DocumentScannerEvents = {
  onDocumentScanBatch: (event: DocumentScanBatchEvent) => void;
  onDocumentScanComplete: (event: DocumentScanResult) => void;
  onDocumentScanProgress: (event: DocumentScanProgressEvent) => void;
};

const emitter = new NativeEventEmitter(NativeDocumentScanner);

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function scanDocuments(paths: readonly string[], options: DocumentScannerOptions = {}) {
  return NativeDocumentScanner.scanDocuments(JSON.stringify(paths), JSON.stringify(options)).then((json) =>
    parseJson<DocumentScanResult>(json, { totalDocuments: 0, totalRoots: 0 }),
  );
}

export function addDocumentScannerListener<T extends keyof DocumentScannerEvents>(
  eventName: T,
  listener: DocumentScannerEvents[T],
) {
  const subscription = emitter.addListener(eventName, listener);
  return { remove: () => subscription.remove() };
}

export { NativeDocumentScanner };
