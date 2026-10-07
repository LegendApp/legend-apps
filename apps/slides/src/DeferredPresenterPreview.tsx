import { useDeferredValue, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export function DeferredPresenterPreview({ children, weight }: { children: ReactNode; weight: number }) {
  const preview = useDeferredValue(children, null);
  const pending = preview !== children;
  return (
    <View style={[styles.section, { flex: weight }]}>
      <View
        accessibilityElementsHidden={pending}
        importantForAccessibility={pending ? "no-hide-descendants" : "auto"}
        pointerEvents={pending ? "none" : "auto"}
        style={[styles.content, pending && styles.hidden]}
      >
        {preview}
      </View>
      {pending && (
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="Preparing next slide preview" color="#a1a1aa" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { minWidth: 0 },
  content: { flex: 1 },
  hidden: { opacity: 0 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
