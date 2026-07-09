import type { CommandRunner, CommandRunnerResult } from "@legend-apps/command-runner";

export type AIToolId = "claude" | "codex";

export type AICommandAvailability = {
  claude: boolean;
  codex: boolean;
  preferredTool: AIToolId | null;
};

export type AIInvocation = {
  command: string;
  args: string[];
  input?: string;
};

export type AICodexInvocationOptions = {
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
};

export type AIInvocationOptions = {
  codex?: AICodexInvocationOptions;
};

export type RunAIToolOptions = {
  prompt: string;
  runner?: CommandRunner;
  timeoutMs?: number;
  tool: AIToolId;
  invocationOptions?: AIInvocationOptions;
};

export type AIToolRunResult = CommandRunnerResult & {
  output: string;
  tool: AIToolId;
};
