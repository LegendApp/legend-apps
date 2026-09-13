import { createContext, useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { Animated, Text, View, type ViewProps } from "react-native";
import { renderNativeChildren } from "./nativeChildren";
import { identityCamera, validFocusRect, type FocusCamera, type FocusRect } from "./focusGeometry";

type Entry = { id: string; kind: "region" | "element"; view: View };
export type FocusSurface = {
  root: View | null;
  setRoot(root: View | null): void;
  setLayout(layout: { width: number; height: number }): void;
  entries: Set<Entry>;
  width: number;
  height: number;
};
export type FocusMeasurements = { regions: Map<string, FocusRect>; elements: Map<string, FocusRect> };
export type FocusMotion = {
  progress: Animated.Value;
  cameraFrom: FocusCamera;
  cameraTo: FocusCamera;
  elements: Map<string, { from: FocusRect; to: FocusRect; own: FocusRect }>;
};
export const FocusSurfaceContext = createContext<{ surface: FocusSurface; motion?: FocusMotion } | null>(null);
const InsideSharedElement = createContext(false);

export function createFocusSurface(): FocusSurface {
  const surface: FocusSurface = {
    root: null, entries: new Set(), width: 0, height: 0,
    setRoot(root) { surface.root = root; },
    setLayout({ width, height }) { surface.width = width; surface.height = height; },
  };
  return surface;
}

/** Layout measurements ignore animated transforms and the physical display scale. */
export async function measureFocusSurface(surface: FocusSurface): Promise<FocusMeasurements> {
  const regions = new Map<string, FocusRect>();
  const elements = new Map<string, FocusRect>();
  const duplicates = new Set<string>();
  const root = surface.root;
  if (!root) return { regions, elements };
  await Promise.all([...surface.entries].map((entry) => new Promise<void>((resolve) => {
    let finished = false;
    const finish = (rect?: FocusRect) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (rect && validFocusRect(rect)) {
        const map = entry.kind === "region" ? regions : elements;
        const key = `${entry.kind}:${entry.id}`;
        if (map.has(entry.id)) duplicates.add(key);
        if (!duplicates.has(key)) map.set(entry.id, rect);
        else map.delete(entry.id);
      }
      resolve();
    };
    // Native measurement callbacks can disappear when a slide unmounts mid-request.
    const timeout = setTimeout(() => finish(), 120);
    try {
      entry.view.measureLayout(root, (x, y, width, height) => finish({ x, y, width, height }), () => finish());
    } catch {
      finish();
    }
  })));
  return { regions, elements };
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
export function FocusStage({ children }: { children: ReactNode }) {
  const context = useContext(FocusSurfaceContext);
  const surface = context?.surface;
  const setRoot = useCallback((view: View | null) => { surface?.setRoot(view); }, [surface]);
  return (
    <View collapsable={false} ref={setRoot}
      onLayout={(event) => {
        surface?.setLayout(event.nativeEvent.layout);
      }} style={{ flex: 1 }}>
      <Animated.View style={[{ flex: 1, overflow: "visible" }, focusCameraStyle(context?.motion)]}>
        {children}
      </Animated.View>
    </View>
  );
}

type MarkerProps = ViewProps & { id: string };

function Marker({ id, kind, children, style, ...props }: MarkerProps & { kind: Entry["kind"] }) {
  const context = useContext(FocusSurfaceContext);
  const nested = useContext(InsideSharedElement);
  const ref = useRef<View>(null);
  const surface = context?.surface;
  useLayoutEffect(() => {
    const view = ref.current;
    if (!surface || !view || (nested && kind === "element")) return;
    const entry = { id, kind, view };
    surface.entries.add(entry);
    return () => { surface.entries.delete(entry); };
  }, [id, kind, nested, surface]);
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
      { scaleX: Animated.divide(interpolate(progress, pair.from.width / pair.own.width, pair.to.width / pair.own.width), cameraScale) },
      { scaleY: Animated.divide(interpolate(progress, pair.from.height / pair.own.height, pair.to.height / pair.own.height), cameraScale) },
    ];
  }
  const content = renderNativeChildren(children, (text) => <Text>{text}</Text>);
  return kind === "element" ? (
    <Animated.View {...props} collapsable={false} ref={ref} style={[style, transform && { transform }]}>
      <InsideSharedElement.Provider value={true}>{content}</InsideSharedElement.Provider>
    </Animated.View>
  ) : <View {...props} collapsable={false} ref={ref} style={style}>{content}</View>;
}

export function FocusRegion(props: MarkerProps) { return <Marker {...props} kind="region" />; }
export function SharedElement(props: MarkerProps) { return <Marker {...props} kind="element" />; }

export function createFocusMotion(progress: Animated.Value, cameraFrom = identityCamera, cameraTo = identityCamera): FocusMotion {
  return { progress, cameraFrom, cameraTo, elements: new Map() };
}
