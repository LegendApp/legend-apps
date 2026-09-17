import { Children, createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { StyleSheet, Text, View, type ViewProps, type ViewStyle } from "react-native";
import { useResolveClassNames } from "uniwind";
import { columnWeights, layoutOverflows, type LayoutProps } from "@legend-apps/presentation";

const alignments = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;
const justifications = { start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around", evenly: "space-evenly" } as const;
type Bounds = { root: RefObject<View | null>; width: number; height: number; report(id: string, overflow: boolean): void };
const BoundsContext = createContext<Bounds | null>(null);

/** Warnings belong to the editor/preview, never the audience output. */
export function LayoutStage({ children, width, height, warn }: { children: ReactNode; width: number; height: number; warn: boolean }) {
  const root = useRef<View>(null);
  const [overflow, setOverflow] = useState<Set<string>>(() => new Set());
  const report = useCallback((id: string, value: boolean) => setOverflow((current) => {
    if (current.has(id) === value) return current;
    const next = new Set(current);
    if (value) next.add(id); else next.delete(id);
    return next;
  }), []);
  const bounds = useMemo(() => warn ? { root, width, height, report } : null, [warn, width, height, report]);
  return <View ref={root} collapsable={false} style={styles.stage}>
    <BoundsContext.Provider value={bounds}>{children}</BoundsContext.Provider>
    {warn && overflow.size > 0 && <View pointerEvents="none" style={styles.warning}>
      <Text accessibilityRole="alert" style={styles.warningText}>Layout exceeds slide bounds</Text>
    </View>}
  </View>;
}

function MeasuredView({ children, ...props }: ViewProps) {
  const bounds = useContext(BoundsContext);
  const ref = useRef<View>(null);
  const id = useId();
  const measure = useCallback(() => {
    const view = ref.current;
    const root = bounds?.root.current;
    if (!view || !root || !bounds) return;
    view.measureLayout(root, (x, y, width, height) => {
      if (ref.current === view) bounds.report(id, layoutOverflows({ x, y, width, height }, bounds));
    }, () => bounds.report(id, false));
  }, [bounds, id]);
  useLayoutEffect(() => {
    measure();
    return () => bounds?.report(id, false);
  }, [bounds, id, measure]);
  return <View {...props} ref={ref} collapsable={false} onLayout={measure}>{children}</View>;
}

export function Layout({ children, kind, gap, padding, align, justify, width, height, ratio, columns = 2, className = "" }: LayoutProps & { children?: ReactNode }) {
  const classStyle = useResolveClassNames(className);
  const items = Children.toArray(children).filter((child) => typeof child !== "string" || child.trim());
  const style: ViewStyle = {
    ...(gap === undefined ? {} : { gap }), ...(padding === undefined ? {} : { padding }),
    ...(align === undefined ? {} : { alignItems: alignments[align] }),
    ...(justify === undefined ? {} : { justifyContent: justifications[justify] }),
    ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }) };
  if (kind === "columns") {
    const weights = columnWeights(ratio, items.length);
    return <MeasuredView style={[styles.container, classStyle, style, styles.row]}>
      {items.map((child, index) => <MeasuredView key={index} style={[styles.cell, { flexGrow: weights[index] }]}>{child}</MeasuredView>)}
    </MeasuredView>;
  }
  if (kind === "grid") {
    const rows = Array.from({ length: Math.ceil(items.length / columns) }, (_, index) => items.slice(index * columns, (index + 1) * columns));
    return <MeasuredView style={[styles.container, classStyle, style]}>
      {rows.map((row, rowIndex) => <View key={rowIndex} style={[styles.row, styles.gridRow, { gap: gap ?? (classStyle as ViewStyle).gap ?? 24, alignItems: alignments[align ?? "stretch"] }]}>
        {Array.from({ length: columns }, (_, index) => <MeasuredView key={index} style={[styles.cell, styles.equalCell]}>{row[index]}</MeasuredView>)}
      </View>)}
    </MeasuredView>;
  }
  return <MeasuredView style={[styles.container, classStyle, style]}>
    {items.map((child, index) => <MeasuredView key={index} style={styles.block}>{child}</MeasuredView>)}
  </MeasuredView>;
}

const styles = StyleSheet.create({
  stage: { flex: 1 },
  container: { gap: 24, padding: 0, alignItems: "stretch", justifyContent: "flex-start" },
  row: { flexDirection: "row" },
  gridRow: { alignSelf: "stretch" },
  cell: { flexBasis: 0, flexShrink: 1, minWidth: 0 },
  equalCell: { flexGrow: 1 },
  block: { minWidth: 0, flexShrink: 0 },
  warning: { position: "absolute", bottom: 12, left: 12, backgroundColor: "#78350f", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  warningText: { color: "#fef3c7", fontSize: 24 },
});
