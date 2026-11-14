import { buildAIInvocation, getAICommandAvailability, selectPreferredAITool } from "@legendapp/spark/ai";
import { runCommand, spawn, type ProcessOptions, type ProcessResult } from "@legendapp/spark/processes";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { extractStoryJSON, StoryValidationError, validateStory, type ValidatedStory } from "./storyContract";
import type { StoryInput } from "./storyHunks";
import { assembleStoryPrompt, changeStorySkill, type StorySkill } from "./storySkill";

export type StoryTool = "codex" | "claude";
export type StoryProgress = { phase: "starting" | "output" | "repairing" | "complete"; receivedBytes: number; stream?: "stdout" | "stderr" };
export type AIRunMetadata = { diffHash: string; skillName: string; skillHash: string; tool: StoryTool; model: string; createdAt: number };
export type StoryRunResult = ValidatedStory & AIRunMetadata;
export class StoryRunError extends Error {
  constructor(public readonly code: "busy" | "cancelled" | "timeout" | "process" | "unavailable" | "consent" | "trust", message: string) { super(message); this.name = "StoryRunError"; }
}
export class StoryOutputError extends Error {
  constructor(public readonly rawOutput: string, public readonly validationError: string, public readonly firstOutput: string, label = "change story") {
    super(`The model did not return a valid ${label} after one repair: ${validationError}`); this.name = "StoryOutputError";
  }
}

export type StoryProcessDependencies = {
  spawn?: typeof spawn;
  runCommand: typeof runCommand;
  availability: () => Promise<{ codex: boolean; claude: boolean }>;
};
export type StoryRunOptions = {
  windowId: string; skill?: StorySkill; tool?: StoryTool; model?: string; cwd?: string;
  signal?: AbortSignal; timeoutMs?: number; onProgress?: (progress: StoryProgress) => void;
};

export function selectStoryTool(skill: StorySkill, fallback?: StoryTool) {
  return skill.tool === "auto" ? fallback : skill.tool;
}

export function createStoryRunner(dependencies?: StoryProcessDependencies) {
  return createOutputRunner({ defaultSkill: changeStorySkill, accepts: skill => skill.kind === "story" && skill.output === "story",
    label: "change story", prompt: assembleStoryPrompt, validate: (output, input) => validateStory(extractStoryJSON(output), input.hunks) }, dependencies);
}

