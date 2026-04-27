import { createElement, type ReactNode } from "react";
import type { ColorValue, ViewProps } from "react-native";
import NativeGlassEffectView from "./GlassEffectViewNativeComponent";

export type GlassEffectStyle = "regular" | "clear";

export interface GlassEffectViewProps extends ViewProps {
  children?: ReactNode;
  glassStyle?: GlassEffectStyle;
  tintColor?: ColorValue;
}

export function GlassEffectView({ children, glassStyle = "regular", ...props }: GlassEffectViewProps) {
  return createElement(NativeGlassEffectView, { glassStyle, ...props }, children);
}

export { default as NativeGlassEffectView } from "./GlassEffectViewNativeComponent";
