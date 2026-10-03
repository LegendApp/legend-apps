import { type DiffViewerWindowProps } from "./DiffViewerWindow";
import { DiffCustomizationViewer } from "./customization/DiffCustomizationViewer";
import { getLastDiffViewerShellSplitMetrics } from "./diffViewerShellMetrics";

export function DiffViewerWindowShell(props?: DiffViewerWindowProps | null) {
  const safeProps = props ?? {};
  return (
    <DiffCustomizationViewer
      {...safeProps}
      initialSplitPaneMetrics={safeProps.initialSplitPaneMetrics ?? getLastDiffViewerShellSplitMetrics()}
    />
  );
}
