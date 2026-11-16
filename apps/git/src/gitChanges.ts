import { getGitService, watchGitRepo, type GitDirectoryWatcher, type GitService, type GitStatus } from "@legend-apps/git-core";

export type ChangesState = { root: string | null; status: GitStatus | null; loading: boolean; writing: boolean; error: string | null };
export const emptyChanges: ChangesState = { root: null, status: null, loading: false, writing: false, error: null };

export function createGitChanges(onChange: (state: ChangesState) => void, watch: GitDirectoryWatcher, serviceFor: (path: string) => GitService = getGitService) {
  let state = emptyChanges;
  let active: AbortController | undefined;
  let watcher: { remove(): void } | undefined;
  let service: GitService | undefined;
  let closed = false;
  let suppressedUntil = 0;
  const publish = (patch: Partial<ChangesState>) => { state = { ...state, ...patch }; if (!closed) onChange(state); };
  const current = (controller: AbortController) => !closed && active === controller && !controller.signal.aborted;
  const report = (error: unknown, controller: AbortController) => {
    if (current(controller)) publish({ error: error instanceof Error ? error.message : String(error) });
  };
  const cancel = () => { active?.abort(); watcher?.remove(); watcher = undefined; service = undefined; };
  const refresh = async (git: GitService, controller: AbortController) => {
    if (!current(controller)) return;
    const status = await git.status({ signal: controller.signal });
    if (current(controller)) publish({ status, error: null });
  };
  return {
    async open(path: string) {
      cancel();
      if (closed) return;
      const controller = active = new AbortController();
      publish({ ...emptyChanges, loading: true });
      try {
        const root = await serviceFor(path).resolveRoot({ signal: controller.signal });
        if (!current(controller)) return;
        const git = service = serviceFor(root);
        const locations = await git.watchLocations({ signal: controller.signal });
        if (!current(controller)) return;
        publish({ root });
        watcher = watchGitRepo({ locations, watch, reload: () => refresh(git, controller), onError: error => report(error, controller), suppressedUntil: () => state.writing ? Date.now() + 300 : suppressedUntil });
        await refresh(git, controller);
      } catch (error) { report(error, controller); }
      finally { if (current(controller)) publish({ loading: false }); }
    },
    async changeFile(path: string, stage: boolean) {
      const git = service, controller = active;
      if (!git || !controller || state.writing || !current(controller)) return;
      publish({ writing: true, error: null });
      try {
        await (stage ? git.stageFile(path, { signal: controller.signal }) : git.unstageFile(path, { signal: controller.signal }));
        await refresh(git, controller);
      } catch (error) { report(error, controller); }
      finally {
        if (current(controller)) { suppressedUntil = Date.now() + 300; publish({ writing: false }); }
      }
    },
    async refresh() {
      const git = service, controller = active;
      if (git && controller) try { await refresh(git, controller); } catch (error) { report(error, controller); }
    },
    dispose() { closed = true; cancel(); },
  };
}
