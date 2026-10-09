import { FrameView } from "./FrameView";
import type { ReactNode } from "react";
import { useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { clamp } from "./geometry";
import { useMotion } from "./Motion";
export function ProgressiveDetail({
  expanded,
  summary,
  detail,
  style
}: {
  expanded: boolean;
  summary: ReactNode;
  detail: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const motion = useMotion([expanded ? 1 : 0], 700);
  return <View style={[styles.row, style]}>
    <FrameView frameStyle={() => {
      "worklet";

      return {
        flex: 1,
        justifyContent: "center",
        paddingRight: motion.value[0] * 32
      };
    }}>{summary}</FrameView>
    <FrameView pointerEvents={expanded ? "auto" : "none"} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? "auto" : "no-hide-descendants"} frameStyle={() => {
      "worklet";

      return {
        width: `${motion.value[0] * 63}%`,
        overflow: "hidden",
        opacity: motion.value[0],
        justifyContent: "center"
      };
    }}>{detail}</FrameView>
  </View>;
}
export function ComparisonWipe({
  position,
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  style
}: {
  position: number;
  before: ReactNode;
  after: ReactNode;
  beforeLabel?: string;
  afterLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [size, setSize] = useState({
    width: 0,
    height: 0
  });
  const motion = useMotion([clamp(position, 0, 1)], 900);
  return <View style={[styles.wipe, style]} onLayout={({
    nativeEvent: {
      layout
    }
  }) => setSize(old => old.width === layout.width && old.height === layout.height ? old : {
    width: layout.width,
    height: layout.height
  })}>
    <View style={StyleSheet.absoluteFill}>{before}</View>
    <FrameView frameStyle={() => {
      "worklet";

      return [styles.clip, {
        width: size.width * motion.value[0]
      }];
    }}>
      <View style={{
        width: size.width,
        height: size.height
      }}>{after}</View>
    </FrameView>
    <FrameView pointerEvents="none" frameStyle={() => {
      "worklet";

      return [styles.divider, {
        left: Math.max(0, size.width * motion.value[0] - 2)
      }];
    }}>
      <View style={styles.handle}><Text style={styles.handleText}>↔</Text></View>
    </FrameView>
    <View pointerEvents="none" style={styles.wipeLabels}>
      <Text style={styles.badge}>{afterLabel}</Text><Text style={styles.badge}>{beforeLabel}</Text>
    </View>
  </View>;
}
export function ContentSwap({
  active,
  before,
  after,
  duration = 500,
  style
}: {
  active: boolean;
  before: ReactNode;
  after: ReactNode;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const motion = useMotion([active ? 1 : 0], duration);
  return <View style={[styles.swap, style]}>
    <FrameView pointerEvents={active ? "none" : "auto"} accessibilityElementsHidden={active} importantForAccessibility={active ? "no-hide-descendants" : "auto"} frameStyle={() => {
      "worklet";

      return [StyleSheet.absoluteFill, {
        opacity: 1 - motion.value[0],
        transform: [{
          scale: 1 - motion.value[0] * 0.025
        }]
      }];
    }}>{before}</FrameView>
    <FrameView pointerEvents={active ? "auto" : "none"} accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"} frameStyle={() => {
      "worklet";

      return [StyleSheet.absoluteFill, {
        opacity: motion.value[0],
        transform: [{
          scale: 0.975 + motion.value[0] * 0.025
        }]
      }];
    }}>{after}</FrameView>
  </View>;
}
export type ExplodedLayer = {
  id: string;
  label: string;
  content: ReactNode;
  color?: string;
};
export function ExplodedLayers({
  expanded,
  layers,
  style
}: {
  expanded: boolean;
  layers: ExplodedLayer[];
  style?: StyleProp<ViewStyle>;
}) {
  const motion = useMotion([expanded ? 1 : 0], 850);
  const [height, setHeight] = useState(580);
  const available = Math.max(0, height - 80);
  const layerHeight = Math.min(130, available / Math.max(1, layers.length) - 14);
  return <View style={[styles.exploded, style]} onLayout={({
    nativeEvent: {
      layout
    }
  }) => setHeight(layout.height)}>
    {layers.map((layer, index) => {
      const collapsedTop = (height - layerHeight) / 2 + index * 7;
      const expandedTop = 40 + index * (layerHeight + 14);
      return <FrameView key={layer.id} frameStyle={() => {
        "worklet";

        return [styles.layer, {
          top: collapsedTop + (expandedTop - collapsedTop) * motion.value[0],
          height: Math.max(40, layerHeight),
          backgroundColor: layer.color ?? "#153044",
          zIndex: layers.length - index,
          transform: [{
            perspective: 1200
          }, {
            rotateX: `${motion.value[0] * 12}deg`
          }, {
            translateX: (index - (layers.length - 1) / 2) * 22 * motion.value[0]
          }]
        }];
      }}>
        <Text style={styles.layerLabel}>{layer.label}</Text><View style={{
          flex: 1
        }}>{layer.content}</View>
      </FrameView>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    overflow: "hidden"
  },
  wipe: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 24
  },
  clip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden"
  },
  divider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: "#67e8f9",
    justifyContent: "center"
  },
  handle: {
    width: 58,
    height: 58,
    marginLeft: -27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
    backgroundColor: "#102e40",
    borderColor: "#67e8f9",
    borderWidth: 2
  },
  handleText: {
    color: "#ecfeff",
    fontSize: 30
  },
  wipeLabels: {
    position: "absolute",
    top: 18,
    left: 18,
    right: 18,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  badge: {
    color: "#fff",
    fontSize: 22,
    backgroundColor: "#020617",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12
  },
  swap: {
    position: "relative"
  },
  exploded: {
    position: "relative",
    overflow: "hidden"
  },
  layer: {
    position: "absolute",
    left: "12%",
    width: "76%",
    flexDirection: "row",
    alignItems: "center",
    gap: 34,
    padding: 28,
    borderWidth: 2,
    borderColor: "#67e8f9",
    borderRadius: 20
  },
  layerLabel: {
    color: "#ecfeff",
    fontSize: 32,
    fontWeight: "700",
    width: 240
  }
});
