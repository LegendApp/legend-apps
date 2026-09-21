import { createContext, useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { Animated, Text, View, type ViewProps } from "react-native";
import { renderNativeChildren } from "./nativeChildren";
import { identityCamera, validFocusRect, type FocusCamera, type FocusRect } from "./focusGeometry";

type Entry = { id: string; kind: "region" | "element"; view: View; offsetY?: number };
export type FocusSurface = {
  root: View | null;
  setRoot(root: View | null): void;
  setLayout(layout: { width: number; height: number }): void;
  entries: Set<Entry>;
  width: number;
  height: number;
  scale: number;
  layoutVersion: number;
  measurements?: { version: number; entries: Entry[]; result: FocusMeasurements };
  preparation?: Promise<void>;
  pendingMeasurements?: Map<Entry, Promise<FocusRect | undefined>>;
};
export type FocusMeasurements = { regions: Map<string, FocusRect>; elements: Map<string, FocusRect> };
export type FocusMotion = {
  progress: Animated.Value;
  cameraFrom: FocusCamera;
  cameraTo: FocusCamera;
  elements: Map<string, { from: FocusRect; to: FocusRect; own: FocusRect }>;
};
export const FocusSurfaceContext = createContext<{ surface: FocusSurface; motion?: FocusMotion } | null>(null);
/** Matched content should resize from its previous rectangle, not replay its entrance. */
export function useSharedElementTransition(id: string) {
  return useContext(FocusSurfaceContext)?.motion?.elements.has(id) ?? false;
}

const InsideSharedElement = createContext(false);
/** Layout stays fixed while positioned content moves with UI-thread transforms. */
export const FocusLayoutOffsetContext = createContext(0);

export function createFocusSurface(): FocusSurface {
  const surface: FocusSurface = {
    root: null, entries: new Set(), width: 0, height: 0, scale: 1, layoutVersion: 0,
    setRoot(root) { surface.root = root; invalidateFocusSurface(surface); },
    setLayout({ width, height }) {
      if (surface.width !== width || surface.height !== height) {
        surface.width = width; surface.height = height; invalidateFocusSurface(surface);
      }
    },
  };
  return surface;
}

export function invalidateFocusSurface(surface: FocusSurface) {
  surface.layoutVersion++;
  surface.measurements = undefined;
  surface.pendingMeasurements = undefined;
}

/** Layout/setup work only: preloaded slides finish this before navigation. */
export function prepareFocusSurface(surface: FocusSurface): Promise<void> {
  if (surface.preparation) return surface.preparation;
  surface.preparation = Promise.resolve().then(async () => {
    // Coalesce layout notifications from sibling markers in the same commit.
    const version = surface.layoutVersion;
    const entries = [...surface.entries];
    const result = await readFocusSurface(surface);
    if (surface.layoutVersion === version && entries.length === surface.entries.size && entries.every(entry => surface.entries.has(entry))) {
      surface.measurements = { version, entries, result };
    }
  }).finally(() => {
    surface.preparation = undefined;
    // A step/layout change during native measurement needs a new snapshot.
    if (!surface.measurements && surface.root && surface.entries.size) void prepareFocusSurface(surface);
  });
  return surface.preparation;
}

export function measureFocusSurface(surface: FocusSurface, include: (entry: Entry) => boolean = () => true): Promise<FocusMeasurements> {
  const cached = surface.measurements;
  if (cached && cached.version === surface.layoutVersion && cached.entries.length === surface.entries.size && cached.entries.every(entry => surface.entries.has(entry))) {
    const selected = cached.entries.filter(include);
    const select = (kind: Entry["kind"], map: Map<string, FocusRect>) => new Map([...map].filter(([id]) => selected.some(entry => entry.kind === kind && entry.id === id)));
    return Promise.resolve({ regions: select("region", cached.result.regions), elements: select("element", cached.result.elements) });
  }
  return readFocusSurface(surface, include);
}

/** Layout measurements ignore animated transforms and the physical display scale. */
async function readFocusSurface(surface: FocusSurface, include: (entry: Entry) => boolean = () => true): Promise<FocusMeasurements> {
  const regions = new Map<string, FocusRect>();
  const elements = new Map<string, FocusRect>();
  const duplicates = new Set<string>();
  const root = surface.root;
  if (!root) return { regions, elements };
  await Promise.all([...surface.entries].filter(include).map(async (entry) => {
    const rect = await readFocusEntry(surface, root, entry);
    if (rect && validFocusRect(rect)) {
      const map = entry.kind === "region" ? regions : elements;
      const key = `${entry.kind}:${entry.id}`;
      if (map.has(entry.id)) duplicates.add(key);
      if (!duplicates.has(key)) map.set(entry.id, rect);
      else map.delete(entry.id);
    }
  }));
  return { regions, elements };
}

/** Share only the requested entry: an unrelated preparation timeout must not hold up navigation. */
function readFocusEntry(surface: FocusSurface, root: View, entry: Entry): Promise<FocusRect | undefined> {
  const pending = surface.pendingMeasurements ??= new Map();
  const existing = pending.get(entry);
  if (existing) return existing;
  const version = surface.layoutVersion;
  const measurement = new Promise<FocusRect | undefined>((resolve) => {
    let finished = false;
    const finish = (rect?: FocusRect) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(surface.layoutVersion === version && surface.root === root && surface.entries.has(entry) ? rect : undefined);
    };
    // Native measurement callbacks can disappear when a slide unmounts mid-request.
    const timeout = setTimeout(() => finish(), 120);
    try {
      entry.view.measureLayout(root, (x, y, width, height) => finish({ x, y: y + (entry.offsetY ?? 0), width, height }), () => finish());
    } catch {
      finish();
    }
  });
  // Retain successful per-entry results while unrelated preparation entries
  // are still outstanding. Invalidation drops the whole version's map.
  void measurement.then(rect => { if (!rect || !validFocusRect(rect)) pending.delete(entry); });
  pending.set(entry, measurement);
  return measurement;
}

