import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import codegenNativeCommands from "react-native/Libraries/Utilities/codegenNativeCommands";
import type { DirectEventHandler, Double, WithDefault } from "react-native/Libraries/Types/CodegenTypes";

export interface NativeProps extends ViewProps {
  documentPath: string;
  automaticPairs?: WithDefault<boolean, true>;
  indentUnit?: WithDefault<string, "  ">;
  initialSource?: string;
  useInitialSource?: boolean;
  syntaxLanguage: string;
  syntaxBackend?: string;
  syntaxTheme: string;
  syntaxHighlightingEnabled: boolean;
  syntaxHighlightingInBackground: boolean;
  grammarRevision?: WithDefault<Double, 0>;
  onGrammarRequired?: DirectEventHandler<Readonly<{ language: string }>>;
  onSyntaxError?: DirectEventHandler<Readonly<{ error: string }>>;
  onProgress?: DirectEventHandler<Readonly<{ completedLines: Double; totalLines: Double; active: boolean }>>;
  onReady?: DirectEventHandler<Readonly<{ lineCount: Double; firstId: Double; complete: boolean; error: string; sourcePrefix: string }>>;
  onAppend?: DirectEventHandler<Readonly<{ json: string; complete: boolean; error: string }>>;
  onEdit?: DirectEventHandler<Readonly<{ json: string }>>;
  onLineHeights?: DirectEventHandler<Readonly<{ json: string }>>;
  onSelection?: DirectEventHandler<Readonly<{ line: Double; start: Double; length: Double }>>;
  onDocumentState?: DirectEventHandler<Readonly<{ dirty: boolean; path: string }>>;
  onCommandResult?: DirectEventHandler<Readonly<{ id: Double; allowed: boolean; error: string }>>;
}
export interface NativeCommands {
  execute: (view: React.ElementRef<HostComponent<NativeProps>>, id: Double, command: string, argument: string) => void;
}
export const Commands = codegenNativeCommands<NativeCommands>({ supportedCommands: ["execute"] });
export default codegenNativeComponent<NativeProps>("SourceEditorHost") as HostComponent<NativeProps>;
