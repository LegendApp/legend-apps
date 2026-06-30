import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { Double } from "react-native/Libraries/Types/CodegenTypes";

export interface NativeProps extends ViewProps {
  blockId?: string;
  bottomPadding?: Double;
  contentsHidden?: boolean;
  renderRevision?: Double;
  topPadding?: Double;
}

export default codegenNativeComponent<NativeProps>("MarkdownBlockActivationView") as HostComponent<NativeProps>;
