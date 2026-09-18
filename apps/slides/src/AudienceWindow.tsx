import { useValue } from "@legendapp/state/react";
import { BackgroundHost, useHasBackground, FocusSurfaceContext, createFocusSurface,
  measureFocusSurface, createFocusMotion, focusCamera, resolveTransition,
  type TransitionDefinition, type SlideTransition, type FocusMotion, type FocusSurface } from "@legend-apps/presentation";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { slideTransitionStyles } from "./slideTransitions";
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
  const definitions = useValue(slidesState$.transitions);
  const resolve = (from: number, to: number) => {
    const resolved = resolveTransition(from, to, slides, defaultTransition);
    const definition = resolved.focus ? undefined : definitions[resolved.kind];
    const reference = resolved.reference;
    const configuredDuration = typeof reference === "object" ? reference.duration : undefined;
    const duration = configuredDuration ?? definition?.duration ?? resolved.duration;
    return { ...resolved, definition, duration: Number.isFinite(duration) ? Math.max(0, Math.min(10000, duration)) : 320 };
  };
  const revision = useValue(slidesState$.revision);
  const slideCount = slides.length;
  const [surfaces] = useState(() => new Map<number, FocusSurface>());
  const [transitionState, setTransitionState] = useState(() => ({
    index: currentSlide,
    revision,
    outgoing: null as number | null,
    ...resolve(currentSlide, currentSlide),
    progress: new Animated.Value(1),
    ready: true,
    motions: new Map<number, FocusMotion>(),
  }));
  // Allocate the incoming opacity with its new layer tree. Resetting a shared
  // Animated.Value here would also hide the still-mounted outgoing slide.
  if (transitionState.index !== currentSlide || transitionState.revision !== revision) {
    const resolved = resolve(transitionState.index, currentSlide);
    // Markers opt into motion even when the slide itself uses a cut.
    const hasShared = resolved.definition?.sharedElements !== "slide" && [...(surfaces.get(transitionState.index)?.entries ?? [])]
      .some((entry) => entry.kind === "element");
    const cut = transitionState.revision !== revision ||
      (!hasShared && (resolved.kind === "none" || resolved.duration === 0));
    setTransitionState({
      index: currentSlide,
      revision,
      outgoing: cut ? null : transitionState.index,
      ...resolved,
      progress: new Animated.Value(cut ? 1 : 0),
      ready: cut || (!resolved.focus && !hasShared),
      duration: hasShared && resolved.duration === 0 ? 320 : resolved.duration,
      motions: new Map(),
    });
  }
  const transition = transitionState.kind;
  const { progress, outgoing: previousSlide } = transitionState;

  useEffect(() => {
    setSlidesState({ audienceOpen: true });
  }, []);

  useLayoutEffect(() => {
    if (transitionState.ready || transitionState.outgoing === null) return;
    let cancelled = false;
    const prepare = async () => {
      const from = surfaces.get(transitionState.outgoing!);
      const to = surfaces.get(transitionState.index);
      const motions = new Map<number, FocusMotion>();
      if (from && to) {
        const [source, destination] = await Promise.all([measureFocusSurface(from), measureFocusSurface(to)]);
        const sourceMotion = createFocusMotion(progress);
        const destinationMotion = createFocusMotion(progress);
        if (transitionState.focus) {
          const overview = transitionState.reverse ? destination : source;
          const region = overview.regions.get(transitionState.focus.from);
          const surface = transitionState.reverse ? to : from;
          if (region && surface.width > 0 && surface.height > 0) {
            const camera = focusCamera(region, surface);
            if (transitionState.reverse) destinationMotion.cameraFrom = camera;
            else sourceMotion.cameraTo = camera;
            motions.set(transitionState.outgoing!, sourceMotion);
            motions.set(transitionState.index, destinationMotion);
          }
        }
        for (const [id, sourceRect] of source.elements) {
          const destinationRect = destination.elements.get(id);
          if (!destinationRect) continue;
          sourceMotion.elements.set(id, { from: sourceRect, to: destinationRect, own: sourceRect });
          destinationMotion.elements.set(id, { from: sourceRect, to: destinationRect, own: destinationRect });
        }
        if (sourceMotion.elements.size) {
          // The slide translation is in window points; shared geometry is in
          // logical slide points inside ScaledView.
          if (!transitionState.definition && transitionState.kind === "slide") {
            sourceMotion.cameraTo = { x: -90 / (from.scale || 1), y: 0, scale: 1 };
            destinationMotion.cameraFrom = { x: 180 / (to.scale || 1), y: 0, scale: 1 };
          } else if (!transitionState.definition && transitionState.kind === "reveal-up") {
            destinationMotion.cameraFrom = { x: 0, y: 20 / (to.scale || 1), scale: 1 };
          }
          motions.set(transitionState.outgoing!, sourceMotion);
          motions.set(transitionState.index, destinationMotion);
        }
      }
      if (!cancelled && transitionState.kind === "none" && !motions.size) progress.setValue(1);
      if (!cancelled) setTransitionState((current) => current === transitionState
        ? { ...current, ready: true, motions,
          outgoing: current.kind === "none" && !motions.size ? null : current.outgoing } : current);
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
      easing: transitionState.definition?.easing === "linear" ? Easing.linear : transitionState.definition?.easing === "ease-in-out" ? Easing.inOut(Easing.cubic) : Easing.out(Easing.cubic),
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

  const { entering: enteringStyle, outgoing: outgoingStyle } = slideTransitionStyles(
    transitionState.definition ? "none" : transition, progress, hasBackground, transitionState.motions.size > 0,
  );
  // Render from state: ref changes do not invalidate React's cached output.
  // The layout effect establishes the outgoing layer before paint; cuts never
  // have one, even when the previous transition has not cleaned up yet.
  const outgoingSlide = previousSlide === currentSlide ? null : previousSlide;
  const layers = outgoingSlide === null
    ? [{ index: currentSlide, style: transitionState.definition ? {} : enteringStyle }]
    : [
        { index: outgoingSlide, style: transitionState.definition ? {} : outgoingStyle },
        { index: currentSlide, style: transitionState.definition ? {} : enteringStyle },
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
                <UserTransitionLayer definition={isPreload ? undefined : transitionState.definition}
                  reference={transitionState.reference} progress={progress} incoming={layer.index === currentSlide}
                  settled={previousSlide === null} reverse={transitionState.reverse} hasBackground={hasBackground} shared={transitionState.motions.size > 0}>
                  <DeckRenderer isPreparing={isPreload} isPreview={layer.index !== currentSlide} targetIndex={layer.index} />
                </UserTransitionLayer>
              </SlideCanvas>
            </AudienceFocusSurface>
          </Animated.View>
        );
      })}
      {blackout && <View accessibilityLabel="Audience blacked out" style={styles.blackout} />}
    </>
  );
}

