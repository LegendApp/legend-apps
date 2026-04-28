import { NativeEventEmitter } from "react-native";
import NativeMediaLibraryScanner from "./NativeMediaLibraryScanner";
import type { FileScannerOptions } from "@legend-desktop/file-scanner";
import type { MediaTags } from "@legend-desktop/media-tags";

export type MediaScanOptions = FileScannerOptions &
  Readonly<{
    includeArtwork?: boolean;
  }>;

export type NativeScannedTrack = MediaTags &
  Readonly<{
    fileName: string;
    relativePath: string;
    rootIndex: number;
    skipped?: boolean;
  }>;

export type NativeScannedPlaylist = Readonly<{
  absolutePath?: string;
  fileName: string;
  relativePath: string;
  rootIndex: number;
}>;

export type MediaScanBatchEvent = Readonly<{
  completedRoots: number;
  rootIndex: number;
  totalRoots: number;
  tracks: NativeScannedTrack[];
}>;

export type MediaScanProgressEvent = Readonly<{
  completedRoots: number;
  rootIndex: number;
  totalRoots: number;
}>;

export type MediaScanResult = Readonly<{
  errors?: string[];
  playlists?: NativeScannedPlaylist[];
  totalRoots: number;
  totalTracks: number;
}>;

export type MediaLibraryScannerEvents = {
  onMediaScanBatch: (event: MediaScanBatchEvent) => void;
  onMediaScanComplete: (event: MediaScanResult) => void;
  onMediaScanProgress: (event: MediaScanProgressEvent) => void;
};

const emitter = new NativeEventEmitter(NativeMediaLibraryScanner);

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function scanMediaLibrary(paths: readonly string[], cacheDir = "", options: MediaScanOptions = {}) {
  return NativeMediaLibraryScanner.scanMediaLibrary(JSON.stringify(paths), cacheDir, JSON.stringify(options)).then((json) =>
    parseJson<MediaScanResult>(json, { totalRoots: 0, totalTracks: 0 }),
  );
}

export function addMediaLibraryScannerListener<T extends keyof MediaLibraryScannerEvents>(
  eventName: T,
  listener: MediaLibraryScannerEvents[T],
) {
  const subscription = emitter.addListener(eventName, listener);
  return { remove: () => subscription.remove() };
}

export { NativeMediaLibraryScanner };
