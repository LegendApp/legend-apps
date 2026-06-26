import {
  createElement,
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import TextInputSearchNativeComponent, {
  Commands,
  type TextInputSearchChangeEvent,
} from "./TextInputSearchNativeComponent";

export interface TextInputSearchProps extends Omit<ViewProps, "children"> {
  appearance?: "dark" | "light" | "system";
  defaultValue?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  value?: string;
}

export interface TextInputSearchRef {
  focus(): void;
}

export const TextInputSearch = memo(
  forwardRef<TextInputSearchRef, TextInputSearchProps>(function TextInputSearch(
    { defaultValue, onChangeText, value, ...props },
    ref,
  ) {
    "use no memo";

    const nativeRef = useRef<React.ElementRef<typeof TextInputSearchNativeComponent>>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus() {
          if (nativeRef.current) {
            Commands.focus(nativeRef.current);
          }
        },
      }),
      [],
    );

    const handleChangeText = useCallback(
      (event: NativeSyntheticEvent<TextInputSearchChangeEvent>) => {
        onChangeText?.(event.nativeEvent.text);
      },
      [onChangeText],
    );

    return createElement(TextInputSearchNativeComponent, {
      defaultText: defaultValue,
      onChangeText: handleChangeText,
      ref: nativeRef,
      text: value,
      ...props,
    });
  }),
);

export { TextInputSearchNativeComponent };
export type { TextInputSearchChangeEvent };
