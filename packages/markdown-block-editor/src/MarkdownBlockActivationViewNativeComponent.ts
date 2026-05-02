import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  blockId?: string;
  contentsHidden?: boolean;
  markdown?: string;
}

export default codegenNativeComponent<NativeProps>("MarkdownBlockActivationView") as HostComponent<NativeProps>;
