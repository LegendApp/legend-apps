import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { DirectEventHandler, Double } from "react-native/Libraries/Types/CodegenTypes";

export type SidebarSplitViewResizeEvent = Readonly<{
  contentHeight: Double;
  contentWidth: Double;
  contentX: Double;
  height: Double;
  isVertical: boolean;
  sidebarHeight: Double;
  sidebarWidth: Double;
}>;

export interface NativeProps extends ViewProps {
  appearance?: string;
  contentTitlebarHeight?: Double;
  contentTitlebarMaterial?: string;
  contentTitlebarOverlayColor?: string;
  contentTitlebarOverlayOpacity?: Double;
  contentMinWidth?: Double;
  onSplitViewDidResize?: DirectEventHandler<SidebarSplitViewResizeEvent>;
  sidebarCollapsed?: boolean;
  sidebarMinWidth?: Double;
}

export default codegenNativeComponent<NativeProps>("SidebarSplitView") as HostComponent<NativeProps>;
