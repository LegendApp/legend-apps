import { addDirectoryChangeListener, setWatchedDirectories } from "@legend-desktop/file-system-watcher";
import { useEffect, useRef } from "react";

const watchedExtensions = new Set([
  ".aac",
  ".aif",
  ".aiff",
  ".flac",
  ".m3u",
  ".m3u8",
  ".m4a",
  ".m4b",
  ".mp3",
  ".ogg",
  ".wav",
]);

type MusicLibraryWatcherOptions = Readonly<{
  enabled: boolean;
  isScanning: boolean;
  onRescan: () => Promise<void>;
  onStatus: (message: string) => void;
  rootPaths: readonly string[];
}>;

export function useMusicLibraryWatcher(options: MusicLibraryWatcherOptions) {
  const optionsRef = useRef(options);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rootPathsKey = options.rootPaths.join("\n");

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    setWatchedDirectories(options.enabled ? [...options.rootPaths] : []);

    return () => {
      setWatchedDirectories([]);
    };
  }, [options.enabled, rootPathsKey]);

  useEffect(() => {
    const subscription = addDirectoryChangeListener((event) => {
      const latest = optionsRef.current;
      if (!latest.enabled || latest.rootPaths.length === 0 || !isWatchedMusicPath(event.filePath)) {
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        const current = optionsRef.current;
        timerRef.current = undefined;

        if (!current.enabled || current.isScanning || current.rootPaths.length === 0) {
          return;
        }

        current.onStatus("Library changed on disk. Rescanning...");
        void current.onRescan().catch((error) => {
          current.onStatus(error instanceof Error ? error.message : String(error));
        });
      }, 1500);
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      subscription.remove();
    };
  }, []);
}

function isWatchedMusicPath(filePath: string) {
  const normalized = filePath.toLowerCase();
  for (const extension of watchedExtensions) {
    if (normalized.endsWith(extension)) {
      return true;
    }
  }
  return false;
}
