import { runCommand } from "@legendapp/spark/processes";
import type { GitStagedDiff } from "@legend-apps/git-core";
import { buildCommitPrompt, createCommitMessageGenerator, parseCommitMessage, runCommitMessageAI, wrapBody, type CommitMessageGeneration } from "../commitMessageAI";
import type { CommitDraft } from "../commitMessage";

jest.mock("@legendapp/spark/ai", () => ({
  ...jest.requireActual("@legendapp/spark/ai"),
  getAICommandAvailability: jest.fn(async () => { throw new Error("The generator tests inject availability."); }),
}));

const staged: GitStagedDiff = {
  files: [
    { path: "src/app.ts", originalPath: null, binary: false, added: 3, deleted: 1 },
    { path: "new name.ts", originalPath: "old name.ts", binary: false, added: 0, deleted: 0 },
    { path: "logo.png", originalPath: null, binary: true, added: 0, deleted: 0 },
    { path: "big.txt", originalPath: null, binary: false, added: 9000, deleted: 0 },
  ],
  patch: "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1,3 @@\n-old\n+new\n",
  truncated: true,
  omitted: ["big.txt"],
};
const bytes = (text: string) => new TextEncoder().encode(text);
const result = (stdout: string, code = 0, extra: object = {}) => ({ exit: { type: "exited", code }, stdout: bytes(stdout), stderr: bytes(code ? "error: not signed in\n" : ""), timedOut: false, aborted: false, outputTruncated: false, ...extra });

it("builds a prompt with every staged file, binary files by name, the truncation note and the diff as data", () => {
  const prompt = buildCommitPrompt(staged);
  expect(prompt).toContain("- src/app.ts (+3 −1)");
  expect(prompt).toContain("- old name.ts → new name.ts (+0 −0)");
  expect(prompt).toContain("- logo.png (binary, contents not shown)");
  expect(prompt).toContain("their changes are not shown: big.txt.");
  expect(prompt).toContain("<staged-diff>\ndiff --git a/src/app.ts b/src/app.ts\n@@ -1 +1,3 @@\n-old\n+new\n</staged-diff>");
  expect(prompt).toContain("at most 72 characters");
  expect(buildCommitPrompt({ ...staged, truncated: false, omitted: [] })).not.toContain("truncated");
  const many = buildCommitPrompt({ ...staged, files: Array.from({ length: 205 }, (_, i) => ({ path: `f${i}.ts`, originalPath: null, binary: false, added: 1, deleted: 0 })) });
  expect(many).toContain("- f199.ts");
  expect(many).not.toContain("- f200.ts");
  expect(many).toContain("- …and 5 more files");
});

it("parses fenced or bare JSON into a Conventional Commit subject and a wrapped body", () => {
  expect(parseCommitMessage("Here you go:\n```json\n{\"subject\": \"feat(git): add AI messages\", \"body\": \"\"}\n```")).toEqual({ subject: "feat(git): add AI messages", body: "" });
  const long = "Reads the staged diff through git-core and asks the user's own CLI for a message, so no API keys are needed.";
  const parsed = parseCommitMessage(JSON.stringify({ subject: " fix!: keep amend intact ", body: `${long}\n\n- ${long}\n    indented code line that is deliberately longer than seventy-two columns, kept` }));
  expect(parsed.subject).toBe("fix!: keep amend intact");
  expect(parsed.body.split("\n").every(line => line.length <= 72 || line.startsWith("    "))).toBe(true);
  expect(parsed.body).toContain("\n\n- Reads the staged diff");
  expect(parsed.body).toMatch(/\n  \S/);
  expect(parseCommitMessage("{\"subject\": \"docs: x\"}")).toEqual({ subject: "docs: x", body: "" });
  expect(parseCommitMessage("{\"subject\": \"docs: document fences\", \"body\": \"Wrap samples in ```ts fences``` in the guide.\"}")).toEqual({ subject: "docs: document fences", body: "Wrap samples in ```ts fences``` in the guide." });
});

