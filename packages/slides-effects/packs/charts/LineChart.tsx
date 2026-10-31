import { usePlaybackTween } from "@legend-apps/presentation";
import { BlurMask, Canvas, Circle, Group, LinearGradient, Path, Skia, vec } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { dataColors, monoFont } from "./AnimatedNumber";
import { compactNumber, niceMaximum } from "./DataGeometry";

export type LineSeries = { points: readonly number[]; color?: string; label?: string };

const palette = [dataColors.accent, dataColors.hot, "#b07cff"];

/**
 * A time series whose points ease to each step's dataset on the shared clock. Every dataset in one chart must keep the
 * same series and point counts; set `maximum` to hold the y axis still while values change.
 */
export function LineChart({ series, maximum, width = 1500, height = 560, duration = 1600, reference, xLabels = [], fill = true }: {
  series: readonly LineSeries[]; maximum?: number; width?: number; height?: number; duration?: number;
  reference?: { value: number; label?: string }; xLabels?: readonly string[]; fill?: boolean;
}) {
  const top = maximum ?? niceMaximum(Math.max(...series.flatMap(s => s.points)));
  const left = 84, bottom = xLabels.length ? 44 : 12, plotWidth = width - left - 24, plotHeight = height - bottom - 12;
  const counts = series.map(s => s.points.length);
  const target = Object.fromEntries(series.flatMap((s, i) => s.points.map((value, j) => [`${i}:${j}`, Math.max(0, Math.min(1, value / top))])));
  const entrance = usePlaybackTween({ drawn: 1 }, duration, { drawn: 0 }, "smoothstep");
  const motion = usePlaybackTween(target, duration, undefined, "smoothstep");
  const shapes = useDerivedValue(() => counts.map((count, i) => {
    const builder = Skia.PathBuilder.Make();
    for (let j = 0; j < count; j++) {
      const x = left + (count > 1 ? j / (count - 1) : 0) * plotWidth, y = 12 + (1 - motion.value[`${i}:${j}`]) * plotHeight;
      if (j) builder.lineTo(x, y); else builder.moveTo(x, y);
    }
    const line = builder.build();
    const area = builder.lineTo(left + plotWidth, 12 + plotHeight).lineTo(left, 12 + plotHeight).close().detach();
    const last = count - 1;
    return { line, area, end: { x: left + plotWidth, y: 12 + (1 - motion.value[`${i}:${last}`]) * plotHeight } };
  }), [counts.join(","), plotWidth, plotHeight]);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const referenceY = reference ? 12 + (1 - Math.min(1, reference.value / top)) * plotHeight : 0;
  const grid = useMemo(() => {
    const path = Skia.PathBuilder.Make();
    for (const tick of ticks) path.moveTo(left, 12 + (1 - tick) * plotHeight).lineTo(left + plotWidth, 12 + (1 - tick) * plotHeight);
    return path.detach();
  }, [plotWidth, plotHeight]);
  const referencePath = useMemo(() => {
    const path = Skia.PathBuilder.Make();
    for (let x = left; x < left + plotWidth; x += 18) path.moveTo(x, referenceY).lineTo(Math.min(x + 9, left + plotWidth), referenceY);
    return path.detach();
  }, [referenceY, plotWidth]);
  return <View style={{ width, height }}>
    <Canvas style={{ position: "absolute", inset: 0 }}>
      <Path path={grid} style="stroke" strokeWidth={1} color="rgba(148,163,184,0.13)" />
      {reference && <Path path={referencePath} style="stroke" strokeWidth={1.5} color={dataColors.hot} opacity={0.7} />}
      {series.map((s, i) => <SeriesShape key={i} index={i} shapes={shapes} entrance={entrance} color={s.color ?? palette[i % palette.length]}
        fill={fill && i === 0} top={12} bottom={12 + plotHeight} />)}
    </Canvas>
    {ticks.map(tick => <Text key={tick} style={{ position: "absolute", left: 0, width: left - 16, top: 12 + (1 - tick) * plotHeight - 12, textAlign: "right",
      color: dataColors.dim, fontFamily: monoFont, fontSize: 18 }}>{compactNumber(tick * top)}</Text>)}
    {reference?.label && <Text style={{ position: "absolute", right: 24, top: referenceY - 32, color: dataColors.hot, fontFamily: monoFont, fontSize: 20 }}>{reference.label}</Text>}
    {xLabels.map((label, i) => <Text key={i} style={{ position: "absolute", left: left + (xLabels.length > 1 ? i / (xLabels.length - 1) : 0) * plotWidth - 60, width: 120,
      bottom: 4, textAlign: "center", color: dataColors.dim, fontFamily: monoFont, fontSize: 18 }}>{label}</Text>)}
  </View>;
}

function SeriesShape({ index, shapes, entrance, color, fill, top, bottom }: {
  index: number; shapes: { value: { line: any; area: any; end: { x: number; y: number } }[] }; entrance: { value: { drawn: number } };
  color: string; fill: boolean; top: number; bottom: number;
}) {
  const line = useDerivedValue(() => shapes.value[index].line);
  const area = useDerivedValue(() => shapes.value[index].area);
  const end = useDerivedValue(() => entrance.value.drawn);
  const cx = useDerivedValue(() => shapes.value[index].end.x);
  const cy = useDerivedValue(() => shapes.value[index].end.y);
  const dot = useDerivedValue(() => entrance.value.drawn >= 0.999 ? 1 : 0);
  return <Group>
    {fill && <Path path={area} opacity={end}><LinearGradient start={vec(0, top)} end={vec(0, bottom)} colors={[`${color}38`, `${color}00`]} /></Path>}
    <Path path={line} style="stroke" strokeWidth={6} strokeJoin="round" strokeCap="round" color={color} opacity={0.25} end={end}><BlurMask blur={6} style="normal" /></Path>
    <Path path={line} style="stroke" strokeWidth={2.5} strokeJoin="round" strokeCap="round" color={color} end={end} />
    <Group opacity={dot}>
      <Circle cx={cx} cy={cy} r={11} color={color} opacity={0.35}><BlurMask blur={8} style="normal" /></Circle>
      <Circle cx={cx} cy={cy} r={5} color={color} />
    </Group>
  </Group>;
}
