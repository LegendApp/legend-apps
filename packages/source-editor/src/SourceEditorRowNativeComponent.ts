import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { DirectEventHandler, Double } from "react-native/Libraries/Types/CodegenTypes";

export interface NativeProps extends ViewProps {
  lineId: string;
  lineIndex: Double;
  fontFamily: string;
  fontSize: Double;
  lineHeight: Double;
  foreground: string;
  wrap: boolean;
  onMetrics?: DirectEventHandler<Readonly<{ lineId: string; height: Double; width: Double }>>;
}
export default codegenNativeComponent<NativeProps>("SourceEditorRow") as HostComponent<NativeProps>;
