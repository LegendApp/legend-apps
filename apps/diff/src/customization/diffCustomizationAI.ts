import { buildAIInvocation, parseAIJson } from "@legendapp/spark/ai";
import { runCommand } from "@legendapp/spark/processes";
import { decodeProcessText } from "@legend-apps/runtime-utils";

export async function runDiffCustomizationAI(prompt: string, tool: "codex" | "claude", cwd: string, signal: AbortSignal) {
  const invocation = buildAIInvocation(tool, prompt);
  const args = tool === "claude"
    ? ["-p", "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]
    : [...invocation.args.slice(0, -1), "--sandbox", "read-only", "-"];
  const result = await runCommand({ target: { type: "command", name: invocation.command }, args, input: prompt, cwd, signal, timeoutMs: 180_000 });
  const output = decodeProcessText(result.stdout).trim() || decodeProcessText(result.stderr).trim();
  if (result.aborted || result.timedOut || result.outputTruncated || result.exit.type !== "exited" || result.exit.code !== 0) {
    throw new Error(result.aborted ? "Cancelled." : result.timedOut ? "Generation timed out. Try a smaller change." : result.outputTruncated ? "The generated response was too large. Try a smaller change." : output.slice(0, 2000) || `Could not run ${tool}. Install it and sign in, then retry.`);
  }
  return parseAIJson(output);
}
