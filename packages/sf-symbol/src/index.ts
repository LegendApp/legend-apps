import { createElement } from "react";
import type { ColorValue, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import NativeSFSymbol from "./SFSymbolNativeComponent";

export type SFSymbolScale = "small" | "medium" | "large";

export interface SFSymbolProps {
  name: string;
  color?: ColorValue;
  scale?: SFSymbolScale;
  size?: number;
  yOffset?: number;
  style?: ViewStyle;
  testID?: string;
}

export function SFSymbol({ name, color, scale = "medium", size = 24, style, yOffset, ...props }: SFSymbolProps) {
  const baseStyle: ViewStyle = { height: size, width: size };
  return createElement(NativeSFSymbol, {
    color,
    name,
    scale,
    size,
    style: StyleSheet.flatten([baseStyle, style]),
    yOffset,
    ...props,
  });
}

export function SFSymbolPlaceholder({ style, testID }: Pick<SFSymbolProps, "style" | "testID">) {
  return createElement(View, { style: [{ height: 24, width: 24 }, style], testID });
}

export { default as NativeSFSymbol } from "./SFSymbolNativeComponent";
