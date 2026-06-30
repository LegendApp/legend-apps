import type { HostComponent, ViewProps } from "react-native";
import type { DirectEventHandler, Double } from "react-native/Libraries/Types/CodegenTypes";
import { codegenNativeComponent } from "react-native";

type EditorFrameEvent = Readonly<{
  blockId: string;
  height: Double;
  rowHeight: Double;
  width: Double;
  x: Double;
  y: Double;
}>;

export interface NativeProps extends ViewProps {
  activeBlockId?: string;
  markdownLayoutConfigJson?: string;
  onBeginEditing?: DirectEventHandler<EditorFrameEvent>;
  onEditorFrameChange?: DirectEventHandler<EditorFrameEvent>;
}

export default codegenNativeComponent<NativeProps>("MarkdownEditorHost") as HostComponent<NativeProps>;
