import { createContext, useContext, useId, useLayoutEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useObservable, useValue } from "@legendapp/state/react";
import type { Observable } from "@legendapp/state";
import { PresentationObservableProvider, usePresentation$ } from "./runtime";
import type { PresentationRuntime } from "./types";

type Entry = { children: ReactNode; runtime$: Observable<PresentationRuntime>; priority: number };
type Registry = (id: string, entry: Entry | undefined) => void;
const RegistryContext = createContext<Registry | null>(null);
const SizeContext = createContext({ width: 1920, height: 1080 });
const HasBackgroundContext = createContext(false);

/** Declare in a template or slide. Higher priority overrides the template background. */
export function Background({ children, priority = 0 }: { children?: ReactNode; priority?: number }) {
  const register = useContext(RegistryContext);
  const runtime$ = usePresentation$();
  const id = useId();
  useLayoutEffect(() => {
    register?.(id, { children, runtime$, priority });
    return () => register?.(id, undefined);
  }, [register, id, children, runtime$, priority]);
  return null;
}

export function useBackgroundSize() { return useContext(SizeContext); }
export function useHasBackground() { return useContext(HasBackgroundContext); }
export function useBackgroundHost() { return useContext(RegistryContext) !== null; }

/** One host per audience window or presenter preview, outside the scaled content. */
export function BackgroundHost({ children, slideIndex, color, isPreview = false }: { children: ReactNode; slideIndex: number; color: string; isPreview?: boolean }) {
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
  return (
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
  );
}
function SelectedBackground({ entry, isPreview }: { entry: Entry; isPreview: boolean }) {
  const runtime$ = useObservable(() => ({ ...entry.runtime$.get(), isActive: !isPreview, isPreview, isPreparing: false }), [entry, isPreview]);
  return <PresentationObservableProvider value={runtime$}>{entry.children}</PresentationObservableProvider>;
}

const styles = StyleSheet.create({
  host: { flex: 1, overflow: "hidden" },
  background: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
});
