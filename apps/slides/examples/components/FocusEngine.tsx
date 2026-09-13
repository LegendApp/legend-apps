import { usePresentationValue } from "@legend-apps/presentation";
import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";

/** A live native animation that continues while its shared wrapper moves. */
export function FocusEngine() {
  const isActive = usePresentationValue("isActive");
  const [rotation] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!isActive) return;
    const animation = Animated.loop(Animated.timing(rotation, {
      toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [isActive, rotation]);
  return (
    <View style={{ flex: 1, backgroundColor: "#16384e", borderRadius: 28, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 2,
        borderColor: "#67e8f9", transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
        <View style={{ position: "absolute", left: 56, top: -12, width: 24, height: 24, borderRadius: 12, backgroundColor: "#a5f3fc" }} />
        <View style={{ position: "absolute", left: 48, top: 48, width: 40, height: 40, borderRadius: 12, backgroundColor: "#22d3ee" }} />
      </Animated.View>
    </View>
  );
}
