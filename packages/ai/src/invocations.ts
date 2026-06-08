import type { AIInvocation, AIInvocationOptions, AIToolId } from "./types";

const defaultCodexModel = "gpt-5.2";
const defaultCodexReasoningEffort = "medium";

export function buildAIInvocation(tool: AIToolId, prompt: string, options: AIInvocationOptions = {}): AIInvocation {
  if (tool === "codex") {
    const model = options.codex?.model ?? defaultCodexModel;
    const reasoningEffort = options.codex?.reasoningEffort ?? defaultCodexReasoningEffort;
    return {
      command: "codex",
      args: [
        "exec",
        "--skip-git-repo-check",
        "--model",
        model,
        "--config",
        `model_reasoning_effort=${reasoningEffort}`,
        prompt,
      ],
    };
  }

  return { command: "claude", args: ["-p", prompt] };
}
