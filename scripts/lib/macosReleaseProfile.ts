import benchmarkMarkdownConfig from "../../apps/chat-history/scripts/benchmark-markdown.json";

// Benchmark rendering options must never change a regular app's native build.
export function getMacOSReleaseProfile(appId: string) {
  return appId === "chat-history" && process.env.LEGEND_CHAT_HISTORY_BENCHMARK === "1"
    ? "benchmark"
    : "release";
}

export function getMacOSReleaseMarkdownConfig(
  appId: string,
  shellConfig?: Record<string, unknown>,
  appConfig?: Record<string, unknown>,
) {
  return {
    ...shellConfig,
    ...appConfig,
    ...(getMacOSReleaseProfile(appId) === "benchmark"
      ? {
          ...benchmarkMarkdownConfig,
          codeHighlightLanguages: [...benchmarkMarkdownConfig.codeHighlightLanguages],
        }
      : {}),
  };
}
