import type { DiffDocument, DiffRenderRow } from "@legend-apps/diff-parser";
import { useValue } from "@legendapp/state/react";
import { Pressable, Text, View } from "react-native";
import type { Observable } from "@legendapp/state";
import type { DiffRowRenderState } from "../viewer/DiffRows";
import type { WorkflowGutter } from "./workflowReview";

export function WorkflowGutterMarkers({ gutter, rowRender$, sourceStart, sourceEnd, row, sideBySide }: {
  gutter: WorkflowGutter; rowRender$: Observable<DiffRowRenderState>; sourceStart: number; sourceEnd: number;
  row?: DiffRenderRow; sideBySide: boolean;
}) {
  const markers = useValue(() => {
    if (!Object.keys(gutter.comments$.get(true)).length) return [];
    const document = rowRender$.document.current.get() as DiffDocument | null;
    const rows = row ? [row] : document?.getPlainRows(sourceStart, sourceEnd - sourceStart) ?? [];
    return (["old", "new"] as const).flatMap(side => {
      const found = rows.flatMap(line => gutter.comments$[`${line.fileIndex}:${side}:${side === "old" ? line.oldLineNumber : line.newLineNumber}`].get() ?? []);
      return found.length ? [{ side, comments: found }] : [];
    });
  });
  return <View pointerEvents="box-none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}>
    {markers.map(({ side, comments }) => <Pressable key={side} accessibilityRole="button" accessibilityLabel={`${comments.length} workflow comment${comments.length === 1 ? "" : "s"}, ${side} line ${comments[0].ref.startLine}`} onPress={() => gutter.onOpen(comments[0])}
      style={{ position: "absolute", top: 0, bottom: 0, left: side === "old" ? 2 : sideBySide ? "50%" : 48, width: 14, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 12, color: comments.some(comment => comment.severity === "error") ? "#e5484d" : comments.some(comment => comment.severity === "warn") ? "#d99a20" : "#3987e8" }}>●</Text>
    </Pressable>)}
  </View>;
}
