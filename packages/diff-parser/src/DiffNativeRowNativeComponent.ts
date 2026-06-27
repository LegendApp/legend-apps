import type { CodegenTypes, HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  adaptiveRender: string;
  addAccentColor: string;
  addBackgroundColor: string;
  changeBarWidth: CodegenTypes.Double;
  documentId: CodegenTypes.Double;
  collapsedFileIndexes: string;
  dividerColor: string;
  fontFamily: string;
  fontSize: CodegenTypes.Double;
  foregroundColor: string;
  lineNumberWidth: CodegenTypes.Double;
  markerWidth: CodegenTypes.Double;
  mutedColor: string;
  removeAccentColor: string;
  removeBackgroundColor: string;
  presentation: string;
  rowHeight: CodegenTypes.Double;
  rowIndex: CodegenTypes.Double;
  syntaxHighlightingEnabled: boolean;
  themeName: string;
  tokenizedMaxRow: CodegenTypes.Double;
}

export default codegenNativeComponent<NativeProps>("DiffNativeRow") as HostComponent<NativeProps>;