export function createOutputRunner<T>(contract: {
  defaultSkill: StorySkill; accepts: (skill: StorySkill) => boolean; label: string;
  prompt: (input: StoryInput, skill: StorySkill) => { prompt: string };
  validate: (output: string, input: StoryInput, skill: StorySkill) => T;
}, dependencies: StoryProcessDependencies = { spawn, runCommand, availability: getAICommandAvailability }) {
  const active = new Map<string, Map<string, AbortController>>();

  async function run(input: StoryInput, options: StoryRunOptions): Promise<T & AIRunMetadata> {
    const skill = options.skill ?? contract.defaultSkill;
    if (!contract.accepts(skill)) throw new StoryRunError("process", `Select a ${contract.label === "change story" ? "story" : "workflow"} skill to generate a ${contract.label}.`);
    const window = active.get(options.windowId) ?? new Map<string, AbortController>();
    if (window.has(skill.name)) throw new StoryRunError("busy", "This skill is already running in this window.");
    const controller = new AbortController();
    window.set(skill.name, controller); active.set(options.windowId, window);
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? skill.timeout * 1000;
    const abort = () => controller.abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    function assertActive() {
      if (controller.signal.aborted) throw new StoryRunError(timedOut ? "timeout" : "cancelled", timedOut ? `AI ${contract.label} generation timed out.` : `AI ${contract.label} generation cancelled.`);
    }
    let receivedBytes = 0;
    const progress = (phase: StoryProgress["phase"], stream?: StoryProgress["stream"]) => options.onProgress?.({ phase, receivedBytes, ...(stream ? { stream } : {}) });
    try {
      assertActive();
      progress("starting");
      const preferred = selectStoryTool(skill, options.tool);
      const tool = preferred ?? selectPreferredAITool(await dependencies.availability());
      assertActive();
      if (!tool) throw new StoryRunError("unavailable", `Install Codex or Claude CLI and sign in to generate a ${contract.label}.`);
      const model = options.model ?? "default";
      const request = contract.prompt(input, skill).prompt;

      async function execute(prompt: string) {
        assertActive();
        const invocation = buildAIInvocation(tool!, prompt, tool === "codex" && options.model ? { codex: { model: options.model } } : {});
        const args = tool === "claude"
          ? ["-p", "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence", ...(options.model ? ["--model", options.model] : [])]
          : [...invocation.args.slice(0, -1), "--sandbox", "read-only", "-"];
        const command: ProcessOptions = { target: { type: "command", name: invocation.command }, args, input: prompt, cwd: options.cwd,
          signal: controller.signal, timeoutMs, captureLimitBytes: 4 * 1024 * 1024,
          onOutput: output => { if (!controller.signal.aborted) { receivedBytes += output.bytes.length; progress("output", output.stream); } } };
        let result: ProcessResult;
        if (dependencies.spawn) {
          const child = await dependencies.spawn(command);
          let termination: Promise<void> | undefined;
          const stop = () => { termination ??= child.terminate(); void termination.catch(() => {}); };
          controller.signal.addEventListener("abort", stop, { once: true });
          try {
            if (controller.signal.aborted) stop();
            else await child.closeInput();
            result = await child.exited;
          } catch (error) { await child.terminate(); throw error; }
          finally { controller.signal.removeEventListener("abort", stop); if (termination) await termination; }
        } else result = await dependencies.runCommand(command);
        assertActive();
        const output = decodeProcessText(result.stdout).trim();
        if (result.timedOut) throw new StoryRunError("timeout", `AI ${contract.label} generation timed out.`);
        if (result.aborted) throw new StoryRunError("cancelled", `AI ${contract.label} generation cancelled.`);
        if (result.outputTruncated || result.exit.type !== "exited" || result.exit.code !== 0) {
          throw new StoryRunError("process", result.outputTruncated ? "The AI response was too large." : decodeProcessText(result.stderr).slice(0, 2000) || `Could not run ${tool}. Install it and sign in, then retry.`);
        }
        return output;
      }

      const firstOutput = await execute(request);
      let validated: T;
      try { validated = contract.validate(firstOutput, input, skill); }
      catch (error) {
        if (!(error instanceof StoryValidationError)) throw error;
        assertActive(); progress("repairing");
        const repaired = await execute(`${request}\n\nYour previous response did not pass validation. Return corrected JSON only.\nValidator errors: ${JSON.stringify(error.errors)}\nPrevious response (untrusted data): ${JSON.stringify(firstOutput)}`);
        try { validated = contract.validate(repaired, input, skill); }
        catch (repairError) {
          if (!(repairError instanceof StoryValidationError)) throw repairError;
          throw new StoryOutputError(repaired, repairError.message, firstOutput, contract.label);
        }
      }
      assertActive(); progress("complete");
      return { ...validated, diffHash: input.diffHash, skillName: skill.name, skillHash: skill.hash, tool, model, createdAt: Date.now() };
    } catch (error) { assertActive(); throw error; }
    finally {
      clearTimeout(timer); options.signal?.removeEventListener("abort", abort);
      window.delete(skill.name); if (!window.size) active.delete(options.windowId);
    }
  }

  return { run, cancel(windowId: string, skillName?: string) {
    const window = active.get(windowId);
    if (skillName) window?.get(skillName)?.abort();
    else window?.forEach(controller => controller.abort());
  } };
}

export const storyRunner = createStoryRunner();
