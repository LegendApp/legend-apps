import { useBackgroundIntensitySetting } from "./slidesSettings";
import { useValue } from "@legendapp/state/react";
import { SnapshotCaptureBoundary, NavigationTransitionContext, useHasBackground, FocusSurfaceContext, createFocusSurface,
  measureFocusPair, prepareFocusSurface, invalidateFocusSurface, createFocusMotion, focusCamera, resolveTransition,
  type TransitionDefinition, type SlideTransition, type FocusMotion, type FocusSurface } from "@legend-apps/presentation";
import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, runOnJS, runOnUI, withTiming } from "react-native-reanimated";
import { createTransitionProgress, useTransitionStyle, type TransitionProgress, type TransitionStyle } from "@legend-apps/presentation";
import { slideTransitionStyles, visibleSlideStyle } from "./slideTransitions";
import { useNativeTransitionReady } from "./useNativeTransitionReady";
import { useRetainedTransitionStyle } from "./useRetainedTransitionStyle";
import { nativeTransitionStyles } from "./nativeTransitionStyles";
import { DeckRenderer, SlideCanvas, SlideBackgroundHost } from "./DeckRenderer";
import { setSlidesState, slidesState$ } from "./slidesStore";

function preparationIndexes(index: number, count: number) {
  const first = Math.max(0, index - 2);
  const last = Math.min(count - 1, index + 2);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => first + offset);
}

