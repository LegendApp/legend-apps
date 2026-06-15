import { Platform, PlatformColor, type ColorValue, type GestureResponderEvent, type TextStyle, type ViewStyle } from "react-native";
import type { MarkdownTextInputStyle } from "react-native-enriched-markdown";
import { markdownDocumentStyles } from "./MarkdownDocument.styles";
import type { NativeSelectionDragOutsideEvent, SelectionDragOutsideEvent } from "./internalTypes";
import type { MarkdownBlockSnapshot, MarkdownDocumentLayout, MarkdownDocumentProps } from "./types";

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const systemBlockSelectionBackgroundColor = Platform.OS === "macos" ? PlatformColor("selectedTextBackgroundColor") : "#bfdbfe";

export function inputStyleFromMarkdownStyle(markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>) {
  return markdownStyle as MarkdownTextInputStyle;
}

export function resolveSelectionColor(selectionColor: string | undefined): ColorValue {
  return selectionColor === undefined || selectionColor === "auto" ? systemBlockSelectionBackgroundColor : selectionColor;
}

export function editableTextStyleForBlock(
  block: MarkdownBlockSnapshot,
  markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>,
) {
  const headingLevel = getHeadingLevel(block);
  const markdownTextStyle =
    headingLevel === 1
      ? markdownStyle.h1
      : headingLevel === 2
        ? markdownStyle.h2
        : headingLevel === 3
          ? markdownStyle.h3
          : headingLevel === 4
            ? markdownStyle.h4
            : headingLevel === 5
              ? markdownStyle.h5
              : headingLevel === 6
                ? markdownStyle.h6
                : block.type === "codeBlock"
                  ? markdownStyle.codeBlock
                  : markdownStyle.paragraph;

  return [markdownDocumentStyles.editorInput, markdownTextStyle as TextStyle | undefined];
}

export function emptyParagraphPlaceholderStyle(markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>) {
  const paragraphStyle = markdownStyle.paragraph as TextStyle | undefined;
  const lineHeight = typeof paragraphStyle?.lineHeight === "number"
    ? paragraphStyle.lineHeight
    : typeof paragraphStyle?.fontSize === "number"
      ? Math.ceil(paragraphStyle.fontSize * 1.5)
      : 25;

  return { minHeight: lineHeight };
}

export function getHeadingLevel(block: MarkdownBlockSnapshot): HeadingLevel | undefined {
  return block.type === "heading" && block.headingLevel >= 1 && block.headingLevel <= 6
    ? block.headingLevel as HeadingLevel
    : undefined;
}

export function blockSpacingForBlock(block: MarkdownBlockSnapshot, markdownLayout: MarkdownDocumentLayout) {
  const { blockSpacing } = markdownLayout;
  const headingLevel = getHeadingLevel(block);
  if (headingLevel) {
    return blockSpacing.heading[headingLevel];
  }

  switch (block.type) {
    case "paragraph":
      return blockSpacing.paragraph;
    case "codeBlock":
      return blockSpacing.codeBlock;
    case "quote":
      return blockSpacing.blockquote;
    case "unorderedList":
    case "orderedList":
    case "listItem":
      return blockSpacing.list;
    case "thematicBreak":
      return blockSpacing.thematicBreak;
    case "table":
    case "tableHead":
    case "tableBody":
    case "tableRow":
    case "tableHeaderCell":
    case "tableCell":
      return blockSpacing.table;
    default:
      return blockSpacing.fallback;
  }
}

export function blockRowSpacingStyle(
  block: MarkdownBlockSnapshot,
  previousBlock: MarkdownBlockSnapshot | undefined,
  hasPreviousBlock: boolean,
  hasNextBlock: boolean,
  markdownLayout: MarkdownDocumentLayout,
): ViewStyle {
  const spacing = blockSpacingForBlock(block, markdownLayout);
  const previousSpacing = previousBlock
    ? blockSpacingForBlock(previousBlock, markdownLayout)
    : hasPreviousBlock
      ? markdownLayout.blockSpacing.fallback
      : undefined;

  return {
    marginBottom: hasNextBlock ? 0 : spacing.marginBottom ?? 0,
    marginTop: previousSpacing ? Math.max(previousSpacing.marginBottom ?? 0, spacing.marginTop ?? 0) : 0,
  };
}

export function splitMarkdownAtFirstLineBreak(markdown: string) {
  const lineBreakMatch = /\r\n|\r|\n/.exec(markdown);
  if (!lineBreakMatch) {
    return null;
  }

  const lineBreakIndex = lineBreakMatch.index;
  const beforeMarkdown = markdown.slice(0, lineBreakIndex);
  const afterMarkdown = markdown.slice(lineBreakIndex + lineBreakMatch[0].length);
  return { beforeMarkdown, afterMarkdown };
}

