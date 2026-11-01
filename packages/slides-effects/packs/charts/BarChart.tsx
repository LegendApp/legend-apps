import { SceneMotionView, usePlaybackTween } from "@legend-apps/presentation";
import { useMemo } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { AnimatedNumber, dataColors, monoFont } from "./AnimatedNumber";
import { compactNumber, createAxis, niceMaximum, type AxisScale, type NumberFormat } from "./DataGeometry";

export type BarDatum = { label: string; value: number; color?: string };
export type BarCallout = { label: string; text: string };

const minimumBar = 4;

function Bar({ fraction, width, height, color, duration, delay, gap, background }: {
  fraction: number; width: number; height: number; color: string; duration: number; delay: number; gap?: readonly [number, number]; background: string;
}) {
  const motion = usePlaybackTween({ fraction }, duration, { fraction: 0 }, "smoothstep", delay);
  const barStyle = useAnimatedStyle(() => ({ width: Math.max(fraction > 0 ? minimumBar : 0, motion.value.fraction * width) }));
  const cutStyle = useAnimatedStyle(() => ({ opacity: gap && motion.value.fraction > gap[1] ? 1 : 0 }));
  return <View style={{ width, height }}>
    <Animated.View style={[{ height, borderRadius: Math.min(6, height / 2), backgroundColor: color, shadowColor: color, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }, barStyle]} />
    {gap && <Animated.View style={[{ position: "absolute", left: gap[0] * width + 6, top: -6, width: (gap[1] - gap[0]) * width - 12, height: height + 12,
      backgroundColor: background, transform: [{ skewX: "-18deg" }] }, cutStyle]} />}
  </View>;
}

/**
 * Horizontal bars that grow on entry and between steps. Tiny values keep a visible minimum bar and a readable value.
 * `scale="log"` uses powers of ten from `minimum`; `scale={{ break: [from, to] }}` removes the empty span between two values.
 */
export function BarChart({ data, scale = "linear", maximum, minimum = 1, width = 1500, rowHeight = 86, barHeight = 28, labelWidth = 300, valueWidth = 220,
  color = "#7cc8e8", highlight, highlightColor = dataColors.accent, callout, duration = 1300, stagger = 140, background = "#05060a", ...format }: NumberFormat & {
  data: readonly BarDatum[]; scale?: AxisScale; maximum?: number; minimum?: number; width?: number; rowHeight?: number; barHeight?: number;
  labelWidth?: number; valueWidth?: number; color?: string; highlight?: string; highlightColor?: string; callout?: BarCallout;
  duration?: number; stagger?: number; background?: string;
}) {
  const top = maximum ?? (scale === "linear" ? niceMaximum(Math.max(...data.map(d => d.value))) : Math.max(...data.map(d => d.value)));
  const axis = useMemo(() => createAxis(scale, top, minimum), [JSON.stringify(scale), top, minimum]);
  const barWidth = width - labelWidth - valueWidth - 40;
  const height = data.length * rowHeight + 48;
  const calloutRow = callout ? data.findIndex(d => d.label === callout.label) : -1;
  return <View style={{ width, height }}>
    <View style={{ position: "absolute", left: labelWidth + 20, top: 0, width: barWidth, height }}>
      {axis.ticks.map(tick => <View key={tick} style={{ position: "absolute", left: axis.position(tick) * barWidth, top: 0, bottom: 40, width: 1, backgroundColor: "rgba(148,163,184,0.13)" }} />)}
      {axis.ticks.map(tick => {
        const at = axis.position(tick) * barWidth;
        const side = axis.gap?.[0] === axis.position(tick) ? "right" : axis.gap?.[1] === axis.position(tick) ? "left" : "center";
        return <Text key={`t${tick}`} style={{ position: "absolute", left: side === "right" ? at - 104 : side === "left" ? at + 4 : at - 50, width: 100, bottom: 6,
          textAlign: side, color: dataColors.dim, fontFamily: monoFont, fontSize: 18 }}>{compactNumber(tick)}</Text>;
      })}
      {axis.gap && <View style={{ position: "absolute", left: axis.gap[0] * barWidth, width: (axis.gap[1] - axis.gap[0]) * barWidth, bottom: 32, height: 26,
        flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 6 }}>
        {[0, 1].map(side => <View key={side} style={{ width: 2, height: "100%", backgroundColor: "rgba(148,163,184,0.6)", transform: [{ rotate: "18deg" }] }} />)}
      </View>}
    </View>
    {data.map((datum, index) => {
      const active = highlight === datum.label;
      const barColor = datum.color ?? (active ? highlightColor : color);
      const tiny = axis.position(datum.value) * barWidth < 24;
      return <View key={datum.label} style={{ position: "absolute", left: 0, top: index * rowHeight, width, height: rowHeight, flexDirection: "row", alignItems: "center" }}>
        <Text numberOfLines={1} style={{ width: labelWidth, color: active ? "#ffffff" : "#c9d5e3", fontSize: 30, fontWeight: active ? "600" : "400" }}>{datum.label}</Text>
        <View style={{ marginLeft: 20, width: barWidth }}>
          <Bar fraction={axis.position(datum.value)} width={barWidth} height={barHeight} color={barColor} duration={duration} delay={index * stagger}
            gap={axis.gap} background={background} />
        </View>
        <AnimatedNumber value={datum.value} from={0} duration={duration} delay={index * stagger} fontSize={30} fontFamily={monoFont} fontWeight="500"
          color={tiny || active ? highlightColor : dataColors.ink} align="right" width={valueWidth} style={{ marginLeft: 20 }} {...format} />
      </View>;
    })}
    {calloutRow >= 0 && <SceneMotionView initialPose={{ opacity: 0, x: -10 }} pose={{ opacity: 1, x: 0 }} duration={800} delay={duration + calloutRow * stagger + 200}
      style={{ position: "absolute", left: labelWidth + 20 + Math.max(minimumBar, axis.position(data[calloutRow].value) * barWidth) + 10,
        top: calloutRow * rowHeight + rowHeight / 2 - 18, height: 36, flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 70, height: 1.5, backgroundColor: highlightColor }} />
      <View style={{ borderRadius: 999, borderWidth: 1.5, borderColor: highlightColor, paddingHorizontal: 14, paddingVertical: 4, backgroundColor: "rgba(5,10,18,0.9)" }}>
        <Text style={{ color: highlightColor, fontFamily: monoFont, fontSize: 20 }}>{callout!.text}</Text>
      </View>
    </SceneMotionView>}
  </View>;
}
