import { useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { createContext, useContext, useId, useLayoutEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useValue } from "@legendapp/state/react";
import type { Observable } from "@legendapp/state";
import { PresentationObservableProvider, usePresentation$ } from "./runtime";
import { useRuntimeProjection } from "./useRuntimeProjection";
import type { PresentationRuntime } from "./types";

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

/** Declare in a template or slide. Higher priority overrides the template background. */
export function Background({ children, priority = 0, intensityMultiplier = 1, maxIntensity = Infinity }: { children?: ReactNode; priority?: number; intensityMultiplier?: number; maxIntensity?: number }) {
  const register = useContext(RegistryContext);
  const runtime$ = usePresentation$();
  const id = useId();
  useLayoutEffect(() => {
    register?.(id, { children, runtime$, priority, intensityMultiplier, maxIntensity });
    return () => register?.(id, undefined);
  }, [register, id, children, runtime$, priority, intensityMultiplier, maxIntensity]);
  return null;
}

export function useBackgroundIntensity() { return useContext(IntensityContext); }
export function useBackgroundSize() { return useContext(SizeContext); }
export function useHasBackground() { return useContext(HasBackgroundContext); }
export function useBackgroundHost() { return useContext(RegistryContext) !== null; }

/** One host per audience window or presenter preview, outside the scaled content. */
export function BackgroundHost({ children, slideIndex, color, isPreview = false, intensity = 1 }: { children: ReactNode; slideIndex: number; color: string; isPreview?: boolean; intensity?: number }) {
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
  const selected = useValue(() => Object.values(entries).filter((entry) => entry.runtime$.slideIndex.get() === slideIndex)
    .sort((a, b) => b.priority - a.priority)[0]);
  const brightnessScale=useSharedValue(1);
  const motion=useSharedValue<BackgroundMotion>({time:0,raw:0,burst:3.5,slideIndex:-1,owner:""});
  const multiplier=selected?.intensityMultiplier ?? 1;
  const ceiling=selected?.maxIntensity ?? Infinity;
  const target=intensity>0?Math.min(multiplier,ceiling/intensity):1;
  useLayoutEffect(()=>{
    brightnessScale.value=isPreview || target!==1 ? target : withTiming(1,{duration:1200});
  },[brightnessScale,target,isPreview]);
  return (
    <MotionContext.Provider value={motion}>
    <BrightnessScaleContext.Provider value={brightnessScale}>
    <IntensityContext.Provider value={intensity}>
      <RegistryContext.Provider value={register}>
        <HasBackgroundContext.Provider value={Boolean(selected)}>
          <View style={[styles.host, { backgroundColor: color }]} onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
          }}>
            <View pointerEvents="none" style={[styles.background, { backgroundColor: color }]}>
              <SizeContext.Provider value={size}>
                {selected && <SelectedBackground entry={selected} isPreview={isPreview} />}
              </SizeContext.Provider>
            </View>
            {children}
          </View>
        </HasBackgroundContext.Provider>
      </RegistryContext.Provider>
    </IntensityContext.Provider>
    </BrightnessScaleContext.Provider>
    </MotionContext.Provider>
  );
}
function SelectedBackground({ entry, isPreview }: { entry: Entry; isPreview: boolean }) {
  const sourceRuntime$ = entry.runtime$;
  const runtime$ = useRuntimeProjection(() => ({ ...sourceRuntime$.get(), isActive: !isPreview, isPreview, isPreparing: false, playbackPhase: isPreview ? "preview" : "playing", playbackScope: "background" }), [sourceRuntime$, isPreview]);
  return <PresentationObservableProvider value={runtime$}>{entry.children}</PresentationObservableProvider>;
}

const styles = StyleSheet.create({
  host: { flex: 1, overflow: "hidden" },
  background: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
});
