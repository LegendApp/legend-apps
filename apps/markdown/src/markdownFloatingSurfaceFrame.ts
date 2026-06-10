import type { MarkdownSelectionAnchor } from "@legend-desktop/markdown-document";

export type MarkdownFloatingSurfaceCoordinateSpace = "content" | "item";
export type MarkdownFloatingSurfacePlacement = "above" | "below";

export function getMarkdownFloatingSurfaceFrame({
  anchor,
  coordinateSpace = "item",
  placement = "above",
}: {
  anchor: MarkdownSelectionAnchor;
  coordinateSpace?: MarkdownFloatingSurfaceCoordinateSpace;
  placement?: MarkdownFloatingSurfacePlacement;
}) {
  const itemTop = anchor.itemY ?? anchor.y;
  const surfaceLeft = coordinateSpace === "content" ? anchor.itemX ?? anchor.x : 0;
  const surfaceWidth = coordinateSpace === "content" ? anchor.itemWidth ?? anchor.width : anchor.itemWidth ?? anchor.width;
  const selectionTop = anchor.y - itemTop;
  const surfaceTop = coordinateSpace === "content" ? anchor.y : selectionTop;
  const top = placement === "above"
    ? Math.max(coordinateSpace === "content" ? 0 : -26, surfaceTop - 56)
    : Math.max(0, surfaceTop + anchor.height + 6);

  return {
    left: surfaceLeft,
    top,
    width: surfaceWidth,
  };
}
