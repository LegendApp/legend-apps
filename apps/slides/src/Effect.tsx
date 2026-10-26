import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { isObservable, type Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import {
  Blur,
  Canvas,
  Fill,
  Group,
  ImageShader,
  Image as SkiaImage,
  Paint,
  RuntimeShader,
  Shader,
  Skia,
  makeImageFromView,
  type SkImage,
  type SkRuntimeEffect,
  type Uniform,
} from "@shopify/react-native-skia";
import { renderNativeChildren, useAnimatedShaderUniforms, usePresentationValue, snapshotCaptureQueue } from "@legend-apps/presentation";
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PixelRatio, Platform, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { resolveEffectSource, type EffectPreset } from "./effects";
import { SlideCaptureContext } from "./SlideCaptureContext";

type Uniforms = Record<string, Uniform>;
type EffectBlur = number | Observable<number> | (() => number) | SharedValue<number>;
type EffectUniforms = Uniforms | (() => Uniforms) | Readonly<Pick<SharedValue<Uniforms>, "value">>;
function isShared(value: unknown): value is SharedValue<any> {
  return !!value && typeof value === "object" && !isObservable(value) && "_isReanimatedSharedValue" in value;
}

type EffectProps = {
  blur?: EffectBlur;
  children?: ReactNode;
  padding?: number;
  preset?: EffectPreset;
  previewTime?: number;
  shader?: string;
  speed?: number;
  active?: boolean;
  strength?: number;
  style?: StyleProp<ViewStyle>;
  uniforms?: EffectUniforms;
};

type EffectCanvasProps = {
  blur: EffectBlur;
  effect: SkRuntimeEffect;
  height: number;
  image: SkImage;
  animationEnabled: boolean;
  previewTime: number;
  speed: number;
  clock: "slide" | number;
  strength: number;
  uniforms?: EffectUniforms;
  width: number;
};

function EffectShader({ blur, animationEnabled, effect, height, image, speed, strength, uniforms, width,
  time, pixelRatio }: EffectCanvasProps & { time: Readonly<Pick<SharedValue<{ time: number }>, "value">>; pixelRatio: number }) {
  // JS-owned subscriptions stay at the shader leaf; animation values stay on the UI runtime.
  const resolvedBlur = useValue(() => isShared(blur) ? 0 : typeof blur === "function" ? blur() : typeof blur === "number" ? blur : blur.get());
  const resolvedUniforms = useValue(() => isShared(uniforms) ? {} : typeof uniforms === "function" ? uniforms() : uniforms ?? {});
  const sharedUniforms = isShared(uniforms) ? uniforms : undefined;
  const sharedBlur = isShared(blur) ? blur : undefined;
  const shaderUniforms = useDerivedValue(() => ({
    ...(sharedUniforms ? sharedUniforms.value : resolvedUniforms),
    resolution: [width * pixelRatio, height * pixelRatio], strength: strength * pixelRatio,
    time: animationEnabled && speed !== 0 ? time.value.time * speed : 0,
  }));
  const shaderBlur = useDerivedValue(() => Math.max(0, sharedBlur ? sharedBlur.value : resolvedBlur) * pixelRatio);
  // CanvasKit has no runtime shader image filter, so web samples the snapshot as a child shader.
  if (Platform.OS === "web") return <Fill>
    <Shader source={effect} uniforms={shaderUniforms}>
      <ImageShader image={image} fit="fill" rect={{ x: 0, y: 0, width: width * pixelRatio, height: height * pixelRatio }} />
    </Shader>
    <Blur blur={shaderBlur} mode="clamp" />
  </Fill>;
  return <RuntimeShader source={effect} uniforms={shaderUniforms}><Blur blur={shaderBlur} mode="clamp" /></RuntimeShader>;
}

function EffectCanvas(props: EffectCanvasProps) {
  const { height, image, previewTime, clock, width } = props;
  // Read presentation context outside Skia's renderer.
  const time = useAnimatedShaderUniforms({}, previewTime, { clock, active: props.animationEnabled && props.speed !== 0 });
  const pixelRatio = PixelRatio.get();
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Group transform={[{ scale: 1 / pixelRatio }]}>
      {Platform.OS === "web" ? <EffectShader {...props} time={time} pixelRatio={pixelRatio} /> : <Group layer={<Paint><EffectShader {...props} time={time} pixelRatio={pixelRatio} /></Paint>} transform={[{ scale: pixelRatio }]}>
        <SkiaImage fit="fill" height={height} image={image} width={width} x={0} y={0} />
      </Group>}
    </Group>
  </Canvas>;
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
  const isActive = usePresentationValue("isActive");
  const isPreview = usePresentationValue("isPreview");
  const isPreparing = usePresentationValue("isPreparing");
  const startedAt = usePresentationValue("startedAt");
  const stepIndex = usePresentationValue("stepIndex");
  const captureScale = useContext(SlideCaptureContext);
  const sourceRef = useRef<View>(null);
  const [snapshot, setSnapshot] = useState<{ image: SkImage; scale: number; width: number; height: number }>();
  const [size, setSize] = useState({ height: 0, width: 0 });
  const source = resolveEffectSource(preset, shader);
  const runtimeEffect = useMemo(() => source ? Skia.RuntimeEffect.Make(source) ?? undefined : undefined, [source]);
  const shouldRender = isActive || isPreview;
  const animationEnabled = active;
  const [playback, setPlayback] = useState({ active, slideEpoch: startedAt, clock: "slide" as "slide" | number });
  if (playback.active !== active || playback.slideEpoch !== startedAt) {
    setPlayback({ active, slideEpoch: startedAt, clock: active ? stepIndex : "slide" });
  }
  const animationClock = playback.clock;
  const image = snapshot?.scale === captureScale && snapshot.width === size.width && snapshot.height === size.height
    ? snapshot.image : undefined;

  useEffect(() => {
    setSnapshot(undefined);
    if (!runtimeEffect || !shouldRender || captureScale <= 0 || size.width === 0 || size.height === 0) {
      return;
    }
    let cancelled = false;
    const cancelCapture = snapshotCaptureQueue.enqueue(async () => {
      await makeImageFromView(sourceRef).then((snapshot) => {
        if (!snapshot) {
          return;
        }
        if (cancelled) {
          snapshot.dispose();
          return;
        }
        setSnapshot({ image: snapshot, scale: captureScale, width: size.width, height: size.height });
      }).catch(() => {
        // Unsupported capture paths fall back to the unfiltered children.
      });
    });
    return () => {
      cancelled = true;
      cancelCapture();
    };
  }, [captureScale, runtimeEffect, shouldRender, size.height, size.width]);
  // The canvas can still paint a replaced snapshot until its next frame, so dispose it after that frame.
  useEffect(() => () => {
    const image = snapshot?.image;
    if (image) requestAnimationFrame(() => image.dispose());
  }, [snapshot]);

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
          previewTime={isPreparing ? 0 : previewTime}
          speed={speed}
          clock={animationClock}
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
