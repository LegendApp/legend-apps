import { createStoryCache, storyCacheIdentity, storyCacheKey } from "../storyCache";
import { changeStorySkill } from "../storySkill";
import { fixtureInput, fixtureResult, memoryStorage } from "./storyFixtures";

it("hits exact cache keys and recomputes coverage locally", () => {
  const storage = memoryStorage(), cache = createStoryCache(storage), input = fixtureInput(), result = fixtureResult(input);
  const identity = storyCacheIdentity("repo:/a", input, changeStorySkill, "codex");
  expect(cache.load(identity)).toBeNull();
  cache.save(identity, { ...result, uncovered: [], coveredHunkIds: ["invented"] }, input);
  expect(cache.load(identity)).toMatchObject({ stale: false, result: { uncovered: result.uncovered, coveredHunkIds: ["h1"] }, input });
  expect([...storage.values.keys()].every(path => !path.includes("/a"))).toBe(true);
});
it("preserves the previous story as stale after the diff hash changes", () => {
  const storage = memoryStorage(), cache = createStoryCache(storage), input = fixtureInput(), result = fixtureResult(input);
  const identity = storyCacheIdentity("repo:/a", input, changeStorySkill, "codex");
  cache.save(identity, result, input);
  const changed = fixtureInput({ text: "changed" }), changedIdentity = { ...identity, diffHash: changed.diffHash };
  expect(cache.load(changedIdentity)).toMatchObject({ stale: true, result, input });
  cache.save(changedIdentity, fixtureResult(changed), changed);
  expect(cache.load(identity)).toMatchObject({ stale: false, result });
});
it.each(["skillName", "skillHash", "contractVersion", "tool", "model", "scope"] as const)("misses when %s changes", field => {
  const storage = memoryStorage(), cache = createStoryCache(storage), input = fixtureInput();
  const identity = storyCacheIdentity("repo:/a", input, changeStorySkill, "codex");
  cache.save(identity, fixtureResult(input), input);
  const changed = { ...identity, [field]: field === "contractVersion" ? 2 : field === "tool" ? "claude" : "different" };
  expect(cache.load(changed)).toBeNull();
  if (field !== "scope") expect(storyCacheKey(changed)).not.toBe(storyCacheKey(identity));
});
it("treats malformed cache files as misses and rejects mismatched saves", () => {
  const storage = memoryStorage(), cache = createStoryCache(storage), input = fixtureInput();
  const identity = storyCacheIdentity("repo:/a", input, changeStorySkill, "codex");
  cache.save(identity, fixtureResult(input), input);
  for (const path of storage.values.keys()) storage.values.set(path, "bad JSON");
  expect(cache.load(identity)).toBeNull();
  expect(() => cache.save({ ...identity, diffHash: "other" }, fixtureResult(input), input)).toThrow("identity");
});
