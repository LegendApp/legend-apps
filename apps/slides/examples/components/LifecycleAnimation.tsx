import { usePresentationValue } from "@legend-apps/presentation";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

const travelDistance = 760;

export function LifecycleAnimation() {
  const isActive = usePresentationValue("isActive");
  const isPreview = usePresentationValue("isPreview");
  const [progress] = useState(() => new Animated.Value(isPreview ? 1 : 0));

  useEffect(() => {
    progress.stopAnimation();
    if (isPreview) {
      progress.setValue(1);
      return;
    }
    if (!isActive) {
      return;
    }

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      duration: 1_200,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [isActive, isPreview, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-travelDistance, 0],
  });

  return (
    <View style={styles.root}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { transform: [{ translateX }] }]} />
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
