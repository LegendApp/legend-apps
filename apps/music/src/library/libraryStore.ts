import { getStoredString, removeStoredItem, setStoredString } from "@legend-desktop/app-storage";
import { createEmptyLibrary, type MusicLibrary } from "../domain/musicModel";
import { parseLibrarySnapshot, serializeLibrarySnapshot } from "./librarySnapshot";

const STORAGE_KEY = "music.library.v1";

let library = createEmptyLibrary();
let loadPromise: Promise<MusicLibrary> | undefined;
const subscribers = new Set<() => void>();

function emit() {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

export function getMusicLibrarySnapshot() {
  return library;
}

export function subscribeMusicLibrary(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function loadMusicLibrary() {
  loadPromise ??= getStoredString(STORAGE_KEY).then((json) => {
    library = parseLibrarySnapshot(json);
    emit();
    return library;
  });
  return loadPromise;
}

export function setMusicLibrarySnapshot(nextLibrary: MusicLibrary) {
  library = nextLibrary;
  emit();
  return library;
}

export async function saveMusicLibrary(nextLibrary: MusicLibrary) {
  setMusicLibrarySnapshot(nextLibrary);
  await setStoredString(STORAGE_KEY, serializeLibrarySnapshot(nextLibrary));
  return nextLibrary;
}

export async function clearMusicLibrary() {
  library = createEmptyLibrary();
  emit();
  await removeStoredItem(STORAGE_KEY);
  return library;
}
