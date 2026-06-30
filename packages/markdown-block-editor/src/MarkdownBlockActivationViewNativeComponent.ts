import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { Double } from "react-native/Libraries/Types/CodegenTypes";

export interface NativeProps extends ViewProps {
  blockId?: string;
  contentsHidden?: boolean;
  nextBlockId?: string;
  previousBlockId?: string;
  renderRevision?: Double;
}

export default codegenNativeComponent<NativeProps>("MarkdownBlockActivationView") as HostComponent<NativeProps>;
