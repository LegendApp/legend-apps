import type { DiffDocument, DiffRenderRow, DiffSideBySideRenderRow } from "@legend-apps/diff-parser";
import { useValue } from "@legendapp/state/react";
import { Pressable, Text } from "react-native";
import type { Observable } from "@legendapp/state";
import type { DiffRowRenderState } from "../viewer/DiffRows";
import type { WorkflowGutter } from "./workflowReview";

export function WorkflowGutterMarkers({ gutter, rowRender$, index, row, projectedRow, sideBySide }: {
  gutter: WorkflowGutter; rowRender$: Observable<DiffRowRenderState>; index: number;
  row?: DiffRenderRow; projectedRow?: DiffSideBySideRenderRow; sideBySide: boolean;
}) {
  const markers = useValue(() => {
    if (!Object.keys(gutter.comments$.get(true)).length) return [];
    const document = rowRender$.document.current.get() as DiffDocument | null;
    const projected = sideBySide ? projectedRow ?? document?.getSideBySideRow(index, Array.from(rowRender$.document.collapsedFileIndexList.get())) : undefined;
    const unified = sideBySide ? undefined : row ?? document?.getPlainRows(index, 1)[0];
    return (["old", "new"] as const).flatMap(side => {
      const line = projected ? side === "old" ? projected.oldRowVisible && projected.oldRow : projected.newRowVisible && projected.newRow : unified;
      const found = line ? gutter.comments$[`${line.fileIndex}:${side}:${side === "old" ? line.oldLineNumber : line.newLineNumber}`].get() ?? [] : [];
      return found.length ? [{ side, comments: found }] : [];
    });
  });
  return <>
    {markers.map(({ side, comments }) => <Pressable key={side} accessibilityRole="button" accessibilityLabel={`${comments.length} workflow comment${comments.length === 1 ? "" : "s"}, ${side} line ${comments[0].ref.startLine}`} onPress={() => gutter.onOpen(comments[0])}
      style={{ position: "absolute", zIndex: 1, top: 0, bottom: 0, left: side === "old" ? 2 : sideBySide ? "50%" : 48, width: 14, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 12, color: comments.some(comment => comment.severity === "error") ? "#e5484d" : comments.some(comment => comment.severity === "warn") ? "#d99a20" : "#3987e8" }}>●</Text>
    </Pressable>)}
  </>;
}
