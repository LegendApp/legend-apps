import { SceneMotionView } from "@legend-apps/presentation";
import { Canvas, Fill, LinearGradient, vec } from "@shopify/react-native-skia";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

/** Shared chart material; grouped colors crossfade on the UI thread. */
export function ChartBar({ highlighted = false, groupColor, grouped = false, animateEntrance = true, rounded = false, luminous = false, style }: {
  animateEntrance?: boolean;
  rounded?: boolean;
  luminous?: boolean;
  highlighted?: boolean;
  groupColor?: string;
  grouped?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const dimensions = StyleSheet.flatten(style);
  const width = typeof dimensions?.width === "number" ? dimensions.width : 0;
  const height = typeof dimensions?.height === "number" ? dimensions.height : 0;
  const color = highlighted ? "#67e8f9" : "#b8c2ce";
  return <SceneMotionView key={animateEntrance ? "entrance" : "matched"} duration={450} initialPose={animateEntrance ? { scaleX: 0 } : undefined} pose={{ scaleX: 1 }}
    style={[style, { minWidth: 2, borderRadius: rounded ? 999 : 5, overflow: "hidden", transformOrigin: "left center" }]}>
    {luminous && width > 0 && height > 0 ? <Canvas pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      <Fill><LinearGradient start={vec(0, 0)} end={vec(width, height * 0.6)} colors={highlighted ? ["#60bdea", "#5ed4f5", "#b1f4ff"] : ["#78afe3", "#a2d6fa", "#d8f4ff"]} /></Fill>
      <Fill><LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={["#ffffff90", "#ffffff08", "#1263ab28", "#e4faff60"]} positions={[0, 0.25, 0.65, 1]} /></Fill>
    </Canvas> : groupColor ? <>
      <SceneMotionView pose={{ opacity: grouped ? 0 : 0.65 }} style={{ position: "absolute", inset: 0, backgroundColor: color }} />
      <SceneMotionView pose={{ opacity: grouped ? 0.65 : 0 }} style={{ position: "absolute", inset: 0, backgroundColor: groupColor }} />
    </> : <View style={{ position: "absolute", inset: 0, backgroundColor: color, opacity: 0.65 }} />}
    <View pointerEvents="none" style={{ position: "absolute", inset: 0, borderRadius: rounded ? 999 : 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.60)" }} />
  </SceneMotionView>;
}