it("rejects malformed output with a readable error", () => {
  expect(() => parseCommitMessage("I could not do that.")).toThrow("did not return a commit message in the expected format.\n\nI could not do that.");
  expect(() => parseCommitMessage("{\"body\": \"x\"}")).toThrow("expected format");
  expect(() => parseCommitMessage("{\"subject\": \"feat: x\", \"body\": 3}")).toThrow("expected format");
  expect(() => parseCommitMessage("[\"feat: x\"]")).toThrow("expected format");
  expect(() => parseCommitMessage("{\"subject\": \"feat: a\\nb\"}")).toThrow("multi-line subject");
  expect(() => parseCommitMessage(JSON.stringify({ subject: `feat: ${"x".repeat(70)}` }))).toThrow("76-character subject; the limit is 72");
  expect(() => parseCommitMessage("{\"subject\": \"Add AI messages\"}")).toThrow("not in Conventional Commit style: “Add AI messages”");
});

it("wraps only long prose and bullet lines", () => {
  expect(wrapBody("short\r\nline")).toBe("short\nline");
  expect(wrapBody(`1. ${"word ".repeat(20)}`).split("\n")).toEqual([`1. ${"word ".repeat(14).trim()}`, `   ${"word ".repeat(6).trim()}`]);
});

it("runs Claude and Codex as Diff's Customize does, with the prompt on stdin, and surfaces stderr on failure", async () => {
  const run = jest.mocked(runCommand);
  const signal = new AbortController().signal;
  run.mockResolvedValueOnce(result("{\"subject\":\"feat: x\"}") as never);
  await expect(runCommitMessageAI("PROMPT $(rm -rf /)", "claude", "/repo", signal)).resolves.toBe("{\"subject\":\"feat: x\"}");
  expect(run).toHaveBeenLastCalledWith({ target: { type: "command", name: "claude" }, args: ["-p", "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"], input: "PROMPT $(rm -rf /)", cwd: "/repo", signal, timeoutMs: 180_000 });
  run.mockResolvedValueOnce(result("ok") as never);
  await runCommitMessageAI("PROMPT", "codex", "/repo", signal);
  expect(run.mock.calls.at(-1)![0]).toMatchObject({ target: { name: "codex" }, args: ["exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--config", "model_reasoning_effort=low", "--sandbox", "read-only", "-"], input: "PROMPT" });
  run.mockResolvedValueOnce(result("", 1) as never);
  await expect(runCommitMessageAI("PROMPT", "claude", "/repo", signal)).rejects.toThrow("error: not signed in");
  run.mockResolvedValueOnce(result("", 0, { aborted: true }) as never);
  await expect(runCommitMessageAI("PROMPT", "claude", "/repo", signal)).rejects.toThrow("Cancelled.");
  run.mockResolvedValueOnce(result("", 0, { timedOut: true }) as never);
  await expect(runCommitMessageAI("PROMPT", "claude", "/repo", signal)).rejects.toThrow("timed out");
});

