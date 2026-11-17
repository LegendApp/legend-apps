import { storyHash } from "@legend-apps/change-story";
import type { DiffFileSummary } from "@legend-apps/diff-parser";
import { storyCacheIdentity, storyCacheKey } from "../storyCache";
import { buildStoryInput } from "../storyHunks";
import { assembleStoryPrompt, builtInStorySkills } from "../storySkill";
import { fixtureDocument, patchSource, repoSource } from "./storyFixtures";

// Golden values from before the shared change-story package: a change here invalidates every cached story.
function renamedDocument() {
  const document = fixtureDocument();
  const files: DiffFileSummary[] = document.files.map(file => file.path === "src/a.ts" ? { ...file, path: "src/b \\\"q\\\".ts", oldPath: "src/a.ts", status: "renamed" } : file);
  return { ...document, getFiles: () => files };
}

test("story inputs, skills, cache keys and prompts keep their pre-package identity", () => {
  const input = buildStoryInput(fixtureDocument(), repoSource);
  const renamed = buildStoryInput(renamedDocument(), patchSource);
  expect(input.diffHash).toBe(GOLDEN.diffHash);
  expect(renamed.diffHash).toBe(GOLDEN.renamedDiffHash);
  expect(input.hunks.map(hunk => hunk.hash)).toEqual(GOLDEN.hunkHashes);
  expect(builtInStorySkills.map(skill => skill.hash)).toEqual(GOLDEN.skillHashes);
  expect(storyCacheKey(storyCacheIdentity("repo:/repo", input, builtInStorySkills[0], "claude"))).toBe(GOLDEN.cacheKey);
  expect(storyHash(assembleStoryPrompt(renamed).prompt)).toBe(GOLDEN.promptHash);
});

const GOLDEN = {
  diffHash: "sha256:0fdfcc95b435b8270df50a4221eb12e658cadd380ee0a569e03efd70e4600694",
  renamedDiffHash: "sha256:6551320770bbe3e2388d1955320680a222dc72e7f102acecc751da1e9e276008",
  hunkHashes: ["b9cf8972bd77bf98ebbdb170f073e7dbdd22cbe764fe0241a54202aeb63ad460", "2bd3196144089c87c39362f09845e9d6066f08bf24a621fb93c8b1be3cd8497c", "c432d87a7fb7c988c18da89d80a6c1bde9f0f0bf12d7ec5a005460f7c8ba6621"],
  skillHashes: ["54938121b67d4f8cb58053ea25b92aada9066ef358ad74350dda2742fbe82e94", "76616d931f2f2fc1765d5d4b25fd7ff58e49ddbe98521e37b7cc9e6ab07cb29b"],
  cacheKey: "b515e5bf48e7ea97f5987798e888bfef4bb4cf027d66d4b6e7b75b9de720a05f",
  promptHash: "47ff863949d403434e084740a4fd8ff39fefcd5d3c76adb50e08b8b6ca226e47",
};
