import { StyleSheet, Text, View } from "react-native";
import { useEffectTime } from "../shared/effectRuntime";

type FrameBudgetProps = {
  budgetMs?: number;
  cycleSeconds?: number;
  heavyWorkMs?: number;
  lightWorkMs?: number;
};

const frames = 8;
const timelineWidth = 1420;
const frameWidth = timelineWidth / frames;

function BudgetRow({
  budgetMs,
  color,
  label,
  playhead,
  workMs,
}: {
  budgetMs: number;
  color: string;
  label: string;
  playhead: number;
  workMs: number;
}) {
  const missed = workMs > budgetMs;

  return (
    <View style={styles.budgetRow}>
      <View style={styles.rowHeading}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.workValue, { color }]}>{workMs.toFixed(0)} ms work</Text>
      </View>
      <View style={styles.timeline}>
        {Array.from({ length: frames }, (_, index) => {
          const current = Math.floor(playhead * frames) === index;
          const workWidth = Math.min(frameWidth * 1.8, frameWidth * workMs / budgetMs);
          const hasWork = !missed || index % 2 === 0;
          const withinBudgetWidth = Math.min(frameWidth - 16, workWidth);
          const overrunWidth = Math.max(0, workWidth - withinBudgetWidth);
          return (
            <View key={index} style={[styles.frameCell, current && { backgroundColor: `${color}14` }]}>
              <Text style={styles.frameNumber}>{index + 1}</Text>
              {hasWork && <View style={[styles.workBlock, { backgroundColor: color, width: withinBudgetWidth }]} />}
              {hasWork && missed && <View style={[styles.overrunBlock, { backgroundColor: color, width: overrunWidth }]} />}
              {missed && <View style={styles.budgetBoundary} />}
            </View>
          );
        })}
        <View style={[styles.playhead, { backgroundColor: color, left: Math.min(timelineWidth - 3, playhead * timelineWidth), shadowColor: color }]} />
      </View>
    </View>
  );
}

export function FrameBudget({
  budgetMs = 16.7,
  cycleSeconds = 4.4,
  heavyWorkMs = 24,
  lightWorkMs = 6,
}: FrameBudgetProps) {
  const time = useEffectTime(3.7);
  const playhead = time % cycleSeconds / cycleSeconds;
  const stepped = Math.floor(playhead * frames) / (frames - 1);

  return (
    <View style={styles.frame}>
      <View style={styles.header}>
        <Text style={styles.measure}>{budgetMs.toFixed(1)} MS FRAME BUDGET</Text>
        <Text style={styles.scale}>Illustrative workload</Text>
      </View>
      <View style={styles.preview}>
        <Text style={styles.previewLabel}>RESULT</Text>
        <View style={styles.previewTrack}>
          <View style={[styles.cursor, styles.smoothCursor, { left: playhead * 1050 }]} />
          <View style={[styles.cursor, styles.jankCursor, { left: stepped * 1050 }]} />
        </View>
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: "#67e8f9" }]} />
          <Text style={styles.legendText}>work fits</Text>
          <View style={[styles.legendDot, { backgroundColor: "#fb7185" }]} />
          <Text style={styles.legendText}>work crosses the boundary</Text>
        </View>
      </View>
      <BudgetRow budgetMs={budgetMs} color="#67e8f9" label="Light frame" playhead={playhead} workMs={lightWorkMs} />
      <BudgetRow budgetMs={budgetMs} color="#fb7185" label="Heavy frame" playhead={playhead} workMs={heavyWorkMs} />
      <Text style={styles.caption}>A reusable timing explanation, not a measurement from the comparison.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  budgetRow: { flexDirection: "row", height: 112, marginTop: 18 },
  caption: { bottom: 4, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  cursor: { borderRadius: 14, height: 28, position: "absolute", top: 12, width: 28 },
  frame: { height: 580, overflow: "hidden", paddingHorizontal: 40, position: "relative", width: 1680 },
  frameCell: { borderLeftColor: "#334155", borderLeftWidth: 1, height: 82, overflow: "visible", position: "relative", width: frameWidth },
  frameNumber: { color: "#475569", fontSize: 13, left: 8, position: "absolute", top: 7 },
  header: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", paddingRight: 40, paddingTop: 18 },
  jankCursor: { backgroundColor: "#fb7185", top: 52 },
  legend: { alignItems: "center", flexDirection: "row", gap: 12, position: "absolute", right: 0, top: 25 },
  legendDot: { borderRadius: 6, height: 12, marginLeft: 18, width: 12 },
  legendText: { color: "#94a3b8", fontSize: 17 },
  measure: { color: "#67e8f9", fontSize: 18, fontWeight: "700", letterSpacing: 4 },
  budgetBoundary: { backgroundColor: "rgba(251, 113, 133, 0.24)", bottom: 0, position: "absolute", right: -1, top: 0, width: 4 },
  playhead: { height: 92, position: "absolute", shadowOpacity: 0.9, shadowRadius: 9, top: -5, width: 3, zIndex: 4 },
  preview: { height: 132, marginLeft: 200, marginTop: 16, position: "relative", width: timelineWidth },
  previewLabel: { color: "#64748b", fontSize: 14, fontWeight: "700", letterSpacing: 3, left: -200, position: "absolute", top: 29 },
  previewTrack: { backgroundColor: "#0f172a", borderRadius: 36, height: 92, overflow: "hidden", width: 1080 },
  rowHeading: { justifyContent: "center", width: 200 },
  rowLabel: { color: "#f8fafc", fontSize: 25, fontWeight: "700" },
  scale: { color: "#64748b", fontSize: 18 },
  smoothCursor: { backgroundColor: "#67e8f9" },
  timeline: { borderBottomColor: "#334155", borderBottomWidth: 1, flexDirection: "row", height: 82, position: "relative", width: timelineWidth },
  overrunBlock: { bottom: 14, height: 22, left: frameWidth - 8, opacity: 0.42, position: "absolute", zIndex: 2 },
  workBlock: { bottom: 14, height: 22, left: 8, opacity: 0.86, position: "absolute" },
  workValue: { fontSize: 18, fontVariant: ["tabular-nums"], marginTop: 5 },
});
