import type { CodegenTypes, HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export type DiffNativeRowSelectionActionEvent = Readonly<{
  actionId: string;
  itemText: string;
  side: string;
  anchorRowIndex: CodegenTypes.Double;
  anchorColumn: CodegenTypes.Double;
  focusRowIndex: CodegenTypes.Double;
  focusColumn: CodegenTypes.Double;
  selectedText: string;
}>;

export interface NativeProps extends ViewProps {
  addAccentColor: string;
  addBackgroundColor: string;
  activeSearchHighlightByRowIndex: string;
  activeSearchHighlightColor: string;
  activeSearchRowHighlightColor: string;
  /** JSON from encodeDiffAnnotationHighlightRanges; empty draws none. */
  annotationHighlightRanges?: CodegenTypes.WithDefault<string, "">;
  changeBarWidth: CodegenTypes.Double;
  collapsedFileIndexes: string;
  configId: string;
  configVersion: CodegenTypes.Double;
  /** JSON from encodeDiffContextMenuItems; empty keeps the default context menu. */
  contextMenuItems?: CodegenTypes.WithDefault<string, "">;
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
  onSelectionAction?: CodegenTypes.DirectEventHandler<DiffNativeRowSelectionActionEvent>;
  presentation: string;
  projectionId: CodegenTypes.Double;
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
