import type { HostComponent, ViewProps } from "react-native";
import type { DirectEventHandler, Double } from "react-native/Libraries/Types/CodegenTypes";
import { codegenNativeComponent } from "react-native";

type EditorFrameEvent = Readonly<{
  blockId: string;
  height: Double;
  markdown: string;
  rowHeight: Double;
  width: Double;
  x: Double;
  y: Double;
}>;

export interface NativeProps extends ViewProps {
  activeBlockId?: string;
  activeBlockMarkdown?: string;
  markdownLayoutConfigJson?: string;
  onBeginEditing?: DirectEventHandler<EditorFrameEvent>;
  onBackspaceAtStart?: DirectEventHandler<Readonly<{ blockId: string }>>;
  onEnterPressed?: DirectEventHandler<Readonly<{
    afterMarkdown: string;
    blockId: string;
    beforeMarkdown: string;
  }>>;
  onEditorFrameChange?: DirectEventHandler<EditorFrameEvent>;
}

export default codegenNativeComponent<NativeProps>("MarkdownEditorHost") as HostComponent<NativeProps>;
