import { samplePlayback, usePlayback } from "@legend-apps/presentation";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from "react-native-reanimated";
import { AnimatedNumber, dataColors, monoFont } from "./AnimatedNumber";
import { layoutTree, renderCounts, type TreeEdge, type TreeFlash, type TreeNode } from "./DataGeometry";

/** Rise quickly, then settle slowly to a residual glow; delayed by depth so renders read top-down. */
function pulse(time: number) {
  "worklet";
  if (time <= 0) return 0;
  if (time < 0.22) return time / 0.22;
  // A finite settle, so the glow stops changing (and its canvas stops redrawing) 2.7 s after the step.
  const t = Math.min(1, (time - 0.22) / 2.5);
  return 1 - 0.6 * t * t * (3 - 2 * t);
}

function usePulse(playback: SharedValue<any>, delay: number, active: boolean) {
  return useDerivedValue(() => active ? pulse(samplePlayback(playback.value, 0.4 + delay, "step") - delay) : 0, [delay, active]);
}

function Node({ x, y, width, height, label, count, active, delay, color, playback }: {
  x: number; y: number; width: number; height: number; label: string; count: number; active: boolean; delay: number; color: string; playback: SharedValue<any>;
}) {
  const glow = usePulse(playback, delay, active);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  return <View style={{ position: "absolute", left: x - width / 2, top: y, width, height }}>
    <View style={{ position: "absolute", inset: 0, borderRadius: 14, borderWidth: 1.5, borderColor: count ? "#4a5d74" : "#2d3b4d", backgroundColor: "#0d1726" }} />
    <Animated.View style={[{ position: "absolute", inset: 0, borderRadius: 14, borderWidth: 2, borderColor: color, backgroundColor: `${color}2e`,
      shadowColor: color, shadowOpacity: 0.85, shadowRadius: 22, shadowOffset: { width: 0, height: 0 } }, glowStyle]} />
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 }}>
      <Text numberOfLines={1} style={{ color: active ? "#fff4e2" : "#c9d5e3", fontFamily: monoFont, fontSize: Math.min(22, height * 0.4) }}>{label}</Text>
    </View>
    {count > 0 && <View style={{ position: "absolute", right: -12, top: -14, minWidth: 34, height: 30, borderRadius: 15, paddingHorizontal: 8,
      alignItems: "center", justifyContent: "center", backgroundColor: active ? color : "#1c2a3c", borderWidth: 1, borderColor: active ? color : "#3a4c62" }}>
      <Text style={{ color: active ? "#1a1204" : "#c9d5e3", fontFamily: monoFont, fontSize: 17, fontWeight: "700" }}>{count}</Text>
    </View>}
  </View>;
}

export type RenderTreeProps = {
  nodes: readonly TreeNode[];
  edges: readonly TreeEdge[];
  /** Per step: "all", a list of node ids, or `{ subtree: id }`. Counts accumulate across steps. */
  flashes: readonly (TreeFlash | undefined)[];
  step: number;
  width?: number;
  height?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  color?: string;
  /** Label for the running total; `false` hides the counter. */
  totalLabel?: string | false;
  badges?: boolean;
};

/** A parent/child tree whose nodes glow when they render on a step, with per-node and total render counts. */
export function RenderTree({ nodes, edges, flashes, step, width = 1500, height = 600, nodeWidth = 190, nodeHeight = 58, color = dataColors.hot,
  totalLabel = "renders", badges = true }: RenderTreeProps) {
  const playback = usePlayback();
  const layout = useMemo(() => layoutTree(nodes, edges), [nodes, edges]);
  const { counts, current, total } = renderCounts(flashes, step, layout.nodes);
  const counterWidth = totalLabel === false ? 0 : 260;
  const treeWidth = width - counterWidth;
  const column = treeWidth / layout.columns;
  const boxWidth = Math.min(nodeWidth, column - 18);
  const rowGap = layout.depth > 1 ? (height - nodeHeight - 16) / (layout.depth - 1) : 0;
  const place = useMemo(() => new Map(layout.nodes.map(node => [node.id, { x: (node.x + 0.5) * column, y: 16 + node.depth * rowGap, node }])), [layout, column, rowGap]);
  const edgePaths = useMemo(() => edges.map(([parent, child]) => {
    const a = place.get(parent)!, b = place.get(child)!;
    const top = a.y + nodeHeight, mid = (top + b.y) / 2;
    return { child, path: Skia.PathBuilder.Make().moveTo(a.x, top).cubicTo(a.x, mid, b.x, mid, b.x, b.y).detach() };
  }), [edges, place, nodeHeight]);
  const join = (list: typeof edgePaths) => {
    const path = Skia.PathBuilder.Make();
    for (const edge of list) path.addPath(edge.path);
    return path.detach();
  };
  const base = useMemo(() => join(edgePaths), [edgePaths]);
  const currentKey = [...current].join(" ");
  const lit = useMemo(() => join(edgePaths.filter(edge => current.has(edge.child))), [edgePaths, currentKey]);
  const edgeGlow = usePulse(playback, 0.07, current.size > 0);
  const delayFor = (depth: number) => depth * 0.14;
  return <View style={{ width, height, flexDirection: "row" }}>
    <View style={{ width: treeWidth, height }}>
      <Canvas style={{ position: "absolute", inset: 0 }}>
        <Path path={base} style="stroke" strokeWidth={1.5} color="#2b3a4e" />
        <Path path={lit} style="stroke" strokeWidth={3} strokeCap="round" color={color} opacity={edgeGlow} />
      </Canvas>
      {layout.nodes.map(node => {
        const p = place.get(node.id)!;
        return <Node key={node.id} x={p.x} y={p.y} width={boxWidth} height={nodeHeight} label={node.label ?? node.id}
          count={badges ? counts[node.id] : 0} active={current.has(node.id)} delay={delayFor(node.depth)} color={color} playback={playback} />;
      })}
    </View>
    {totalLabel !== false && <View style={{ width: counterWidth, justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 8 }}>
      <Text style={{ color: dataColors.dim, fontFamily: monoFont, fontSize: 20, letterSpacing: 2 }}>{totalLabel.toUpperCase()}</Text>
      <AnimatedNumber value={total} duration={1200} delay={300} fontSize={76} fontFamily={monoFont} fontWeight="500" color={current.size ? color : dataColors.ink} align="right" width={counterWidth} />
      <Text style={{ color: current.size ? color : dataColors.faint, fontFamily: monoFont, fontSize: 20 }}>{`+${current.size} this step`}</Text>
    </View>}
  </View>;
}
