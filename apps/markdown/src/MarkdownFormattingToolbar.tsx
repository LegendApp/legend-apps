import { useMemo } from "react";
import type { RefObject } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
import { useResolveClassNames } from "uniwind";
import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";
import {
  type MarkdownToolbarLayoutId,
  useMarkdownDisplayThemeSetting,
  useMarkdownToolbarLayoutSetting,
} from "./markdownSettings";
import { markdownToolbarItemMap } from "./markdownToolbarItems";

type MarkdownFormattingToolbarPlacement = "top" | "bottom";

export function MarkdownFormattingToolbar({
  commandsRef,
  floating,
  layoutId = floating ? "selection" : "top",
  onInsertLink,
  placement = "top",
  style,
}: {
  commandsRef: RefObject<MarkdownDocumentCommands | null>;
  floating?: boolean;
  layoutId?: MarkdownToolbarLayoutId;
  onInsertLink?: () => void;
  placement?: MarkdownFormattingToolbarPlacement;
  style?: StyleProp<ViewStyle>;
}) {
  const toolbarStyle = useResolveClassNames("border-border bg-surface");
  const buttonStyle = useResolveClassNames("border-border bg-surface-muted");
  const displayTheme = getLegendDisplayTheme(useMarkdownDisplayThemeSetting());
  const iconColor = displayTheme.colors.foreground;
  const toolbarLayout = useMarkdownToolbarLayoutSetting(layoutId);
  const toolbarItems = useMemo(
    () => toolbarLayout.shown.map((itemId) => markdownToolbarItemMap[itemId]).filter(Boolean),
    [toolbarLayout],
  );
  const toolbarButtons = toolbarItems.map((item) => (
    <Pressable
      accessibilityLabel={item.accessibilityLabel}
      accessibilityRole="button"
      className="border"
      key={item.id}
      onPressIn={() => {
        if (item.id === "link" && onInsertLink) {
          onInsertLink();
          return;
        }

        const commands = commandsRef.current;
        if (commands) {
          item.run(commands);
        }
      }}
      style={[styles.button, buttonStyle]}
    >
      <SFSymbol color={iconColor} name={item.icon} size={14} style={styles.icon} />
      <Text
        className="text-foreground"
        style={[styles.fallbackIconText, "textStyle" in item && item.textStyle ? styles[item.textStyle] : null]}
      >
        {item.fallbackLabel}
      </Text>
    </Pressable>
  ));

  if (toolbarItems.length === 0) {
    return null;
  }

  return (
    <View
      className="border"
      style={[
        styles.toolbar,
        floating ? styles.floatingToolbar : placement === "bottom" ? styles.bottomToolbar : styles.topToolbar,
        toolbarStyle,
        style,
      ]}
    >
      {floating ? (
        <View style={styles.toolbarContent}>{toolbarButtons}</View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.toolbarContent, styles.dockedToolbarContent]}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {toolbarButtons}
        </ScrollView>
      )}
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
  fallbackIconText: {
    fontSize: 0,
    height: 0,
    opacity: 0,
    width: 0,
  },
  icon: {
    flexShrink: 0,
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
    flexDirection: "row",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  dockedToolbarContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  bottomToolbar: {
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
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
