import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { DirectEventHandler, Double } from "react-native/Libraries/Types/CodegenTypes";

export type DragDropFileEvent = {
  directories: string[];
  files: string[];
};

export type NativeTrackDragEnterEvent = {
  tracksJson: string;
};

export type NativeTrackDragEvent = {
  tracksJson: string;
  x: Double;
  y: Double;
};

export interface NativeProps extends ViewProps {
  allowedFileTypes?: string[];
  onDragEnter?: DirectEventHandler<DragDropFileEvent>;
  onDragLeave?: DirectEventHandler<{}>;
  onDrop?: DirectEventHandler<DragDropFileEvent>;
  onTrackDragEnter?: DirectEventHandler<NativeTrackDragEnterEvent>;
  onTrackDragHover?: DirectEventHandler<NativeTrackDragEvent>;
  onTrackDragLeave?: DirectEventHandler<{}>;
  onTrackDrop?: DirectEventHandler<NativeTrackDragEvent>;
}

export default codegenNativeComponent<NativeProps>("DragDropView") as HostComponent<NativeProps>;
