import { StyleSheet, Text, View } from "react-native";
import { stage, useEffectTime } from "../shared/effectRuntime";

type LatencyRaceProps = {
  cycleSeconds?: number;
  fastDuration?: number;
  fastLabel?: string;
  fastValue?: number;
  slowDuration?: number;
  slowLabel?: string;
  slowValue?: number;
};

const trackWidth = 1260;
const cardWidth = 270;
const travel = trackWidth - cardWidth;

function RaceLane({
  color,
  duration,
  label,
  loopTime,
  value,
}: {
  color: string;
  duration: number;
  label: string;
  loopTime: number;
  value: number;
}) {
  const progress = stage(loopTime, 0.55, duration);
  const ready = stage(loopTime, 0.55 + duration, 0.18);

  return (
    <View style={styles.lane}>
      <View style={styles.laneHeading}>
        <Text style={styles.laneLabel}>{label}</Text>
        <Text style={[styles.laneValue, { color }]}>{value.toFixed(0)} ms</Text>
      </View>
      <View style={styles.track}>
        {Array.from({ length: 11 }, (_, index) => (
          <View key={index} style={[styles.tick, { left: index * trackWidth / 10 }]} />
        ))}
        {Array.from({ length: 5 }, (_, index) => {
          const trailProgress = Math.max(0, progress - 0.028 * (index + 1));
          return (
            <View
              key={index}
              style={[
                styles.trail,
                {
                  backgroundColor: color,
                  left: trailProgress * travel,
                  opacity: progress < 0.03 ? 0 : 0.16 - index * 0.025,
                  width: cardWidth - index * 22,
                },
              ]}
            />
          );
        })}
        <View style={[styles.appCard, { borderColor: color, left: progress * travel, shadowColor: color }]}>
          <View style={styles.titlebar}>
            <View style={[styles.statusDot, { backgroundColor: color }]} />
            <Text style={styles.cardTitle}>Chat History</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.sidebar} />
            <View style={styles.contentLines}>
              <View style={[styles.contentLine, { width: 112 }]} />
              <View style={[styles.contentLine, { width: 82 }]} />
            </View>
          </View>
          <View style={[styles.ready, { backgroundColor: color, opacity: ready, transform: [{ scale: 0.8 + ready * 0.2 }] }]}>
            <Text style={styles.readyText}>READY</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function LatencyRace({
  cycleSeconds = 5.4,
  fastDuration = 1.1,
  fastLabel = "React Native",
  fastValue = 394,
  slowDuration = 2.2,
  slowLabel = "Electron",
  slowValue = 792,
}: LatencyRaceProps) {
  const time = useEffectTime(4.4);
  const loopTime = time % cycleSeconds;
  const reset = stage(loopTime, cycleSeconds - 0.42, 0.32);

  return (
    <View style={[styles.frame, { opacity: 1 - reset }]}>
      <View style={styles.header}>
        <Text style={styles.measure}>STABLE FIRST CONTENT</Text>
        <Text style={styles.scale}>Measured time, expanded for the animation</Text>
      </View>
      <RaceLane color="#67e8f9" duration={fastDuration} label={fastLabel} loopTime={loopTime} value={fastValue} />
      <RaceLane color="#818cf8" duration={slowDuration} label={slowLabel} loopTime={loopTime} value={slowValue} />
      <Text style={styles.caption}>The faster result arrives, stops and stays readable.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  appCard: {
    backgroundColor: "#07101f",
    borderRadius: 15,
    borderWidth: 2,
    height: 94,
    overflow: "hidden",
    position: "absolute",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    top: 0,
    width: cardWidth,
  },
  caption: { bottom: 4, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  cardBody: { bottom: 0, flexDirection: "row", left: 0, position: "absolute", right: 0, top: 28 },
  cardTitle: { color: "#cbd5e1", fontSize: 13 },
  contentLine: { backgroundColor: "#334155", borderRadius: 3, height: 8, marginBottom: 9 },
  contentLines: { paddingHorizontal: 16, paddingTop: 15 },
  frame: { height: 580, paddingHorizontal: 40, position: "relative", width: 1680 },
  header: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", paddingRight: 40, paddingTop: 22 },
  lane: { flexDirection: "row", height: 190, marginTop: 26 },
  laneHeading: { justifyContent: "center", paddingBottom: 34, width: 300 },
  laneLabel: { color: "#f8fafc", fontSize: 30, fontWeight: "700" },
  laneValue: { fontSize: 24, fontVariant: ["tabular-nums"], marginTop: 8 },
  measure: { color: "#67e8f9", fontSize: 18, fontWeight: "700", letterSpacing: 4 },
  ready: { alignItems: "center", borderRadius: 10, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 7, position: "absolute", right: 8, top: 8 },
  readyText: { color: "#020617", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  scale: { color: "#64748b", fontSize: 18 },
  sidebar: { backgroundColor: "#12243d", width: 74 },
  statusDot: { borderRadius: 5, height: 10, width: 10 },
  tick: { backgroundColor: "#243248", bottom: -13, height: 12, position: "absolute", width: 2 },
  titlebar: { alignItems: "center", backgroundColor: "#0f172a", flexDirection: "row", gap: 8, height: 28, paddingHorizontal: 10 },
  track: { borderBottomColor: "#334155", borderBottomWidth: 2, height: 108, position: "relative", width: trackWidth },
  trail: { borderRadius: 14, height: 76, position: "absolute", top: 9 },
});
