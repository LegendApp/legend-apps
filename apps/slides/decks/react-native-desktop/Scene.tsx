import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { benchmark, chartLabels, sortedBenchmarks, type BenchmarkMetric } from "./benchmark";

const accent = "#67e8f9";

export function Scene({ children, eyebrow, title, footer }: {
  children: ReactNode;
  eyebrow: string;
  title: ReactNode;
  footer?: string;
}) {
  return (
    <View style={styles.scene}>
      <Text className="text-2xl font-semibold uppercase tracking-widest" style={styles.accent}>{eyebrow}</Text>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View className="flex-1 justify-center">{children}</View>
      <View className="mt-6 flex-row items-center justify-between border-t border-slate-700 pt-5">
        <Text className="text-xl text-slate-400">{footer ?? "REACT NATIVE / DESKTOP"}</Text>
        <View className="h-1 w-16 bg-cyan-300" />
      </View>
    </View>
  );
}

export function BigStatement({ children, detail }: { children: string; detail?: string }) {
  return (
    <View className="gap-8">
      <Text style={styles.statement}>{children}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

export function Frameworks() {
  return (
    <View className="flex-row flex-wrap gap-x-12 gap-y-8">
      {benchmark.map(({ name }, index) => (
        <View className="flex-row items-center gap-5" style={styles.framework} key={name}>
          <Text className="text-2xl text-slate-500">{String(index + 1).padStart(2, "0")}</Text>
          <Text className="text-4xl font-semibold" style={{ color: name === "React Native" ? accent : "#e2e8f0" }}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

export function BenchmarkChart({ metric }: { metric: BenchmarkMetric }) {
  const { label, maximum, unit } = chartLabels[metric];
  return (
    <View className="gap-3">
      <Text className="mb-4 text-2xl text-slate-400">{label} · p50 · lower is better</Text>
      {sortedBenchmarks[metric].map((row) => {
        const highlighted = row.name === "React Native";
        return (
          <View className="flex-row items-center gap-6" key={row.name}>
            <Text className="text-3xl" style={[styles.chartLabel, { color: highlighted ? accent : "#cbd5e1" }]}>{row.name}</Text>
            <View className="h-8 flex-1 bg-slate-900">
              <View style={{ height: "100%", width: `${row[metric] / maximum * 100}%`, backgroundColor: highlighted ? accent : "#526580" }} />
            </View>
            <Text className="text-right text-3xl" style={[styles.chartValue, { color: highlighted ? accent : "#e2e8f0" }]}>
              {row[metric].toFixed(1)} {unit}
            </Text>
          </View>
        );
      })}
      <View className="mt-1 flex-row justify-between" style={styles.axis}>
        <Text className="text-xl text-slate-500">0</Text>
        <Text className="text-xl text-slate-500">{maximum} {unit}</Text>
      </View>
    </View>
  );
}

const histories = ["Design a desktop app", "Make it feel native", "Add a little glass", "A reasonable amount", "Please stop adding glass"];

// Synthetic artwork for the effect demonstration, never a screenshot or benchmark fixture.
export function ChatIllustration() {
  return (
    <View className="overflow-hidden rounded-3xl border border-slate-600 bg-slate-950" style={styles.chat}>
      <View className="h-16 flex-row items-center gap-3 border-b border-slate-700 px-8">
        {["#fb7185", "#fbbf24", "#4ade80"].map((color) => <View className="h-4 w-4 rounded-full" key={color} style={{ backgroundColor: color }} />)}
        <Text className="ml-8 text-2xl text-slate-300">Chat History</Text>
        <Text className="ml-auto text-xl text-slate-500">Illustrated demo</Text>
      </View>
      <View className="flex-1 flex-row">
        <View className="gap-3 border-r border-slate-600 p-6" style={styles.sidebar}>
          <Text className="text-xl font-semibold uppercase tracking-widest text-cyan-200">Your conversations</Text>
          {histories.map((title, index) => (
            <View className="rounded-xl px-5 py-3" style={index === 2 ? styles.selected : undefined} key={title}>
              <Text className="text-2xl text-slate-100">{title}</Text>
            </View>
          ))}
          <Text className="mt-auto text-xl text-slate-400">Codex + Claude</Text>
        </View>
        <View className="flex-1 overflow-hidden p-12">
          <View style={styles.orbCyan} />
          <View style={styles.orbViolet} />
          <View style={styles.orbOrange} />
          <Text className="mb-8 text-xl uppercase tracking-widest text-cyan-100">You</Text>
          <Text className="text-5xl font-semibold text-white">Can we add a little glass?</Text>
          <View className="mt-10 gap-5 rounded-2xl border border-white/30 bg-slate-950/70 p-8">
            <Text className="text-xl uppercase tracking-widest text-slate-300">Assistant</Text>
            <Text className="text-4xl text-white">Of course. How hard could it be?</Text>
            <Text className="text-2xl text-slate-300">Blur. Refraction. Highlights. Just a few details.</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function DataPath() {
  const stages = [
    ["01", "228 MiB file", "Memory-mapped input"],
    ["02", "Native document", "Selective C++ parsing"],
    ["03", "Visible rows", "Small, lazy requests"],
    ["04", "Native views", "LegendList + React"],
  ];
  return (
    <View className="gap-12">
      <View className="flex-row gap-8">
        {stages.map(([number, title, detail]) => (
          <View className="flex-1 gap-6 border-t-2 border-cyan-300 pt-8" key={number}>
            <Text className="text-2xl text-cyan-300">{number}</Text>
            <Text className="text-4xl font-semibold text-white">{title}</Text>
            <Text className="text-2xl leading-relaxed text-slate-400">{detail}</Text>
          </View>
        ))}
      </View>
      <Text className="text-4xl text-slate-200">The large document stays native. React asks for what is visible.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { width: 1680, height: 920 },
  accent: { color: accent },
  title: { color: "#f8fafc", fontSize: 72, lineHeight: 84, fontWeight: "700", marginTop: 20, marginBottom: 28 },
  statement: { color: "#f8fafc", fontSize: 96, lineHeight: 112, fontWeight: "700", maxWidth: 1500 },
  detail: { color: "#94a3b8", fontSize: 36, lineHeight: 50, maxWidth: 1450 },
  framework: { width: 512, height: 100 },
  chartLabel: { width: 260 },
  chartValue: { width: 192, fontVariant: ["tabular-nums"] },
  axis: { marginLeft: 284, marginRight: 216 },
  chat: { width: 1680, height: 580 },
  sidebar: { width: 420, backgroundColor: "#1e293b" },
  selected: { backgroundColor: "#3c5470" },
  orbCyan: { position: "absolute", left: 80, top: -100, width: 600, height: 600, borderRadius: 300, backgroundColor: "#087e8b" },
  orbViolet: { position: "absolute", right: -80, top: 80, width: 680, height: 680, borderRadius: 340, backgroundColor: "#5b21b6" },
  orbOrange: { position: "absolute", left: 320, bottom: -220, width: 440, height: 440, borderRadius: 220, backgroundColor: "#c05d37" },
});
