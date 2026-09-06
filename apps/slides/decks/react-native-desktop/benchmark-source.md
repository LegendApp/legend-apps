# Benchmark source

Authoritative run: **2026-09-05T19-46-07.162Z** in the sibling
`chat-history-comparison` repository.

- [Report](../../../../../chat-history-comparison/benchmarks/chat-history/results/2026-09-05T19-46-07.162Z.md)
- [Raw observations](../../../../../chat-history-comparison/benchmarks/chat-history/results/2026-09-05T19-46-07.162Z.json)
- [Methodology](../../../../../chat-history-comparison/benchmarks/chat-history/README.md)

The chart values in `benchmark.ts` are a transcription of that report. The deck
does not read the report at runtime and contains no private fixture paths or text.
These relative links expect the sibling repository to remain alongside the
Slides worktree. The comparison repository's `PERFORMANCE_ANALYSIS.md` begins
with an older September 4 run; do not use those older headline numbers here.

Machine: Apple M4, arm64, macOS 26.6.1. Two warmups discarded, ten measured new
production processes per implementation, rotating app order, warmed operating
system filesystem cache. Each app discovers the catalog after launch with no
application catalog cache. Discovery is already part of first-content time.

The initial Codex history is 228.25 MiB and the second is 140.99 MiB. Images are
disabled. Normalized content digests match across all implementations. These
checks establish parser-output equivalence, not equivalent rendering architecture
or identical pixels. The comparison is end-to-end, not renderer-only.

Times are p50 visible timings from 60 fps external recordings. Memory is p50
macOS physical footprint including attributable helpers, measured after load and
switch; it is not RSS, peak memory, long-idle memory, or memory under pressure.
Bundle size is logical bytes in production app bundles, reported in MB.

React Native has the fastest first content in this run, and effectively ties GPUI
for switching. SwiftUI has the least initial footprint. AppKit has the least
switched footprint and smallest bundle. These results do not establish universal
framework performance, Windows results, scrolling FPS, or the cost of glass effects.