/** Ignore unrelated markers: missing callbacks there must not delay navigation. */
export function measureFocusPair(from: FocusSurface, to: FocusSurface, focus?: { from: string }, reverse = false) {
  const sourceIds = new Set([...from.entries].filter(entry => entry.kind === "element").map(entry => entry.id));
  const destinationIds = new Set([...to.entries].filter(entry => entry.kind === "element").map(entry => entry.id));
  const shared = (entry: Entry) => entry.kind === "element" && sourceIds.has(entry.id) && destinationIds.has(entry.id);
  return Promise.all([
    measureFocusSurface(from, entry => shared(entry) || (!reverse && entry.kind === "region" && entry.id === focus?.from)),
    measureFocusSurface(to, entry => shared(entry) || (reverse && entry.kind === "region" && entry.id === focus?.from)),
  ]);
}

const interpolate = (progress: Animated.Value, from: number, to: number) =>
  progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });

export function focusCameraStyle(motion?: FocusMotion) {
  if (!motion) return undefined;
  return {
    transformOrigin: "0px 0px" as const,
    transform: [
      { translateX: interpolate(motion.progress, motion.cameraFrom.x, motion.cameraTo.x) },
      { translateY: interpolate(motion.progress, motion.cameraFrom.y, motion.cameraTo.y) },
      { scale: interpolate(motion.progress, motion.cameraFrom.scale, motion.cameraTo.scale) },
    ],
  };
}

