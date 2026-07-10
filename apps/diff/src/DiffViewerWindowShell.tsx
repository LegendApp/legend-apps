import { markViewerShellModuleEvaluated } from "./viewerDependenciesStartupMarker";
import type { DiffOpenSource } from "./diffFiles";
import DiffViewerWindowComponent from "./DiffViewerWindow";
import { getLastDiffViewerShellSplitMetrics } from "./diffViewerShellMetrics";

markViewerShellModuleEvaluated();

type DiffViewerWindowShellProps = {
  focusUrlInputRequestId?: number;
  folderPath?: string;
  initialSplitPaneMetrics?: ReturnType<typeof getLastDiffViewerShellSplitMetrics>;
  source?: DiffOpenSource;
};

export function DiffViewerWindowShell(props?: DiffViewerWindowShellProps | null) {
  const safeProps = props ?? {};
  return (
    <DiffViewerWindowComponent
      {...safeProps}
      initialSplitPaneMetrics={safeProps.initialSplitPaneMetrics ?? getLastDiffViewerShellSplitMetrics()}
    />
  );
}
