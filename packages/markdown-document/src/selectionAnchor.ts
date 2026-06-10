import type { CaretRect } from "react-native-enriched-markdown";
import type { MarkdownSelectionAnchor } from "./types";

type TextSelectionAnchorOptions = {
  blockId?: string;
  caretRect: CaretRect;
  contentItemX: number;
  itemHeight: number;
  itemWidth: number;
  itemY: number;
  markdown: string;
  paragraphFontSize: number;
  paragraphLineHeight: number;
  scrollOffsetY: number;
  selectedLength: number;
  selectionEnd: number;
  selectionStart: number;
};

type EstimatedVisualPosition = {
  x: number;
  y: number;
  averageCharacterWidth: number;
};

function countLineBreaksBefore(markdown: string, index: number) {
  let lineBreaks = 0;
  for (let charIndex = 0; charIndex < index; charIndex += 1) {
    if (markdown[charIndex] === "\n") {
      lineBreaks += 1;
    }
  }
  return lineBreaks;
}

function estimateSelectionWidth(markdown: string, selectionStart: number, selectionEnd: number, fontSize: number) {
  const nextLineBreak = markdown.indexOf("\n", selectionStart);
  const lineEnd = nextLineBreak === -1 ? markdown.length : nextLineBreak;
  const selectedColumns = Math.max(1, Math.min(selectionEnd, lineEnd) - selectionStart);
  return Math.ceil(selectedColumns * fontSize * 0.56);
}

function selectionStartsMarkdownLine(markdown: string, selectionStart: number) {
  return selectionStart === 0 || markdown[selectionStart - 1] === "\n";
}

function estimateVisualPosition(markdown: string, selectionStart: number, itemWidth: number, fontSize: number, lineHeight: number): EstimatedVisualPosition {
  const averageCharacterWidth = Math.max(1, fontSize * 0.56);
  const charactersPerLine = Math.max(1, Math.floor(itemWidth / averageCharacterWidth));
  const lines = markdown.split("\n");
  let offset = 0;
  let visualLine = 0;

  for (const line of lines) {
    const lineEnd = offset + line.length;
    if (selectionStart <= lineEnd) {
      const column = Math.max(0, selectionStart - offset);
      return {
        averageCharacterWidth,
        x: (column % charactersPerLine) * averageCharacterWidth,
        y: visualLine * lineHeight + Math.floor(column / charactersPerLine) * lineHeight,
      };
    }
    offset = lineEnd + 1;
    visualLine += Math.max(1, Math.ceil(Math.max(1, line.length) / charactersPerLine));
  }

  return {
    averageCharacterWidth,
    x: 0,
    y: visualLine * lineHeight,
  };
}

export function resolveTextSelectionAnchor({
  blockId,
  caretRect,
  contentItemX,
  itemHeight,
  itemWidth,
  itemY,
  markdown,
  paragraphFontSize,
  paragraphLineHeight,
  scrollOffsetY,
  selectedLength,
  selectionEnd,
  selectionStart,
}: TextSelectionAnchorOptions): MarkdownSelectionAnchor {
  const startsAtLineStart = selectionStartsMarkdownLine(markdown, selectionStart);
  const estimatedVisualPosition = estimateVisualPosition(markdown, selectionStart, itemWidth, paragraphFontSize, paragraphLineHeight);
  const startsAtEstimatedVisualLineStart = estimatedVisualPosition.x <= estimatedVisualPosition.averageCharacterWidth * 2;
  const caretLooksLikePreviousLineEnd =
    startsAtEstimatedVisualLineStart &&
    caretRect.x >= itemWidth - estimatedVisualPosition.averageCharacterWidth * 8;
  const shouldUseEstimatedVisualPosition = startsAtLineStart || caretLooksLikePreviousLineEnd;
  const selectionX = shouldUseEstimatedVisualPosition ? estimatedVisualPosition.x : caretRect.x;
  const selectionY = startsAtLineStart
    ? countLineBreaksBefore(markdown, selectionStart) * paragraphLineHeight
    : caretLooksLikePreviousLineEnd
      ? estimatedVisualPosition.y
      : caretRect.y;
  const estimatedSelectionWidth = estimateSelectionWidth(markdown, selectionStart, selectionEnd, paragraphFontSize);
  const selectionWidth = shouldUseEstimatedVisualPosition
    ? estimatedSelectionWidth
    : Math.max(caretRect.width, 1);

  return {
    blockId,
    height: Math.max(caretRect.height, paragraphLineHeight),
    itemHeight,
    itemWidth,
    itemX: contentItemX,
    itemY: itemY + scrollOffsetY,
    kind: "textSelection",
    selectedLength,
    width: selectionWidth,
    x: contentItemX + selectionX,
    y: itemY + selectionY + scrollOffsetY,
  };
}
