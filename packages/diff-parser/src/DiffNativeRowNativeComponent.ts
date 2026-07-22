import type { CodegenTypes, HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  adaptiveRender: string;
  configId: string;
  itemId: CodegenTypes.Double;
  rowIndex: CodegenTypes.Double;
}

export default codegenNativeComponent<NativeProps>("DiffNativeRow") as HostComponent<NativeProps>;
