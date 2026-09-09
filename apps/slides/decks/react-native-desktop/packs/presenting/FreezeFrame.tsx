import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useMotion } from "./motion";

/** A pausable clock, not a screenshot: drive Lottie progress, shader time or transforms with seconds. */
export function FreezeFrame({ paused, children, annotation, previewTime = 1.5 }: {
  paused: boolean; children: (seconds: number) => ReactNode; annotation?: ReactNode; previewTime?: number;
}) {
  const { isActive, isPreview, startedAt } = useSlideLifecycle();
  const [clock, setClock] = useState({ epoch: startedAt, seconds: 0 });
  const saved = useRef(clock);
  const [opacity] = useMotion([paused ? 1 : 0], 250);
  useEffect(() => {
    if (saved.current.epoch !== startedAt) {
      saved.current = { epoch: startedAt, seconds: 0 };
      setClock(saved.current);
    }
    if (paused || !isActive || isPreview) return;
    let previous = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      saved.current = { epoch: startedAt, seconds: saved.current.seconds + Math.max(0, now - previous) / 1000 };
      previous = now;
      setClock(saved.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, isActive, isPreview, startedAt]);
  const seconds = isPreview ? previewTime : clock.epoch === startedAt ? clock.seconds : 0;
  return <View style={styles.frame}>
    {children(seconds)}
    <View pointerEvents={paused ? "auto" : "none"} accessibilityElementsHidden={!paused}
      importantForAccessibility={paused ? "auto" : "no-hide-descendants"} style={[StyleSheet.absoluteFill, { opacity }]}>{annotation}</View>
  </View>;
}
const styles = StyleSheet.create({ frame: { position: "relative" } });
