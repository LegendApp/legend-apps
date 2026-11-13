import { watchDirectories } from "@legend-apps/file-system-watcher";
import { useValue } from "@legendapp/state/react";
import { type RefObject, useEffect } from "react";
import { isDiffGitSource, type DiffOpenSource } from "../diffFiles";
import { useDiffAutoRefreshSetting } from "../diffSettings";
import { getGitService, GitServiceError } from "../git/GitService";
import { getDiffRepoStateBanner } from "../git/diffRepoStateBanner";
import { watchDiffRepo } from "../git/diffRepoWatcher";
import { useDiffViewerModel, type DiffLoadSourceOptions } from "../viewer/diffViewerModel";
import { createRefreshError, getErrorMessage } from "../viewer/diffViewerSupport";

export function DiffRepositoryController({ onBannerChange, loadSource, suppressReloadUntilRef }: {
  onBannerChange: (text: string | null) => void;
  loadSource: (source: DiffOpenSource, options?: DiffLoadSourceOptions) => Promise<void>;
  suppressReloadUntilRef: RefObject<number>;
}) {
  const { state$, loadingSource$, setDocumentErrorValue } = useDiffViewerModel();
  const source = useValue(() => state$.source.get());
  const document = useValue(() => {
    const state = state$.get();
    return state.status === "loaded" ? state.document : null;
  });
  const autoRefresh = useDiffAutoRefreshSetting();
  const repoPath = source?.kind === "folder" ? source.value : source && isDiffGitSource(source) ? source.cwd : null;
  useEffect(() => onBannerChange(null), [repoPath, onBannerChange]);

  useEffect(() => {
    if (!repoPath || !document) return;
    const controller = new AbortController();
    void getGitService(repoPath).repoState({ signal: controller.signal }).then((state) => {
      if (!controller.signal.aborted) onBannerChange(getDiffRepoStateBanner(state));
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !(error instanceof GitServiceError && error.code === "index-locked")) console.error(getErrorMessage(error));
    });
    return () => controller.abort();
  }, [repoPath, document, onBannerChange]);

  useEffect(() => {
    if (!repoPath || !source || !autoRefresh || source.kind === "commit" || source.kind === "range") return;
    const controller = new AbortController();
    const service = getGitService(repoPath);
    let subscription: { remove(): void } | undefined;
    const reportError = (error: unknown) => {
      if (!controller.signal.aborted) setDocumentErrorValue(createRefreshError(source, getErrorMessage(error)));
    };
    void service.watchLocations({ signal: controller.signal }).then((locations) => {
      if (controller.signal.aborted) return;
      subscription = watchDiffRepo({
        locations,
        watch: watchDirectories,
        suppressedUntil: () => loadingSource$.peek() ? Date.now() + 300 : suppressReloadUntilRef.current,
        reload: async () => {
          const state = await service.repoState({ signal: controller.signal });
          if (!controller.signal.aborted) {
            onBannerChange(getDiffRepoStateBanner(state));
            await loadSource(source, { force: true, reason: "watch" });
          }
        },
        onError: reportError,
      });
    }).catch(reportError);
    return () => {
      controller.abort();
      subscription?.remove();
    };
  }, [repoPath, source, autoRefresh, loadSource, setDocumentErrorValue, suppressReloadUntilRef, loadingSource$, onBannerChange]);

  return null;
}
