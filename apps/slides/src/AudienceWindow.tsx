import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { setSlidesState, useSlidesState } from "./slidesStore";

export function AudienceWindow() {
  const currentSlide = useSlidesState((state) => state.currentSlide);
  const blackout = useSlidesState((state) => state.blackout);
  const slideCount = useSlidesState((state) => state.slides.length);
  const transition = useSlidesState((state) => state.slides[state.currentSlide]?.metadata.transition ?? state.config.transition ?? "none");
  const previousCurrent = useRef(currentSlide);
  const [previousSlide, setPreviousSlide] = useState<number | null>(null);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setSlidesState({ audienceOpen: true });
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
    // The incoming layer blends over this opaque base. Fading both layers
    // exposes the black window underneath and dims even identical backgrounds.
    : { opacity: 1 };
  // Render from state: ref changes do not invalidate React's cached output.
  // The layout effect establishes the outgoing layer before paint; cuts never
  // have one, even when the previous transition has not cleaned up yet.
  const outgoingSlide = transition === "none" || previousSlide === currentSlide ? null : previousSlide;
  const layers = outgoingSlide === null
    ? [{ index: currentSlide, style: enteringStyle }]
    : [
        { index: outgoingSlide, style: outgoingStyle },
        { index: currentSlide, style: enteringStyle },
      ];
  const preparedIndexes = Array.from(
    { length: Math.min(slideCount - 1, currentSlide + 2) - Math.max(0, currentSlide - 2) + 1 },
    (_, offset) => Math.max(0, currentSlide - 2) + offset,
  );
  const renderedLayers = [
    ...preparedIndexes.filter((index) => !layers.some((layer) => layer.index === index))
      .map((index) => ({ index, style: styles.preload })),
    ...layers,
  ];

  return (
    <View style={styles.root}>
      {renderedLayers.map((layer) => {
        const isPreload = !layers.some((visibleLayer) => visibleLayer.index === layer.index);
        return (
          <Animated.View key={layer.index} accessibilityElementsHidden={isPreload} importantForAccessibility={isPreload ? "no-hide-descendants" : "auto"} pointerEvents={isPreload ? "none" : "auto"} style={isPreload ? styles.preload : [styles.layer, layer.style]}>
            <SlideCanvas>
              <DeckRenderer isPreparing={isPreload} isPreview={layer.index !== currentSlide} targetIndex={layer.index} />
            </SlideCanvas>
          </Animated.View>
        );
      })}
      {blackout && <View accessibilityLabel="Audience blacked out" style={styles.blackout} />}
    </View>
  );
}

const styles = StyleSheet.create({
  blackout: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  layer: { ...StyleSheet.absoluteFillObject },
  // Full-size, opaque preparation surfaces sit behind the visible slides.
  // Opacity zero or a 1px layout prevents usable native snapshots.
  preload: { ...StyleSheet.absoluteFillObject, zIndex: -1 },
  root: { backgroundColor: "#000", flex: 1 },
});
