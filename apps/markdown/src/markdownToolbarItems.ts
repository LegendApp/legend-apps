import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";

export type MarkdownToolbarItem = {
  id: string;
  label: string;
  accessibilityLabel: string;
  textStyle?: "bold" | "italic" | "underline" | "strikethrough";
  run: (commands: MarkdownDocumentCommands) => void;
};

export const markdownToolbarItems = [
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
    textStyle: "bold",
    run: (commands) => commands.toggleBold(),
  },
  {
    id: "italic",
    label: "I",
    accessibilityLabel: "Italic",
    textStyle: "italic",
    run: (commands) => commands.toggleItalic(),
  },
  {
    id: "underline",
    label: "U",
    accessibilityLabel: "Underline",
    textStyle: "underline",
    run: (commands) => commands.toggleUnderline(),
  },
  {
    id: "strikethrough",
    label: "S",
    accessibilityLabel: "Strikethrough",
    textStyle: "strikethrough",
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
] as const satisfies readonly MarkdownToolbarItem[];

export type MarkdownToolbarItemId = (typeof markdownToolbarItems)[number]["id"];

export const markdownToolbarItemMap = Object.fromEntries(
  markdownToolbarItems.map((item) => [item.id, item]),
) as Record<MarkdownToolbarItemId, MarkdownToolbarItem>;
