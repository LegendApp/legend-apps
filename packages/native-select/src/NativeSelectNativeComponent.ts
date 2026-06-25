import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { DirectEventHandler } from "react-native/Libraries/Types/CodegenTypes";

export type NativeSelectChangeEvent = {
  value: string;
};

export interface NativeProps extends ViewProps {
  enabled?: boolean;
  itemsJson: string;
  onValueChange?: DirectEventHandler<NativeSelectChangeEvent>;
  value: string;
}

export default codegenNativeComponent<NativeProps>("NativeSelect") as HostComponent<NativeProps>;
