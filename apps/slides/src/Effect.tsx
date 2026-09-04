import {
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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PixelRatio, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { resolveEffectSource, type EffectPreset } from "./effects";

type EffectProps = {
  children?: ReactNode;
  padding?: number;
  preset?: EffectPreset;
  previewTime?: number;
  shader?: string;
  speed?: number;
  strength?: number;
  style?: StyleProp<ViewStyle>;
  uniforms?: Record<string, Uniform>;
};

type EffectCanvasProps = {
  effect: SkRuntimeEffect;
  height: number;
  image: SkImage;
  isActive: boolean;
  isPreview: boolean;
  previewTime: number;
  speed: number;
  strength: number;
  uniforms?: Record<string, Uniform>;
  width: number;
};

function EffectCanvas({
  effect,
  height,
  image,
  isActive,
  isPreview,
  previewTime,
  speed,
  strength,
  uniforms,
  width,
}: EffectCanvasProps) {
  const [time, setTime] = useState(isPreview ? previewTime : 0);
  const pixelRatio = PixelRatio.get();

  useEffect(() => {
    if (isPreview) {
      setTime(previewTime);
      return;
    }
    if (!isActive) {
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const update = (timestamp: number) => {
      setTime((timestamp - startedAt) / 1000 * speed);
      frame = requestAnimationFrame(update);
    };
    setTime(0);
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isActive, isPreview, previewTime, speed]);

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
              <RuntimeShader source={effect} uniforms={shaderUniforms} />
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
  children,
  padding = 0,
  preset = "liquid",
  previewTime = 1.25,
  shader,
  speed = 1,
  strength = 12,
  style,
  uniforms,
}: EffectProps) {
  const { isActive, isPreview } = useSlideLifecycle();
  const sourceRef = useRef<View>(null);
  const imageRef = useRef<SkImage | undefined>(undefined);
  const [image, setImage] = useState<SkImage>();
  const [size, setSize] = useState({ height: 0, width: 0 });
  const source = resolveEffectSource(preset, shader);
  const runtimeEffect = useMemo(() => source ? Skia.RuntimeEffect.Make(source) ?? undefined : undefined, [source]);
  const shouldRender = isActive || isPreview;

  useEffect(() => {
    if (!runtimeEffect || !shouldRender || imageRef.current || size.width === 0 || size.height === 0) {
      return;
    }
    let cancelled = false;
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
          imageRef.current = snapshot;
          setImage(snapshot);
        }).catch(() => {
          // Unsupported capture paths fall back to the unfiltered children.
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [runtimeEffect, shouldRender, size.height, size.width]);

  useEffect(() => () => {
    imageRef.current?.dispose();
    imageRef.current = undefined;
  }, []);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextSize = event.nativeEvent.layout;
    if (nextSize.width !== size.width || nextSize.height !== size.height) {
      imageRef.current?.dispose();
      imageRef.current = undefined;
      setImage(undefined);
      setSize({ height: nextSize.height, width: nextSize.width });
    }
  };

  return (
    <View collapsable={false} onLayout={handleLayout} ref={sourceRef} style={[styles.container, style]}>
      <View style={[padding ? { padding } : undefined, image && styles.hidden]}>
        {renderNativeChildren(children, (text) => <Text>{text}</Text>)}
      </View>
      {image && runtimeEffect ? (
        <EffectCanvas
          effect={runtimeEffect}
          height={size.height}
          image={image}
          isActive={isActive}
          isPreview={isPreview}
          previewTime={previewTime}
          speed={speed}
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
