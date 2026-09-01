import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { addWindowClosedListener } from "@legend-apps/window-manager";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { setSlidesState, useSlidesState } from "./slidesStore";

export function AudienceWindow() {
  const currentSlide = useSlidesState((state) => state.currentSlide);
  const transition = useSlidesState((state) => state.slides[state.currentSlide]?.metadata.transition ?? state.config.transition ?? "none");
  const previousCurrent = useRef(currentSlide);
  const [previousSlide, setPreviousSlide] = useState<number | null>(null);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setSlidesState({ audienceOpen: true });
    const subscription = addWindowClosedListener((event) => {
      if (event.identifier === "slides-audience") {
        setSlidesState({ audienceOpen: false });
      }
    });
    return () => subscription.remove();
  }, []);

  useLayoutEffect(() => {
    const outgoing = previousCurrent.current;
    previousCurrent.current = currentSlide;
    if (outgoing === currentSlide || transition === "none") {
      setPreviousSlide(null);
      progress.setValue(1);
      return;
    }
    setPreviousSlide(outgoing);
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false,
    });
    let settled = false;
    const finishTransition = () => {
      if (settled) {
        return;
      }
      settled = true;
      progress.setValue(1);
      setPreviousSlide(null);
    };
    animation.start(({ finished }) => {
      if (finished) {
        finishTransition();
      }
    });
    const watchdog = setTimeout(() => {
      animation.stop();
      finishTransition();
    }, 450);
    return () => {
      clearTimeout(watchdog);
      animation.stop();
    };
  }, [currentSlide, progress, transition]);

  const enteringStyle = transition === "slide"
    ? { opacity: progress, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [180, 0] }) }] }
    : { opacity: progress };
  const outgoingStyle = transition === "slide"
    ? { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -90] }) }] }
    : { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
  const outgoingSlide = previousCurrent.current === currentSlide ? previousSlide : previousCurrent.current;
  const layers = outgoingSlide === null
    ? [{ index: currentSlide, style: enteringStyle }]
    : [
        { index: outgoingSlide, style: outgoingStyle },
        { index: currentSlide, style: enteringStyle },
      ];

  return (
    <View style={styles.root}>
      {layers.map((layer) => (
        <Animated.View key={layer.index} style={[styles.layer, layer.style]}>
          <SlideCanvas><DeckRenderer targetIndex={layer.index} /></SlideCanvas>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject },
  root: { backgroundColor: "#000", flex: 1 },
});
