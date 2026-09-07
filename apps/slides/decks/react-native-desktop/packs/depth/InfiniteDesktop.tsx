import { StyleSheet, Text, View } from "react-native";
import { effectAmount, effectDuration, type EffectProfileProps } from "../shared/effectProfile";
import { useEffectTime } from "../shared/effectRuntime";

const depthCount = 10;

export function InfiniteDesktop({
  durationSeconds,
  intensity = "heavy",
  previewProgress = 0.58,
  tempo = "fast",
}: EffectProfileProps) {
  const duration = effectDuration(tempo, durationSeconds, 8.4, 4.2);
  const amount = effectAmount(intensity, 0.38, 1);
  const time = useEffectTime(duration * previewProgress);
  const phase = time / duration;

  return (
    <View style={styles.frame}>
      <Text style={styles.measure}>RECURSION DEPTH {depthCount}</Text>
      {Array.from({ length: depthCount }, (_, index) => {
        const shifted = (index + phase * (2 + amount * 4)) % depthCount;
        const scale = 1 - shifted * 0.075;
        const brightness = 1 - shifted / depthCount;
        return (
          <View
            key={index}
            style={[
              styles.window,
              {
                borderColor: index % 2 ? "#818cf8" : "#67e8f9",
                opacity: 0.16 + brightness * 0.72,
                transform: [
                  { perspective: 1200 },
                  { scale },
                  { translateX: shifted * amount * 18 },
                  { translateY: shifted * amount * 11 },
                  { rotateZ: `${shifted * amount * 0.48}deg` },
                ],
                zIndex: depthCount - Math.floor(shifted),
              },
            ]}
          >
            <View style={styles.titlebar}><View style={styles.dot} /><View style={[styles.dot, { opacity: 0.65 }]} /><View style={[styles.dot, { opacity: 0.35 }]} /><Text style={styles.title}>React Native Desktop</Text></View>
            <View style={styles.body}><View style={styles.sidebar} /><View style={styles.content}><View style={styles.line} /><View style={[styles.line, { width: "58%" }]} /></View></View>
          </View>
        );
      })}
      <View style={styles.vanish}><Text style={styles.vanishText}>∞</Text></View>
      <Text style={styles.caption}>A desktop inside a desktop, accelerating exactly as much as good judgment allows.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, flexDirection: "row" },
  caption: { bottom: 2, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute", zIndex: 30 },
  content: { flex: 1, gap: 18, padding: 42 },
  dot: { backgroundColor: "#67e8f9", borderRadius: 6, height: 12, width: 12 },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
  line: { backgroundColor: "#334155", borderRadius: 7, height: 14, width: "82%" },
  measure: { color: "#67e8f9", fontSize: 17, fontWeight: "800", left: 48, letterSpacing: 4, position: "absolute", top: 24, zIndex: 30 },
  sidebar: { backgroundColor: "#111c30", width: 280 },
  title: { color: "#cbd5e1", fontSize: 17, marginLeft: 14 },
  titlebar: { alignItems: "center", borderBottomColor: "#334155", borderBottomWidth: 1, flexDirection: "row", gap: 8, height: 52, paddingHorizontal: 18 },
  vanish: { alignItems: "center", backgroundColor: "rgba(2, 6, 23, 0.78)", borderColor: "#67e8f9", borderRadius: 42, borderWidth: 1, height: 84, justifyContent: "center", left: 798, position: "absolute", top: 250, width: 84, zIndex: 28 },
  vanishText: { color: "#67e8f9", fontSize: 50, fontWeight: "300" },
  window: { alignSelf: "center", backgroundColor: "#050b16", borderRadius: 26, borderWidth: 2, height: 420, left: 220, overflow: "hidden", position: "absolute", top: 84, width: 1240 },
});