/** Root stays untransformed so measurement never samples the moving camera. */
export function FocusStage({ children, scale = 1 }: { children: ReactNode; scale?: number }) {
  const context = useContext(FocusSurfaceContext);
  const surface = context?.surface;
  useLayoutEffect(() => { if (surface) surface.scale = scale; }, [surface, scale]);
  const setRoot = useCallback((view: View | null) => { surface?.setRoot(view); }, [surface]);
  return (
    <View collapsable={false} ref={setRoot}
      onLayout={(event) => {
        surface?.setLayout(event.nativeEvent.layout);
        if (surface) void prepareFocusSurface(surface);
      }} style={{ flex: 1 }}>
      <Animated.View style={[{ flex: 1, overflow: "visible" }, focusCameraStyle(context?.motion)]}>
        {children}
      </Animated.View>
    </View>
  );
}

type MarkerProps = ViewProps & {
  id: string;
  /** Preserve text proportions while moving between differently sized containers. */
  resize?: "stretch" | "preserve";
};

function Marker({ id, kind, children, style, resize = "stretch", onLayout, ...props }: MarkerProps & { kind: Entry["kind"] }) {
  const context = useContext(FocusSurfaceContext);
  const nested = useContext(InsideSharedElement);
  const offsetY = useContext(FocusLayoutOffsetContext);
  const ref = useRef<View>(null);
  const surface = context?.surface;
  useLayoutEffect(() => {
    const view = ref.current;
    if (!surface || !view || (nested && kind === "element")) return;
    const entry = { id, kind, view, offsetY };
    surface.entries.add(entry);
    invalidateFocusSurface(surface);
    void prepareFocusSurface(surface);
    return () => { surface.entries.delete(entry); invalidateFocusSurface(surface); };
  }, [id, kind, nested, surface, offsetY]);
  const measureLayout: ViewProps["onLayout"] = event => {
    onLayout?.(event);
    if (surface) { invalidateFocusSurface(surface); void prepareFocusSurface(surface); }
  };
  const motion = context?.motion;
  const pair = kind === "element" && !nested ? motion?.elements.get(id) : undefined;
  let transform;
  if (pair && motion) {
    const { progress, cameraFrom, cameraTo } = motion;
    const cameraScale = interpolate(progress, cameraFrom.scale, cameraTo.scale);
    // Both live copies follow the same screen rectangle. Undo the enclosing
    // camera on the overview copy so it doesn't receive the zoom twice.
    transform = [
      { translateX: Animated.subtract(Animated.divide(Animated.subtract(
        interpolate(progress, pair.from.x + pair.from.width / 2, pair.to.x + pair.to.width / 2),
        interpolate(progress, cameraFrom.x, cameraTo.x)), cameraScale), pair.own.x + pair.own.width / 2) },
      { translateY: Animated.subtract(Animated.divide(Animated.subtract(
        interpolate(progress, pair.from.y + pair.from.height / 2, pair.to.y + pair.to.height / 2),
        interpolate(progress, cameraFrom.y, cameraTo.y)), cameraScale), pair.own.y + pair.own.height / 2) },
      { scaleX: Animated.divide(resize === "preserve" ? 1 : interpolate(progress, pair.from.width / pair.own.width, pair.to.width / pair.own.width), cameraScale) },
      { scaleY: Animated.divide(resize === "preserve" ? 1 : interpolate(progress, pair.from.height / pair.own.height, pair.to.height / pair.own.height), cameraScale) },
    ];
  }
  const content = renderNativeChildren(children, (text) => <Text>{text}</Text>);
  return kind === "element" ? (
    <Animated.View {...props} onLayout={measureLayout} collapsable={false} ref={ref} style={[style, transform && { transform }]}>
      <InsideSharedElement.Provider value={true}>{content}</InsideSharedElement.Provider>
    </Animated.View>
  ) : <View {...props} onLayout={measureLayout} collapsable={false} ref={ref} style={style}>{content}</View>;
}

export function FocusRegion(props: MarkerProps) { return <Marker {...props} kind="region" />; }
export function SharedElement(props: MarkerProps) { return <Marker {...props} kind="element" />; }

export function createFocusMotion(progress: Animated.Value, cameraFrom = identityCamera, cameraTo = identityCamera): FocusMotion {
  return { progress, cameraFrom, cameraTo, elements: new Map() };
}
