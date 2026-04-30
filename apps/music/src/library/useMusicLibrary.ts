import { useEffect, useSyncExternalStore } from "react";
import { getMusicLibrarySnapshot, loadMusicLibrary, subscribeMusicLibrary } from "./libraryStore";

export function useMusicLibrary() {
  useEffect(() => {
    void loadMusicLibrary();
  }, []);

  return useSyncExternalStore(subscribeMusicLibrary, getMusicLibrarySnapshot, getMusicLibrarySnapshot);
}
