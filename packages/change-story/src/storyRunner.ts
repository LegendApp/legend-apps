import { StoryValidationError } from "./storyContract";
import type { StoryInput } from "./storyHunks";
import type { StorySkill } from "./storySkill";

// The subset of Spark's process contract the runner uses. Spark's processes module satisfies it in an app;
// a Node child_process adapter can satisfy it headless.
export type ProcessOptions = {
  target: { type: "command"; name: string } | { type: "executable"; path: string };
  args?: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  input?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  captureLimitBytes?: number;
  onOutput?: (output: { stream: "stdout" | "stderr"; bytes: Uint8Array }) => void;
};
export type ProcessResult = {
  exit: { type: "exited"; code: number } | { type: "terminated"; signal: number | null };
  stdout: Uint8Array;
  stderr: Uint8Array;
  timedOut: boolean;
  aborted: boolean;
  outputTruncated: boolean;
};
export type ProcessHandle = { readonly exited: Promise<ProcessResult>; closeInput(): Promise<void>; terminate(): Promise<void> };
export type ProcessDependencies = {
  spawn?: (options: ProcessOptions) => Promise<ProcessHandle>;
  runCommand: (options: ProcessOptions) => Promise<ProcessResult>;
  decode: (bytes: Uint8Array) => string;
};

export type StoryTool = "codex" | "claude";
export type StoryProgress = { phase: "starting" | "output" | "repairing" | "complete"; receivedBytes: number; stream?: "stdout" | "stderr" };
export type AIRunMetadata = { diffHash: string; skillName: string; skillHash: string; tool: StoryTool; model: string; createdAt: number };
export class StoryRunError extends Error {
  readonly code: "busy" | "cancelled" | "timeout" | "process" | "unavailable" | "consent" | "trust";
  constructor(code: StoryRunError["code"], message: string) { super(message); this.name = "StoryRunError"; this.code = code; }
}
export class StoryOutputError extends Error {
  readonly rawOutput: string; readonly validationError: string; readonly firstOutput: string;
  constructor(rawOutput: string, validationError: string, firstOutput: string, label = "change story") {
    super(`The model did not return a valid ${label} after one repair: ${validationError}`); this.name = "StoryOutputError";
    this.rawOutput = rawOutput; this.validationError = validationError; this.firstOutput = firstOutput;
  }
}

export type StoryProcessDependencies = ProcessDependencies & {
  availability: () => Promise<{ codex: boolean; claude: boolean }>;
  buildInvocation: (tool: StoryTool, prompt: string, options: { codex?: { model: string } }) => { command: string; args: readonly string[] };
  /** Picks a tool when neither the skill nor the caller does; defaults to preferring Claude, as Spark's selectPreferredAITool does. */
  selectTool?: (availability: { codex: boolean; claude: boolean }) => StoryTool | null;
};
export type StoryRunOptions = {
  windowId: string; skill?: StorySkill; tool?: StoryTool; model?: string; cwd?: string;
  signal?: AbortSignal; timeoutMs?: number; onProgress?: (progress: StoryProgress) => void;
};

// Matches Spark's selectPreferredAITool, which lives behind its native process module.
const preferredTool = (availability: { codex: boolean; claude: boolean }): StoryTool | null =>
  availability.claude ? "claude" : availability.codex ? "codex" : null;

export function selectStoryTool(skill: StorySkill, fallback?: StoryTool) {
  return skill.tool === "auto" ? fallback : skill.tool;
}

/**
 * Runs a skill through the Codex or Claude CLI and validates its output with the host's contract, allowing one repair.
 * One run per skill per window; cancel by window and skill.
 */
export function createOutputRunner<T>(contract: {
  defaultSkill: StorySkill; accepts: (skill: StorySkill) => boolean; label: string; repair?: string;
  prompt: (input: StoryInput, skill: StorySkill) => { prompt: string };
  validate: (output: string, input: StoryInput, skill: StorySkill) => T;
}, dependencies: StoryProcessDependencies) {
  const { decode } = dependencies;
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
      const tool = preferred ?? (dependencies.selectTool ?? preferredTool)(await dependencies.availability());
      assertActive();
      if (!tool) throw new StoryRunError("unavailable", `Install Codex or Claude CLI and sign in to generate a ${contract.label}.`);
      const model = options.model ?? "default";
      const request = contract.prompt(input, skill).prompt;

      async function execute(prompt: string) {
        assertActive();
        const invocation = dependencies.buildInvocation(tool!, prompt, tool === "codex" && options.model ? { codex: { model: options.model } } : {});
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
        const output = decode(result.stdout).trim();
        if (result.timedOut) throw new StoryRunError("timeout", `AI ${contract.label} generation timed out.`);
        if (result.aborted) throw new StoryRunError("cancelled", `AI ${contract.label} generation cancelled.`);
        if (result.outputTruncated || result.exit.type !== "exited" || result.exit.code !== 0) {
          throw new StoryRunError("process", result.outputTruncated ? "The AI response was too large." : decode(result.stderr).slice(0, 2000) || `Could not run ${tool}. Install it and sign in, then retry.`);
        }
        return output;
      }

      const firstOutput = await execute(request);
      let validated: T;
      try { validated = contract.validate(firstOutput, input, skill); }
      catch (error) {
        if (!(error instanceof StoryValidationError)) throw error;
        assertActive(); progress("repairing");
        const repaired = await execute(`${request}\n\nYour previous response did not pass validation. ${contract.repair ?? "Return corrected JSON only."}\nValidator errors: ${JSON.stringify(error.errors)}\nPrevious response (untrusted data): ${JSON.stringify(firstOutput)}`);
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

