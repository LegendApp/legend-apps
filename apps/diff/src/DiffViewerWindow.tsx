import { DiffViewerModelProvider } from "./viewer/diffViewerModel";
import { DiffViewerWindowContent } from "./window/DiffViewerWindowContent";
import { type DiffViewerWindowProps } from "./window/diffWindowTypes";

export function DiffViewerWindow(props?: DiffViewerWindowProps | null) {
    const safeProps = props ?? {};
    return (<DiffViewerModelProvider initialSplitPaneMetrics={safeProps.initialSplitPaneMetrics}>
      <DiffViewerWindowContent {...safeProps}/>
    </DiffViewerModelProvider>);
}
export default DiffViewerWindow;
export { customizationSettingsTextColor } from "./customization/diffCustomizationAppearance";
export type { DiffViewerWindowProps } from "./window/diffWindowTypes";
