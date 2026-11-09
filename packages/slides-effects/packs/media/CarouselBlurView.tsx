import { blurImages, disposeBlurImage, resizeBlurImage } from "./blurImages";
import { snapshotCaptureQueue } from "@legend-apps/presentation";
import { Blur, Canvas, Group, Image as SkiaImage, Paint, makeImageFromView, type SkImage } from "@shopify/react-native-skia";
import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { Image as ReactNativeImage, StyleSheet, Text, View } from "react-native";
import Animated, { runOnUI, useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";

type CarouselBlurProps = {
  children: ReactNode; progress: SharedValue<{ position: number }>; index: number; enabled: boolean; cacheKey?: string; poster?: string; posterTop?: number; posterCaption?: string;
};

export function CarouselBlurView(props: CarouselBlurProps) {
  return props.poster
    ? <PosterCarouselBlurView key={props.poster} {...props} />
    : <SnapshotCarouselBlurView {...props} />;
}

function useCarouselFocus({ enabled, index, progress }: CarouselBlurProps) {
  return useDerivedValue(() => {
    "worklet";
    const distance = enabled ? Math.min(1, Math.abs(index - progress.value.position)) : 0;
    return distance * distance * (3 - 2 * distance);
  });
}

function PosterCarouselBlurView(props: CarouselBlurProps) {
  const { children, poster, posterTop = 0, posterCaption } = props;
  const ready = useSharedValue(false);
  const mounted = useRef(true);
  const [width, setWidth] = useState(0);
  const focus = useCarouselFocus(props);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; ready.set(false); };
  }, [ready]);
  const liveStyle = useAnimatedStyle(() => { "worklet"; return { opacity: ready.value ? 1 - focus.value : 1 }; });
  const posterStyle = useAnimatedStyle(() => { "worklet"; return { opacity: ready.value ? focus.value : 0 }; });
  return <View style={styles.fill} onLayout={posterCaption ? event => setWidth(event.nativeEvent.layout.width) : undefined}>
    <Animated.View style={[styles.fill, liveStyle]}>{children}</Animated.View>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, posterStyle]}>
      {posterCaption && <View style={{ height: posterTop }}>
        <SnapshotCarouselBlurView {...props} cacheKey={JSON.stringify([posterCaption, width, posterTop])}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: "#f8fafc", fontSize: width * 0.035, fontWeight: "600" }}>{posterCaption}</Text>
          </View>
        </SnapshotCarouselBlurView>
      </View>}
      <View style={[StyleSheet.absoluteFill, { top: posterTop, borderRadius: 12, overflow: "hidden", backgroundColor: "#14253a" }]}>
        <ReactNativeImage source={{ uri: poster! }} resizeMode="contain" blurRadius={10} style={StyleSheet.absoluteFill}
          onLoad={() => { if (mounted.current) ready.set(true); }} />
      </View>
    </Animated.View>
  </View>;
}

/** Capture on layout changes only; blur and the live-content handoff run on the UI thread. */
function SnapshotCarouselBlurView(props: CarouselBlurProps) {
  const { children, enabled, cacheKey } = props;
  const snapshotEnabled = useDeferredValue(enabled, false);
  const source = useRef<View>(null);
  const layout = useRef({ width: 0, height: 0 });
  const size = useSharedValue({ width: 0, height: 0 });
  const image = useSharedValue<SkImage | null>(null);
  const recapture = useRef(() => {});
  useEffect(() => {
    let release = () => {};
    const capture = () => {
      const previousRelease = release;
      release = () => {};
      previousRelease();
      image.set(null);
      if (!enabled || !snapshotEnabled || !layout.current.width || !layout.current.height) return;
      let cancelled = false;
      let held: { image: SkImage; release(): void } | undefined;
      const key = cacheKey ? JSON.stringify([cacheKey, layout.current.width, layout.current.height]) : undefined;
      const publish = (lease: NonNullable<typeof held>) => {
        held = lease;
        const next = lease.image;
        runOnUI(() => { "worklet"; image.set(next); })();
      };
      const cached = key ? blurImages.acquire(key) : undefined;
      if (cached) publish(cached);
      const cancelCapture = cached ? () => {} : snapshotCaptureQueue.enqueue(async () => {
        if (cancelled) return;
        try {
          let available;
          if (key) available = blurImages.acquire(key);
          if (available) { publish(available); return; }
          const snapshot = await makeImageFromView(source);
          if (!snapshot) return;
          if (cancelled) { disposeBlurImage(snapshot); return; }
          const small = resizeBlurImage(snapshot);
          if (key) publish(blurImages.insert(key, small));
          else publish({ image: small, release: () => disposeBlurImage(small) });
        } catch { /* Keep live content if native capture is unavailable. */ }
      });
      release = () => {
        cancelled = true;
        cancelCapture();
        const previous = held;
        held = undefined;
        runOnUI(() => { "worklet"; image.set(null); })();
        previous?.release();
      };
    };
    recapture.current = capture;
    capture();
    return () => { recapture.current = () => {}; release(); };
  }, [enabled, snapshotEnabled, image, cacheKey]);
  const focus = useCarouselFocus(props);
  const blur = useDerivedValue(() => { "worklet"; return 10 * focus.value; });
  const width = useDerivedValue(() => { "worklet"; return size.value.width; });
  const height = useDerivedValue(() => { "worklet"; return size.value.height; });
  const liveStyle = useAnimatedStyle(() => { "worklet"; return { opacity: image.value ? 1 - focus.value : 1 }; });
  const snapshotStyle = useAnimatedStyle(() => { "worklet"; return { opacity: image.value ? focus.value : 0 }; });
  return <View style={styles.fill} onLayout={event => {
    const { width, height } = event.nativeEvent.layout;
    if (layout.current.width === width && layout.current.height === height) return;
    layout.current = { width, height };
    size.set(layout.current);
    recapture.current();
  }}>
    <Animated.View style={[styles.fill, liveStyle]}>
      <View ref={source} collapsable={false} style={styles.fill}>{children}</View>
    </Animated.View>
    {enabled && snapshotEnabled && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, snapshotStyle]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group layer={<Paint><Blur blur={blur} mode="clamp" /></Paint>}>
          <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="fill" />
        </Group>
      </Canvas>
    </Animated.View>}
  </View>;
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
