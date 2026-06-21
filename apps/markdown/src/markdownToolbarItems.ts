import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";

export type MarkdownToolbarItem = {
  id: MarkdownToolbarItemId;
  fallbackLabel: string;
  icon?: string;
  accessibilityLabel: string;
  textStyle?: "bold" | "italic" | "underline" | "strikethrough";
  run: (commands: MarkdownDocumentCommands) => void;
};

export const markdownToolbarItemIds = [
  "paragraph",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "heading-5",
  "heading-6",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "spoiler",
  "link",
  "blockquote",
  "unordered-list",
  "ordered-list",
  "task-list",
  "code-block",
  "thematic-break",
] as const;

export type MarkdownToolbarItemId = (typeof markdownToolbarItemIds)[number];

export const markdownToolbarItems = [
  {
    id: "paragraph",
    fallbackLabel: "P",
    icon: "text.alignleft",
    accessibilityLabel: "Paragraph",
    run: (commands) => commands.setParagraph(),
  },
  ...([1, 2, 3, 4, 5, 6] as const).map((level): MarkdownToolbarItem => ({
    id: `heading-${level}` as MarkdownToolbarItemId,
    fallbackLabel: `H${level}`,
    accessibilityLabel: `Heading ${level}`,
    run: (commands: MarkdownDocumentCommands) => commands.setHeading(level),
  })),
  {
    id: "bold",
    fallbackLabel: "B",
    icon: "bold",
    accessibilityLabel: "Bold",
    textStyle: "bold",
    run: (commands) => commands.toggleBold(),
  },
  {
    id: "italic",
    fallbackLabel: "I",
    icon: "italic",
    accessibilityLabel: "Italic",
    textStyle: "italic",
    run: (commands) => commands.toggleItalic(),
  },
  {
    id: "underline",
    fallbackLabel: "U",
    icon: "underline",
    accessibilityLabel: "Underline",
    textStyle: "underline",
    run: (commands) => commands.toggleUnderline(),
  },
  {
    id: "strikethrough",
    fallbackLabel: "S",
    icon: "strikethrough",
    accessibilityLabel: "Strikethrough",
    textStyle: "strikethrough",
    run: (commands) => commands.toggleStrikethrough(),
  },
  {
    id: "spoiler",
    fallbackLabel: "||",
    icon: "eye.slash",
    accessibilityLabel: "Spoiler",
    run: (commands) => commands.toggleSpoiler(),
  },
  {
    id: "link",
    fallbackLabel: "Link",
    icon: "link",
    accessibilityLabel: "Link",
    run: (commands) => commands.insertLink(),
  },
  {
    id: "blockquote",
    fallbackLabel: ">",
    icon: "quote.opening",
    accessibilityLabel: "Blockquote",
    run: (commands) => commands.toggleBlockquote(),
  },
  {
    id: "unordered-list",
    fallbackLabel: "UL",
    icon: "list.bullet",
    accessibilityLabel: "Bulleted List",
    run: (commands) => commands.toggleUnorderedList(),
  },
  {
    id: "ordered-list",
    fallbackLabel: "OL",
    icon: "list.number",
    accessibilityLabel: "Numbered List",
    run: (commands) => commands.toggleOrderedList(),
  },
  {
    id: "task-list",
    fallbackLabel: "[ ]",
    icon: "checklist",
    accessibilityLabel: "Task List",
    run: (commands) => commands.toggleTaskList(),
  },
  {
    id: "code-block",
    fallbackLabel: "```",
    icon: "curlybraces.square",
    accessibilityLabel: "Code Block",
    run: (commands) => commands.toggleCodeBlock(),
  },
  {
    id: "thematic-break",
    fallbackLabel: "---",
    icon: "minus",
    accessibilityLabel: "Thematic Break",
    run: (commands) => commands.insertThematicBreak(),
  },
] as const satisfies readonly MarkdownToolbarItem[];

export const markdownToolbarItemMap = Object.fromEntries(
  markdownToolbarItems.map((item) => [item.id, item]),
) as Record<MarkdownToolbarItemId, MarkdownToolbarItem>;
