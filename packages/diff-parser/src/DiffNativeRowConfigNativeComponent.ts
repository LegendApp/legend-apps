import type { CodegenTypes, HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  addAccentColor: string;
  addBackgroundColor: string;
  activeSearchHighlightByRowIndex: string;
  activeSearchHighlightColor: string;
  activeSearchRowHighlightColor: string;
  changeBarWidth: CodegenTypes.Double;
  collapsedFileIndexes: string;
  configId: string;
  configVersion: CodegenTypes.Double;
  dividerColor: string;
  documentId: CodegenTypes.Double;
  fontFamily: string;
  fontSize: CodegenTypes.Double;
  foregroundColor: string;
  horizontalViewportWidth: CodegenTypes.Double;
  highlightChangedCharacters: boolean;
  lineNumberWidth: CodegenTypes.Double;
  markerWidth: CodegenTypes.Double;
  mutedColor: string;
  presentation: string;
  removeAccentColor: string;
  removeBackgroundColor: string;
  rowHeight: CodegenTypes.Double;
  searchHighlightByRowIndex: string;
  searchHighlightColor: string;
  showWhitespaceCharacters: boolean;
  syntaxHighlightingEnabled: boolean;
  themeName: string;
  tokenizationVersion: CodegenTypes.Double;
  tokenizedRowRanges: string;
}

export default codegenNativeComponent<NativeProps>("DiffNativeRowConfig") as HostComponent<NativeProps>;
