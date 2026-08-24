import { NitroModules } from "react-native-nitro-modules";
import type { CodexAppServer } from "./Codex.nitro";

export type CodexRunOptions = {
  cwd?: string;
  developerInstructions?: string;
  outputSchema?: object;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  timeoutMs?: number;
};

let codex: CodexAppServer | undefined;

function getCodex() {
  codex ??= NitroModules.createHybridObject<CodexAppServer>("CodexAppServer");
  return codex;
}

export function getCodexAvailability() {
  return getCodex().getAvailability();
}

export function runCodexPrompt(prompt: string, options: CodexRunOptions = {}) {
  return getCodex().runPrompt(
    prompt,
    options.cwd ?? "",
    options.reasoningEffort ?? "low",
    options.timeoutMs ?? 120_000,
    options.outputSchema ? JSON.stringify(options.outputSchema) : "",
    options.developerInstructions ?? "",
  );
}

export function cancelActiveCodexRuns() {
  return getCodex().cancelActiveRuns();
}

export function shutdownCodex() {
  const result = getCodex().shutdown();
  codex = undefined;
  return result;
}

export type { CodexAvailability, CodexRunResult } from "./Codex.nitro";
