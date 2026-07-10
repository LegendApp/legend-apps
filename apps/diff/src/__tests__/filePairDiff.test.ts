import type { CommandRunnerResult } from "@legend-apps/command-runner";
import { createDiffFilePairSource } from "../diffFiles";
import {
  createFilePairDiffCommand,
  createFilePairUnifiedDiff,
  getFilePairDiffDisplayPath,
} from "../filePairDiff";

function commandResult(result: Partial<CommandRunnerResult>): CommandRunnerResult {
  return {
    exitCode: 0,
    stderr: "",
    stdout: "",
    timedOut: false,
    ...result,
  };
}

describe("filePairDiff", () => {
  it("creates a macOS diff command with explicit labels", () => {
    const source = createDiffFilePairSource("/tmp/old/App.tsx", "/tmp/new/App.tsx");
    expect(createFilePairDiffCommand(source)).toEqual({
      args: [
        "-u",
        "-L",
        "a/App.tsx",
        "-L",
        "b/App.tsx",
        "/tmp/old/App.tsx",
        "/tmp/new/App.tsx",
      ],
      command: "/usr/bin/diff",
      timeoutMs: 60_000,
    });
  });

  it("adds the native ignore-all-whitespace option when requested", () => {
    const source = createDiffFilePairSource("/tmp/old/App.tsx", "/tmp/new/App.tsx");
    expect(createFilePairDiffCommand(source, true).args.slice(0, 2)).toEqual(["-u", "-w"]);
  });

  it("sanitizes display paths used in diff headers", () => {
    expect(getFilePairDiffDisplayPath("/tmp/old/App\tName.tsx", "a")).toBe("a/App Name.tsx");
    expect(getFilePairDiffDisplayPath("/tmp/old/\n", "b")).toBe("b/file");
  });

  it("returns an empty unified diff when files match", () => {
    const source = createDiffFilePairSource("/tmp/old.ts", "/tmp/new.ts");
    expect(createFilePairUnifiedDiff(source, commandResult({ exitCode: 0 }))).toBe("");
  });

  it("prefixes changed output with a synthetic git header", () => {
    const source = createDiffFilePairSource("/tmp/old.ts", "/tmp/new.ts");
    const stdout = "--- a/old.ts\n+++ b/new.ts\n@@ -1 +1 @@\n-old\n+new\n";
    expect(createFilePairUnifiedDiff(source, commandResult({ exitCode: 1, stdout }))).toBe(
      "diff --git a/old.ts b/new.ts\n--- a/old.ts\n+++ b/new.ts\n@@ -1 +1 @@\n-old\n+new\n",
    );
  });

  it("keeps binary diff output under the synthetic file header", () => {
    const source = createDiffFilePairSource("/tmp/old.bin", "/tmp/new.bin");
    expect(createFilePairUnifiedDiff(source, commandResult({
      exitCode: 1,
      stdout: "Binary files a/old.bin and b/new.bin differ\n",
    }))).toBe("diff --git a/old.bin b/new.bin\nBinary files a/old.bin and b/new.bin differ\n");
  });

  it("fails command errors and timeouts", () => {
    const source = createDiffFilePairSource("/tmp/old.ts", "/tmp/new.ts");
    expect(() => createFilePairUnifiedDiff(source, commandResult({
      exitCode: 2,
      stderr: "diff failed",
    }))).toThrow("diff failed");
    expect(() => createFilePairUnifiedDiff(source, commandResult({
      exitCode: 0,
      timedOut: true,
    }))).toThrow("File comparison timed out");
  });
});
