import type { MarkdownSelectionAnchor } from "@legend-apps/markdown-document";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import {
  getMarkdownFloatingSurfaceFrame,
  type MarkdownFloatingSurfaceCoordinateSpace,
  type MarkdownFloatingSurfacePlacement,
} from "./markdownFloatingSurfaceFrame";

export function MarkdownFloatingSurface({
  anchor,
  children,
  coordinateSpace = "item",
  placement = "above",
}: {
  anchor: MarkdownSelectionAnchor;
  children: ReactNode;
  coordinateSpace?: MarkdownFloatingSurfaceCoordinateSpace;
  placement?: MarkdownFloatingSurfacePlacement;
}) {
  const frame = getMarkdownFloatingSurfaceFrame({
    anchor,
    coordinateSpace,
    placement,
  });

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        frame,
      ]}
    >
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    position: "absolute",
    zIndex: 10,
  },
  content: {},
});