export function AudienceWindow() {
  const intensity = useBackgroundIntensitySetting();
  const currentSlide = useValue(slidesState$.currentSlide);
  const color = useValue(() => slidesState$.config.theme.backgroundColor.get() ?? "#111827");
  return <SlideBackgroundHost intensity={intensity} slideIndex={currentSlide} color={color}><AudienceContent /></SlideBackgroundHost>;
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
    preparedIndexes: preparationIndexes(currentSlide, slideCount),
    revision,
    outgoing: null as number | null,
    outgoingStep: 0,
    ...resolve(currentSlide, currentSlide),
    progress: createTransitionProgress(1),
    ready: true,
    motions: new Map<number, FocusMotion>(),
  }));
  // Allocate the incoming opacity with its new layer tree. Resetting a shared
  // TransitionProgress here would also hide the still-mounted outgoing slide.
  if (transitionState.index !== currentSlide || transitionState.revision !== revision) {
    const resolved = resolve(transitionState.index, currentSlide);
    // Markers opt into motion even when the slide itself uses a cut.
    const hasShared = resolved.definition?.sharedElements !== "slide" && [...(surfaces.get(transitionState.index)?.entries ?? [])]
      .some((entry) => entry.kind === "element");
    const cut = transitionState.revision !== revision ||
      (!hasShared && (resolved.kind === "none" || resolved.duration === 0));
    setTransitionState({
      index: currentSlide,
      preparedIndexes: transitionState.revision !== revision ? preparationIndexes(currentSlide, slideCount)
        : cut ? [...new Set([...transitionState.preparedIndexes, currentSlide])]
          .filter(index => preparationIndexes(currentSlide, slideCount).includes(index)) : transitionState.preparedIndexes,
      revision,
      outgoing: cut ? null : transitionState.index,
      outgoingStep: lastPresented.current.index === transitionState.index ? lastPresented.current.step : 0,
      ...resolved,
      progress: createTransitionProgress(cut ? 1 : 0),
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
      if (!cancelled && transitionState.kind === "none" && !motions.size) progress.value = 1;
      if (!cancelled) setTransitionState((current) => current === transitionState
        ? { ...current, ready: true, motions,
          preparedIndexes: current.kind === "none" && !motions.size
            ? [...new Set([...current.preparedIndexes, current.index])]
              .filter(index => preparationIndexes(current.index, slideCount).includes(index)) : current.preparedIndexes,
          outgoing: current.kind === "none" && !motions.size ? null : current.outgoing } : current);
    };
    // Child layout effects have registered the preloaded surfaces. Fabric
    // measurement reads committed layout; another JS frame only delays startup.
    void prepare();
    return () => { cancelled = true; };
  }, [transitionState, surfaces, progress]);

  useLayoutEffect(() => {
    if (transitionState.outgoing === null || !transitionState.ready) return;
    let settled = false;
    const finishTransition = () => {
      if (settled) return;
      settled = true;
      transitionState.progress.value = 1;
      setTransitionState((current) => current === transitionState
        ? { ...current, outgoing: null,
          preparedIndexes: [...new Set([...current.preparedIndexes, current.index])]
            .filter(index => preparationIndexes(current.index, slideCount).includes(index)),
          motions: new Map() } : current);
    };
    const clock = transitionState.progress;
    const duration = transitionState.duration;
    const easing = transitionState.definition?.easing === "linear" ? Easing.linear : transitionState.definition?.easing === "ease-in-out" ? Easing.inOut(Easing.cubic) : Easing.out(Easing.cubic);
    runOnUI(() => {
      "worklet";
      clock.value = withTiming(1, { duration, easing }, finished => { if (finished) runOnJS(finishTransition)(); });
    })();
    const watchdog = setTimeout(() => {
      cancelAnimation(clock);
      finishTransition();
    }, transitionState.duration + 200);
    return () => {
      settled = true;
      clearTimeout(watchdog);
      cancelAnimation(clock);
    };
  }, [transitionState]);

  useEffect(() => {
    if (transitionState.outgoing !== null || !transitionState.ready) return;
    const desired = preparationIndexes(transitionState.index, slideCount);
    const missing = desired.filter(index => !transitionState.preparedIndexes.includes(index))
      .sort((a, b) => Math.abs(a - transitionState.index) - Math.abs(b - transitionState.index))[0];
    if (missing === undefined) return;
    let cancelled = false;
    const idle = requestIdleCallback(() => {
      if (cancelled) return;
      startTransition(() => setTransitionState(current => !cancelled && current === transitionState
        ? { ...current, preparedIndexes: [...current.preparedIndexes, missing] } : current));
    });
    return () => { cancelled = true; cancelIdleCallback(idle); };
  }, [transitionState, slideCount]);

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
  // Retain keyed surfaces during motion, then replenish one neighbor per idle
  // commit. Finishing a transition must not synchronously cold-mount its slots.
  const preparedIndexes = transitionState.preparedIndexes;
  const renderedLayers = [
    ...preparedIndexes.filter((index) => !layers.some((layer) => layer.index === index))
      .map((index) => ({ index, style: styles.preload })),
    ...layers,
  ];

  return (
    <SnapshotCaptureBoundary suspended={previousSlide !== null}>
      {renderedLayers.map((layer) => {
        const isPreload = !layers.some((visibleLayer) => visibleLayer.index === layer.index);
        // Measurements being ready does not mean Fabric has applied the graph.
        // Reveal only after its first native progress event, keeping the live
        // content measurable behind the background until then.
        const incoming = layer.index === currentSlide;
        const behindBackground = isPreload || incoming && !transitionState.ready;
        return (
          <AudienceSlide key={layer.index} index={layer.index} preparing={isPreload} incoming={incoming}
            transitioning={incoming && previousSlide !== null} behindBackground={behindBackground}
            style={isPreload ? visibleStyle : layer.style} progress={progress} surfaces={surfaces}
            layoutKey={`${revision}:${incoming ? currentStep : layer.index === outgoingSlide ? transitionState.outgoingStep : 0}`}
            motion={transitionState.motions.get(layer.index)} definition={isPreload ? undefined : transitionState.definition}
            reference={transitionState.reference} settled={previousSlide === null} reverse={transitionState.reverse}
            hasBackground={hasBackground} shared={transitionState.motions.size > 0}
            targetStep={layer.index === outgoingSlide ? transitionState.outgoingStep : undefined} />
        );
      })}
      {blackout && <View accessibilityLabel="Audience blacked out" style={styles.blackout} />}
    </SnapshotCaptureBoundary>
  );
}

