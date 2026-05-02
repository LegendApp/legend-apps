import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  blockId?: string;
  markdown?: string;
}

export default codegenNativeComponent<NativeProps>("MarkdownBlockActivationView") as HostComponent<NativeProps>;
