import { fixtureInput } from "../../story/__tests__/storyFixtures";
import { changeStorySkill } from "../../story/storySkill";
import { builtInWorkflowSkills } from "../workflowSkills";
import { fakeWorkflowCLI, flush, workflowOutput } from "./workflowFixtures";

const input = fixtureInput();
it.each(builtInWorkflowSkills)("runs $name with its fixed output and stdin", async skill => {
  const cli = fakeWorkflowCLI([JSON.stringify(workflowOutput(skill.output))]);
  const result = await cli.runner.run(input, { windowId: "w", skill, tool: "codex" });
  expect(result.output.kind).toBe(skill.output);
  expect(cli.children[0].options).toMatchObject({ input: expect.stringContaining(input.diffHash), cwd: undefined });
  expect(cli.children[0].options.args).toEqual(expect.arrayContaining(["--sandbox", "read-only", "-"]));
});
it("repairs the expected workflow kind once and exposes raw output on repeated failure", async () => {
  const skill = builtInWorkflowSkills[1];
  const cli = fakeWorkflowCLI(['{"kind":"check","result":"maybe"}', `Here:\n${JSON.stringify(workflowOutput("check"))}`]);
  expect((await cli.runner.run(input, { windowId: "w", skill, tool: "claude" })).output.kind).toBe("check");
  expect(cli.children).toHaveLength(2);
  expect(cli.children[1].options.input).toContain("$.result: expected pass | fail | warn");
  expect(cli.children[0].options.args).toEqual(expect.arrayContaining(["--tools", "", "--strict-mcp-config", "--no-session-persistence"]));
  const bad = fakeWorkflowCLI(["first bad", "second bad"]);
  await expect(bad.runner.run(input, { windowId: "w", skill, tool: "codex" })).rejects.toMatchObject({ rawOutput: "second bad", firstOutput: "first bad" });
  expect(bad.children).toHaveLength(2);
});
it("cancels active workflow children and rejects story skills", async () => {
  const cli = fakeWorkflowCLI();
  const pending = cli.runner.run(input, { windowId: "w", tool: "codex" });
  await flush();
  const rejected = expect(pending).rejects.toMatchObject({ code: "cancelled" });
  cli.runner.cancel("w"); await rejected;
  expect(cli.children[0].terminate).toHaveBeenCalledTimes(1);
  await expect(cli.runner.run(input, { windowId: "w", skill: changeStorySkill })).rejects.toThrow("workflow skill");
});
it("uses a single deadline for the workflow and its repair", async () => {
  jest.useFakeTimers();
  try {
    const cli = fakeWorkflowCLI(["bad", null]);
    const pending = cli.runner.run(input, { windowId: "w", tool: "codex", timeoutMs: 40 });
    const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await jest.advanceTimersByTimeAsync(40); await rejected;
    expect(cli.children).toHaveLength(2);
    expect(cli.children[1].terminate).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});

it("repairs a patch that echoes a different base hash", async () => {
  const output = workflowOutput("patch");
  const cli = fakeWorkflowCLI([JSON.stringify({ ...output, baseDiffHash: `sha256:${"0".repeat(64)}` }), JSON.stringify(output)]);
  const result = await cli.runner.run(input, { windowId: "w", skill: builtInWorkflowSkills[2], tool: "codex" });
  expect(cli.children).toHaveLength(2);
  expect(cli.children[1].options.input).toContain("baseDiffHash");
  expect(result.output).toEqual(output);
});
