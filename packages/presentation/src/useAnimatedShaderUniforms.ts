import { useEffect } from "react";
import { useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";

/** Adds a UI-thread `time` uniform in seconds; previews hold a fixed frame. */
export function useAnimatedShaderUniforms(
  uniforms: Record<string, number | number[]>,
  previewTime = 0,
) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const time = useSharedValue(preview ? previewTime : 0);
  const frame = useFrameCallback((info) => {
    time.value += (info.timeSincePreviousFrame ?? 0) / 1000;
  }, false);

  useEffect(() => {
    if (preview) {
      time.value = previewTime;
    }
    frame.setActive(active && !preview);
    return () => frame.setActive(false);
  }, [active, preview, previewTime, frame, time]);

  return useDerivedValue(() => ({ ...uniforms, time: time.value }), [uniforms]);
}
