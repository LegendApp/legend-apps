import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import type { DirectEventHandler, Double } from "react-native/Libraries/Types/CodegenTypes";

export interface NativeProps extends ViewProps {
  documentPath: string;
  syntaxLanguage: string;
  syntaxTheme: string;
  syntaxHighlightingEnabled: boolean;
  onSyntaxError?: DirectEventHandler<Readonly<{ error: string }>>;
  onReady?: DirectEventHandler<Readonly<{ source: string; error: string }>>;
  onEdit?: DirectEventHandler<Readonly<{ json: string }>>;
  onSelection?: DirectEventHandler<Readonly<{ line: Double; start: Double; length: Double }>>;
}
export default codegenNativeComponent<NativeProps>("SourceEditorHost") as HostComponent<NativeProps>;
