import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

/** Previews sample whole scenes on the UI thread: while the audience watches, they trail navigation so that work misses the transition. */
const AUDIENCE_TRANSITION_MS = 3000;
export function useAudienceSettled<T>(value: T, audienceOpen: boolean, delay = AUDIENCE_TRANSITION_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (!audienceOpen) return;
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, audienceOpen, delay]);
  return audienceOpen ? settled : value;
}

export function DeferredPresenterPreview({ children, immediate = false, weight }: { children: ReactNode; immediate?: boolean; weight: number }) {
  const deferred = useDeferredValue(children, null);
  const preview = immediate ? children : deferred;
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
