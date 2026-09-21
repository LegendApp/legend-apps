import { PixelRatio } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { usePlaybackTween } from "./usePlaybackTween";

/** GPU-backed glass formation; obtain this above Canvas's separate renderer. */
export function useLiquidGlassPlayback({ active, width, height, blur = 24, refraction = 8, duration = 700 }: {
  active: boolean; width: number; height: number; blur?: number; refraction?: number; duration?: number;
}) {
  const pixelRatio = PixelRatio.get();
  const tween = usePlaybackTween({ progress: active ? 1 : 0 }, duration, undefined, "smoothstep");
  return {
    pixelRatio,
    blur: useDerivedValue(() => Math.max(0, blur) * pixelRatio * tween.value.progress, [blur, pixelRatio]),
    uniforms: useDerivedValue(() => ({
      resolution: [width * pixelRatio, height * pixelRatio], strength: Math.max(0, refraction) * pixelRatio,
      progress: tween.value.progress, time: 0, liquid: 0,
    }), [width, height, refraction, pixelRatio]),
  };
}
