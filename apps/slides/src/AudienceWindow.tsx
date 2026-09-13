import { useValue } from "@legendapp/state/react";
import { BackgroundHost, useHasBackground, FocusSurfaceContext, createFocusSurface,
  measureFocusSurface, createFocusMotion, focusCamera, resolveTransition,
  type FocusMotion, type FocusSurface } from "@legend-apps/presentation";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { setSlidesState, slidesState$ } from "./slidesStore";

export function AudienceWindow() {
  const currentSlide = useValue(slidesState$.currentSlide);
  const color = useValue(() => slidesState$.config.theme.backgroundColor.get() ?? "#111827");
  return <BackgroundHost slideIndex={currentSlide} color={color}><AudienceContent /></BackgroundHost>;
}

function AudienceContent() {
  const hasBackground = useHasBackground();
  const currentSlide = useValue(slidesState$.currentSlide);
  const blackout = useValue(slidesState$.blackout);
  const slides = useValue(slidesState$.slides);
  const defaultTransition = useValue(slidesState$.config.transition);
  const revision = useValue(slidesState$.revision);
  const slideCount = slides.length;
  const [surfaces] = useState(() => new Map<number, FocusSurface>());
  const [transitionState, setTransitionState] = useState(() => ({
    index: currentSlide,
    revision,
    outgoing: null as number | null,
    ...resolveTransition(currentSlide, currentSlide, slides, defaultTransition),
    progress: new Animated.Value(1),
    ready: true,
    motions: new Map<number, FocusMotion>(),
  }));
  // Allocate the incoming opacity with its new layer tree. Resetting a shared
  // Animated.Value here would also hide the still-mounted outgoing slide.
  if (transitionState.index !== currentSlide || transitionState.revision !== revision) {
    const resolved = resolveTransition(transitionState.index, currentSlide, slides, defaultTransition);
    const cut = resolved.kind === "none" || resolved.duration === 0 || transitionState.revision !== revision;
    setTransitionState({
      index: currentSlide,
      revision,
      outgoing: cut ? null : transitionState.index,
      ...resolved,
      progress: new Animated.Value(cut ? 1 : 0),
      ready: cut || !resolved.focus,
      motions: new Map(),
    });
  }
  const transition = transitionState.kind;
  const { progress, outgoing: previousSlide } = transitionState;

  useEffect(() => {
    setSlidesState({ audienceOpen: true });
  }, []);

  useLayoutEffect(() => {
    if (transitionState.ready || transitionState.outgoing === null || !transitionState.focus) return;
    let cancelled = false;
    const prepare = async () => {
      const from = surfaces.get(transitionState.outgoing!);
      const to = surfaces.get(transitionState.index);
      const motions = new Map<number, FocusMotion>();
      if (from && to) {
        const [source, destination] = await Promise.all([measureFocusSurface(from), measureFocusSurface(to)]);
        const overview = transitionState.reverse ? destination : source;
        const region = overview.regions.get(transitionState.focus!.from);
        const surface = transitionState.reverse ? to : from;
        if (region && surface.width > 0 && surface.height > 0) {
          const camera = focusCamera(region, surface);
          const sourceMotion = transitionState.reverse ? createFocusMotion(progress) : createFocusMotion(progress, undefined, camera);
          const destinationMotion = transitionState.reverse ? createFocusMotion(progress, camera) : createFocusMotion(progress);
          for (const [id, sourceRect] of source.elements) {
            const destinationRect = destination.elements.get(id);
            if (!destinationRect) continue;
            sourceMotion.elements.set(id, { from: sourceRect, to: destinationRect, own: sourceRect });
            destinationMotion.elements.set(id, { from: sourceRect, to: destinationRect, own: destinationRect });
          }
          motions.set(transitionState.outgoing!, sourceMotion);
          motions.set(transitionState.index, destinationMotion);
        }
      }
      if (!cancelled) setTransitionState((current) => current === transitionState
        ? { ...current, ready: true, motions } : current);
    };
    // Give newly mounted destinations a native layout pass before measuring.
    let started = false;
    const start = () => {
      if (started || cancelled) return;
      started = true;
      void prepare();
    };
    const frame = requestAnimationFrame(start);
    const fallback = setTimeout(start, 160);
    return () => { cancelled = true; cancelAnimationFrame(frame); clearTimeout(fallback); };
  }, [transitionState, surfaces, progress]);

  useLayoutEffect(() => {
    if (transitionState.outgoing === null || !transitionState.ready) return;
    const animation = Animated.timing(transitionState.progress, {
      duration: transitionState.duration,
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
        ? { ...current, outgoing: null, motions: new Map() } : current);
    };
    animation.start(({ finished }) => {
      if (finished) finishTransition();
    });
    const watchdog = setTimeout(() => {
      animation.stop();
      finishTransition();
    }, transitionState.duration + 200);
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
    // With a shared background, fade both content layers. Legacy opaque slides
    // keep the outgoing surface solid to avoid dimming their backgrounds.
    : { opacity: hasBackground ? progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 1 };
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
    <>
      {renderedLayers.map((layer) => {
        const isPreload = !layers.some((visibleLayer) => visibleLayer.index === layer.index);
        return (
          <Animated.View key={layer.index} accessibilityElementsHidden={isPreload} importantForAccessibility={isPreload ? "no-hide-descendants" : "auto"} pointerEvents={isPreload ? "none" : "auto"} style={isPreload ? styles.preload : [styles.layer, layer.style]}>
            <AudienceFocusSurface index={layer.index} surfaces={surfaces} motion={transitionState.motions.get(layer.index)}>
              <SlideCanvas>
                <DeckRenderer isPreparing={isPreload} isPreview={layer.index !== currentSlide} targetIndex={layer.index} />
              </SlideCanvas>
            </AudienceFocusSurface>
          </Animated.View>
        );
      })}
      {blackout && <View accessibilityLabel="Audience blacked out" style={styles.blackout} />}
    </>
  );
}

function AudienceFocusSurface({ children, index, motion, surfaces }: {
  children: ReactNode; index: number; motion?: FocusMotion; surfaces: Map<number, FocusSurface>;
}) {
  const [surface] = useState(createFocusSurface);
  useLayoutEffect(() => {
    surfaces.set(index, surface);
    return () => { if (surfaces.get(index) === surface) surfaces.delete(index); };
  }, [index, surface, surfaces]);
  return <FocusSurfaceContext.Provider value={{ surface, motion }}>{children}</FocusSurfaceContext.Provider>;
}

const styles = StyleSheet.create({
  blackout: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", zIndex: 2 },
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  // Full-size, opaque preparation surfaces sit behind the visible slides.
  // Opacity zero or a 1px layout prevents usable native snapshots.
  preload: { ...StyleSheet.absoluteFillObject, zIndex: -1 },
});
