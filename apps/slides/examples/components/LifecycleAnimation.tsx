import { usePresentationValue, usePlayback, samplePlayback } from "@legend-apps/presentation";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { StyleSheet, Text, View } from "react-native";

const travelDistance = 760;

export function LifecycleAnimation() {
  const isActive = usePresentationValue("isActive");
  const isPreview = usePresentationValue("isPreview");
  const playback = usePlayback();
  const animatedStyle = useAnimatedStyle(() => {
    const t = Math.min(1, samplePlayback(playback.value, 1.2) / 1.2);
    return { transform: [{ translateX: -travelDistance * (1 - t) ** 3 }] };
  });

  return (
    <View style={styles.root}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, animatedStyle]} />
      </View>
      <Text style={styles.caption}>
        {isPreview ? "Presenter preview" : isActive ? "Animation is active" : "Waiting for this slide"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { color: "#94a3b8", fontSize: 26, marginTop: 18 },
  fill: { backgroundColor: "#22d3ee", borderRadius: 14, height: 28, width: travelDistance },
  root: { marginTop: 56 },
  track: { backgroundColor: "#1e293b", borderRadius: 14, height: 28, overflow: "hidden", width: travelDistance },
});
