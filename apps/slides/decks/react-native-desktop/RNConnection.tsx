import { FlowGlyph } from "./RNConnectionVisuals";
import { Background, usePresentationValue, type PresentationTemplateProps } from "@legend-apps/presentation";
import { Animated, Easing, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { AnimatedAtmosphere } from "./packs/backgrounds";
import benchmarks from "./rnconnection-assets/benchmarks.json";

export default function Frame({ children }: PresentationTemplateProps) {
  return (
    <>
      <Background priority={-1}>
        {/* Variants: "glass", "fluid", "smoke", "wireframe"; 1 is normal brightness/speed. */}
        <AnimatedAtmosphere variant="glass" brightness={0.7} speed={0.6} />
      </Background>
      <View style={{ flex: 1, paddingHorizontal: 112, paddingVertical: 96, justifyContent: "center" }}>
        {children}
      </View>
    </>
  );
}

function useRevealProgress(delay: number, duration: number) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const startedAt = usePresentationValue("startedAt");
  const [progress] = useState(() => new Animated.Value(preview ? 1 : 0));

  useEffect(() => {
    progress.setValue(preview || !active ? 1 : 0);
    if (active && !preview) {
      const animation = Animated.timing(progress, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        // Match the macOS presentation host's transition driver.
        useNativeDriver: false,
        isInteraction: false,
      });
      animation.start();
      return () => animation.stop();
    }
  }, [active, preview, startedAt, delay, duration, progress]);

  return progress;
}

function Reveal({ children, delay = 0, style }: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRevealProgress(delay, 650);

  return (
    <Animated.View style={[style, { opacity: progress }]}>
      {children}
    </Animated.View>
  );
}

export function Points({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 24, marginTop: 24, alignItems: "center" }}>
      {items.map((item) => (
        <View key={item}>
          <Text style={{ color: "#e5e5e5", fontSize: 40, lineHeight: 56, textAlign: "center" }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function Flow({ labels }: { labels: string[] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 32, marginTop: 80, paddingHorizontal: 48 }}>
      {labels.map((label, index) => (
        <Fragment key={label}>
          {index > 0 && (
            <Reveal delay={200 + (index * 2 - 1) * 220}>
              <View style={{ width: 112, height: 24, justifyContent: "center" }}>
                <View style={{ height: 2, backgroundColor: "#67e8f9" }} />
                <View style={{ position: "absolute", right: 0, width: 14, height: 14, borderTopWidth: 2, borderRightWidth: 2, borderColor: "#67e8f9", transform: [{ rotate: "45deg" }] }} />
              </View>
            </Reveal>
          )}
          <Reveal delay={200 + index * 440} style={{ flex: 1 }}>
            <FlowGlyph label={label} />
            <Text style={{ color: "#ffffff", fontSize: 38, lineHeight: 48, fontWeight: "500", textAlign: "center" }}>{label}</Text>
          </Reveal>
        </Fragment>
      ))}
    </View>
  );
}

type Metric = "content" | "memory" | "size" | "jump" | "switch";
const units: Record<Metric, string> = { content: "ms", memory: "MiB", size: "MiB", jump: "ms", switch: "ms" };

function ChartRow({ name, value, maximum, metric, index }: {
  name: string;
  value: number;
  maximum: number;
  metric: Metric;
  index: number;
}) {
  const progress = useRevealProgress(index * 25, 320);
  const highlighted = name === "React Native";
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${value / maximum * 100}%`] });

  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: 43, gap: 24 }}>
      <Text style={{ width: 280, fontSize: 27, color: highlighted ? "#67e8f9" : "#cbd5e1", fontWeight: highlighted ? "700" : "400" }}>{name}</Text>
      <View style={{ flex: 1, height: 28 }}>
        <Animated.View style={{ width, minWidth: 2, height: 28, borderRadius: 5, backgroundColor: highlighted ? "#67e8f9" : "#525252" }} />
      </View>
      <Text style={{ width: 180, textAlign: "right", fontSize: 27, color: highlighted ? "#67e8f9" : "#e2e8f0", fontVariant: ["tabular-nums"] }}>{value.toFixed(1)} {units[metric]}</Text>
    </View>
  );
}

export function Chart({ metric, workload = "chat" }: { metric: Metric; workload?: "chat" | "hello" }) {
  const rows = (workload === "chat" ? benchmarks.chat : benchmarks.hello)
    .map((row) => ({ name: row.name, value: (row as unknown as Record<string, number>)[metric] }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => a.value - b.value);
  const maximum = Math.max(...rows.map((row) => row.value));
  return (
    <View style={{ gap: 12, marginTop: 32 }}>
      {rows.map(({ name, value }, index) => (
        <ChartRow key={`${metric}-${workload}-${name}`} name={name} value={value} maximum={maximum} metric={metric} index={index} />
      ))}
    </View>
  );
}

export function Tradeoffs() {
  return (
    <View style={{ gap: 10, marginTop: 20 }}>
      <View style={{ flexDirection: "row", padding: 12 }}>
        {[["Implementation", 340], ["First content", 250], ["Memory", 220], ["Content UI", 700]].map(([label, width]) => <Text key={label} style={{ width: Number(width), fontSize: 24, color: "#94a3b8" }}>{label}</Text>)}
      </View>
      {benchmarks.chat.map((row) => (
        <View key={row.name} style={{ flexDirection: "row", padding: 12, borderRadius: 8, backgroundColor: row.name === "React Native" ? "#102326" : "transparent" }}>
          <Text style={{ width: 340, fontSize: 25, color: "#f8fafc", fontWeight: row.name === "React Native" ? "700" : "400" }}>{row.name}</Text>
          <Text style={{ width: 250, fontSize: 25, color: "#e2e8f0" }}>{row.content.toFixed(1)} ms</Text>
          <Text style={{ width: 220, fontSize: 25, color: "#e2e8f0" }}>{row.memory.toFixed(1)} MiB</Text>
          <Text style={{ fontSize: 25, color: "#e2e8f0" }}>{row.name === "GPUI" ? "Canvas; native composer added later" : row.ui}</Text>
        </View>
      ))}
    </View>
  );
}
