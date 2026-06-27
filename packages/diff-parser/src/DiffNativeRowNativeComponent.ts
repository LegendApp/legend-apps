import type { CodegenTypes, HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  adaptiveRender: string;
  configId: string;
  configVersion: CodegenTypes.Double;
  rowIndex: CodegenTypes.Double;
  tokenizedMaxRow: CodegenTypes.Double;
}

export default codegenNativeComponent<NativeProps>("DiffNativeRow") as HostComponent<NativeProps>;
