import { Platform, PlatformColor, type ColorValue, type GestureResponderEvent, type TextStyle, type ViewStyle } from "react-native";
import type { MarkdownTextInputStyle } from "react-native-enriched-markdown";
import { markdownDocumentStyles } from "./MarkdownDocument.styles";
import type { NativeSelectionDragOutsideEvent, SelectionDragOutsideEvent } from "./internalTypes";
import type { MarkdownBlockSnapshot, MarkdownDocumentLayout, MarkdownDocumentProps } from "./types";

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const systemBlockSelectionBackgroundColor = Platform.OS === "macos" ? PlatformColor("selectedTextBackgroundColor") : "#bfdbfe";

function textInputStyleFromMarkdownBlockStyle(markdownTextStyle: TextStyle | undefined): TextStyle | undefined {
  if (!markdownTextStyle) {
    return undefined;
  }

  const {
    backgroundColor: _backgroundColor,
    borderBottomColor: _borderBottomColor,
    borderBottomLeftRadius: _borderBottomLeftRadius,
    borderBottomRightRadius: _borderBottomRightRadius,
    borderBottomWidth: _borderBottomWidth,
    borderColor: _borderColor,
    borderLeftColor: _borderLeftColor,
    borderLeftWidth: _borderLeftWidth,
    borderRadius: _borderRadius,
    borderRightColor: _borderRightColor,
    borderRightWidth: _borderRightWidth,
    borderTopColor: _borderTopColor,
    borderTopLeftRadius: _borderTopLeftRadius,
    borderTopRightRadius: _borderTopRightRadius,
    borderTopWidth: _borderTopWidth,
    borderWidth: _borderWidth,
    padding: _padding,
    paddingBottom: _paddingBottom,
    paddingLeft: _paddingLeft,
    paddingRight: _paddingRight,
    paddingTop: _paddingTop,
    ...textInputStyle
  } = markdownTextStyle;

  return textInputStyle;
}

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

  return [
    markdownDocumentStyles.editorInput,
    textInputStyleFromMarkdownBlockStyle(markdownTextStyle as TextStyle | undefined),
  ];
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

function hiddenLeadingMarkdownSyntaxLength(line: string) {
  const headingMatch = /^(\s{0,3}#{1,6}\s+)/.exec(line);
  return headingMatch?.[1]?.length ?? 0;
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
    const hiddenPrefixLength = hiddenLeadingMarkdownSyntaxLength(line);
    const renderedLineLength = Math.max(0, line.length - hiddenPrefixLength);
    const wrappedLineCount = Math.max(1, Math.ceil(Math.max(1, renderedLineLength) / charactersPerLine));
    if (visualLine < currentVisualLine + wrappedLineCount) {
      const wrappedLine = visualLine - currentVisualLine;
      const renderedSelection = Math.min(renderedLineLength, wrappedLine * charactersPerLine + characterInVisualLine);
      return Math.min(markdown.length, offset + hiddenPrefixLength + renderedSelection);
    }
    offset += line.length + 1;
    currentVisualLine += wrappedLineCount;
  }

  return markdown.length;
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
