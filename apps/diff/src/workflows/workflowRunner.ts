import { extractStoryJSON } from "../story/storyContract";
import { createOutputRunner, type AIRunMetadata, type StoryProcessDependencies } from "../story/storyRunner";
import { validateWorkflow, type ValidatedWorkflow, type WorkflowKind } from "./workflowContract";
import { assembleWorkflowPrompt, builtInWorkflowSkills } from "./workflowSkills";

export type WorkflowRunResult = ValidatedWorkflow & AIRunMetadata;
export function createWorkflowRunner(dependencies?: StoryProcessDependencies) {
  return createOutputRunner({ defaultSkill: builtInWorkflowSkills[0], accepts: skill => skill.kind === "workflow" && skill.output !== "story",
    label: "workflow", prompt: assembleWorkflowPrompt,
    validate: (output, input, skill) => validateWorkflow(extractStoryJSON(output, skill.output), skill.output as WorkflowKind, input.hunks) }, dependencies);
}
export const workflowRunner = createWorkflowRunner();
