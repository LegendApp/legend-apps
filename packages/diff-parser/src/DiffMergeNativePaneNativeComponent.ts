import type { CodegenTypes, HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  configVersion: CodegenTypes.Double;
  fontFamily: string;
  fontSize: CodegenTypes.Double;
  foregroundColor: string;
  horizontalConfigId: string;
  inlineHighlightColor: string;
  inlineHighlights: string;
  lineNumber: CodegenTypes.Double;
  lineNumberWidth: CodegenTypes.Double;
  mutedColor: string;
  rowHeight: CodegenTypes.Double;
  text: string;
  tokens: string;
}

export default codegenNativeComponent<NativeProps>("DiffMergeNativePane") as HostComponent<NativeProps>;
