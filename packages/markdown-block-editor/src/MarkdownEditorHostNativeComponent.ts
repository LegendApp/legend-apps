import type { HostComponent, ViewProps } from "react-native";
import type { DirectEventHandler, Double } from "react-native/Libraries/Types/CodegenTypes";
import { codegenNativeComponent } from "react-native";
import codegenNativeCommands from "react-native/Libraries/Utilities/codegenNativeCommands";

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
  textSelectionJson?: string;
  onTextSelectionChange?: DirectEventHandler<Readonly<{ json: string; dragging: boolean }>>;
  onTextSelectionReveal?: DirectEventHandler<Readonly<{ index: Double; upwards: boolean }>>;
  onTextSelectionAction?: DirectEventHandler<Readonly<{ action: string; text: string }>>;
  onBeginEditing?: DirectEventHandler<EditorFrameEvent>;
  onBackspaceAtStart?: DirectEventHandler<Readonly<{ blockId: string }>>;
  onDeleteAtEnd?: DirectEventHandler<Readonly<{ blockId: string }>>;
  onEnterPressed?: DirectEventHandler<Readonly<{
    afterMarkdown: string;
    blockId: string;
    beforeMarkdown: string;
  }>>;
  onPasteMarkdown?: DirectEventHandler<Readonly<{
    afterMarkdown: string;
    blockId: string;
    beforeMarkdown: string;
    text: string;
  }>>;
  onEditorFrameChange?: DirectEventHandler<EditorFrameEvent>;
}

type ComponentType = HostComponent<NativeProps>;
interface NativeCommands {
  setSelectionAfterMarkdown: (viewRef: React.ElementRef<ComponentType>, blockId: string, markdownPrefix: string) => void;
  writeSelectionClipboard: (viewRef: React.ElementRef<ComponentType>, markdown: string) => void;
}
export const Commands = codegenNativeCommands<NativeCommands>({ supportedCommands: ["writeSelectionClipboard", "setSelectionAfterMarkdown"] });
export default codegenNativeComponent<NativeProps>("MarkdownEditorHost") as ComponentType;
