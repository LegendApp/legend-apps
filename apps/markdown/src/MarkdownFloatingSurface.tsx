import type { MarkdownSelectionAnchor } from "@legend-desktop/markdown-document";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export function MarkdownFloatingSurface({
  anchor,
  children,
  placement = "above",
}: {
  anchor: MarkdownSelectionAnchor;
  children: ReactNode;
  placement?: "above" | "below";
}) {
  const itemTop = anchor.itemY ?? anchor.y;
  const itemWidth = anchor.itemWidth ?? anchor.width;
  const selectionTop = anchor.y - itemTop;
  const top = placement === "above"
    ? Math.max(-26, selectionTop - 56)
    : Math.max(0, selectionTop + anchor.height + 6);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          left: 0,
          top,
          width: itemWidth,
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
  content: {
    maxWidth: "100%",
  },
});
