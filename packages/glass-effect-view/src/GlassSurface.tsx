import type { ReactNode } from "react";
import { StyleSheet, View, type ColorValue, type ViewProps } from "react-native";

import { GlassEffectView, type GlassEffectStyle } from "./GlassEffectView";

export interface GlassSurfaceProps extends ViewProps {
  children?: ReactNode;
  glassStyle?: GlassEffectStyle;
  tintColor?: ColorValue;
}

export function GlassSurface({
  children,
  glassStyle = "regular",
  style,
  tintColor,
  ...props
}: GlassSurfaceProps) {
  return (
    <View {...props} style={[styles.surface, style]}>
      <GlassEffectView
        glassStyle={glassStyle}
        pointerEvents="none"
        style={styles.glass}
        tintColor={tintColor}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    ...StyleSheet.absoluteFillObject,
  },
  surface: {
    overflow: "hidden",
  },
});
