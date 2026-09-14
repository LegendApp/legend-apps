// @ts-nocheck Bun tests run separately from the workspace typecheck.
import benchmarkMarkdownConfig from "../../../apps/chat-history/scripts/benchmark-markdown.json";
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getMacOSReleaseMarkdownConfig, getMacOSReleaseProfile } from "../macosReleaseProfile";
import { getMacOSReleaseAppRootDir, getMacOSReleaseWorkspaceDir } from "../macosWorkspaces";

const original = process.env.LEGEND_CHAT_HISTORY_BENCHMARK;
afterEach(() => {
  if (original === undefined) delete process.env.LEGEND_CHAT_HISTORY_BENCHMARK;
  else process.env.LEGEND_CHAT_HISTORY_BENCHMARK = original;
});
const shellConfig = JSON.parse(readFileSync(new URL("../../../shell/package.json", import.meta.url), "utf8"))["enriched-markdown"];
const chatConfig = JSON.parse(readFileSync(new URL("../../../apps/chat-history/package.json", import.meta.url), "utf8"))["enriched-markdown"];

test("regular Chat History retains syntax highlighting and the existing release workspace", () => {
  delete process.env.LEGEND_CHAT_HISTORY_BENCHMARK;
  expect(getMacOSReleaseProfile("chat-history")).toBe("release");
  expect(getMacOSReleaseMarkdownConfig("chat-history", shellConfig, chatConfig).enableCodeHighlight).toBe(true);
  expect(getMacOSReleaseMarkdownConfig("chat-history", shellConfig, chatConfig).codeHighlightLanguages).toBeUndefined();
  expect(getMacOSReleaseWorkspaceDir("chat-history")).toEndWith("/release/chat-history/macos");
});

test("benchmark exports retain highlighting and use separate Pods and build output", () => {
  process.env.LEGEND_CHAT_HISTORY_BENCHMARK = "1";
  expect(getMacOSReleaseMarkdownConfig("chat-history", shellConfig, chatConfig)).toEqual({ ...shellConfig, ...chatConfig, ...benchmarkMarkdownConfig });
  expect(getMacOSReleaseAppRootDir("chat-history")).toEndWith("/benchmark/chat-history");
  expect(getMacOSReleaseWorkspaceDir("chat-history")).toEndWith("/benchmark/chat-history/macos");
  delete process.env.LEGEND_CHAT_HISTORY_BENCHMARK;
  expect(getMacOSReleaseMarkdownConfig("chat-history", shellConfig, chatConfig).enableCodeHighlight).toBe(true);
});

test("the benchmark flag leaves other apps and their explicit Markdown settings unchanged", () => {
  process.env.LEGEND_CHAT_HISTORY_BENCHMARK = "1";
  expect(getMacOSReleaseProfile("slides")).toBe("release");
  expect(getMacOSReleaseMarkdownConfig("slides", shellConfig).enableCodeHighlight).toBe(true);
  expect(getMacOSReleaseMarkdownConfig("slides", shellConfig, { enableMath: false })).toEqual({ ...shellConfig, enableMath: false });
});

test("benchmark grammars override app policy without mutating either configuration", () => {
  const appConfig = { codeHighlightLanguages: ["json"] };
  process.env.LEGEND_CHAT_HISTORY_BENCHMARK = "1";
  const benchmark = getMacOSReleaseMarkdownConfig("chat-history", shellConfig, appConfig);
  expect(benchmark.codeHighlightLanguages).toEqual(benchmarkMarkdownConfig.codeHighlightLanguages);
  benchmark.codeHighlightLanguages.pop();
  expect(benchmarkMarkdownConfig.codeHighlightLanguages).toHaveLength(19);
  delete process.env.LEGEND_CHAT_HISTORY_BENCHMARK;
  expect(getMacOSReleaseMarkdownConfig("chat-history", shellConfig, appConfig).codeHighlightLanguages).toEqual(["json"]);
});
