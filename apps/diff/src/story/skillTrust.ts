import { diffSkillApprovals$ } from "../diffSettings";
import { storyHash } from "./storyHash";
import type { StorySkill } from "./storySkill";

export function repoSkillApprovalKey(repoRoot: string, skill: StorySkill) {
  return storyHash(JSON.stringify([repoRoot, skill.hash]));
}
export function repoSkillNotice(skill: StorySkill) {
  return `“${skill.name}” is from this repository (${skill.path}). Repository prompts can contain instructions written by anyone with access to the repository. Review the prompt before allowing it to run with your AI CLI. Approval covers this file hash only; edits require approval again.`;
}
export const skillTrust = {
  isTrusted(skill: StorySkill, repoRoot?: string) {
    return skill.layer !== "repo" || !!repoRoot && skill.repoRoot === repoRoot && diffSkillApprovals$[repoSkillApprovalKey(repoRoot, skill)].peek() === true;
  },
  approve(skill: StorySkill, repoRoot: string) {
    if (skill.layer !== "repo" || skill.repoRoot !== repoRoot) throw new Error("Repository skill approval must match the repository being reviewed.");
    diffSkillApprovals$[repoSkillApprovalKey(repoRoot, skill)].set(true);
  },
};
