import { Canvas, Image as SkiaImage, useImage } from "@shopify/react-native-skia";
import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { useNativeVideo } from "./useNativeVideo";

/** A native decoded frame and its poster share one canvas; no WebView or snapshot. */
export function NativeVideoView({ source, poster, playing }: {
  source: string; poster: string; playing: boolean;
}) {
  const video = useNativeVideo(source, playing);
  const preview = useImage(poster);
  const image = useDerivedValue(() => video.currentFrame.value ?? preview, [preview]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(old => old.width === width && old.height === height ? old : { width, height });
  };
  return <View onLayout={onLayout} style={{ width: "100%", height: "100%" }}>
    <Canvas style={{ flex: 1 }}>
      <SkiaImage image={image} x={0} y={0} width={size.width} height={size.height} fit="contain" />
    </Canvas>
  </View>;
}
