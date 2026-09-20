import { useBackgroundIntensitySetting } from "./slidesSettings";
import { useValue } from "@legendapp/state/react";
import { BackgroundHost, useHasBackground, FocusSurfaceContext, createFocusSurface,
  measureFocusPair, prepareFocusSurface, invalidateFocusSurface, createFocusMotion, focusCamera, resolveTransition,
  type TransitionDefinition, type SlideTransition, type FocusMotion, type FocusSurface } from "@legend-apps/presentation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { slideTransitionStyles, visibleSlideStyle } from "./slideTransitions";
import { useNativeTransitionReady } from "./useNativeTransitionReady";
import { useRetainedTransitionStyle } from "./useRetainedTransitionStyle";
import { nativeTransitionStyles } from "./nativeTransitionStyles";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { setSlidesState, slidesState$ } from "./slidesStore";

// Temporary regression trace. Observation only; never drives animation frames.
type TransitionTrace = { from: number; to: number; startedAt: number; renderMs: number; preparedMs?: number; animationStartMs?: number; progressObservedMs?: number; endMs?: number; endedBy?: string };
const transitionTraces: TransitionTrace[] = [];
(globalThis as typeof globalThis & { slidesTransitionTrace: TransitionTrace[] }).slidesTransitionTrace = transitionTraces;
function beginTransitionTrace(from: number, to: number): TransitionTrace {
  const startedAt = slidesState$.slideStartedAt.peek();
  const trace = { from: from + 1, to: to + 1, startedAt, renderMs: Math.round(performance.now() - startedAt) };
  transitionTraces.push(trace);
  if (transitionTraces.length > 20) transitionTraces.shift();
  return trace;
}

export function AudienceWindow() {
  const intensity = useBackgroundIntensitySetting();
  const currentSlide = useValue(slidesState$.currentSlide);
  const color = useValue(() => slidesState$.config.theme.backgroundColor.get() ?? "#111827");
  return <BackgroundHost intensity={intensity} slideIndex={currentSlide} color={color}><AudienceContent /></BackgroundHost>;
}

