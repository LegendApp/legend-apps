import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { PreparationBoundary, usePreparationTask } from "./PreparationBoundary";

const SurfaceSuspensionContext = createContext<{ suspended: boolean; signal: SharedValue<boolean> } | null>(null);
export function useSurfaceSuspension() { return useContext(SurfaceSuspensionContext); }

/** Keep the last drawn generation until its replacement finishes preparation. */
export function RetainedSurface({ identity, children }: { identity: string; children: ReactNode }) {
  const suspended = useSurfaceSuspension()?.suspended ?? false;
  const [state, setState] = useState(() => ({ current: { identity, children }, previous: undefined as { identity: string; children: ReactNode } | undefined, ready: false }));
  if (state.current.identity !== identity) {
    const returning = state.previous?.identity === identity;
    setState({ current: { identity, children }, previous: returning ? undefined : state.ready ? state.current : state.previous, ready: returning, });
  } else if (state.current.children !== children) {
    setState({ ...state, current: { identity, children } });
  }
  usePreparationTask(!state.ready);
  const layers = state.previous ? [state.previous, state.current] : [state.current];
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {layers.map(layer => {
      const incoming = layer === state.current;
      return <SurfaceLayer key={layer.identity} suspended={suspended || !incoming} preparing={incoming && !state.ready}
        onReady={incoming ? () => setState(current => current.current.identity === layer.identity && !current.ready
          ? { ...current, ready: true, previous: undefined } : current) : undefined}>
        {layer.children}
      </SurfaceLayer>;
    })}
  </View>;
}
function SurfaceLayer({ children, suspended, preparing, onReady }: { children: ReactNode; suspended: boolean; preparing: boolean; onReady?: () => void }) {
  const signal = useSharedValue(suspended);
  // Queued callbacks must freeze before the surrounding clock publishes navigation.
  useLayoutEffect(() => { signal.value = suspended; }, [signal, suspended]);
  const value = useMemo(() => ({ suspended, signal }), [suspended, signal]);
  return <View style={[StyleSheet.absoluteFill, preparing && styles.preparing]}>
    <SurfaceSuspensionContext.Provider value={value}>
      <PreparationBoundary onReady={onReady}>{children}</PreparationBoundary>
    </SurfaceSuspensionContext.Provider>
  </View>;
}
const styles = StyleSheet.create({ preparing: { opacity: 0 } });
