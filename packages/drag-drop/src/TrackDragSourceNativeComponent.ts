import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { DirectEventHandler } from "react-native/Libraries/Types/CodegenTypes";

export interface NativeProps extends ViewProps {
  onDragStart?: DirectEventHandler<{}>;
  trackPayloadJson: string;
}

export default codegenNativeComponent<NativeProps>("TrackDragSource") as HostComponent<NativeProps>;
