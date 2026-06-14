import type { MarkdownSelectionAnchor } from "@legend-desktop/markdown-document";

export type MarkdownFloatingSurfaceCoordinateSpace = "content" | "item";
export type MarkdownFloatingSurfacePlacement = "above" | "below";

const floatingToolbarEstimatedHeight = 40;
const floatingToolbarGap = 6;
const toolbarGeometryDebugId = "markdown-toolbar-geometry-v1";
let toolbarGeometryDebugSeq = 0;

function logToolbarGeometryDebug(event: string, data: Record<string, unknown>) {
  console.info(`${Date.now()} [debug-log markdown-toolbar ${toolbarGeometryDebugId}] ${event}`, {
    seq: ++toolbarGeometryDebugSeq,
    ...data,
  });
}

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
    ? Math.max(coordinateSpace === "content" ? 0 : -floatingToolbarEstimatedHeight, surfaceTop - floatingToolbarEstimatedHeight - floatingToolbarGap)
    : Math.max(0, surfaceTop + anchor.height + floatingToolbarGap);

  const frame = {
    left: surfaceLeft,
    top,
    width: surfaceWidth,
  };
  logToolbarGeometryDebug("surface-frame", {
    anchor: {
      blockId: anchor.blockId,
      height: anchor.height,
      itemHeight: anchor.itemHeight,
      itemWidth: anchor.itemWidth,
      itemX: anchor.itemX,
      itemY: anchor.itemY,
      kind: anchor.kind,
      width: anchor.width,
      x: anchor.x,
      y: anchor.y,
    },
    coordinateSpace,
    frame,
    itemTop,
    placement,
    selectionTop,
    surfaceTop,
  });

  return frame;
}
