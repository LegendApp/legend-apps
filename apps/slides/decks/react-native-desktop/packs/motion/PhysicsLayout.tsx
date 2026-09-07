import { StyleSheet, Text, View } from "react-native";
import { effectAmount, effectDuration, loopTime, type EffectProfileProps } from "../shared/effectProfile";
import { useEffectTime } from "../shared/effectRuntime";

const panels = [
  { color: "#67e8f9", height: 150, label: "Sidebar", left: 70, top: 105, width: 330 },
  { color: "#818cf8", height: 150, label: "Toolbar", left: 430, top: 105, width: 1090 },
  { color: "#22d3ee", height: 250, label: "Conversation", left: 430, top: 285, width: 700 },
  { color: "#a78bfa", height: 250, label: "Inspector", left: 1160, top: 285, width: 360 },
  { color: "#fb7185", height: 250, label: "Navigation", left: 70, top: 285, width: 330 },
];

function spring(value: number, bounce: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return 1 - Math.exp(-7 * clamped) * Math.cos(clamped * Math.PI * bounce);
}

export function PhysicsLayout({
  durationSeconds,
  intensity = "heavy",
  previewProgress = 0.75,
  tempo = "fast",
}: EffectProfileProps) {
  const duration = effectDuration(tempo, durationSeconds, 6.5, 3.7);
  const amount = effectAmount(intensity, 0.38, 1);
  const time = useEffectTime(duration * previewProgress);
  const local = loopTime(time, duration, 1.1);

  return (
    <View style={styles.frame}>
      <Text style={styles.measure}>SPRING-CONSTRAINED LAYOUT</Text>
      {panels.map((panel, index) => {
        const start = duration * (0.06 + index * 0.055);
        const raw = (local - start) / (duration * 0.56);
        const settle = spring(raw, 5 + amount * 3);
        const clampedSettle = Math.max(0, settle);
        return (
          <View
            key={panel.label}
            style={[
              styles.panel,
              {
                borderColor: panel.color,
                height: panel.height,
                left: panel.left,
                opacity: Math.min(1, Math.max(0, raw * 3)),
                top: panel.top,
                transform: [
                  { translateY: (1 - clampedSettle) * (-440 - index * 75) },
                  { rotate: `${(1 - clampedSettle) * (index % 2 ? -13 : 13) * amount}deg` },
                  { scale: 0.86 + Math.min(1, clampedSettle) * 0.14 },
                ],
                width: panel.width,
              },
            ]}
          >
            <View style={[styles.panelMark, { backgroundColor: panel.color }]} />
            <Text style={styles.panelLabel}>{panel.label}</Text>
          </View>
        );
      })}
      <Text style={styles.caption}>Panels can feel physical without turning the application into a pinball table.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { bottom: 2, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
  measure: { color: "#67e8f9", fontSize: 17, fontWeight: "800", left: 70, letterSpacing: 4, position: "absolute", top: 28 },
  panel: { alignItems: "center", backgroundColor: "rgba(7, 16, 31, 0.93)", borderRadius: 24, borderWidth: 2, flexDirection: "row", paddingHorizontal: 28, position: "absolute", shadowColor: "#020617", shadowOpacity: 0.8, shadowRadius: 24 },
  panelLabel: { color: "#f8fafc", fontSize: 27, fontWeight: "700", marginLeft: 18 },
  panelMark: { borderRadius: 7, height: 14, width: 42 },
});
