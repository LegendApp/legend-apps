import { GlassEffectView } from "@legend-desktop/glass-effect-view";
import { Text, View } from "react-native";
import { styles } from "./shared";

export function GlassEffectViewExample() {
  return (
    <View style={styles.visualPanel}>
      <GlassEffectView glassStyle="regular" style={styles.glassPreview}>
        <Text style={styles.panelTitle}>Glass Effect View</Text>
        <Text style={styles.bodyText}>Native visual effect container</Text>
      </GlassEffectView>
    </View>
  );
}
