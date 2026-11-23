import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSymbolColor } from "../FileRow";
import { recentLabels } from "../gitRecents";

export function GitStartScreen({ recents, onOpen, onOpenRecent }: {
  recents: readonly string[];
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
}) {
  const labels = recentLabels(recents);
  const muted = useSymbolColor("secondary");
  return (
    <ScrollView automaticallyAdjustContentInsets={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.page}>
        <View style={styles.brand}>
          <View style={styles.icon}>
            <SFSymbol name="point.3.connected.trianglepath.dotted" color="#ffffff" size={28} />
          </View>
          <Text style={styles.title}>Legend Git</Text>
        </View>
        <View style={styles.hero}>
          <SFSymbol name="point.3.connected.trianglepath.dotted" color="#b7d2ff" size={76} />
        </View>
        <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
          <SFSymbol name="folder" color="#ffffff" size={20} />
          <Text style={styles.openLabel}>Open Repository…</Text>
        </Pressable>
        {recents.length > 0 ? (
          <View style={styles.recents}>
            <Text style={styles.heading}>Recent Repositories</Text>
            <View style={styles.list}>
              {recents.map((path, index) => (
                <Pressable accessibilityRole="button" key={path} onPress={() => onOpenRecent(path)}
                  style={({ pressed }) => [styles.row, index > 0 && styles.divider, pressed && styles.pressed]}>
                  <SFSymbol name="folder" color={muted} size={22} />
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.label}>{labels[index]}</Text>
                    <Text numberOfLines={1} style={styles.path}>{path}</Text>
                  </View>
                  <SFSymbol name="chevron.right" color={muted} size={14} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { alignItems: "center", paddingHorizontal: 48, paddingBottom: 34 },
  page: { width: "100%", maxWidth: 1080 },
  brand: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 76, gap: 14 },
  icon: { width: 46, height: 46, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#1f396f" },
  title: { fontSize: 34, fontWeight: "600", color: PlatformColor("labelColor") },
  hero: { aspectRatio: 4.8, borderRadius: 8, backgroundColor: "#192b4b", alignItems: "center", justifyContent: "center" },
  open: { alignSelf: "flex-start", marginTop: 14, paddingHorizontal: 16, height: 48, borderRadius: 7, flexDirection: "row", gap: 14, alignItems: "center", backgroundColor: "#1f396f" },
  openLabel: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  recents: { marginTop: 48, gap: 14 },
  heading: { fontSize: 20, fontWeight: "600", color: PlatformColor("labelColor") },
  list: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("controlBackgroundColor") },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: PlatformColor("separatorColor") },
  rowText: { flex: 1, gap: 2, minWidth: 0 },
  label: { color: PlatformColor("labelColor"), fontSize: 15, fontWeight: "700" },
  path: { color: PlatformColor("secondaryLabelColor"), fontSize: 13 },
});
