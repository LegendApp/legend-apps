import {
  Blur,
  Canvas,
  Group,
  Image as SkiaImage,
  Paint,
  RuntimeShader,
  Skia,
  makeImageFromView,
  type SkImage,
  type SkRuntimeEffect,
  type Uniform,
} from "@shopify/react-native-skia";
import { renderNativeChildren, useSlideLifecycle } from "@legend-apps/presentation";
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PixelRatio, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { resolveEffectSource, type EffectPreset } from "./effects";
import { SlideCaptureContext } from "./SlideCaptureContext";

type EffectProps = {
  blur?: number;
  children?: ReactNode;
  padding?: number;
  preset?: EffectPreset;
  previewTime?: number;
  shader?: string;
  speed?: number;
  active?: boolean;
  strength?: number;
  style?: StyleProp<ViewStyle>;
  uniforms?: Record<string, Uniform>;
};

type EffectCanvasProps = {
  blur: number;
  effect: SkRuntimeEffect;
  height: number;
  image: SkImage;
  isActive: boolean;
  animationEnabled: boolean;
  isPreview: boolean;
  previewTime: number;
  speed: number;
  startedAt?: number;
  strength: number;
  uniforms?: Record<string, Uniform>;
  width: number;
};

function EffectCanvas({
  blur,
  animationEnabled,
  effect,
  height,
  image,
  isActive,
  isPreview,
  previewTime,
  speed,
  startedAt,
  strength,
  uniforms,
  width,
}: EffectCanvasProps) {
  const [clock, setClock] = useState({ epoch: startedAt, time: isPreview ? previewTime : 0 });
  const pixelRatio = PixelRatio.get();

  useEffect(() => {
    if (isPreview) {
      return;
    }
    if (!isActive) {
      return;
    }
    if (!animationEnabled || speed === 0) {
      return;
    }
    let frame = 0;
    const epoch = startedAt ?? performance.now();
    const update = (timestamp: number) => {
      setClock({ epoch: startedAt, time: Math.max(0, timestamp - epoch) / 1000 * speed });
      frame = requestAnimationFrame(update);
    };
    setClock({ epoch: startedAt, time: Math.max(0, performance.now() - epoch) / 1000 * speed });
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [animationEnabled, isActive, isPreview, previewTime, speed, startedAt]);

  const time = isPreview
    ? animationEnabled ? previewTime : 0
    : animationEnabled && clock.epoch === startedAt
      ? clock.time
      : 0;

  const shaderUniforms = {
    ...uniforms,
    resolution: [width * pixelRatio, height * pixelRatio],
    strength: strength * pixelRatio,
    time,
  };

  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Group transform={[{ scale: 1 / pixelRatio }]}>
        <Group
          layer={(
            <Paint>
              <RuntimeShader source={effect} uniforms={shaderUniforms}>
                {blur > 0 ? <Blur blur={blur * pixelRatio} mode="clamp" /> : null}
              </RuntimeShader>
            </Paint>
          )}
          transform={[{ scale: pixelRatio }]}
        >
          <SkiaImage fit="fill" height={height} image={image} width={width} x={0} y={0} />
        </Group>
      </Group>
    </Canvas>
  );
}

export function Effect({
  blur = 0,
  children,
  padding = 0,
  preset = "liquid",
  previewTime = 1.25,
  shader,
  speed = 1,
  active = true,
  strength = 12,
  style,
  uniforms,
}: EffectProps) {
  const { isActive, isPreview, isPreparing, startedAt, stepStartedAt } = useSlideLifecycle();
  const captureScale = useContext(SlideCaptureContext);
  const sourceRef = useRef<View>(null);
  const [snapshot, setSnapshot] = useState<{ image: SkImage; scale: number; width: number; height: number }>();
  const [size, setSize] = useState({ height: 0, width: 0 });
  const source = resolveEffectSource(preset, shader);
  const runtimeEffect = useMemo(() => source ? Skia.RuntimeEffect.Make(source) ?? undefined : undefined, [source]);
  const shouldRender = isActive || isPreview;
  const animationEnabled = active;
  const [playback, setPlayback] = useState({ active, slideEpoch: startedAt, epoch: startedAt });
  if (playback.active !== active || playback.slideEpoch !== startedAt) {
    setPlayback({ active, slideEpoch: startedAt, epoch: active ? stepStartedAt ?? startedAt : undefined });
  }
  const animationStartedAt = playback.epoch;
  const image = snapshot?.scale === captureScale && snapshot.width === size.width && snapshot.height === size.height
    ? snapshot.image : undefined;

  useEffect(() => {
    setSnapshot(undefined);
    if (!runtimeEffect || !shouldRender || captureScale <= 0 || size.width === 0 || size.height === 0) {
      return;
    }
    let cancelled = false;
    let captured: SkImage | undefined;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        void makeImageFromView(sourceRef).then((snapshot) => {
          if (!snapshot) {
            return;
          }
          if (cancelled) {
            snapshot.dispose();
            return;
          }
          captured = snapshot;
          setSnapshot({ image: snapshot, scale: captureScale, width: size.width, height: size.height });
        }).catch(() => {
          // Unsupported capture paths fall back to the unfiltered children.
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      captured?.dispose();
    };
  }, [captureScale, runtimeEffect, shouldRender, size.height, size.width]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextSize = event.nativeEvent.layout;
    if (nextSize.width !== size.width || nextSize.height !== size.height) {
      setSize({ height: nextSize.height, width: nextSize.width });
    }
  };

  return (
    <View onLayout={handleLayout} style={[styles.container, style]}>
      <View style={image && styles.hidden}>
        {/* Capture only the native source, never the canvas that replaces it. */}
        <View collapsable={false} ref={sourceRef} style={padding ? { padding } : undefined}>
          {renderNativeChildren(children, (text) => <Text>{text}</Text>)}
        </View>
      </View>
      {image && runtimeEffect ? (
        <EffectCanvas
          blur={blur}
          animationEnabled={animationEnabled}
          effect={runtimeEffect}
          height={size.height}
          image={image}
          isActive={isActive}
          isPreview={isPreview}
          previewTime={isPreparing ? 0 : previewTime}
          speed={speed}
          startedAt={animationStartedAt}
          strength={strength}
          uniforms={uniforms}
          width={size.width}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "relative" },
  hidden: { opacity: 0 },
});
