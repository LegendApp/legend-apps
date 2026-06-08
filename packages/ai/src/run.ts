import { commandRunner } from "@legend-desktop/command-runner";
import { buildAIInvocation } from "./invocations";
import type { AIToolRunResult, RunAIToolOptions } from "./types";

export async function runAITool({
  invocationOptions,
  prompt,
  runner = commandRunner,
  timeoutMs,
  tool,
}: RunAIToolOptions): Promise<AIToolRunResult> {
  const invocation = buildAIInvocation(tool, prompt, invocationOptions);
  const result = await runner.runCommand({
    command: invocation.command,
    args: invocation.args,
    input: invocation.input,
    timeoutMs,
  });

  return {
    ...result,
    output: result.stdout.trim() || result.stderr.trim(),
    tool,
  };
}
