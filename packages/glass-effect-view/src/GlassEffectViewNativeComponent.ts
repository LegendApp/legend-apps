import type { ColorValue, HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  glassStyle?: string;
  tintColor?: ColorValue;
}

export default codegenNativeComponent<NativeProps>("GlassEffectView") as HostComponent<NativeProps>;
