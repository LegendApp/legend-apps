import { usePlayback, samplePlayback } from "@legend-apps/presentation";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { View } from "react-native";

/** A live native animation that continues while its shared wrapper moves. */
export function FocusEngine() {
  const playback = usePlayback();
  const rotation = useAnimatedStyle(() => ({ transform: [{ rotate: `${samplePlayback(playback.value, 2) / 8 * 360}deg` }] }));
  return (
    <View style={{ flex: 1, backgroundColor: "#16384e", borderRadius: 28, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ width: 140, height: 140, borderRadius: 70, borderWidth: 2,
        borderColor: "#67e8f9" }, rotation]}>
        <View style={{ position: "absolute", left: 56, top: -12, width: 24, height: 24, borderRadius: 12, backgroundColor: "#a5f3fc" }} />
        <View style={{ position: "absolute", left: 48, top: 48, width: 40, height: 40, borderRadius: 12, backgroundColor: "#22d3ee" }} />
      </Animated.View>
    </View>
  );
}
