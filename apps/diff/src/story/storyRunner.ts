import { buildAIInvocation, getAICommandAvailability, selectPreferredAITool } from "@legendapp/spark/ai";
import { runCommand, spawn } from "@legendapp/spark/processes";
import { createOutputRunner, type AIRunMetadata, type StoryProcessDependencies } from "@legend-apps/change-story";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { extractStoryJSON, validateStory, type ValidatedStory } from "./storyContract";
import { assembleStoryPrompt, changeStorySkill } from "./storySkill";

export { selectStoryTool, StoryOutputError, StoryRunError, type StoryProgress, type StoryRunOptions, type StoryTool } from "@legend-apps/change-story";

export type StoryRunResult = ValidatedStory & AIRunMetadata;
type DiffStoryDependencies = Omit<StoryProcessDependencies, "decode" | "buildInvocation"> & Partial<Pick<StoryProcessDependencies, "decode" | "buildInvocation">>;

export function createStoryRunner(dependencies: DiffStoryDependencies = { spawn, runCommand, availability: getAICommandAvailability }) {
  return createOutputRunner<ValidatedStory>({
    defaultSkill: changeStorySkill, accepts: skill => skill.kind === "story" && skill.output === "story", label: "change story",
    prompt: assembleStoryPrompt, validate: (output, input) => validateStory(extractStoryJSON(output), input.hunks),
  }, { decode: decodeProcessText, buildInvocation: buildAIInvocation, selectTool: selectPreferredAITool, ...dependencies });
}

export const storyRunner = createStoryRunner();
