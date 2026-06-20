import type { CaretRect } from "react-native-enriched-markdown";
import type { MarkdownSelectionAnchor } from "./types";

type TextSelectionAnchorOptions = {
  blockId?: string;
  caretRect: CaretRect;
  contentItemX: number;
  itemHeight: number;
  itemWidth: number;
  itemY: number;
  paragraphLineHeight: number;
  scrollOffsetY: number;
  selectedLength: number;
};

export function resolveTextSelectionAnchor({
  blockId,
  caretRect,
  contentItemX,
  itemHeight,
  itemWidth,
  itemY,
  paragraphLineHeight,
  scrollOffsetY,
  selectedLength,
}: TextSelectionAnchorOptions): MarkdownSelectionAnchor {
  return {
    blockId,
    height: Math.max(caretRect.height, paragraphLineHeight),
    itemHeight,
    itemWidth,
    itemX: contentItemX,
    itemY: itemY + scrollOffsetY,
    kind: "textSelection",
    selectedLength,
    width: Math.max(caretRect.width, 1),
    x: contentItemX + caretRect.x,
    y: itemY + caretRect.y + scrollOffsetY,
  };
}
