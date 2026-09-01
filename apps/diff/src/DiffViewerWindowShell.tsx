import DiffViewerWindowComponent, { type DiffViewerWindowProps } from "./DiffViewerWindow";
import { getLastDiffViewerShellSplitMetrics } from "./diffViewerShellMetrics";

export function DiffViewerWindowShell(props?: DiffViewerWindowProps | null) {
  const safeProps = props ?? {};
  return (
    <DiffViewerWindowComponent
      {...safeProps}
      initialSplitPaneMetrics={safeProps.initialSplitPaneMetrics ?? getLastDiffViewerShellSplitMetrics()}
    />
  );
}
