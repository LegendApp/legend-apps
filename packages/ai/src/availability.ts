import { commandRunner, type CommandRunner } from "@legend-apps/command-runner";
import type { AICommandAvailability, AIToolId } from "./types";

const aiToolIds = ["claude", "codex"] as const satisfies AIToolId[];

export function selectPreferredAITool(availability: Pick<AICommandAvailability, "claude" | "codex">): AIToolId | null {
  if (availability.claude) {
    return "claude";
  }
  if (availability.codex) {
    return "codex";
  }
  return null;
}

export async function getAICommandAvailability(runner: CommandRunner = commandRunner): Promise<AICommandAvailability> {
  const availability = await runner.getAvailability([...aiToolIds]);
  const result = {
    claude: Boolean(availability.claude),
    codex: Boolean(availability.codex),
    preferredTool: null,
  } satisfies AICommandAvailability;

  return {
    ...result,
    preferredTool: selectPreferredAITool(result),
  };
}
