import { SceneMotionView, ScenePositionView, SharedElement, useSharedElementEntrance, usePlaybackTween } from "@legend-apps/presentation";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Text } from "react-native";
import type { ReactNode } from "react";
import { ChartBar } from "./ChartBar";
export const defaultBarRowLayout = { width: 1696, height: 710, top: 55, rowSpacing: 57, rowHeight: 43, fontSize: 34, lineHeight: 42, labelWidth: 280, barLeft: 285, barWidth: 1210, barHeight: 30, valueWidth: 190, marginTop: 24 };
export type BarRowLayout = typeof defaultBarRowLayout;
function AnimatedRowBar({ layout, width, duration, animateEntrance, highlighted, groupColor, grouped }: {
  layout: BarRowLayout; width: number; duration: number; animateEntrance: boolean; highlighted: boolean; groupColor?: string; grouped: boolean;
}) {
  const motion = usePlaybackTween({ width }, duration, animateEntrance ? { width: 0 } : undefined);
  const animatedStyle = useAnimatedStyle(() => ({ width: motion.value.width }));
  return <Animated.View style={[{ height: layout.barHeight }, animatedStyle]}>
    <ChartBar highlighted={highlighted} groupColor={groupColor} grouped={grouped} animateEntrance={false}
      style={{ width: "100%", height: layout.barHeight }} />
  </Animated.View>;
}

/** Separate sibling markers keep text rigid while only the bar changes width. */
export function BarRow({ id, name, value, maximum, layout: requestedLayout, y, groupColor, grouped = false, tintText = false, duration = 650, decimals = 0, valueLabel, valueContent, animateValue = false, highlighted = false }: {
  id: string; name: string; value: number; maximum: number; layout?: Partial<BarRowLayout>; y: number;
  groupColor?: string; grouped?: boolean; tintText?: boolean; duration?: number; decimals?: number; valueLabel?: string; valueContent?: ReactNode; animateValue?: boolean; highlighted?: boolean;
}) {
  const layout = { ...defaultBarRowLayout, ...requestedLayout };
  const animateEntrance = useSharedElementEntrance(`${id}-bar`);
  const width = Math.max(2, Math.max(0, value) / (maximum > 0 ? maximum : 1) * layout.barWidth);
  return <ScenePositionView y={y} duration={duration} style={{ left: 0, width: layout.width, height: layout.rowHeight }}>
    <SharedElement id={`${id}-label`} resize="preserve" style={{ position: "absolute", left: 0, top: 0, width: layout.labelWidth, height: layout.rowHeight }}>
      <Text style={{ color: "#f1f5f9", fontWeight: highlighted ? "600" : "400", fontSize: layout.fontSize, lineHeight: layout.lineHeight }}>{name}</Text>
      {tintText && <SceneMotionView pose={{ opacity: grouped ? 1 : 0 }} duration={duration} style={{ position: "absolute", inset: 0 }}>
        <Text style={{ color: groupColor, fontWeight: highlighted ? "600" : "400", fontSize: layout.fontSize, lineHeight: layout.lineHeight }}>{name}</Text>
      </SceneMotionView>}
    </SharedElement>
    <SharedElement id={`${id}-bar`} style={{ position: "absolute", left: layout.barLeft, top: (layout.rowHeight - layout.barHeight) / 2, width: animateValue ? layout.barWidth : width, height: layout.barHeight }}>
      {animateValue ? <AnimatedRowBar layout={layout} width={width} duration={duration} animateEntrance={animateEntrance}
        highlighted={highlighted} groupColor={groupColor} grouped={grouped} />
        : <ChartBar highlighted={highlighted} groupColor={groupColor} grouped={grouped} animateEntrance={animateEntrance} style={{ width, height: layout.barHeight }} />}
    </SharedElement>
    <SharedElement id={`${id}-value`} resize="preserve" style={{ position: "absolute", right: 0, top: 0, width: layout.valueWidth, height: layout.rowHeight }}>
      {valueContent ?? <Text style={{ color: "#f1f5f9", textAlign: "right", fontSize: layout.fontSize, lineHeight: layout.lineHeight, fontVariant: ["tabular-nums"] }}>{valueLabel ?? value.toFixed(decimals)}</Text>}
      {tintText && <SceneMotionView pose={{ opacity: grouped ? 1 : 0 }} duration={duration} style={{ position: "absolute", inset: 0 }}>
        <Text style={{ color: groupColor, textAlign: "right", fontSize: layout.fontSize, lineHeight: layout.lineHeight, fontVariant: ["tabular-nums"] }}>{valueLabel ?? value.toFixed(decimals)}</Text>
      </SceneMotionView>}
    </SharedElement>
  </ScenePositionView>;
}
