import type { PresentationTemplateProps } from "@legend-apps/presentation";
import { Text, View } from "react-native";
import benchmarks from "./rnconnection-assets/benchmarks.json";

export default function Frame({ children, slide }: PresentationTemplateProps) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 112, paddingVertical: 64 }}>
      <View className="mb-8 flex-row items-center justify-between">
        <Text className="text-2xl font-semibold uppercase tracking-widest text-cyan-300">
          {typeof slide.eyebrow === "string" ? slide.eyebrow : "REACT NATIVE / DESKTOP"}
        </Text>
        <View className="h-1 w-20 bg-cyan-300" />
      </View>
      <View style={{ flex: 1, justifyContent: "center" }}>{children}</View>
      <Text className="mt-6 border-t border-slate-700 pt-5 text-xl text-slate-400">
        {typeof slide.footer === "string" ? slide.footer : "RN CONNECTION  /  REACT NATIVE DESKTOP"}
      </Text>
    </View>
  );
}

type Metric = "content" | "memory" | "size" | "jump" | "switch";
const units: Record<Metric, string> = { content: "ms", memory: "MiB", size: "MiB", jump: "ms", switch: "ms" };

export function Chart({ metric, workload = "chat" }: { metric: Metric; workload?: "chat" | "hello" }) {
  const rows = (workload === "chat" ? benchmarks.chat : benchmarks.hello)
    .map((row) => ({ name: row.name, value: (row as unknown as Record<string, number>)[metric] }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => a.value - b.value);
  const maximum = Math.max(...rows.map((row) => row.value));
  return (
    <View style={{ gap: 12, marginTop: 20 }}>
      {rows.map(({ name, value }) => {
        const highlighted = name === "React Native" || name === "Legend Shell (RN)";
        return (
          <View key={name} style={{ flexDirection: "row", alignItems: "center", height: 43, gap: 24 }}>
            <Text style={{ width: 280, fontSize: 27, color: highlighted ? "#67e8f9" : "#cbd5e1", fontWeight: highlighted ? "700" : "400" }}>{name}</Text>
            <View style={{ flex: 1, height: 28, backgroundColor: "#172334", borderRadius: 5 }}>
              <View style={{ width: `${value / maximum * 100}%`, minWidth: 2, height: 28, borderRadius: 5, backgroundColor: highlighted ? "#67e8f9" : "#52657e" }} />
            </View>
            <Text style={{ width: 180, textAlign: "right", fontSize: 27, color: highlighted ? "#67e8f9" : "#e2e8f0", fontVariant: ["tabular-nums"] }}>{value.toFixed(1)} {units[metric]}</Text>
          </View>
        );
      })}
      <Text className="mt-2 text-xl text-slate-400">Zero-based linear scale · lower is better</Text>
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
        <View key={row.name} style={{ flexDirection: "row", padding: 12, borderRadius: 8, backgroundColor: row.name === "React Native" ? "#123746" : "#111d2e" }}>
          <Text style={{ width: 340, fontSize: 25, color: "#f8fafc", fontWeight: row.name === "React Native" ? "700" : "400" }}>{row.name}</Text>
          <Text style={{ width: 250, fontSize: 25, color: "#e2e8f0" }}>{row.content.toFixed(1)} ms</Text>
          <Text style={{ width: 220, fontSize: 25, color: "#e2e8f0" }}>{row.memory.toFixed(1)} MiB</Text>
          <Text style={{ fontSize: 25, color: "#e2e8f0" }}>{row.name === "GPUI" ? "Canvas; native composer added later" : row.ui}</Text>
        </View>
      ))}
    </View>
  );
}
