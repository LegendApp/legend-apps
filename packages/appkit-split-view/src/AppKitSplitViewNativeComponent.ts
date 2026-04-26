import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  sidebarTitle?: string;
  sidebarItemsJson?: string;
  selectedSidebarItemId?: string;
  titlebarItemsJson?: string;
  mainTitle?: string;
  usesLiquidGlass?: boolean;
}

export default codegenNativeComponent<NativeProps>("AppKitSplitView") as HostComponent<NativeProps>;
