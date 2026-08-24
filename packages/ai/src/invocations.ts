import type { AIInvocation, AIInvocationOptions, AIToolId } from "./types";

const defaultCodexReasoningEffort = "low";

export function buildAIInvocation(tool: AIToolId, prompt: string, options: AIInvocationOptions = {}): AIInvocation {
  if (tool === "codex") {
    const model = options.codex?.model;
    const reasoningEffort = options.codex?.reasoningEffort ?? defaultCodexReasoningEffort;
    const args = ["exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check"];
    if (model) {
      args.push("--model", model);
    }
    args.push("--config", `model_reasoning_effort=${reasoningEffort}`, "-");

    return {
      command: "codex",
      args,
      input: prompt,
    };
  }

  return { command: "claude", args: ["-p", prompt] };
}
