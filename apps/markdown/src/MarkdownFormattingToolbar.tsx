import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";
import type { RefObject } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useResolveClassNames } from "uniwind";

type ToolbarItem = {
  id: string;
  label: string;
  accessibilityLabel: string;
  run: (commands: MarkdownDocumentCommands) => void;
};

const toolbarItems: ToolbarItem[] = [
  {
    id: "paragraph",
    label: "P",
    accessibilityLabel: "Paragraph",
    run: (commands) => commands.setParagraph(),
  },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    id: `heading-${level}`,
    label: `H${level}`,
    accessibilityLabel: `Heading ${level}`,
    run: (commands: MarkdownDocumentCommands) => commands.setHeading(level),
  })),
  {
    id: "bold",
    label: "B",
    accessibilityLabel: "Bold",
    run: (commands) => commands.toggleBold(),
  },
  {
    id: "italic",
    label: "I",
    accessibilityLabel: "Italic",
    run: (commands) => commands.toggleItalic(),
  },
  {
    id: "underline",
    label: "U",
    accessibilityLabel: "Underline",
    run: (commands) => commands.toggleUnderline(),
  },
  {
    id: "strikethrough",
    label: "S",
    accessibilityLabel: "Strikethrough",
    run: (commands) => commands.toggleStrikethrough(),
  },
  {
    id: "spoiler",
    label: "||",
    accessibilityLabel: "Spoiler",
    run: (commands) => commands.toggleSpoiler(),
  },
  {
    id: "link",
    label: "Link",
    accessibilityLabel: "Link",
    run: (commands) => commands.insertLink(),
  },
  {
    id: "blockquote",
    label: ">",
    accessibilityLabel: "Blockquote",
    run: (commands) => commands.toggleBlockquote(),
  },
  {
    id: "unordered-list",
    label: "UL",
    accessibilityLabel: "Bulleted List",
    run: (commands) => commands.toggleUnorderedList(),
  },
  {
    id: "ordered-list",
    label: "OL",
    accessibilityLabel: "Numbered List",
    run: (commands) => commands.toggleOrderedList(),
  },
  {
    id: "task-list",
    label: "[ ]",
    accessibilityLabel: "Task List",
    run: (commands) => commands.toggleTaskList(),
  },
  {
    id: "code-block",
    label: "```",
    accessibilityLabel: "Code Block",
    run: (commands) => commands.toggleCodeBlock(),
  },
  {
    id: "thematic-break",
    label: "---",
    accessibilityLabel: "Thematic Break",
    run: (commands) => commands.insertThematicBreak(),
  },
];

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
        {toolbarItems.map((item) => (
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
            <Text className="text-foreground" style={[styles.buttonText, item.id === "bold" ? styles.bold : null, item.id === "italic" ? styles.italic : null, item.id === "underline" ? styles.underline : null, item.id === "strikethrough" ? styles.strikethrough : null]}>
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