export function estimateMarkdownSelection(markdown: string, event: GestureResponderEvent, width: number) {
  const lineHeight = 25;
  const averageCharacterWidth = 8;
  const x = Math.max(0, event.nativeEvent.locationX);
  const y = Math.max(0, event.nativeEvent.locationY);
  const visualLine = Math.floor(y / lineHeight);
  const characterInVisualLine = Math.floor(x / averageCharacterWidth);
  const charactersPerLine = Math.max(20, Math.floor(width / averageCharacterWidth));
  const lines = markdown.split("\n");
  let offset = 0;
  let currentVisualLine = 0;

  for (const line of lines) {
    const wrappedLineCount = Math.max(1, Math.ceil(Math.max(1, line.length) / charactersPerLine));
    if (visualLine < currentVisualLine + wrappedLineCount) {
      const wrappedLine = visualLine - currentVisualLine;
      return Math.min(markdown.length, offset + Math.min(line.length, wrappedLine * charactersPerLine + characterInVisualLine));
    }
    offset += line.length + 1;
    currentVisualLine += wrappedLineCount;
  }

  return markdown.length;
}

export function isMarkdownSelectionOnFirstLine(markdown: string, selection: { start: number; end: number }) {
  const selectionStart = Math.min(selection.start, selection.end);
  const selectionEnd = Math.max(selection.start, selection.end);
  const firstLineBreak = /\r\n|\r|\n/.exec(markdown);
  return selectionStart === selectionEnd && (!firstLineBreak || selectionStart <= firstLineBreak.index);
}

export function isMarkdownSelectionOnLastLine(markdown: string, selection: { start: number; end: number }) {
  const selectionStart = Math.min(selection.start, selection.end);
  const selectionEnd = Math.max(selection.start, selection.end);
  const lastLineBreakIndex = Math.max(markdown.lastIndexOf("\n"), markdown.lastIndexOf("\r"));
  return selectionStart === selectionEnd && (lastLineBreakIndex < 0 || selectionStart > lastLineBreakIndex);
}

function numberFromStyleValue(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function textStyleLineHeight(textStyle: TextStyle | undefined) {
  if (typeof textStyle?.lineHeight === "number") {
    return textStyle.lineHeight;
  }
  if (typeof textStyle?.fontSize === "number") {
    return Math.ceil(textStyle.fontSize * 1.5);
  }
  return 25;
}

export function estimateMarkdownSelectionVerticalRange(
  markdown: string,
  selection: number,
  width: number,
  textStyle: TextStyle | undefined,
) {
  const lineHeight = textStyleLineHeight(textStyle);
  const fontSize = typeof textStyle?.fontSize === "number" ? textStyle.fontSize : 16;
  const padding = numberFromStyleValue(textStyle?.padding);
  const paddingTop = typeof textStyle?.paddingTop === "number" ? textStyle.paddingTop : padding;
  const paddingLeft = typeof textStyle?.paddingLeft === "number" ? textStyle.paddingLeft : padding;
  const paddingRight = typeof textStyle?.paddingRight === "number" ? textStyle.paddingRight : padding;
  const averageCharacterWidth = Math.max(1, fontSize * 0.62);
  const textWidth = Math.max(1, width - paddingLeft - paddingRight);
  const charactersPerLine = Math.max(1, Math.floor(textWidth / averageCharacterWidth));
  const selectionStart = Math.max(0, Math.min(selection, markdown.length));
  const lines = markdown.split("\n");
  let offset = 0;
  let visualLine = 0;

  for (const line of lines) {
    const lineEnd = offset + line.length;
    if (selectionStart <= lineEnd) {
      const column = Math.max(0, selectionStart - offset);
      const top = paddingTop + (visualLine + Math.floor(column / charactersPerLine)) * lineHeight;
      return { bottom: top + lineHeight, top };
    }

    offset = lineEnd + 1;
    visualLine += Math.max(1, Math.ceil(Math.max(1, line.length) / charactersPerLine));
  }

  const top = paddingTop + visualLine * lineHeight;
  return { bottom: top + lineHeight, top };
}

export function estimateMarkdownEditorHeight(markdown: string, width: number) {
  const lineHeight = 25;
  const averageCharacterWidth = 8;
  const charactersPerLine = Math.max(20, Math.floor(width / averageCharacterWidth));
  const visualLines = markdown
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(Math.max(1, line.length) / charactersPerLine)), 0);

  return Math.max(lineHeight, visualLines * lineHeight);
}

export function normalizeSelectionDragOutsideEvent(event: NativeSelectionDragOutsideEvent): SelectionDragOutsideEvent {
  return event.nativeEvent ?? event;
}
