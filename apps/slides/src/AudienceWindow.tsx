import { useEffect, useLayoutEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { setSlidesState, useSlidesState } from "./slidesStore";

export function AudienceWindow() {
  const currentSlide = useSlidesState((state) => state.currentSlide);
  const blackout = useSlidesState((state) => state.blackout);
  const slideCount = useSlidesState((state) => state.slides.length);
  const transition = useSlidesState((state) => state.slides[state.currentSlide]?.metadata.transition ?? state.config.transition ?? "none");
  const [transitionState, setTransitionState] = useState(() => ({
    index: currentSlide,
    outgoing: null as number | null,
    kind: transition,
    progress: new Animated.Value(1),
  }));
  // Allocate the incoming opacity with its new layer tree. Resetting a shared
  // Animated.Value here would also hide the still-mounted outgoing slide.
  if (transitionState.index !== currentSlide || transitionState.kind !== transition) {
    setTransitionState({
      index: currentSlide,
      outgoing: transition === "none" ? null : transitionState.index,
      kind: transition,
      progress: new Animated.Value(transition === "none" ? 1 : 0),
    });
  }
  const { progress, outgoing: previousSlide } = transitionState;

  useEffect(() => {
    setSlidesState({ audienceOpen: true });
  }, []);

  useLayoutEffect(() => {
    if (transitionState.outgoing === null) return;
    const animation = Animated.timing(transitionState.progress, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false,
    });
    let settled = false;
    const finishTransition = () => {
      if (settled) return;
      settled = true;
      transitionState.progress.setValue(1);
      setTransitionState((current) => current === transitionState
        ? { ...current, outgoing: null } : current);
    };
    animation.start(({ finished }) => {
      if (finished) finishTransition();
    });
    const watchdog = setTimeout(() => {
      animation.stop();
      finishTransition();
    }, 450);
    return () => {
      settled = true;
      clearTimeout(watchdog);
      animation.stop();
    };
  }, [transitionState]);

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
