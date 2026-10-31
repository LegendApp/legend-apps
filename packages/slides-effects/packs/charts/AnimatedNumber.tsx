import { SceneMotionView, usePlaybackTween } from "@legend-apps/presentation";
import { Canvas, Text as SkiaText, matchFont } from "@shopify/react-native-skia";
import { useMemo, useState, type ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { formatNumber, type NumberFormat } from "./DataGeometry";

export const dataColors = { ink: "#e8eef6", dim: "#7b8ba1", faint: "#3a4a5e", accent: "#22d3ee", hot: "#ffb547", card: "rgba(12,20,34,0.86)", rim: "rgba(148,163,184,0.22)" };
export const monoFont = "Menlo";

export type AnimatedNumberProps = NumberFormat & {
  value: number;
  /** Count from this value on first appearance; otherwise the first value shows directly. */
  from?: number;
  duration?: number;
  delay?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "400" | "500" | "600" | "700" | "800";
  color?: string;
  align?: "left" | "center" | "right";
  /** Canvas width; defaults to the widest value shown so far. */
  width?: number;
  style?: StyleProp<ViewStyle>;
};

/** Ticks through every intermediate value on the shared step clock; text is drawn by Skia on the UI thread. */
export function AnimatedNumber({ value, from, duration = 1100, delay = 0, fontSize = 96, fontFamily = "Helvetica Neue", fontWeight = "600",
  color = dataColors.ink, align = "left", width, style, decimals = 0, prefix = "", suffix = "", separator = "," }: AnimatedNumberProps) {
  const font = useMemo(() => matchFont({ fontFamily, fontSize, fontWeight }), [fontFamily, fontSize, fontWeight]);
  const format = useMemo(() => ({ decimals, prefix, suffix, separator }), [decimals, prefix, suffix, separator]);
  const measured = Math.max(...[value, from ?? value].map(v => font.measureText(formatNumber(v, format)).width));
  // Keep the widest value seen so a falling count is never clipped mid-tick.
  const [widest, setWidest] = useState(measured);
  if (measured > widest) setWidest(measured);
  const canvasWidth = width ?? Math.ceil(Math.max(widest, measured) + 2);
  const metrics = font.getMetrics();
  const height = Math.ceil(metrics.descent - metrics.ascent);
  const motion = usePlaybackTween({ value }, duration, from === undefined ? undefined : { value: from }, "smoothstep", delay);
  const text = useDerivedValue(() => formatNumber(motion.value.value, format), [format]);
  const x = useDerivedValue(() => align === "left" ? 0 : (canvasWidth - font.measureText(text.value).width) * (align === "center" ? 0.5 : 1), [align, canvasWidth, font]);
  return <View accessible accessibilityLabel={formatNumber(value, format)} style={[{ width: canvasWidth, height }, style]}>
    <Canvas style={{ width: canvasWidth, height }} accessible={false}>
      <SkiaText x={x} y={-metrics.ascent} text={text} font={font} color={color} />
    </Canvas>
  </View>;
}

export type Baseline = { label: string; value: number | string };

/** A large ticking value with an optional tag and up to two small labeled comparison values. */
export function NumberCard({ label, value, from, baselines = [], tag, accent = dataColors.accent, color = dataColors.ink, width = 760,
  fontSize = 132, duration = 1400, children, style, ...format }: NumberFormat & {
  label?: string; value: number; from?: number; baselines?: readonly Baseline[]; tag?: string; accent?: string; color?: string;
  width?: number; fontSize?: number; duration?: number; children?: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const baselineWidth = baselines.length ? 220 : 0;
  return <View style={[{ width, borderRadius: 28, borderWidth: 1, borderColor: dataColors.rim, backgroundColor: dataColors.card,
    paddingHorizontal: 44, paddingTop: 34, paddingBottom: 38, gap: 18 }, style]}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 }}>
      {label ? <Text style={{ color: dataColors.dim, fontFamily: monoFont, fontSize: 24, letterSpacing: 2.4 }}>{label.toUpperCase()}</Text> : <View />}
      <SceneMotionView pose={{ opacity: tag ? 1 : 0, x: tag ? 0 : 12 }} duration={700}
        style={{ borderRadius: 999, borderWidth: 1.5, borderColor: accent, paddingHorizontal: 16, paddingVertical: 4 }}>
        <Text style={{ color: accent, fontFamily: monoFont, fontSize: 20, letterSpacing: 1.6 }}>{(tag ?? " ").toUpperCase()}</Text>
      </SceneMotionView>
    </View>
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
      <AnimatedNumber value={value} from={from} duration={duration} fontSize={fontSize} color={color} {...format}
        width={width - 88 - baselineWidth} />
      {baselines.length ? <View style={{ width: baselineWidth, gap: 14, paddingBottom: fontSize * 0.12 }}>
        {baselines.slice(0, 2).map(baseline => <View key={baseline.label} style={{ borderLeftWidth: 2, borderLeftColor: dataColors.faint, paddingLeft: 16 }}>
          <Text style={{ color: dataColors.dim, fontFamily: monoFont, fontSize: 18, letterSpacing: 1.4 }}>{baseline.label.toUpperCase()}</Text>
          {typeof baseline.value === "number"
            ? <AnimatedNumber value={baseline.value} duration={duration} fontSize={38} fontWeight="500" color="#b9c6d6" {...format} />
            : <Text style={{ color: "#b9c6d6", fontSize: 38, fontWeight: "500" }}>{baseline.value}</Text>}
        </View>)}
      </View> : null}
    </View>
    {children}
  </View>;
}
