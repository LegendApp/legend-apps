import { useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { Children, Fragment, createContext, isValidElement, useCallback, useContext, useEffect, useId, useLayoutEffect, useState, type ReactNode, type ComponentType } from "react";
import { StyleSheet, View } from "react-native";
import { useValue } from "@legendapp/state/react";
import type { Observable } from "@legendapp/state";
import { PresentationObservableProvider, usePresentation$ } from "./runtime";
import { useRuntimeProjection } from "./useRuntimeProjection";
import type { PresentationRuntime } from "./types";
import { PreparationBoundary, usePreparationTask } from "./PreparationBoundary";

type Entry = { children: ReactNode; runtime$: Observable<PresentationRuntime>; priority: number; intensityMultiplier: number; maxIntensity: number };
type Registry = (id: string, entry: Entry | undefined) => void;
const RegistryContext = createContext<Registry | null>(null);
type BackgroundMotion = { time: number; raw: number; burst: number; slideIndex: number; owner: string };
const MotionContext=createContext<SharedValue<BackgroundMotion> | null>(null);
export function useBackgroundMotion(){return useContext(MotionContext);}
const BrightnessScaleContext=createContext<SharedValue<number> | null>(null);
export function useBackgroundBrightnessScale(){return useContext(BrightnessScaleContext);}
const IntensityContext = createContext(1);
const SizeContext = createContext({ width: 1920, height: 1080 });
const HasBackgroundContext = createContext(false);
const BackgroundReadyContext = createContext(true);
export function useBackgroundReady() { return useContext(BackgroundReadyContext); }

/** Declare in a template or slide. Higher priority overrides the template background. */
export function Background({ children, priority = 0, intensityMultiplier = 1, maxIntensity = Infinity }: { children?: ReactNode; priority?: number; intensityMultiplier?: number; maxIntensity?: number }) {
  const register = useContext(RegistryContext);
  const runtime$ = usePresentation$();
  const id = useId();
  useLayoutEffect(() => {
    register?.(id, { children, runtime$, priority, intensityMultiplier, maxIntensity });
    return () => register?.(id, undefined);
  }, [register, id, children, runtime$, priority, intensityMultiplier, maxIntensity]);
  useEffect(() => {
    if (!register || !runtime$.isPreparing.peek()) return;
    const idle = requestIdleCallback(() => prepareBackground(children));
    return () => cancelIdleCallback(idle);
  }, [register, children, runtime$]);
  return null;
}

/** Element types may define `prepareBackground(props)` to warm caches while their slide is prepared offscreen. */
function prepareBackground(children: ReactNode) {
  Children.forEach(children, child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    if (child.type === Fragment) prepareBackground(child.props.children);
    else (child.type as { prepareBackground?: (props: unknown) => void }).prepareBackground?.(child.props);
  });
}

export function useBackgroundIntensity() { return useContext(IntensityContext); }
export function useBackgroundSize() { return useContext(SizeContext); }
export function useHasBackground() { return useContext(HasBackgroundContext); }
export function useBackgroundHost() { return useContext(RegistryContext) !== null; }

/** One host per audience window or presenter preview, outside the scaled content. */
export function BackgroundHost({ children, slideIndex, color, isPreview = false, intensity = 1, boundary = Fragment, replacement }: { boundary?: ComponentType<{ children?: ReactNode }>; children: ReactNode; /** Shown instead of the declared background, which then never mounts. */ replacement?: ReactNode; slideIndex: number; color: string; isPreview?: boolean; intensity?: number }) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [register] = useState<Registry>(() => (id: string, entry: Entry | undefined) => setEntries((current) => {
    if (entry === undefined) {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    }
    return { ...current, [id]: entry };
  }));
  const [size, setSize] = useState({ width: 0, height: 0 });
  const selectedId = useValue(() => Object.keys(entries).filter(id => entries[id].runtime$.slideIndex.get() === slideIndex)
    .sort((a, b) => entries[b].priority - entries[a].priority)[0]);
  const selected = selectedId ? entries[selectedId] : undefined;
  // A cold slide registers in its layout effect. Retain the last surface through
  // that commit so its GPU and continuity state survive the registration gap.
  const [retained, setRetained] = useState<Entry>();
  useLayoutEffect(() => { setRetained(selected); }, [selected]);
  const visible = selected ?? retained;
  const readyKey = selectedId ? `${slideIndex}:${selectedId}` : undefined;
  const [preparedKey, setPreparedKey] = useState<string>();
  const ready = !!replacement || !visible || !!selected && preparedKey === readyKey;
  usePreparationTask(!ready);
  const backgroundPrepared = useCallback(() => { if (readyKey) setPreparedKey(readyKey); }, [readyKey]);
  const brightnessScale=useSharedValue(1);
  const motion=useSharedValue<BackgroundMotion>({time:0,raw:0,burst:3.5,slideIndex:-1,owner:""});
  const multiplier=selected?.intensityMultiplier ?? 1;
  const ceiling=selected?.maxIntensity ?? Infinity;
  const target=intensity>0?Math.min(multiplier,ceiling/intensity):1;
  useLayoutEffect(()=>{
    brightnessScale.value=isPreview || target!==1 ? target : withTiming(1,{duration:1200});
  },[brightnessScale,target,isPreview]);
  return (
    <BackgroundReadyContext.Provider value={ready}>
    <MotionContext.Provider value={motion}>
    <BrightnessScaleContext.Provider value={brightnessScale}>
    <IntensityContext.Provider value={intensity}>
      <RegistryContext.Provider value={register}>
        <HasBackgroundContext.Provider value={Boolean(replacement || visible)}>
          <View style={[styles.host, { backgroundColor: color }]} onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
          }}>
            <View pointerEvents="none" style={[styles.background, { backgroundColor: color }]}>
              <SizeContext.Provider value={size}>
                {replacement ?? (visible && <PreparationBoundary onReady={backgroundPrepared}><SelectedBackground entry={visible} retained={!selected} isPreview={isPreview} Boundary={boundary} /></PreparationBoundary>)}
              </SizeContext.Provider>
            </View>
            {children}
          </View>
        </HasBackgroundContext.Provider>
      </RegistryContext.Provider>
    </IntensityContext.Provider>
    </BrightnessScaleContext.Provider>
    </MotionContext.Provider>
    </BackgroundReadyContext.Provider>
  );
}
function SelectedBackground({ entry, retained, isPreview, Boundary }: { entry: Entry; retained: boolean; isPreview: boolean; Boundary: ComponentType<{ children?: ReactNode }> }) {
  const sourceRuntime$ = entry.runtime$;
  // The registration gap ends in layout effects; pausing here would discard the retained UI timestamp.
  const runtime$ = useRuntimeProjection(() => ({ ...sourceRuntime$.get(), isActive: !isPreview && !retained, isPreview, isPreparing: false,
    playbackPhase: isPreview ? "preview" : "playing", playbackScope: "background" }), [sourceRuntime$, isPreview, retained]);
  return <PresentationObservableProvider value={runtime$}><Boundary>{entry.children}</Boundary></PresentationObservableProvider>;
}

const styles = StyleSheet.create({
  host: { flex: 1, overflow: "hidden" },
  background: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
});
