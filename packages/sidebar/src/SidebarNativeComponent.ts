import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { DirectEventHandler, Double } from "react-native/Libraries/Types/CodegenTypes";

export type SidebarSelectionChangeEvent = Readonly<{
  id: string;
}>;

export type SidebarLayoutEvent = Readonly<{
  height: Double;
  width: Double;
}>;

export interface NativeProps extends ViewProps {
  contentInsetTop?: Double;
  defaultRowHeight?: Double;
  itemsJson?: string;
  onSidebarLayout?: DirectEventHandler<SidebarLayoutEvent>;
  onSidebarSelectionChange?: DirectEventHandler<SidebarSelectionChangeEvent>;
  selectedId?: string;
}

export default codegenNativeComponent<NativeProps>("Sidebar") as HostComponent<NativeProps>;
