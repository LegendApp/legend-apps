import { diffSkillApprovals$ } from "../../diffSettings";
import { skillTrust, repoSkillApprovalKey } from "../skillTrust";
import { changeStorySkill, parseStorySkill } from "../storySkill";
import { createStoryStore } from "../storyStore";
import { createStoryCache } from "../storyCache";
import { fixtureInput, fixtureResult, memoryStorage, repoSource } from "./storyFixtures";

const repoSkill = { ...changeStorySkill, layer: "repo" as const, repoRoot: "/repo", path: "/repo/.legend-diff/skills/story.md" };
beforeEach(() => diffSkillApprovals$.set({}));
it("requires approval per repository and exact file hash, stored in app settings", () => {
  const trust = skillTrust;
  expect(trust.isTrusted(changeStorySkill, "/repo")).toBe(true);
  expect(trust.isTrusted({ ...repoSkill, layer: "user" }, "/repo")).toBe(true);
  expect(trust.isTrusted(repoSkill, "/repo")).toBe(false);
  trust.approve(repoSkill, "/repo");
  expect(diffSkillApprovals$[repoSkillApprovalKey("/repo", repoSkill)].peek()).toBe(true);
  expect(skillTrust.isTrusted(repoSkill, "/repo")).toBe(true);
  expect(trust.isTrusted({ ...repoSkill, repoRoot: "/other" }, "/other")).toBe(false);
  expect(trust.isTrusted(repoSkill, "/other")).toBe(false);
  expect(trust.isTrusted(repoSkill)).toBe(false);
  const edited = { ...repoSkill, ...parseStorySkill(repoSkill.markdown + "Changed prompt") };
  expect(trust.isTrusted(edited, "/repo")).toBe(false);
  expect(() => trust.approve(repoSkill, "/other")).toThrow("match");
});
it("gates saved and preview runs at the store boundary and asks again after edits", async () => {
  const cache = createStoryCache(memoryStorage()); cache.setEnabled("repo:/repo", "codex", true);
  const runner = { run: jest.fn(async () => fixtureResult()), cancel: jest.fn() };
  const store = createStoryStore({ runner, cache: () => cache });
  const request = { input: fixtureInput(), source: repoSource, repoRoot: "/repo", skill: repoSkill, tool: "codex" as const };
  await expect(store.run("viewer", request)).rejects.toMatchObject({ code: "trust" });
  await expect(store.preview("viewer", request)).rejects.toMatchObject({ code: "trust" });
  expect(runner.run).not.toHaveBeenCalled();
  skillTrust.approve(repoSkill, "/repo");
  await store.run("viewer", request);
  expect(runner.run).toHaveBeenCalledTimes(1);
  await expect(store.run("viewer", { ...request, skill: { ...repoSkill, ...parseStorySkill(repoSkill.markdown + "Edit") } })).rejects.toMatchObject({ code: "trust" });
  expect(runner.run).toHaveBeenCalledTimes(1);
});
