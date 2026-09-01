import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function InteractiveCounter() {
  const [count, setCount] = useState(0);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Audience interactions are normal React state</Text>
      <Text style={styles.value}>{count}</Text>
      <Pressable accessibilityRole="button" onPress={() => setCount((value) => value + 1)} style={styles.button}>
        <Text style={styles.buttonText}>Add one</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: "#2563eb", borderRadius: 16, paddingHorizontal: 28, paddingVertical: 16 },
  buttonText: { color: "#fff", fontSize: 28, fontWeight: "700" },
  card: { alignItems: "center", backgroundColor: "#1e293b", borderRadius: 28, gap: 20, padding: 44 },
  label: { color: "#cbd5e1", fontSize: 28 },
  value: { color: "#f8fafc", fontSize: 96, fontVariant: ["tabular-nums"], fontWeight: "800" },
});
