import { createMockCommandRunner } from "../index";

describe("createMockCommandRunner", () => {
  it("normalizes command availability", async () => {
    const runner = createMockCommandRunner({ availability: { codex: true } });

    await expect(runner.getAvailability(["codex", "claude", "codex", " "])).resolves.toEqual({
      claude: false,
      codex: true,
    });
  });

  it("returns configured command results", async () => {
    const runner = createMockCommandRunner({
      run: (params) => ({
        stdout: params.command,
        stderr: params.args?.join(",") ?? "",
        exitCode: 7,
        timedOut: true,
      }),
    });

    await expect(runner.runCommand({ command: "test", args: ["a", "b"] })).resolves.toEqual({
      stdout: "test",
      stderr: "a,b",
      exitCode: 7,
      timedOut: true,
    });
  });
});
