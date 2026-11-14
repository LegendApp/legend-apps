import { createStoryStore } from "../storyStore";
import { createStoryCache } from "../storyCache";
import { StoryOutputError, StoryRunError, type storyRunner } from "../storyRunner";
import { fixtureInput, fixtureResult, memoryStorage, repoSource } from "./storyFixtures";

const request = { input: fixtureInput(), source: repoSource, tool: "codex" as const };
function setup() {
  const storage = memoryStorage(), cache = createStoryCache(storage);
  cache.setEnabled("repo:/repo", "codex", true);
  const runner = { run: jest.fn<ReturnType<typeof storyRunner.run>, Parameters<typeof storyRunner.run>>(async () => fixtureResult()), cancel: jest.fn() };
  return { store: createStoryStore({ runner, cache: () => cache }), runner, cache };
}
it("owns idle, progress, done and stale state per window and reads cached stories", async () => {
  const { store, runner } = setup();
  expect(store.state("a").status.peek()).toBe("idle");
  runner.run.mockImplementationOnce(async (_input, options) => {
    expect(store.state("a").status.peek()).toBe("running");
    options.onProgress!({ phase: "output", receivedBytes: 20 });
    expect(store.state("a").status.peek()).toBe("progress");
    return fixtureResult();
  });
  await store.run("a", request);
  expect(store.state("a").status.peek()).toBe("done");
  expect(store.state("b").status.peek()).toBe("idle");
  store.load("b", request); expect(store.state("b").status.peek()).toBe("done");
  const changed = { ...request, input: fixtureInput({ text: "changed" }) };
  store.setDiff("a", changed.input, repoSource); expect(store.state("a").status.peek()).toBe("stale");
  store.load("b", changed); expect(store.state("b").status.peek()).toBe("stale");
  expect(store.state("b").input.peek()?.diffHash).toBe(request.input.diffHash);
});
it("marks a completed run stale if the diff changed while it ran", async () => {
  const { store, runner } = setup();
  runner.run.mockImplementationOnce(async () => {
    store.setDiff("a", fixtureInput({ text: "changed" }), repoSource); return fixtureResult();
  });
  await store.run("a", request); expect(store.state("a").status.peek()).toBe("stale");
});
it("does not resurrect a closed window after its pending run completes", async () => {
  const { store, runner } = setup();
  runner.run.mockImplementationOnce(async () => { store.closeWindow("a"); return fixtureResult(); });
  await store.run("a", request);
  expect(runner.cancel).toHaveBeenCalledWith("a"); expect(store.state$.peek()).toEqual({});
});
it("surfaces invalid output with raw text and restores previous state after cancel", async () => {
  const { store, runner } = setup();
  runner.run.mockRejectedValueOnce(new StoryOutputError("raw", "bad", "first"));
  await store.run("a", request);
  expect(store.state("a").peek()).toMatchObject({ status: "error", error: { rawOutput: "raw" } });
  runner.run.mockRejectedValueOnce(new StoryRunError("cancelled", "Cancelled"));
  await store.run("a", request); expect(store.state("a").status.peek()).toBe("idle");
});
it("rejects overlapping runs but permits independent windows", async () => {
  const { store, runner } = setup();
  let finish!: (value: ReturnType<typeof fixtureResult>) => void;
  runner.run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = store.run("a", request);
  await expect(store.run("a", request)).rejects.toMatchObject({ code: "busy" });
  await store.run("b", request); finish(fixtureResult()); await pending;
});
it("clears prior source state and ignores its pending result on a repository switch", async () => {
  const { store, runner } = setup();
  runner.run.mockImplementationOnce(async () => {
    store.setDiff("a", request.input, { ...repoSource, kind: "folder", value: "/other" }); return fixtureResult();
  });
  await store.run("a", request);
  expect(store.state$.peek()).toEqual({}); expect(runner.cancel).toHaveBeenCalledWith("a");
});
it("requires a per-source and per-tool opt-in before starting the CLI", async () => {
  const { store, runner } = setup();
  store.setEnabled("repo:/repo", "codex", false);
  await expect(store.run("a", request)).rejects.toMatchObject({ code: "consent" });
  expect(runner.run).not.toHaveBeenCalled();
  store.setEnabled("repo:/repo", "codex", true);
  await expect(store.run("a", { ...request, tool: "claude" })).rejects.toMatchObject({ code: "consent" });
  await store.run("a", request); expect(runner.run).toHaveBeenCalledTimes(1);
});
