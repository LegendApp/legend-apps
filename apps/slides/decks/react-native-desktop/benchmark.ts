// September 5 production run. Values are p50; footprint includes attributable helpers.
// Source: chat-history-comparison/benchmarks/chat-history/results/2026-09-05T19-46-07.162Z.json
export const benchmark = [
  { name: "React Native", content: 394.0, switch: 139.7, memory: 101.7, switchedMemory: 132.6, bundle: 17.0 },
  { name: "Electron", content: 792.0, switch: 305.4, memory: 628.9, switchedMemory: 384.7, bundle: 286.1 },
  { name: "Tauri", content: 568.1, switch: 168.8, memory: 533.1, switchedMemory: 565.4, bundle: 11.3 },
  { name: "Deno WebView", content: 868.1, switch: 350.8, memory: 669.7, switchedMemory: 843.4, bundle: 65.8 },
  { name: "Deno CEF", content: 858.5, switch: 321.7, memory: 733.9, switchedMemory: 699.9, bundle: 307.7 },
  { name: "Flutter", content: 1000.1, switch: 522.9, memory: 214.1, switchedMemory: 235.4, bundle: 42.5 },
  { name: "GPUI", content: 490.2, switch: 140.3, memory: 392.7, switchedMemory: 395.3, bundle: 9.1 },
  { name: "SwiftUI", content: 765.4, switch: 438.3, memory: 47.6, switchedMemory: 121.2, bundle: 2.7 },
  { name: "AppKit", content: 856.6, switch: 537.4, memory: 93.7, switchedMemory: 101.0, bundle: 2.4 },
] as const;

export type BenchmarkMetric = "content" | "switch" | "memory" | "switchedMemory" | "bundle";

export const chartLabels = {
  content: { unit: "ms", label: "Launch → stable first content", maximum: 1100 },
  switch: { unit: "ms", label: "Selection → stable switched content", maximum: 600 },
  memory: { unit: "MB", label: "Initial macOS physical footprint", maximum: 800 },
  switchedMemory: { unit: "MB", label: "Physical footprint after switching", maximum: 900 },
  bundle: { unit: "MB", label: "Production app bundle", maximum: 320 },
} as const;

export const sortedBenchmarks = {
  content: [...benchmark].sort((a, b) => a.content - b.content),
  switch: [...benchmark].sort((a, b) => a.switch - b.switch),
  memory: [...benchmark].sort((a, b) => a.memory - b.memory),
  switchedMemory: [...benchmark].sort((a, b) => a.switchedMemory - b.switchedMemory),
  bundle: [...benchmark].sort((a, b) => a.bundle - b.bundle),
};
