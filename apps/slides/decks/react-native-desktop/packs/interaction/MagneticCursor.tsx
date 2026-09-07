import { StyleSheet, Text, View } from "react-native";
import { effectAmount, effectDuration, type EffectProfileProps } from "../shared/effectProfile";
import { useEffectTime } from "../shared/effectRuntime";

const actions = [
  { color: "#67e8f9", detail: "Open a history", label: "Browse", x: 210, y: 150 },
  { color: "#818cf8", detail: "Find native code", label: "Inspect", x: 650, y: 300 },
  { color: "#fb7185", detail: "Verify the result", label: "Test", x: 1110, y: 120 },
];

export function MagneticCursor({
  durationSeconds,
  intensity = "heavy",
  previewProgress = 0.62,
  tempo = "slow",
}: EffectProfileProps) {
  const duration = effectDuration(tempo, durationSeconds, 7.4, 3.8);
  const amount = effectAmount(intensity, 0.35, 1);
  const time = useEffectTime(duration * previewProgress);
  const angle = time / duration * Math.PI * 2;
  const pointerX = 810 + Math.cos(angle) * 620;
  const pointerY = 250 + Math.sin(angle * 1.35) * 170;

  return (
    <View style={styles.frame}>
      <Text style={styles.instructions}>POINTER-PROXIMITY FIELD</Text>
      {actions.map((action) => {
        const centerX = action.x + 170;
        const centerY = action.y + 80;
        const dx = pointerX - centerX;
        const dy = pointerY - centerY;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const pull = Math.max(0, 1 - distance / 540) * amount;
        return (
          <View
            key={action.label}
            style={[
              styles.action,
              {
                borderColor: pull > 0.4 ? action.color : "#334155",
                left: action.x,
                shadowColor: action.color,
                shadowOpacity: pull * 0.65,
                top: action.y,
                transform: [
                  { translateX: dx / distance * pull * 76 },
                  { translateY: dy / distance * pull * 54 },
                  { rotate: `${dx / 520 * pull * 3}deg` },
                  { scale: 1 + pull * 0.09 },
                ],
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: action.color }]} />
            <Text style={styles.actionLabel}>{action.label}</Text>
            <Text style={styles.actionDetail}>{action.detail}</Text>
          </View>
        );
      })}
      <View style={[styles.pointerHalo, { left: pointerX - 46, top: pointerY - 46 }]} />
      <View style={[styles.pointer, { left: pointerX - 10, top: pointerY - 10 }]} />
      <Text style={styles.caption}>Small attraction feels responsive. Heavy attraction becomes the presentation.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { backgroundColor: "#08111f", borderRadius: 24, borderWidth: 2, height: 160, padding: 26, position: "absolute", shadowRadius: 26, width: 340 },
  actionDetail: { color: "#94a3b8", fontSize: 19, marginTop: 8 },
  actionLabel: { color: "#f8fafc", fontSize: 34, fontWeight: "800", marginTop: 14 },
  caption: { bottom: 2, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
  icon: { borderRadius: 7, height: 14, width: 54 },
  instructions: { color: "#67e8f9", fontSize: 17, fontWeight: "800", left: 48, letterSpacing: 4, position: "absolute", top: 20 },
  pointer: { backgroundColor: "#f8fafc", borderColor: "#0f172a", borderRadius: 10, borderWidth: 3, height: 20, position: "absolute", shadowColor: "#67e8f9", shadowOpacity: 1, shadowRadius: 15, width: 20 },
  pointerHalo: { borderColor: "rgba(103, 232, 249, 0.26)", borderRadius: 46, borderWidth: 2, height: 92, position: "absolute", width: 92 },
});
