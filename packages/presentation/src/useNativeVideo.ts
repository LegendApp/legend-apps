import { useVideo } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

/** Keep the player and its GPU frame alive when carousel steps change. */
export function useNativeVideo(source: string | null, playing: boolean) {
  const paused = useDerivedValue(() => !playing, [playing]);
  return useVideo(source, { paused, looping: true, volume: 0 });
}
