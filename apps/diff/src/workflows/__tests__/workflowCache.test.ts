import { fixtureInput, memoryStorage } from "../../story/__tests__/storyFixtures";
import { storyCacheIdentity } from "../../story/storyCache";
import { createWorkflowCache } from "../workflowCache";
import { builtInWorkflowSkills } from "../workflowSkills";
import { workflowResult } from "./workflowFixtures";

it("persists results with the story identity scheme and retains stale inputs", () => {
  const storage = memoryStorage(), cache = createWorkflowCache(storage), skill = builtInWorkflowSkills[1], input = fixtureInput();
  const identity = storyCacheIdentity("repo:/repo", input, skill, "codex");
  const result = workflowResult(skill);
  cache.save(identity, result, input);
  expect(createWorkflowCache(storage).load(identity)).toEqual({ result, input, stale: false });
  expect(cache.load({ ...identity, diffHash: "sha256:different" })).toMatchObject({ result, input, stale: true });
  for (const patch of [{ scope: "other" }, { skillHash: "edited" }, { tool: "claude" as const }, { model: "other" }, { contractVersion: 2 }]) expect(cache.load({ ...identity, ...patch })).toBeNull();
  expect(() => cache.save(identity, { ...result, skillHash: "wrong" }, input)).toThrow("identity");
});
it("ignores corrupted cached output and mismatched result metadata", () => {
  const storage = memoryStorage(), cache = createWorkflowCache(storage), skill = builtInWorkflowSkills[1], input = fixtureInput();
  const identity = storyCacheIdentity("repo:/repo", input, skill, "codex");
  cache.save(identity, workflowResult(skill), input);
  const path = [...storage.values.keys()].find(path => path.endsWith(".json"))!;
  const valid = JSON.parse(storage.values.get(path)!);
  for (const value of ["bad json", JSON.stringify({ ...valid, result: { ...valid.result, model: "other" } }), JSON.stringify({ ...valid, result: { ...valid.result, output: { kind: "check" } } })]) {
    storage.values.set(path, value); expect(cache.load(identity)).toBeNull();
  }
});
it("saves named preset sets per source, replaces and deletes them", () => {
  const storage = memoryStorage(), cache = createWorkflowCache(storage);
  cache.savePreset("repo:a", " Pre-PR checks ", ["review-risks", "tests-cover-change", "review-risks"]);
  expect(createWorkflowCache(storage).presets("repo:a")).toEqual([{ name: "Pre-PR checks", skills: ["review-risks", "tests-cover-change"] }]);
  expect(cache.presets("repo:b")).toEqual([]);
  cache.savePreset("repo:a", "Pre-PR checks", ["tests-cover-change"]);
  expect(cache.presets("repo:a")).toHaveLength(1);
  expect(() => cache.savePreset("repo:a", "", [])).toThrow();
  expect(() => cache.savePreset("repo:a", "bad", ["../skill"])).toThrow();
  cache.deletePreset("repo:a", "Pre-PR checks"); expect(cache.presets("repo:a")).toEqual([]);
});
it("discards exact and latest proposals while preserving a newer proposal from another window", () => {
  const storage = memoryStorage(), cache = createWorkflowCache(storage), skill = builtInWorkflowSkills[2], input = fixtureInput();
  const identity = storyCacheIdentity("repo:/repo", input, skill, "codex");
  cache.save(identity, workflowResult(skill, input), input);
  cache.discard(identity);
  expect(cache.load(identity)).toBeNull();
  expect(cache.load({ ...identity, diffHash: "different" })).toBeNull();
  const nextInput = fixtureInput({ text: "newer" }), next = { ...identity, diffHash: nextInput.diffHash };
  cache.save(identity, workflowResult(skill, input), input);
  cache.save(next, workflowResult(skill, nextInput), nextInput);
  cache.discard(identity);
  expect(cache.load(next)?.result.diffHash).toBe(next.diffHash);
});
