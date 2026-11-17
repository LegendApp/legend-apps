import type { GitNetworkOptions, GitService } from "@legend-apps/git-core";
import { createGitNetwork, networkStatusText, type NetworkState } from "../gitNetwork";

it("runs one operation at a time, passes on progress at most every 150 ms per phase, and cancels on stop and on a new root", async () => {
  let options!: GitNetworkOptions;
  let finish!: () => void;
  const git = { fetch: jest.fn((given: GitNetworkOptions) => { options = given; return new Promise<void>((resolve, reject) => { finish = resolve; given.signal!.addEventListener("abort", () => reject(new Error("aborted"))); }); }) };
  const states: NetworkState[] = [];
  let time = 0;
  const network = createGitNetwork(state => states.push(state), () => git as unknown as GitService, () => time);
  await expect(network.fetch()).rejects.toThrow("Open a repository first.");
  network.setRoot("/repo");
  const first = network.fetch();
  expect(states.at(-1)).toEqual({ root: "/repo", operation: "fetch", progress: null });
  await expect(network.pull()).rejects.toThrow("Fetching is still running.");
  options.onProgress!({ phase: "Receiving objects", percent: 1 });
  time = 100; options.onProgress!({ phase: "Receiving objects", percent: 2 });
  time = 200; options.onProgress!({ phase: "Receiving objects", percent: 3 });
  time = 210; options.onProgress!({ phase: "Resolving deltas", percent: 0 });
  expect(states.filter(state => state.progress).map(state => state.progress)).toEqual([
    { phase: "Receiving objects", percent: 1 }, { phase: "Receiving objects", percent: 3 }, { phase: "Resolving deltas", percent: 0 },
  ]);
  finish();
  await first;
  expect(states.at(-1)).toEqual({ root: "/repo", operation: null, progress: null });

  const cancelled = network.fetch();
  network.cancel();
  await expect(cancelled).rejects.toThrow("aborted");
  expect(states.at(-1)!.operation).toBeNull();
  const replaced = network.fetch();
  network.setRoot("/other");
  await expect(replaced).rejects.toThrow("aborted");
  expect(states.at(-1)).toEqual({ root: "/other", operation: null, progress: null });
  network.dispose();
});

it("shows the running phase and percentage, else ↓behind ↑ahead when there's an upstream", () => {
  const idle: NetworkState = { root: "/repo", operation: null, progress: null };
  const branch = { upstream: "origin/main", ahead: 1, behind: 3 };
  expect(networkStatusText(idle, branch)).toBe("↓3 ↑1");
  expect(networkStatusText(idle, { ...branch, behind: 0 })).toBe("↑1");
  expect(networkStatusText(idle, { ...branch, ahead: 0, behind: 0 })).toBe("");
  expect(networkStatusText(idle, { ...branch, upstream: null })).toBe("");
  expect(networkStatusText({ ...idle, operation: "push" }, branch)).toBe("Pushing…");
  expect(networkStatusText({ ...idle, operation: "push", progress: { phase: "Writing objects", percent: 60 } }, branch)).toBe("Writing objects 60%");
});
