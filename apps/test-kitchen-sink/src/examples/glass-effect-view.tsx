import { GlassView } from "@legendapp/spark/ui/glass";
import { Text, View } from "react-native";
import { styles } from "./shared";

export function GlassEffectViewExample() {
  return (
    <View style={styles.visualPanel}>
      <GlassView glassStyle="regular" style={styles.glassPreview}>
        <Text style={styles.panelTitle}>Glass Effect View</Text>
        <Text style={styles.bodyText}>Native visual effect container</Text>
      </GlassView>
    </View>
  );
}
