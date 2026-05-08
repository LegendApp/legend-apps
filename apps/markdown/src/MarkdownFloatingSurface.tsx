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
  const top = placement === "above"
    ? Math.max(8, anchor.y - 44)
    : anchor.y + anchor.height + 6;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          left: 16,
          right: 16,
          top,
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
