import type { CodegenTypes, ColorValue, HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  name: string;
  color?: ColorValue;
  scale?: string;
  size?: CodegenTypes.Double;
  yOffset?: CodegenTypes.Double;
}

export default codegenNativeComponent<NativeProps>("SFSymbol") as HostComponent<NativeProps>;
