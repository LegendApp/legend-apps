import type { PresentationTemplateProps } from "@legend-apps/presentation";
import { StyleSheet, Text, View } from "react-native";

export default function Frame({ children, deck, slide }: PresentationTemplateProps) {
  return (
    <View style={styles.frame}>
      <View style={styles.header}>
        <Text style={styles.deckTitle}>{deck.title}</Text>
        {typeof slide.section === "string" && <Text style={styles.section}>{slide.section}</Text>}
      </View>
      <View style={styles.content}>{children}</View>
      <View style={styles.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  accent: { backgroundColor: "#60a5fa", borderRadius: 4, height: 8, width: 180 },
  content: { flex: 1, justifyContent: "center" },
  deckTitle: { color: "#94a3b8", fontSize: 24, fontWeight: "600", letterSpacing: 1 },
  frame: { flex: 1, paddingHorizontal: 120, paddingVertical: 72 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  section: { color: "#60a5fa", fontSize: 22, fontWeight: "700", textTransform: "uppercase" },
});
