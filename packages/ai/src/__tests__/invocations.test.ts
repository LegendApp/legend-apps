import { buildAIInvocation } from "../invocations";

describe("buildAIInvocation", () => {
  it("builds claude prompt invocations", () => {
    expect(buildAIInvocation("claude", "make a list")).toEqual({
      command: "claude",
      args: ["-p", "make a list"],
    });
  });

  it("builds codex exec invocations", () => {
    expect(buildAIInvocation("codex", "make a list")).toEqual({
      command: "codex",
      args: [
        "exec",
        "--skip-git-repo-check",
        "--model",
        "gpt-5.2",
        "--config",
        "model_reasoning_effort=medium",
        "make a list",
      ],
    });
  });

  it("supports codex model overrides", () => {
    expect(
      buildAIInvocation("codex", "make a list", {
        codex: { model: "gpt-test", reasoningEffort: "low" },
      }),
    ).toEqual({
      command: "codex",
      args: [
        "exec",
        "--skip-git-repo-check",
        "--model",
        "gpt-test",
        "--config",
        "model_reasoning_effort=low",
        "make a list",
      ],
    });
  });
});