function AudienceSlide({ index, preparing, incoming, transitioning, behindBackground, style, progress, surfaces,
  layoutKey, motion, definition, reference, settled, reverse, hasBackground, shared, targetStep }: {
  index: number; preparing: boolean; incoming: boolean; transitioning: boolean; behindBackground: boolean;
  style: TransitionStyle; progress: TransitionProgress; surfaces: Map<number, FocusSurface>; layoutKey: string;
  motion?: FocusMotion; definition?: TransitionDefinition; reference: SlideTransition; settled: boolean;
  reverse: boolean; hasBackground: boolean; shared: boolean; targetStep?: number;
}) {
  const outgoing = !preparing && !incoming;
  return <AudienceLayer preparing={preparing} behindBackground={behindBackground} style={style}
    progress={progress} transitioning={transitioning}>
    <AudienceFocusSurface layoutKey={layoutKey} index={index} surfaces={surfaces} motion={motion}>
      <SlideCanvas targetIndex={index}>
        <UserTransitionLayer definition={definition} reference={reference} progress={progress} incoming={incoming}
          preparing={preparing} settled={settled} reverse={reverse} hasBackground={hasBackground} shared={shared}>
          <NavigationTransitionContext.Provider value={{ progress, outgoing }}>
            <DeckRenderer isPreparing={preparing} isOutgoing={outgoing} isPreview={!incoming}
              targetIndex={index} targetStep={targetStep} />
          </NavigationTransitionContext.Provider>
        </UserTransitionLayer>
      </SlideCanvas>
    </AudienceFocusSurface>
  </AudienceLayer>;
}

function AudienceLayer({ children, style, preparing, behindBackground, progress, transitioning }: {
  children: ReactNode; style: TransitionStyle;
  preparing: boolean; behindBackground: boolean; progress: TransitionProgress; transitioning: boolean;
}) {
  const nativeReady = useNativeTransitionReady(progress, transitioning);
  const retainedStyle = useRetainedTransitionStyle(style, preparing);
  const animatedStyle = useTransitionStyle({ opacity: 1, transform: [], ...retainedStyle });
  return <Animated.View accessibilityElementsHidden={preparing} importantForAccessibility={preparing ? "no-hide-descendants" : "auto"}
    pointerEvents={preparing ? "none" : "auto"} style={[styles.layer, animatedStyle, { zIndex: behindBackground || !nativeReady ? -1 : 1 }]}>{children}</Animated.View>;
}

function UserTransitionLayer({ children, definition, reference, progress, incoming, reverse, hasBackground, shared, settled, preparing }: {
  children: ReactNode; definition?: TransitionDefinition; reference: SlideTransition; progress: TransitionProgress;
  incoming: boolean; settled: boolean; preparing: boolean; reverse: boolean; hasBackground: boolean; shared: boolean;
}) {
  const width = useValue(() => slidesState$.config.width.get() ?? 1920);
  const height = useValue(() => slidesState$.config.height.get() ?? 1080);
  let style: TransitionStyle = visibleSlideStyle(progress);
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
      cancelAnimation(progress);
      progress.value = 1;
      setSlidesState((state) => ({ runtimeErrors: state.runtimeErrors.includes(failure) ? state.runtimeErrors : [...state.runtimeErrors, failure] }));
    }
  }, [failure, progress]);
  const retainedStyle = useRetainedTransitionStyle(style, preparing);
  const normalizedStyle = useMemo(() => ({ opacity: 1, transform: [], ...retainedStyle }), [retainedStyle]);
  const animatedStyle = useTransitionStyle(normalizedStyle);
  return <Animated.View style={[{ flex: 1 }, animatedStyle]}>{children}</Animated.View>;
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
