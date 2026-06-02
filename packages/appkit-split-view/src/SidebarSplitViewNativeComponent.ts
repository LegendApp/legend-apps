import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { DirectEventHandler, Double } from "react-native/Libraries/Types/CodegenTypes";

export type SidebarSplitViewResizeEvent = Readonly<{
  contentWidth: Double;
  isVertical: boolean;
  sidebarWidth: Double;
}>;

export interface NativeProps extends ViewProps {
  contentMinWidth?: Double;
  onSplitViewDidResize?: DirectEventHandler<SidebarSplitViewResizeEvent>;
  sidebarMinWidth?: Double;
}

export default codegenNativeComponent<NativeProps>("SidebarSplitView") as HostComponent<NativeProps>;
