import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { runOnJS, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { createFrameCadence, sampleFrameCadence } from "./frameCadence";
import { slideReferencesVisible } from "./slideReferences";

/** Shares the existing I-key development overlay toggle; never mounts in release. */
export function PerformanceHUD() {
  const visible = useValue(() => slideReferencesVisible(typeof __DEV__ !== "undefined" && __DEV__));
  return visible ? <FrameCadenceHUD /> : null;
}

function FrameCadenceHUD() {
  const [label, setLabel] = useState("UI FPS — · avg frame — ms");
  const sample = useSharedValue(createFrameCadence());
  const publish = useCallback((fps: number, averageMs: number) => {
    setLabel(`UI FPS ${fps.toFixed(1)} · avg frame ${averageMs.toFixed(1)} ms`);
  }, []);
  const frame = useFrameCallback(({ timestamp }) => {
    if (sampleFrameCadence(sample.value, timestamp)) {
      runOnJS(publish)(sample.value.fps, sample.value.averageMs);
    }
  }, false);
  useEffect(() => {
    frame.setActive(true);
    return () => frame.setActive(false);
  }, [frame]);
  return <SafeAreaView pointerEvents="none" style={styles.safeArea}>
    <View pointerEvents="none" style={styles.panel}>
      <Text style={styles.text}>{label}</Text>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { ...StyleSheet.absoluteFillObject, zIndex: 100, alignItems: "flex-end" },
  panel: { margin: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.7)" },
  text: { fontFamily: "Menlo", fontSize: 12, color: "#d1fae5" },
});
