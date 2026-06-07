import type { RefObject } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useResolveClassNames } from "uniwind";
import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";
import { markdownToolbarItems } from "./markdownToolbarItems";

export function MarkdownFormattingToolbar({
  commandsRef,
  floating,
  style,
}: {
  commandsRef: RefObject<MarkdownDocumentCommands | null>;
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const toolbarStyle = useResolveClassNames("border-border bg-surface");
  const buttonStyle = useResolveClassNames("border-border bg-surface-muted");

  return (
    <View
      className="border"
      style={[
        styles.toolbar,
        floating ? styles.floatingToolbar : styles.topToolbar,
        toolbarStyle,
        style,
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.toolbarContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {markdownToolbarItems.map((item) => (
          <Pressable
            accessibilityLabel={item.accessibilityLabel}
            accessibilityRole="button"
            className="border"
            key={item.id}
            onPressIn={() => {
              const commands = commandsRef.current;
              if (commands) {
                item.run(commands);
              }
            }}
            style={[styles.button, buttonStyle]}
          >
            <Text
              className="text-foreground"
              style={[styles.buttonText, "textStyle" in item && item.textStyle ? styles[item.textStyle] : null]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bold: {
    fontWeight: "700",
  },
  button: {
    alignItems: "center",
    borderRadius: 6,
    height: 30,
    justifyContent: "center",
    minWidth: 30,
    paddingHorizontal: 8,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  floatingToolbar: {
    shadowColor: "#000000",
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  italic: {
    fontStyle: "italic",
  },
  strikethrough: {
    textDecorationLine: "line-through",
  },
  toolbar: {
    borderRadius: 8,
    maxWidth: "100%",
  },
  toolbarContent: {
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  topToolbar: {
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  underline: {
    textDecorationLine: "underline",
  },
});
