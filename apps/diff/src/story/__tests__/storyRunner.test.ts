import type { ProcessHandle, ProcessOptions, ProcessResult } from "@legendapp/spark/processes";
import { createStoryRunner, StoryOutputError, StoryRunError } from "../storyRunner";
import { processResult } from "../../__tests__/processFixtures";
import { fixtureInput, fixtureStory } from "./storyFixtures";

function fakeCLI(outputs: (string | "hang" | ProcessResult)[]) {
  const children: { options: ProcessOptions; terminate: jest.Mock; complete: (result: ProcessResult) => void }[] = [];
  const spawn = jest.fn(async (options: ProcessOptions): Promise<ProcessHandle> => {
    const output = outputs.shift()!;
    let complete!: (result: ProcessResult) => void;
    const exited = new Promise<ProcessResult>(resolve => { complete = resolve; });
    const terminate = jest.fn(async () => { complete({ ...processResult(), aborted: true }); await exited; });
    children.push({ options, terminate, complete });
    return { id: String(children.length), exited, terminate, write: jest.fn(async () => {}), resize: jest.fn(async () => {}),
      closeInput: jest.fn(async () => {
        if (output === "hang") return;
        const result = typeof output === "string" ? processResult({ stdout: output }) : output;
        options.onOutput?.({ stream: "stdout", bytes: result.stdout });
        complete(result);
      }) };
  });
  const runCommand = jest.fn(async () => processResult());
  const runner = createStoryRunner({ spawn, runCommand, availability: async () => ({ codex: true, claude: true }) });
  return { runner, children, spawn, runCommand };
}
const options = { windowId: "viewer", tool: "codex" as const, cwd: "/repo" };

