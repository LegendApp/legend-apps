import { Canvas, Image as SkiaImage, useImage, type SkImage } from "@shopify/react-native-skia";
import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import type { NativeVideoGroup } from "./useNativeVideoGroup";
import { useNativeVideo } from "./useNativeVideo";

/** A native decoded frame and its poster share one canvas; no WebView or snapshot. */
export function NativeVideoView({ source, poster, playing, position, looping = true }: {
  source: string; poster: string; playing: boolean; position?: SharedValue<number>; looping?: boolean;
}) {
  const video = useNativeVideo(source, playing, position, looping);
  const preview = useImage(poster);
  const image = useDerivedValue(() => video.currentFrame.value ?? preview);
  return <VideoCanvas image={image} error={video.error} />;
}

/** Uses the same canvas/layout as a standalone video, with a group-owned frame. */
export function NativeVideoGroupFrame({ group, index, poster }: {
  group: NativeVideoGroup; index: number; poster: string;
}) {
  const preview = useImage(poster);
  const image = useDerivedValue(() => group.frames.value[index] ?? preview);
  return <VideoCanvas image={image} error={group.error} />;
}

function VideoCanvas({ image, error }: { image: SharedValue<SkImage | null>; error: string | null }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(old => old.width === width && old.height === height ? old : { width, height });
  };
  return <View onLayout={onLayout} style={{ width: "100%", height: "100%" }}>
    <Canvas style={{ flex: 1 }}>
      <SkiaImage image={image} x={0} y={0} width={size.width} height={size.height} fit="contain" />
    </Canvas>
    {error ? <Text accessibilityRole="alert" style={{ color: "#fff", backgroundColor: "#222", padding: 8 }}>Could not load video: {error}</Text> : null}
  </View>;
}
