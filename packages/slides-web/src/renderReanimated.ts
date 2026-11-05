import { useRef } from "react";
import { useFrameCallback as useRuntimeFrameCallback } from "react-native-reanimated";
export * from "react-native-reanimated";
export { default } from "react-native-reanimated";

export function useFrameCallback(callback: (info: { timestamp: number; timeSincePreviousFrame: number | null; timeSinceFirstFrame: number }) => void, autostart = true) {
  const previous = useRef<number | null>(null);
  return useRuntimeFrameCallback((info: Parameters<typeof callback>[0]) => {
    if (!(globalThis as any).__slidesRenderClock?.running) return;
    // Preparation can flush layout repeatedly at a frozen timestamp, without integrating simulation again.
    if (info.timestamp === previous.current) return;
    previous.current = info.timestamp;
    callback(info);
  }, autostart);
}
