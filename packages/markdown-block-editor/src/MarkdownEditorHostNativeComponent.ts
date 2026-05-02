import type { HostComponent, ViewProps } from "react-native";
import type { DirectEventHandler } from "react-native/Libraries/Types/CodegenTypes";
import { codegenNativeComponent } from "react-native";

type BeginEditingEvent = Readonly<{
  blockId: string;
}>;

export interface NativeProps extends ViewProps {
  activeBlockId?: string;
  activeMarkdown?: string;
  onBeginEditing?: DirectEventHandler<BeginEditingEvent>;
}

export default codegenNativeComponent<NativeProps>("MarkdownEditorHost") as HostComponent<NativeProps>;
