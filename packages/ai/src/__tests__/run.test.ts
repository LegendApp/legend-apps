import { createMockCommandRunner } from "@legend-apps/command-runner";
import { runAITool } from "../run";

describe("runAITool", () => {
  it("returns trimmed stdout as output", async () => {
    const runner = createMockCommandRunner({
      run: () => ({
        stdout: " hello\n",
        stderr: "ignored",
        exitCode: 0,
        timedOut: false,
      }),
    });

    await expect(runAITool({ prompt: "test", runner, tool: "claude" })).resolves.toEqual({
      stdout: " hello\n",
      stderr: "ignored",
      exitCode: 0,
      timedOut: false,
      output: "hello",
      tool: "claude",
    });
  });

  it("falls back to stderr when stdout is empty", async () => {
    const runner = createMockCommandRunner({
      run: () => ({
        stdout: "",
        stderr: " error\n",
        exitCode: 1,
        timedOut: false,
      }),
    });

    await expect(runAITool({ prompt: "test", runner, tool: "codex" })).resolves.toMatchObject({
      output: "error",
      tool: "codex",
    });
  });
});
