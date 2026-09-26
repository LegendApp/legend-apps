export { setWatchedDirectories, isWatchingDirectory } from "@legendapp/spark/files/watchers";
import { addDirectoryChangeListener, type DirectoryChangeEvent } from "@legendapp/spark/files/watchers";
export function addChangeListener(callback: (event: DirectoryChangeEvent) => void) {
  const subscription = addDirectoryChangeListener(callback);
  return () => subscription.remove();
}
