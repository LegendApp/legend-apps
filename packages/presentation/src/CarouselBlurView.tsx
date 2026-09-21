import { snapshotCaptureQueue } from "./snapshotCaptureQueue";
import { Blur, Canvas, Group, Image as SkiaImage, Paint, makeImageFromView, type SkImage } from "@shopify/react-native-skia";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from "react-native-reanimated";

/** Capture on layout changes only; blur and the live-content handoff run on the UI thread. */
export function CarouselBlurView({ children, progress, index, enabled }: {
  children: ReactNode; progress: SharedValue<{ position: number }>; index: number; enabled: boolean;
}) {
  const source = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState<SkImage>();
  useEffect(() => {
    setImage(undefined);
    if (!enabled || !size.width || !size.height) return;
    let cancelled = false;
    let captured: SkImage | undefined;
    const cancelCapture = snapshotCaptureQueue.enqueue(async () => {
      await makeImageFromView(source).then(snapshot => {
        if (!snapshot) return;
        if (cancelled) { snapshot.dispose(); return; }
        captured = snapshot;
        setImage(snapshot);
      }).catch(() => { /* Keep live content if native capture is unavailable. */ });
    });
    return () => {
      cancelled = true;
      cancelCapture();
      captured?.dispose();
    };
  }, [enabled, size.width, size.height]);
  const focus = useDerivedValue(() => {
    const distance = enabled ? Math.min(1, Math.abs(index - progress.value.position)) : 0;
    return distance * distance * (3 - 2 * distance);
  }, [enabled, index]);
  const blur = useDerivedValue(() => 10 * focus.value);
  const liveStyle = useAnimatedStyle(() => ({ opacity: image ? 1 - focus.value : 1 }), [image]);
  const snapshotStyle = useAnimatedStyle(() => ({ opacity: focus.value }));
  return <View style={styles.fill} onLayout={event => {
    const { width, height } = event.nativeEvent.layout;
    setSize(old => old.width === width && old.height === height ? old : { width, height });
  }}>
    <Animated.View style={[styles.fill, liveStyle]}>
      <View ref={source} collapsable={false} style={styles.fill}>{children}</View>
    </Animated.View>
    {image && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, snapshotStyle]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group layer={<Paint><Blur blur={blur} mode="clamp" /></Paint>}>
          <SkiaImage image={image} x={0} y={0} width={size.width} height={size.height} fit="fill" />
        </Group>
      </Canvas>
    </Animated.View>}
  </View>;
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
