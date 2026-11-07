import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

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

export function PresenterPreview({ children, pending, weight }: { children: ReactNode; pending: boolean; weight: number }) {
  return (
    <View style={[styles.section, { flex: weight }]}>
      <View
        accessibilityElementsHidden={pending}
        importantForAccessibility={pending ? "no-hide-descendants" : "auto"}
        pointerEvents={pending ? "none" : "auto"}
        style={styles.content}
      >
        {children}
      </View>
      {pending && (
        <View style={children == null ? styles.loading : styles.updating}>
          <ActivityIndicator accessibilityLabel={children == null ? "Preparing slide preview" : "Updating slide preview"} color="#a1a1aa" />
          {children != null && <Text style={styles.status}>Updating preview</Text>}
        </View>
      )}
    </View>
  );
}

export function DeferredPresenterPreview({ children, immediate = false, pending = false, weight }: { children: ReactNode; immediate?: boolean; pending?: boolean; weight: number }) {
  const deferred = useDeferredValue(children, null);
  const preview = immediate ? children : deferred;
  return <PresenterPreview pending={pending || preview !== children} weight={weight}>{preview}</PresenterPreview>;
}

const styles = StyleSheet.create({
  section: { minWidth: 0 },
  content: { flex: 1 },
  updating: { position: "absolute", left: 8, bottom: 8, flexDirection: "row", gap: 6, alignItems: "center", padding: 6, borderRadius: 6, backgroundColor: "#18181bee" },
  status: { color: "#e4e4e7", fontSize: 12 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
