import type { CodegenTypes, HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  adaptiveRender: string;
  activeSearchHighlightColor: string;
  activeSearchHighlights: string;
  activeSearchNewHighlights: string;
  activeSearchOldHighlights: string;
  activeSearchRowHighlightColor: string;
  configId: string;
  configVersion: CodegenTypes.Double;
  rowIndex: CodegenTypes.Double;
  searchHighlightColor: string;
  searchHighlights: string;
  searchNewHighlights: string;
  searchOldHighlights: string;
}

export default codegenNativeComponent<NativeProps>("DiffNativeRow") as HostComponent<NativeProps>;