function UserTransitionLayer({ children, definition, reference, progress, incoming, reverse, hasBackground, shared, settled }: {
  children: ReactNode; definition?: TransitionDefinition; reference: SlideTransition; progress: Animated.Value;
  incoming: boolean; settled: boolean; reverse: boolean; hasBackground: boolean; shared: boolean;
}) {
  const width = useValue(() => slidesState$.config.width.get() ?? 1920);
  const height = useValue(() => slidesState$.config.height.get() ?? 1080);
  const [clock, setClock] = useState<{ source: Animated.Value; value: number }>(() => ({ source: progress, value: 0 }));
  const value = settled ? 1 : clock.source === progress ? clock.value : 0;
  useLayoutEffect(() => {
    if (definition) {
      // addListener follows the host's JS-driven animation; no second clock or timer.
      const id = progress.addListener(({ value }) => setClock({ source: progress, value }));
      return () => progress.removeListener(id);
    }
  }, [progress, definition]);
  let style = {};
  let failure: string | undefined;
  if (definition && value < 1) {
    try {
      const result = definition.styles({ progress: value, direction: reverse ? "backward" : "forward", width, height,
        options: typeof reference === "object" && "options" in reference ? reference.options ?? {} : {}, hasBackground });
      style = incoming ? result.incoming : result.outgoing;
      if (!style || typeof style !== "object" || Array.isArray(style)) throw new Error("styles must return incoming and outgoing style objects");
      if (shared) style = { ...style, transform: undefined };
    } catch (error) {
      failure = `Transition failed: ${error instanceof Error ? error.message : String(error)}`;
      style = { opacity: incoming ? 1 : 0 };
    }
  }
  useEffect(() => {
    if (failure) {
      progress.stopAnimation();
      progress.setValue(1);
      setSlidesState((state) => ({ runtimeErrors: state.runtimeErrors.includes(failure) ? state.runtimeErrors : [...state.runtimeErrors, failure] }));
    }
  }, [failure, progress]);
  return <View style={[{ flex: 1 }, style]}>{children}</View>;
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
