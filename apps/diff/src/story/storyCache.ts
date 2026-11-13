import { createStorage, type Storage } from "@legend-apps/storage";
import { storyContractVersion, validateStory } from "./storyContract";
import { storyHash } from "./storyHash";
import type { StoryInput } from "./storyHunks";
import type { StoryRunResult, StoryTool } from "./storyRunner";
import type { StorySkill } from "./storySkill";

export type StoryCacheIdentity = { scope: string; diffHash: string; skillName: string; skillHash: string; contractVersion: number; tool: StoryTool; model: string };
export function storyCacheIdentity(scope: string, input: StoryInput, skill: StorySkill, tool: StoryTool, model = "default"): StoryCacheIdentity {
  return { scope, diffHash: input.diffHash, skillName: skill.name, skillHash: skill.hash, contractVersion: storyContractVersion, tool, model };
}
export function storyCacheKey(identity: StoryCacheIdentity) {
  return storyHash(JSON.stringify([identity.diffHash, identity.skillName, identity.skillHash, identity.contractVersion, identity.tool, identity.model]));
}
function cacheGroup(identity: StoryCacheIdentity) {
  return `${storyHash(identity.scope)}/${storyHash(JSON.stringify([identity.skillName, identity.skillHash, identity.contractVersion, identity.tool, identity.model]))}`;
}
type CacheEntry = { identity: StoryCacheIdentity; result: StoryRunResult; input: StoryInput };
export type CachedStory = { result: StoryRunResult; input: StoryInput; stale: boolean };

export function createStoryCache(storage: Pick<Storage, "read" | "write"> = createStorage({ subfolder: "stories" })) {
  function read(path: string, identity: StoryCacheIdentity, exact: boolean): CachedStory | null {
    let entry: CacheEntry;
    try {
      const raw = storage.read(path, { format: "text" });
      if (raw === undefined) return null;
      entry = JSON.parse(raw) as CacheEntry;
      if (cacheGroup(entry.identity) !== cacheGroup(identity) || (exact && storyCacheKey(entry.identity) !== storyCacheKey(identity)) ||
        entry.result.diffHash !== entry.identity.diffHash || entry.input.diffHash !== entry.identity.diffHash) return null;
      const validation = validateStory(entry.result.story, entry.input.hunks);
      return { result: { ...entry.result, ...validation, issues: entry.result.issues }, input: entry.input, stale: entry.identity.diffHash !== identity.diffHash };
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof TypeError || error instanceof Error && error.name === "StoryValidationError") return null;
      throw error;
    }
  }
  return {
    isEnabled(scope: string, tool: StoryTool) {
      const value = storage.read(`${storyHash(scope)}/consent-${tool}.json`, { format: "text" });
      return value === "true";
    },
    setEnabled(scope: string, tool: StoryTool, enabled: boolean) {
      storage.write(`${storyHash(scope)}/consent-${tool}.json`, String(enabled), { format: "text" });
    },
    load(identity: StoryCacheIdentity): CachedStory | null {
      const group = cacheGroup(identity);
      const exact = read(`${group}/${storyCacheKey(identity)}.json`, identity, true);
      if (exact) return exact;
      const latest = storage.read(`${group}/latest`, { format: "text" });
      return latest && /^[a-f0-9]{64}$/.test(latest) ? read(`${group}/${latest}.json`, identity, false) : null;
    },
    save(identity: StoryCacheIdentity, result: StoryRunResult, input: StoryInput) {
      if (identity.diffHash !== input.diffHash || result.diffHash !== input.diffHash || result.skillName !== identity.skillName ||
        result.skillHash !== identity.skillHash || result.tool !== identity.tool || result.model !== identity.model) throw new Error("Story cache identity does not match the result.");
      const entry = JSON.stringify({ identity, result, input });
      const group = cacheGroup(identity);
      storage.write(`${group}/${storyCacheKey(identity)}.json`, entry, { format: "text" });
      storage.write(`${group}/latest`, storyCacheKey(identity), { format: "text" });
    },
  };
}
