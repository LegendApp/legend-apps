import type { DirectoryChangeEvent } from "@legend-apps/file-system-watcher";
import { GitServiceError, type GitService } from "./GitService";

export type DiffRepoWatchLocations = Awaited<ReturnType<GitService["watchLocations"]>>;
export type DiffDirectoryWatcher = (directories: string[], listener: (event: DirectoryChangeEvent) => void) => { remove(): void };

function normalizeWatchPath(path: string) {
  return path.replace(/^\/private(?=\/(?:tmp|var)(?:\/|$))/, "").replace(/\/+$/, "");
}

function inside(path: string, directory: string) {
  return path === directory || path.startsWith(`${directory}/`);
}

export function shouldRefreshDiffRepo(event: DirectoryChangeEvent, locations: DiffRepoWatchLocations) {
  if (event.contentChanged === false) return false;
  const path = normalizeWatchPath(event.filePath);
  for (const location of [locations.gitDir, locations.commonDir]) {
    const directory = normalizeWatchPath(location);
    if (inside(path, directory)) {
      const relative = path.slice(directory.length + 1);
      return !/^(objects|logs|hooks)(\/|$)/.test(relative);
    }
  }
  const root = normalizeWatchPath(locations.root);
  if (!inside(path, root)) return false;
  const relative = path.slice(root.length + 1);
  if (/(^|\/)(\.git|node_modules|build|dist|DerivedData|Pods|\.spark|\.legend)(\/|$)/.test(relative)) return false;
  return !locations.ignoredPaths.some((ignored) => inside(relative, ignored.replace(/\/+$/, "")));
}

export function watchDiffRepo({ locations, watch, reload, onError, suppressedUntil = () => 0 }: {
  locations: DiffRepoWatchLocations;
  watch: DiffDirectoryWatcher;
  reload: () => Promise<void>;
  onError: (error: unknown) => void;
  suppressedUntil?: () => number;
}) {
  locations = { ...locations, root: normalizeWatchPath(locations.root), gitDir: normalizeWatchPath(locations.gitDir), commonDir: normalizeWatchPath(locations.commonDir) };
  let stopped = false;
  let running = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, Math.max(300, suppressedUntil() - Date.now()));
  };
  const flush = async () => {
    timer = undefined;
    if (stopped || running || !pending) return;
    if (suppressedUntil() > Date.now()) {
      schedule();
      return;
    }
    pending = false;
    running = true;
    try {
      await reload();
    } catch (error) {
      if (!stopped) {
        if (error instanceof GitServiceError && error.code === "index-locked") pending = true;
        else onError(error);
      }
    } finally {
      running = false;
      if (!stopped && pending) schedule();
    }
  };
  const subscription = watch([...new Set([locations.root, locations.gitDir, locations.commonDir])], (event) => {
    if (/(^|\/)\.gitignore$|\/info\/exclude$/.test(event.filePath)) locations.ignoredPaths = [];
    if (!stopped && shouldRefreshDiffRepo(event, locations)) {
      pending = true;
      schedule();
    }
  });
  return {
    remove() {
      stopped = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    },
  };
}
