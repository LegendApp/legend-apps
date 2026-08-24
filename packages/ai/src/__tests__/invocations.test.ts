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
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--config",
        "model_reasoning_effort=low",
        "-",
      ],
      input: "make a list",
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
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--model",
        "gpt-test",
        "--config",
        "model_reasoning_effort=low",
        "-",
      ],
      input: "make a list",
    });
  });
});
