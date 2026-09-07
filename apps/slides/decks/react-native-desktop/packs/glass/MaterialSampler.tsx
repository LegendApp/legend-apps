import { StyleSheet, Text, View } from "react-native";
import { effectAmount, effectDuration, type EffectProfileProps } from "../shared/effectProfile";
import { useEffectTime } from "../shared/effectRuntime";

const materials = [
  { accent: "#67e8f9", label: "Frost", tint: "rgba(14, 116, 144, 0.34)" },
  { accent: "#a78bfa", label: "Prism", tint: "rgba(91, 33, 182, 0.34)" },
  { accent: "#fb7185", label: "Gel", tint: "rgba(190, 24, 93, 0.3)" },
  { accent: "#f8fafc", label: "Platform", tint: "rgba(226, 232, 240, 0.18)" },
];

export function MaterialSampler({
  durationSeconds,
  intensity = "heavy",
  previewProgress = 0.66,
  tempo = "slow",
}: EffectProfileProps) {
  const duration = effectDuration(tempo, durationSeconds, 7.8, 4.2);
  const amount = effectAmount(intensity, 0.34, 1);
  const time = useEffectTime(duration * previewProgress);
  const phase = time / duration;

  return (
    <View style={styles.frame}>
      <View style={styles.backdrop}>
        {Array.from({ length: 14 }, (_, index) => <View key={index} style={[styles.backdropLine, { opacity: 0.12 + index % 3 * 0.08, width: 110 + index % 5 * 54 }]} />)}
      </View>
      <View style={styles.cards}>
        {materials.map((material, index) => {
          const wave = Math.sin((phase * Math.PI * 2) + index * 0.9);
          const highlight = 18 + ((phase * 220 + index * 48) % 210);
          return (
            <View key={material.label} style={[styles.card, { backgroundColor: material.tint, borderColor: material.accent, transform: [{ translateY: wave * amount * 18 }, { rotate: `${wave * amount * 1.4}deg` }] }]}>
              <View style={[styles.caustic, { backgroundColor: material.accent, left: highlight, opacity: 0.07 + amount * 0.13, transform: [{ rotate: "18deg" }] }]} />
              <Text style={[styles.cardNumber, { color: material.accent }]}>0{index + 1}</Text>
              <Text style={styles.cardLabel}>{material.label}</Text>
              <Text style={styles.cardDetail}>{index === 3 ? "Ask the OS" : "Custom rendered material"}</Text>
              <View style={[styles.edge, { backgroundColor: material.accent, opacity: 0.28 + amount * 0.35 }]} />
            </View>
          );
        })}
      </View>
      <Text style={styles.caption}>Sample the material deliberately. Escalate only when the joke needs it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flexDirection: "row", flexWrap: "wrap", gap: 26, left: 60, position: "absolute", right: 60, top: 68 },
  backdropLine: { backgroundColor: "#67e8f9", borderRadius: 7, height: 14 },
  backdropLine2: { backgroundColor: "#818cf8" },
  caption: { bottom: 2, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  card: { borderRadius: 38, borderWidth: 2, height: 330, overflow: "hidden", padding: 28, shadowColor: "#020617", shadowOpacity: 0.72, shadowRadius: 28, width: 360 },
  cardDetail: { color: "#cbd5e1", fontSize: 19, marginTop: 18 },
  cardLabel: { color: "#f8fafc", fontSize: 44, fontWeight: "800", marginTop: 94 },
  cardNumber: { fontSize: 17, fontWeight: "800", letterSpacing: 3 },
  cards: { flexDirection: "row", gap: 34, justifyContent: "center", paddingTop: 112 },
  caustic: { bottom: -70, position: "absolute", top: -70, width: 72 },
  edge: { bottom: 0, height: 6, left: 0, position: "absolute", right: 0 },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
});
