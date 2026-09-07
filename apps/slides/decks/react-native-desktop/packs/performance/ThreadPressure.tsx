import { StyleSheet, Text, View } from "react-native";
import { effectAmount, effectDuration, loopTime, type EffectProfileProps } from "../shared/effectProfile";
import { useEffectTime } from "../shared/effectRuntime";

const trackWidth = 1190;
const tasks = [0.08, 0.2, 0.34, 0.51, 0.63, 0.8];

export function ThreadPressure({
  durationSeconds,
  intensity = "heavy",
  previewProgress = 0.68,
  tempo = "fast",
}: EffectProfileProps) {
  const duration = effectDuration(tempo, durationSeconds, 5.2, 3.2);
  const pressure = effectAmount(intensity, 0.46, 1);
  const time = useEffectTime(duration * previewProgress);
  const progress = loopTime(time, duration, 0.8) / duration;
  const cycle = Math.min(1, progress);
  const stallStart = 0.37;
  const stallEnd = stallStart + 0.18 * pressure;
  const jsProgress = cycle < stallStart
    ? cycle
    : cycle < stallEnd
      ? stallStart
      : stallStart + (cycle - stallEnd) * (1 - stallStart) / (1 - stallEnd);
  const warning = cycle >= stallStart && cycle < stallEnd;

  return (
    <View style={styles.frame}>
      <View style={styles.header}>
        <Text style={styles.measure}>SAME MOMENT, TWO EXECUTION PATHS</Text>
        <Text style={[styles.status, warning && styles.statusWarning]}>{warning ? "JS BUSY" : "RESPONSIVE"}</Text>
      </View>
      <View style={styles.lane}>
        <View style={styles.laneHeading}><Text style={styles.laneTitle}>JS-driven pulse</Text><Text style={styles.laneDetail}>pauses behind work</Text></View>
        <View style={styles.track}>
          {tasks.map((position, index) => <View key={position} style={[styles.task, { left: position * trackWidth, opacity: 0.28 + pressure * 0.5, width: 34 + (index % 3) * 24 }]} />)}
          <View style={[styles.cursor, styles.jsCursor, { left: Math.min(trackWidth - 30, jsProgress * trackWidth) }]} />
        </View>
      </View>
      <View style={styles.lane}>
        <View style={styles.laneHeading}><Text style={styles.laneTitle}>Native animation</Text><Text style={styles.laneDetail}>keeps its own cadence</Text></View>
        <View style={styles.track}>
          <View style={[styles.nativeTrail, { width: Math.max(24, cycle * trackWidth) }]} />
          <View style={[styles.cursor, styles.nativeCursor, { left: Math.min(trackWidth - 30, cycle * trackWidth), transform: [{ scale: 0.82 + Math.sin(time * 8) * 0.12 }] }]} />
        </View>
      </View>
      <View style={styles.legend}><View style={styles.taskSample} /><Text style={styles.legendText}>illustrative JS work</Text><View style={styles.stallSample} /><Text style={styles.legendText}>pressure interval</Text></View>
      <Text style={styles.caption}>A timing explanation. It deliberately does not block the presentation thread.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { bottom: 2, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  cursor: { borderRadius: 18, height: 36, position: "absolute", shadowOpacity: 0.8, shadowRadius: 16, top: 27, width: 36 },
  frame: { height: 580, overflow: "hidden", paddingHorizontal: 40, position: "relative", width: 1680 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingRight: 20, paddingTop: 24 },
  jsCursor: { backgroundColor: "#fb7185", shadowColor: "#fb7185" },
  lane: { flexDirection: "row", height: 150, marginTop: 42 },
  laneDetail: { color: "#64748b", fontSize: 18, marginTop: 7 },
  laneHeading: { justifyContent: "center", width: 330 },
  laneTitle: { color: "#f8fafc", fontSize: 29, fontWeight: "700" },
  legend: { alignItems: "center", flexDirection: "row", gap: 12, marginLeft: 330, marginTop: 12 },
  legendText: { color: "#94a3b8", fontSize: 17, marginRight: 26 },
  measure: { color: "#67e8f9", fontSize: 18, fontWeight: "800", letterSpacing: 4 },
  nativeCursor: { backgroundColor: "#67e8f9", shadowColor: "#22d3ee" },
  nativeTrail: { backgroundColor: "rgba(103, 232, 249, 0.16)", borderRadius: 45, height: 90, left: 0, position: "absolute", top: 0 },
  stallSample: { backgroundColor: "#fb7185", height: 10, opacity: 0.4, width: 42 },
  status: { color: "#67e8f9", fontSize: 18, fontWeight: "800", letterSpacing: 3 },
  statusWarning: { color: "#fb7185" },
  task: { backgroundColor: "#fb7185", borderRadius: 5, height: 30, position: "absolute", top: 30 },
  taskSample: { backgroundColor: "#fb7185", borderRadius: 3, height: 10, opacity: 0.7, width: 42 },
  track: { backgroundColor: "#0f172a", borderColor: "#26344c", borderRadius: 45, borderWidth: 1, height: 90, overflow: "hidden", position: "relative", width: trackWidth },
});
