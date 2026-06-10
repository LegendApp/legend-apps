import type { MarkdownSelectionAnchor } from "@legend-desktop/markdown-document";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export function MarkdownFloatingSurface({
  anchor,
  children,
  coordinateSpace = "item",
  placement = "above",
}: {
  anchor: MarkdownSelectionAnchor;
  children: ReactNode;
  coordinateSpace?: "content" | "item";
  placement?: "above" | "below";
}) {
  const itemTop = anchor.itemY ?? anchor.y;
  const anchorsToSelection = coordinateSpace === "content" && anchor.kind === "textSelection";
  const surfaceLeft = anchorsToSelection ? anchor.x : coordinateSpace === "content" ? anchor.itemX ?? anchor.x : 0;
  const surfaceWidth = anchorsToSelection ? anchor.width : anchor.itemWidth ?? anchor.width;
  const selectionTop = anchor.y - itemTop;
  const surfaceTop = coordinateSpace === "content" ? anchor.y : selectionTop;
  const top = placement === "above"
    ? Math.max(coordinateSpace === "content" ? 0 : -26, surfaceTop - 56)
    : Math.max(0, surfaceTop + anchor.height + 6);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          left: surfaceLeft,
          top,
          width: surfaceWidth,
        },
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
