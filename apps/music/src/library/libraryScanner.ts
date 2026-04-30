import { setWatchedDirectories, addDirectoryChangeListener } from "@legend-desktop/file-system-watcher";
import {
  addMediaLibraryScannerListener,
  scanMediaLibrary,
  type MediaScanOptions,
  type MediaScanResult,
  type NativeScannedTrack,
} from "@legend-desktop/media-library-scanner";
import { getMusicLibrarySnapshot, saveMusicLibrary, setMusicLibrarySnapshot } from "./libraryStore";
import { buildLibraryFromScan } from "./librarySnapshot";
import { supportedAudioExtensions } from "./supportedAudio";

type ScanLibraryResult = Readonly<{
  result: MediaScanResult;
  tracksIndexed: number;
}>;

let activeScanId = 0;
let watcherCleanup: (() => void) | undefined;
let watcherTimer: ReturnType<typeof setTimeout> | undefined;

const defaultScanOptions: MediaScanOptions = {
  allowedExtensions: supportedAudioExtensions,
  batchSize: 64,
  includeArtwork: false,
};

function uniquePaths(paths: readonly string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const path of paths) {
    const trimmed = path.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      unique.push(trimmed);
    }
  }
  return unique;
}

export async function scanLibrary(paths: readonly string[], options: MediaScanOptions = {}): Promise<ScanLibraryResult> {
  const roots = uniquePaths(paths);
  const scanId = ++activeScanId;
  const tracks: NativeScannedTrack[] = [];
  const startedAt = Date.now();

  setMusicLibrarySnapshot({
    ...getMusicLibrarySnapshot(),
    scan: {
      completedRoots: 0,
      lastStartedAt: startedAt,
      status: "scanning",
      totalRoots: roots.length,
      tracksScanned: 0,
    },
    updatedAt: startedAt,
  });

  const batchSubscription = addMediaLibraryScannerListener("onMediaScanBatch", (event) => {
    if (scanId !== activeScanId) {
      return;
    }

    tracks.push(...event.tracks);
    setMusicLibrarySnapshot({
      ...getMusicLibrarySnapshot(),
      scan: {
        completedRoots: event.completedRoots,
        lastStartedAt: startedAt,
        status: "scanning",
        totalRoots: event.totalRoots,
        tracksScanned: tracks.length,
      },
      updatedAt: Date.now(),
    });
  });

  const progressSubscription = addMediaLibraryScannerListener("onMediaScanProgress", (event) => {
    if (scanId !== activeScanId) {
      return;
    }

    setMusicLibrarySnapshot({
      ...getMusicLibrarySnapshot(),
      scan: {
        completedRoots: event.completedRoots,
        lastStartedAt: startedAt,
        status: "scanning",
        totalRoots: event.totalRoots,
        tracksScanned: tracks.length,
      },
      updatedAt: Date.now(),
    });
  });

  try {
    const result = await scanMediaLibrary(roots, "", {
      ...defaultScanOptions,
      ...options,
    });
    const library = buildLibraryFromScan(roots, tracks, result.playlists, Date.now());
    await saveMusicLibrary({
      ...library,
      scan: {
        ...library.scan,
        error: result.errors?.join("\n"),
        status: result.errors?.length ? "error" : "complete",
      },
    });
    configureLibraryWatcher(roots);
    return {
      result,
      tracksIndexed: library.trackIds.length,
    };
  } catch (error) {
    await saveMusicLibrary({
      ...getMusicLibrarySnapshot(),
      scan: {
        completedRoots: 0,
        error: error instanceof Error ? error.message : String(error),
        lastStartedAt: startedAt,
        status: "error",
        totalRoots: roots.length,
        tracksScanned: tracks.length,
      },
      updatedAt: Date.now(),
    });
    throw error;
  } finally {
    batchSubscription.remove();
    progressSubscription.remove();
  }
}

export function configureLibraryWatcher(paths: readonly string[]) {
  const roots = uniquePaths(paths);
  setWatchedDirectories(roots);

  if (watcherCleanup) {
    watcherCleanup();
    watcherCleanup = undefined;
  }

  if (roots.length === 0) {
    return;
  }

  const subscription = addDirectoryChangeListener(() => {
    if (watcherTimer) {
      clearTimeout(watcherTimer);
    }

    watcherTimer = setTimeout(() => {
      watcherTimer = undefined;
      void scanLibrary(roots, { includeArtwork: false });
    }, 1500);
  });

  watcherCleanup = () => {
    subscription.remove();
    setWatchedDirectories([]);
  };
}

export function stopLibraryWatcher() {
  if (watcherTimer) {
    clearTimeout(watcherTimer);
    watcherTimer = undefined;
  }
  watcherCleanup?.();
  watcherCleanup = undefined;
}