it.each(["codex", "claude"] as const)("runs %s with stdin, read-only arguments and streaming progress", async tool => {
  const cli = fakeCLI([JSON.stringify(fixtureStory())]), progress = jest.fn();
  const result = await cli.runner.run(fixtureInput(), { ...options, tool, model: "test-model", onProgress: progress });
  expect(result).toMatchObject({ tool, model: "test-model", story: fixtureStory() });
  const command = cli.children[0].options;
  expect(command.cwd).toBe("/repo"); expect(command.input).toContain("Hunk index");
  expect(command.args?.join(" ")).not.toContain("Hunk index");
  expect(command.args).toContain("test-model");
  if (tool === "codex") expect(command.args).toEqual(expect.arrayContaining(["--sandbox", "read-only", "-"]));
  else expect(command.args).toEqual(expect.arrayContaining(["--tools", "", "--strict-mcp-config", "--no-session-persistence"]));
  expect(progress.mock.calls.map(([event]) => event.phase)).toEqual(["starting", "output", "complete"]);
  expect(progress.mock.calls.at(-1)![0].receivedBytes).toBeGreaterThan(0);
  expect(cli.runCommand).not.toHaveBeenCalled();
});
it("repairs invalid output exactly once with the validator error", async () => {
  const cli = fakeCLI(['{"kind":"story","title":4}', `\`\`\`json\n${JSON.stringify(fixtureStory())}\n\`\`\``]);
  expect((await cli.runner.run(fixtureInput(), options)).story).toEqual(fixtureStory());
  expect(cli.spawn).toHaveBeenCalledTimes(2);
  expect(cli.children[1].options.input).toContain("Validator errors");
  expect(cli.children[1].options.input).toContain("$.title: expected string");
});
it("returns a typed error carrying both raw outputs after failed repair", async () => {
  const cli = fakeCLI(["first garbage", "second garbage"]);
  await expect(cli.runner.run(fixtureInput(), options)).rejects.toMatchObject({ name: "StoryOutputError", rawOutput: "second garbage", firstOutput: "first garbage" });
  expect(cli.spawn).toHaveBeenCalledTimes(2);
});
it("does not retry dropped references or process failures", async () => {
  const cli = fakeCLI([JSON.stringify(fixtureStory([{ hunk: "missing" }]))]);
  const result = await cli.runner.run(fixtureInput(), options);
  expect(result.issues).toHaveLength(1); expect(cli.spawn).toHaveBeenCalledTimes(1);
  const failed = fakeCLI([processResult({ exitCode: 1, stderr: "CLI failed" })]);
  await expect(failed.runner.run(fixtureInput(), options)).rejects.toThrow("CLI failed");
  expect(failed.spawn).toHaveBeenCalledTimes(1);
});
it("kills the process on AbortSignal and permits a new run only after termination", async () => {
  const cli = fakeCLI(["hang", JSON.stringify(fixtureStory())]), controller = new AbortController();
  const pending = cli.runner.run(fixtureInput(), { ...options, signal: controller.signal });
  await Promise.resolve(); await Promise.resolve();
  await expect(cli.runner.run(fixtureInput(), options)).rejects.toMatchObject({ code: "busy" });
  const rejected = expect(pending).rejects.toMatchObject({ code: "cancelled" });
  controller.abort(); await rejected;
  expect(cli.children[0].terminate).toHaveBeenCalledTimes(1);
  expect((await cli.runner.run(fixtureInput(), options)).story.title).toBe("Improve behavior");
});
it("times out and kills a hung fake CLI", async () => {
  jest.useFakeTimers();
  try {
    const cli = fakeCLI(["hang"]);
    const pending = cli.runner.run(fixtureInput(), { ...options, timeoutMs: 25 });
    const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await jest.advanceTimersByTimeAsync(25); await rejected;
    expect(cli.children[0].terminate).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});
it("keeps the same total deadline across the automatic repair", async () => {
  jest.useFakeTimers();
  try {
    const cli = fakeCLI(["bad output", "hang"]);
    const pending = cli.runner.run(fixtureInput(), { ...options, timeoutMs: 40 });
    const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await jest.advanceTimersByTimeAsync(40); await rejected;
    expect(cli.spawn).toHaveBeenCalledTimes(2);
    expect(cli.children[1].terminate).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});
it("waits for process termination to drain before releasing the run slot", async () => {
  const cli = fakeCLI(["hang"]);
  const pending = cli.runner.run(fixtureInput(), options);
  await Promise.resolve(); await Promise.resolve();
  let finishTermination!: () => void;
  cli.children[0].terminate.mockImplementationOnce(() => new Promise<void>(resolve => { finishTermination = resolve; }));
  const rejected = expect(pending).rejects.toMatchObject({ code: "cancelled" });
  cli.runner.cancel("viewer");
  cli.children[0].complete(processResult());
  await Promise.resolve();
  await expect(cli.runner.run(fixtureInput(), options)).rejects.toMatchObject({ code: "busy" });
  finishTermination(); await rejected;
});
it("defaults to five minutes and cancels all runs in a closed window only", async () => {
  const cli = fakeCLI(["hang", "hang"]);
  const first = cli.runner.run(fixtureInput(), options), other = cli.runner.run(fixtureInput(), { ...options, windowId: "other" });
  await Promise.resolve(); await Promise.resolve();
  expect(cli.children[0].options.timeoutMs).toBe(300_000);
  const rejected = expect(first).rejects.toMatchObject({ code: "cancelled" });
  cli.runner.cancel("viewer"); await rejected;
  expect(cli.children[1].terminate).not.toHaveBeenCalled();
  cli.children[1].complete(processResult({ stdout: JSON.stringify(fixtureStory()) })); await other;
});
it("handles an abort during spawn acknowledgement without accepting a late result", async () => {
  const controller = new AbortController(), terminate = jest.fn(async () => {});
  const runner = createStoryRunner({ availability: async () => ({ codex: true, claude: false }), runCommand: jest.fn(), spawn: async () => {
    controller.abort();
    return { id: "late", exited: Promise.resolve(processResult({ stdout: JSON.stringify(fixtureStory()) })), terminate,
      closeInput: jest.fn(), write: jest.fn(), resize: jest.fn() };
  } });
  await expect(runner.run(fixtureInput(), { ...options, signal: controller.signal })).rejects.toBeInstanceOf(StoryRunError);
  expect(terminate).toHaveBeenCalledTimes(1);
});
it("uses completion-only plumbing when spawn is unavailable and selects an available tool", async () => {
  const runCommand = jest.fn(async () => processResult({ stdout: JSON.stringify(fixtureStory()) }));
  const runner = createStoryRunner({ runCommand, availability: async () => ({ codex: true, claude: false }) });
  const result = await runner.run(fixtureInput(), { windowId: "fallback" });
  expect(result.tool).toBe("codex"); expect(runCommand).toHaveBeenCalledTimes(1);
});
it("reports unavailable tools and pre-aborted signals without launching", async () => {
  const runCommand = jest.fn(), runner = createStoryRunner({ runCommand, availability: async () => ({ codex: false, claude: false }) });
  await expect(runner.run(fixtureInput(), { windowId: "none" })).rejects.toMatchObject({ code: "unavailable" });
  const controller = new AbortController(); controller.abort();
  await expect(runner.run(fixtureInput(), { ...options, signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
  expect(runCommand).not.toHaveBeenCalled();
});
it("exports typed output errors for callers", () => expect(new StoryOutputError("raw", "error", "first")).toBeInstanceOf(Error));

it.each(["codex", "claude"] as const)("honors a skill's %s preference over the viewer fallback", async tool => {
  const { changeStorySkill } = require("../storySkill");
  const cli = fakeCLI([JSON.stringify(fixtureStory())]);
  const result = await cli.runner.run(fixtureInput(), { ...options, skill: { ...changeStorySkill, tool }, tool: tool === "codex" ? "claude" : "codex" });
  expect(result.tool).toBe(tool);
  expect(cli.children[0].options.target).toMatchObject({ name: tool });
});
it("uses the skill timeout in seconds and refuses workflow output in the story runner", async () => {
  jest.useFakeTimers();
  try {
    const { changeStorySkill } = require("../storySkill");
    const cli = fakeCLI(["hang"]);
    const pending = cli.runner.run(fixtureInput(), { ...options, skill: { ...changeStorySkill, timeout: 2 } });
    const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await jest.advanceTimersByTimeAsync(1999);
    expect(cli.children[0].options.timeoutMs).toBe(2000);
    expect(cli.children[0].terminate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); await rejected;
    await expect(cli.runner.run(fixtureInput(), { ...options, skill: { ...changeStorySkill, kind: "workflow", output: "check" } })).rejects.toThrow("story skill");
  } finally { jest.useRealTimers(); }
});