describe("generator", () => {
  function setup(options: { availability?: { claude: boolean; codex: boolean }; confirm?: boolean } = {}) {
    let draft: CommitDraft = { subject: "", body: "" };
    const states: CommitMessageGeneration[] = [];
    const runs: { signal: AbortSignal; resolve: (output: string) => void; reject: (error: Error) => void; cwd: string; tool: string }[] = [];
    const confirmReplace = jest.fn(async () => options.confirm ?? false);
    const readStaged = jest.fn(async (_signal: AbortSignal) => ({ root: "/repo", staged }));
    const generator = createCommitMessageGenerator(state => states.push(state), {
      readStaged, confirmReplace,
      getDraft: () => draft,
      setDraft: next => { draft = next; },
      availability: async () => options.availability ?? { claude: true, codex: true },
      run: (_prompt, tool, cwd, signal) => new Promise((resolve, reject) => runs.push({ signal, resolve, reject, cwd, tool })),
    });
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    return { generator, states, runs, confirmReplace, readStaged, flush, draft: () => draft, type: (next: CommitDraft) => { draft = next; } };
  }

  it("fills empty fields, then silently replaces its own unchanged result, and asks before replacing edited text", async () => {
    const t = setup();
    t.generator.toggle(); await t.flush();
    expect(t.states.at(-1)).toEqual({ generating: true, error: null });
    expect(t.runs[0]).toMatchObject({ cwd: "/repo", tool: "claude" });
    t.runs[0]!.resolve("{\"subject\": \"feat: first\", \"body\": \"Body\"}"); await t.flush();
    expect(t.draft()).toEqual({ subject: "feat: first", body: "Body" });
    expect(t.states.at(-1)).toEqual({ generating: false, error: null });
    t.generator.toggle(); await t.flush();
    t.runs[1]!.resolve("{\"subject\": \"feat: second\"}"); await t.flush();
    expect(t.confirmReplace).not.toHaveBeenCalled();
    expect(t.draft()).toEqual({ subject: "feat: second", body: "" });
    t.type({ subject: "feat: mine", body: "" });
    t.generator.toggle(); await t.flush();
    t.runs[2]!.resolve("{\"subject\": \"feat: third\"}"); await t.flush();
    expect(t.confirmReplace).toHaveBeenCalledTimes(1);
    expect(t.draft()).toEqual({ subject: "feat: mine", body: "" });
  });

  it("replaces the user's text when they confirm, and treats whitespace-only fields as empty", async () => {
    const t = setup({ confirm: true });
    t.type({ subject: "  ", body: "\n" });
    t.generator.toggle(); await t.flush();
    t.runs[0]!.resolve("{\"subject\": \"fix: a\"}"); await t.flush();
    expect(t.confirmReplace).not.toHaveBeenCalled();
    t.type({ subject: "fix: a", body: "edited" });
    t.generator.toggle(); await t.flush();
    t.runs[1]!.resolve("{\"subject\": \"fix: b\"}"); await t.flush();
    expect(t.confirmReplace).toHaveBeenCalledTimes(1);
    expect(t.draft()).toEqual({ subject: "fix: b", body: "" });
  });

  it("cancels on a second press and on reset, aborting the CLI and leaving the fields alone", async () => {
    const t = setup();
    t.generator.toggle(); await t.flush();
    t.generator.toggle();
    expect(t.runs[0]!.signal.aborted).toBe(true);
    expect(t.states.at(-1)).toEqual({ generating: false, error: null });
    t.runs[0]!.reject(new Error("Cancelled.")); await t.flush();
    expect(t.states.at(-1)).toEqual({ generating: false, error: null });
    t.generator.toggle(); await t.flush();
    t.generator.reset();
    expect(t.runs[1]!.signal.aborted).toBe(true);
    t.runs[1]!.resolve("{\"subject\": \"feat: late\"}"); await t.flush();
    expect(t.draft()).toEqual({ subject: "", body: "" });
    expect(t.readStaged.mock.calls[0]![0].aborted).toBe(true);
  });

  it("forgets its last result on reset, so a later result asks before replacing it", async () => {
    const t = setup();
    t.generator.toggle(); await t.flush();
    t.runs[0]!.resolve("{\"subject\": \"feat: first\"}"); await t.flush();
    t.generator.reset();
    t.generator.toggle(); await t.flush();
    t.runs[1]!.resolve("{\"subject\": \"feat: second\"}"); await t.flush();
    expect(t.confirmReplace).toHaveBeenCalledTimes(1);
    expect(t.draft()).toEqual({ subject: "feat: first", body: "" });
  });

  it("reports a missing CLI, CLI errors and malformed output", async () => {
    const none = setup({ availability: { claude: false, codex: false } });
    none.generator.toggle(); await none.flush();
    expect(none.states.at(-1)).toEqual({ generating: false, error: expect.stringContaining("Install the Claude or Codex command-line tool") });
    expect(none.readStaged).not.toHaveBeenCalled();
    const codex = setup({ availability: { claude: false, codex: true } });
    codex.generator.toggle(); await codex.flush();
    expect(codex.runs[0]!.tool).toBe("codex");
    codex.runs[0]!.reject(new Error("error: not signed in")); await codex.flush();
    expect(codex.states.at(-1)).toEqual({ generating: false, error: "error: not signed in" });
    codex.generator.toggle(); await codex.flush();
    codex.runs[1]!.resolve("Sorry."); await codex.flush();
    expect(codex.states.at(-1)!.error).toContain("expected format");
    expect(codex.draft()).toEqual({ subject: "", body: "" });
    // Switching repositories or committing clears a stale error.
    codex.generator.reset();
    expect(codex.states.at(-1)).toEqual({ generating: false, error: null });
  });
});
