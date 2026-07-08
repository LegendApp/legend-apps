import type { DiffSplitPaneMetrics } from "./viewer/diffViewerModel";

let lastDiffViewerShellSplitMetrics: DiffSplitPaneMetrics | null = null;

export function getLastDiffViewerShellSplitMetrics() {
  return lastDiffViewerShellSplitMetrics;
}

export function setLastDiffViewerShellSplitMetrics(nextMetrics: DiffSplitPaneMetrics) {
  if (nextMetrics.contentHeight > 0 && nextMetrics.contentWidth > 0 && nextMetrics.sidebarWidth > 0) {
    lastDiffViewerShellSplitMetrics = nextMetrics;
  }
}
