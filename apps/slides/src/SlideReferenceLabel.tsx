import { useValue } from "@legendapp/state/react";
import { StyleSheet, Text, View } from "react-native";
import { slidesState$ } from "./slidesStore";
import { slideReferencesVisible } from "./slideReferences";

export function SlideReferenceLabel({ targetIndex, targetStep, isPreview = false }: { targetIndex?: number; targetStep?: number; isPreview?: boolean }) {
  const visible = useValue(() => slideReferencesVisible(typeof __DEV__ !== "undefined" && __DEV__));
  const label = useValue(() => {
    const index = targetIndex ?? slidesState$.currentSlide.get();
    const slide = slidesState$.slides[index].metadata.get();
    if (!slide) return "";
    const step = targetStep ?? (isPreview ? 0 : slidesState$.currentStep.get());
    return `${index + 1}.${step + 1} ${slide.id || slide.referenceSlug || "slide"}`;
  });
  return visible && label ? <View pointerEvents="none" style={styles.label}>
    <Text style={styles.text}>{label}</Text>
  </View> : null;
}

const styles = StyleSheet.create({
  label: { position: "absolute", top: 12, left: 16, zIndex: 100, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  text: { fontFamily: "Menlo", fontSize: 18, color: "rgba(255,255,255,0.6)" },
});
