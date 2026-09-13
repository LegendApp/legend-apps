import { batch, observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { Canvas, DiffRect, Path, RoundedRect, rect, rrect } from "@shopify/react-native-skia";
import { usePresentationValue } from "@legend-apps/presentation";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { calloutBounds, relativeBounds, type Bounds } from "./geometry";
import { useMotion } from "./motion";

type Register = (id: string, ref: RefObject<View | null> | undefined) => void;
const Registration = createContext<Register>(() => {});
type MeasurementState = { width: number; height: number; targets: Record<string, Bounds> };
const Measurements = createContext(observable<MeasurementState>({ width: 0, height: 0, targets: {} }));

export function AttentionStage({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const host = useRef<View>(null);
  const targets = useRef(new Map<string, RefObject<View | null>>());
  const [register] = useState<Register>(() => (id: string, ref: RefObject<View | null> | undefined) => {
    if (ref) targets.current.set(id, ref); else targets.current.delete(id);
  });
  const measurements$ = useObservable<MeasurementState>({ width: 0, height: 0, targets: {} });
  const width = useValue(measurements$.width);
  const height = useValue(measurements$.height);
  const isActive = usePresentationValue("isActive");
  const isPreview = usePresentationValue("isPreview");
  useEffect(() => {
    if (!width || !height) return;
    let cancelled = false;
    let frame = 0;
    let last = -Infinity;
    let measuring = false;
    const tick = (now: number) => {
      if (cancelled) return;
      // Native transforms do not emit onLayout. Measure while mounted so
      // annotations track motion as well as projector/preview scaling.
      if (!measuring && now - last >= (isActive && !isPreview ? 32 : 180)) {
        last = now;
        const view = host.current;
        if (view) {
          measuring = true;
          view.measureInWindow((x, y, hostWidth, hostHeight) => {
            if (cancelled) return;
            const entries = [...targets.current].filter(([, ref]) => ref.current);
            const result: Record<string, Bounds> = {};
            let pending = entries.length;
            const finish = () => {
              measuring = false;
              if (cancelled) return;
              // Publish only changed targets so other annotations keep their geometry and render identity.
              batch(() => {
                for (const id of Object.keys(measurements$.targets.peek())) {
                  if (!result[id]) measurements$.targets[id].delete();
                }
                for (const [id, next] of Object.entries(result)) {
                  const previous = measurements$.targets[id].peek();
                  if (!previous || previous.x !== next.x || previous.y !== next.y
                    || previous.width !== next.width || previous.height !== next.height) {
                    measurements$.targets[id].set(next);
                  }
                }
              });
            };
            if (!pending) finish();
            for (const [id, ref] of entries) {
              ref.current?.measureInWindow((tx, ty, tw, th) => {
                if (targets.current.get(id) === ref && tw > 0 && th > 0 && hostWidth > 0 && hostHeight > 0) result[id] = relativeBounds(
                  { x: tx, y: ty, width: tw, height: th }, { x, y, width: hostWidth, height: hostHeight }, { width, height });
                pending -= 1;
                if (pending === 0) finish();
              });
            }
          });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [width, height, isActive, isPreview, measurements$]);
  return <Registration.Provider value={register}>
    <Measurements.Provider value={measurements$}>
      <View ref={host} collapsable={false} style={[styles.stage, style]} onLayout={({ nativeEvent: { layout } }) =>
        batch(() => { measurements$.width.set(layout.width); measurements$.height.set(layout.height); })}>
        {children}
      </View>
    </Measurements.Provider>
  </Registration.Provider>;
}

export function AttentionTarget({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const register = useContext(Registration);
  const ref = useRef<View>(null);
  useLayoutEffect(() => { register(id, ref); return () => register(id, undefined); }, [id, register]);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}

export function Spotlight({ target, darkness = 0.78, padding = 18 }: { target?: string; darkness?: number; padding?: number }) {
  const measurements$ = useContext(Measurements);
  const width = useValue(measurements$.width);
  const height = useValue(measurements$.height);
  const box = useValue(() => target ? measurements$.targets[target].get() : undefined);
  const [x, y, w, h, opacity] = useMotion(box ? [box.x - padding, box.y - padding, box.width + padding * 2, box.height + padding * 2, 1] : [0, 0, width, height, 0]);
  if (!width || !height) return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
    <Canvas style={StyleSheet.absoluteFill}>
      <DiffRect outer={rrect(rect(0, 0, width, height), 0, 0)} inner={rrect(rect(x, y, Math.max(1, w), Math.max(1, h)), 24, 24)} color={`rgba(2,6,23,${Math.max(0, Math.min(1, darkness))})`} />
      <RoundedRect x={x} y={y} width={Math.max(1, w)} height={Math.max(1, h)} r={24} style="stroke" strokeWidth={2} color="#67e8f9" />
    </Canvas>
  </View>;
}

export function Callout({ target, children, side = "above", width: requestedWidth = 380 }: {
  target: string; children: ReactNode; side?: "above" | "below" | "left" | "right"; width?: number;
}) {
  const measurements$ = useContext(Measurements);
  const width = useValue(measurements$.width);
  const height = useValue(measurements$.height);
  const [labelHeight, setLabelHeight] = useState(90);
  const box = useValue(() => measurements$.targets[target].get());
  if (!box || !width || !height) return null;
  const label = calloutBounds(box, { width, height }, Math.min(requestedWidth, width - 24), labelHeight, side);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const fromX = label.x + label.width / 2;
  const fromY = label.y + label.height / 2;
  const angle = Math.atan2(cy - fromY, cx - fromX);
  const endpointX = cx - Math.cos(angle) * Math.min(box.width, box.height) * 0.42;
  const endpointY = cy - Math.sin(angle) * Math.min(box.width, box.height) * 0.42;
  const arrow = `M ${fromX} ${fromY} L ${endpointX} ${endpointY} M ${endpointX - Math.cos(angle - 0.5) * 16} ${endpointY - Math.sin(angle - 0.5) * 16} L ${endpointX} ${endpointY} L ${endpointX - Math.cos(angle + 0.5) * 16} ${endpointY - Math.sin(angle + 0.5) * 16}`;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Canvas style={StyleSheet.absoluteFill}><Path path={arrow} color="#67e8f9" style="stroke" strokeWidth={3} /></Canvas>
    <View onLayout={({ nativeEvent: { layout } }) => setLabelHeight(layout.height)} style={[styles.callout, { left: label.x, top: label.y, width: label.width }]}>
      {typeof children === "string" ? <Text style={styles.label}>{children}</Text> : children}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  stage: { position: "relative", overflow: "hidden" },
  callout: { position: "absolute", backgroundColor: "#102431", borderColor: "#67e8f9", borderWidth: 2, borderRadius: 18, padding: 20 },
  label: { color: "#ecfeff", fontSize: 27, lineHeight: 35, fontWeight: "600" },
});
