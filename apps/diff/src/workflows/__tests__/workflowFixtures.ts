import type { ProcessHandle, ProcessOptions } from "@legendapp/spark/processes";
import { processResult } from "../../__tests__/processFixtures";
import { fixtureInput } from "../../story/__tests__/storyFixtures";
import type { StorySkill } from "../../story/storySkill";
import { createWorkflowRunner, type WorkflowRunResult } from "../workflowRunner";
import type { WorkflowOutput } from "../workflowContract";

export function workflowOutput(kind: StorySkill["output"], input = fixtureInput()): WorkflowOutput {
  const envelope = { contractVersion: 1 as const, summary: "Review completed" };
  if (kind === "patch") return { ...envelope, kind, description: "No correction needed", patch: "", baseDiffHash: input.diffHash };
  if (kind === "check") return { ...envelope, kind, result: "warn", reasons: [{ text: "Tests not run" }] };
  return { ...envelope, kind: "comments", comments: [] };
}
export function workflowResult(skill: StorySkill, input = fixtureInput()): WorkflowRunResult {
  return { output: workflowOutput(skill.output, input), issues: [], diffHash: input.diffHash, skillName: skill.name, skillHash: skill.hash, tool: "codex", model: "default", createdAt: 1 };
}
export function fakeWorkflowCLI(outputs: (string | null)[] = []) {
  const children: { options: ProcessOptions; complete: (output: string) => void; terminate: jest.Mock }[] = [];
  const spawn = jest.fn(async (options: ProcessOptions): Promise<ProcessHandle> => {
    const output = outputs.shift();
    let resolve!: (result: ReturnType<typeof processResult>) => void;
    const exited = new Promise<ReturnType<typeof processResult>>(done => { resolve = done; });
    const complete = (output: string) => {
      const result = processResult({ stdout: output });
      options.onOutput?.({ stream: "stdout", bytes: result.stdout }); resolve(result);
    };
    const terminate = jest.fn(async () => { resolve({ ...processResult(), aborted: true }); await exited; });
    children.push({ options, complete, terminate });
    return { id: String(children.length), exited, terminate, closeInput: jest.fn(async () => { if (output != null) complete(output); }),
      write: jest.fn(async () => {}), resize: jest.fn(async () => {}) };
  });
  const runner = createWorkflowRunner({ spawn, runCommand: jest.fn(), availability: async () => ({ codex: true, claude: true }) });
  return { runner, children, spawn };
}
export const flush = () => new Promise<void>(resolve => setImmediate(resolve));
