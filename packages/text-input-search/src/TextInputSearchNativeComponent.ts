import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";
import codegenNativeCommands from "react-native/Libraries/Utilities/codegenNativeCommands";
import type { DirectEventHandler } from "react-native/Libraries/Types/CodegenTypes";

export type TextInputSearchChangeEvent = {
  text: string;
};

export interface NativeProps extends ViewProps {
  appearance?: string;
  defaultText?: string;
  onChangeText?: DirectEventHandler<TextInputSearchChangeEvent>;
  placeholder?: string;
  text?: string;
}

type NativeComponentType = HostComponent<NativeProps>;

export interface NativeCommands {
  focus: (viewRef: React.ElementRef<NativeComponentType>) => void;
}

export const Commands = codegenNativeCommands<NativeCommands>({
  supportedCommands: ["focus"],
});

export default codegenNativeComponent<NativeProps>("TextInputSearch") as NativeComponentType;
