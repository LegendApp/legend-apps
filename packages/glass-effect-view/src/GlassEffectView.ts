import { createElement, type ReactNode } from "react";
import type { ColorValue, ViewProps } from "react-native";
import { requireNativeComponent } from "react-native";

export type GlassEffectStyle = "regular" | "clear";

export interface GlassEffectViewProps extends ViewProps {
  children?: ReactNode;
  glassStyle?: GlassEffectStyle;
  tintColor?: ColorValue;
}

export const NativeGlassEffectView = requireNativeComponent<GlassEffectViewProps>("RNGlassEffectView");

export function GlassEffectView({ children, glassStyle = "regular", ...props }: GlassEffectViewProps) {
  return createElement(NativeGlassEffectView, { glassStyle, ...props }, children);
}
