import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { Double } from "react-native/Libraries/Types/CodegenTypes";

export interface NativeProps extends ViewProps {
  progress: Double;
}
export default codegenNativeComponent<NativeProps>("SourceEditorProgressRing") as HostComponent<NativeProps>;