function AudienceContent() {
  const currentStep = useValue(slidesState$.currentStep);
  const hasBackground = useHasBackground();
  const currentSlide = useValue(slidesState$.currentSlide);
  const lastPresented = useRef({ index: currentSlide, step: currentStep });
  useLayoutEffect(() => {
    lastPresented.current = { index: currentSlide, step: currentStep };
  }, [currentSlide, currentStep]);
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
    outgoingStep: 0,
    ...resolve(currentSlide, currentSlide),
    progress: new Animated.Value(1),
    ready: true,
    trace: undefined as TransitionTrace | undefined,
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
      outgoingStep: lastPresented.current.index === transitionState.index ? lastPresented.current.step : 0,
      ...resolved,
      progress: new Animated.Value(cut ? 1 : 0),
      ready: cut || (!resolved.focus && !hasShared),
      trace: beginTransitionTrace(transitionState.index, currentSlide),
      duration: hasShared && resolved.duration === 0 ? 320 : resolved.duration,
      motions: new Map(),
    });
  }
  const transition = transitionState.kind;
  const { progress, outgoing: previousSlide } = transitionState;
  const nativeReady = useNativeTransitionReady(progress, previousSlide !== null);

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
        const [source, destination] = await measureFocusPair(from, to, transitionState.focus, transitionState.reverse);
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
      if (!cancelled && transitionState.trace) transitionState.trace.preparedMs = Math.round(performance.now() - transitionState.trace.startedAt);
      if (!cancelled && transitionState.kind === "none" && !motions.size) progress.setValue(1);
      if (!cancelled) setTransitionState((current) => current === transitionState
        ? { ...current, ready: true, motions,
          outgoing: current.kind === "none" && !motions.size ? null : current.outgoing } : current);
    };
    // Child layout effects have registered the preloaded surfaces. Fabric
    // measurement reads committed layout; another JS frame only delays startup.
    void prepare();
    return () => { cancelled = true; };
  }, [transitionState, surfaces, progress]);

  useLayoutEffect(() => {
    if (transitionState.outgoing === null || !transitionState.ready) return;
    const trace = transitionState.trace;
    if (trace) trace.animationStartMs = Math.round(performance.now() - trace.startedAt);
    const listener = transitionState.progress.addListener(({ value }) => {
      if (value > 0 && trace && trace.progressObservedMs === undefined) {
        trace.progressObservedMs = Math.round(performance.now() - trace.startedAt);
        transitionState.progress.removeListener(listener);
      }
    });
    const animation = Animated.timing(transitionState.progress, {
      duration: transitionState.duration,
      easing: transitionState.definition?.easing === "linear" ? Easing.linear : transitionState.definition?.easing === "ease-in-out" ? Easing.inOut(Easing.cubic) : Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    let settled = false;
    const finishTransition = (endedBy: string) => {
      if (settled) return;
      settled = true;
      transitionState.progress.removeListener(listener);
      if (trace) {
        trace.endMs = Math.round(performance.now() - trace.startedAt);
        trace.endedBy = endedBy;
        console.info("Slides transition", JSON.stringify(trace));
      }
      transitionState.progress.setValue(1);
      setTransitionState((current) => current === transitionState
        ? { ...current, outgoing: null, motions: new Map() } : current);
    };
    animation.start(({ finished }) => {
      if (finished) finishTransition("native-completion");
    });
    const watchdog = setTimeout(() => {
      animation.stop();
      finishTransition("watchdog");
    }, transitionState.duration + 200);
    return () => {
      settled = true;
      transitionState.progress.removeListener(listener);
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
  const visibleStyle = visibleSlideStyle(progress);
  const layers = outgoingSlide === null
    ? [{ index: currentSlide, style: transitionState.definition ? visibleStyle : enteringStyle }]
    : [
        { index: outgoingSlide, style: transitionState.definition ? visibleStyle : outgoingStyle },
        { index: currentSlide, style: transitionState.definition ? visibleStyle : enteringStyle },
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
        // Measurements being ready does not mean Fabric has applied the graph.
        // Reveal only after its first native progress event, keeping the live
        // content measurable behind the background until then.
        const behindBackground = isPreload || layer.index === currentSlide && (!transitionState.ready || !nativeReady);
        return (
          <AudienceLayer key={layer.index} preparing={isPreload} behindBackground={behindBackground} style={isPreload ? visibleStyle : layer.style}>
            <AudienceFocusSurface layoutKey={`${revision}:${layer.index === currentSlide ? currentStep : layer.index === outgoingSlide ? transitionState.outgoingStep : 0}`} index={layer.index} surfaces={surfaces} motion={transitionState.motions.get(layer.index)}>
              <SlideCanvas>
                <UserTransitionLayer definition={isPreload ? undefined : transitionState.definition}
                  reference={transitionState.reference} progress={progress} incoming={layer.index === currentSlide}
                  preparing={isPreload} settled={previousSlide === null} reverse={transitionState.reverse} hasBackground={hasBackground} shared={transitionState.motions.size > 0}>
                  <DeckRenderer isPreparing={isPreload} isOutgoing={!isPreload && layer.index !== currentSlide} isPreview={layer.index !== currentSlide} targetIndex={layer.index}
                    targetStep={layer.index === outgoingSlide ? transitionState.outgoingStep : undefined} />
                </UserTransitionLayer>
              </SlideCanvas>
            </AudienceFocusSurface>
          </AudienceLayer>
        );
      })}
      {blackout && <View accessibilityLabel="Audience blacked out" style={styles.blackout} />}
    </>
  );
}

function AudienceLayer({ children, style, preparing, behindBackground }: {
  children: ReactNode; style: Animated.WithAnimatedObject<import("react-native").ViewStyle>;
  preparing: boolean; behindBackground: boolean;
}) {
  const retainedStyle = useRetainedTransitionStyle(style, preparing);
  return <Animated.View accessibilityElementsHidden={preparing} importantForAccessibility={preparing ? "no-hide-descendants" : "auto"}
    pointerEvents={preparing ? "none" : "auto"} style={[styles.layer, retainedStyle, { zIndex: behindBackground ? -1 : 1 }]}>{children}</Animated.View>;
}

function UserTransitionLayer({ children, definition, reference, progress, incoming, reverse, hasBackground, shared, settled, preparing }: {
  children: ReactNode; definition?: TransitionDefinition; reference: SlideTransition; progress: Animated.Value;
  incoming: boolean; settled: boolean; preparing: boolean; reverse: boolean; hasBackground: boolean; shared: boolean;
}) {
  const width = useValue(() => slidesState$.config.width.get() ?? 1920);
  const height = useValue(() => slidesState$.config.height.get() ?? 1080);
  let style: Animated.WithAnimatedObject<import("react-native").ViewStyle> = visibleSlideStyle(progress);
  let failure: string | undefined;
  if (definition && !settled) {
    try {
      style = nativeTransitionStyles(definition, progress, {
        direction: reverse ? "backward" : "forward", width, height,
        options: typeof reference === "object" && "options" in reference ? reference.options ?? {} : {}, hasBackground,
      }, incoming, shared);
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
  const retainedStyle = useRetainedTransitionStyle(style, preparing);
  return <Animated.View style={[{ flex: 1 }, retainedStyle]}>{children}</Animated.View>;
}

function AudienceFocusSurface({ children, index, motion, surfaces, layoutKey }: {
  children: ReactNode; index: number; motion?: FocusMotion; surfaces: Map<number, FocusSurface>; layoutKey: string;
}) {
  const [surface] = useState(createFocusSurface);
  useLayoutEffect(() => {
    invalidateFocusSurface(surface);
    void prepareFocusSurface(surface);
  }, [surface, layoutKey]);
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
