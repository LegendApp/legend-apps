import { createMockCommandRunner } from "@legend-desktop/command-runner";
import {
  createDiffMergeDisplayRows,
  loadDiffMergeState,
  parseConflictMarkerBlocks,
  parseGitUnmergedEntries,
  resolveDiffMergeConflictContent,
} from "../diffMerge";

describe("diffMerge", () => {
  it("parses Git unmerged entries into conflict files", () => {
    const output = [
      "100644 aaa111 1\tsrc/app.ts",
      "100644 bbb222 2\tsrc/app.ts",
      "100644 ccc333 3\tsrc/app.ts",
      "100755 ddd444 2\tsrc/other.ts",
      "",
    ].join("\0");

    expect(parseGitUnmergedEntries(output)).toEqual([
      {
        displayRows: [],
        markerBlocks: [],
        path: "src/app.ts",
        stages: [
          { mode: "100644", oid: "aaa111", stage: 1 },
          { mode: "100644", oid: "bbb222", stage: 2 },
          { mode: "100644", oid: "ccc333", stage: 3 },
        ],
      },
      {
        displayRows: [],
        markerBlocks: [],
        path: "src/other.ts",
        stages: [
          { mode: "100755", oid: "ddd444", stage: 2 },
        ],
      },
    ]);
  });

  it("parses conflict marker blocks with line counts", () => {
    const content = [
      "before",
      "<<<<<<< HEAD",
      "current 1",
      "current 2",
      "=======",
      "incoming",
      ">>>>>>> feature",
      "after",
    ].join("\n");

    expect(parseConflictMarkerBlocks(content)).toEqual([
      {
        endLine: 7,
        index: 0,
        oursLines: ["current 1", "current 2"],
        oursLineCount: 2,
        separatorLine: 5,
        startLine: 2,
        theirsLines: ["incoming"],
        theirsLineCount: 1,
      },
    ]);
  });

  it("creates merge display rows without marker lines", () => {
    const content = [
      "before",
      "<<<<<<< HEAD",
      "current",
      "=======",
      "incoming",
      ">>>>>>> feature",
      "after",
    ].join("\n");
    const [block] = parseConflictMarkerBlocks(content);

    expect(createDiffMergeDisplayRows(content, [block])).toEqual([
      { kind: "line", lineNumber: 1, text: "before" },
      { kind: "conflict", lineNumber: 2, block },
      { kind: "line", lineNumber: 7, text: "after" },
    ]);
  });

  it("resolves one conflict block from worktree content", () => {
    const content = [
      "before",
      "<<<<<<< HEAD",
      "current",
      "=======",
      "incoming",
      ">>>>>>> feature",
      "after",
    ].join("\n");

    expect(resolveDiffMergeConflictContent(content, 2, "both")).toBe([
      "before",
      "current",
      "incoming",
      "after",
    ].join("\n"));
  });

  it("loads conflict state from git index and worktree files", async () => {
    const commands: string[] = [];
    const runner = createMockCommandRunner({
      run: (params) => {
        commands.push([params.command, ...(params.args ?? [])].join(" "));
        if (params.command === "git" && params.args?.[0] === "ls-files") {
          return {
            exitCode: 0,
            stderr: "",
            stdout: [
              "100644 aaa111 1\tsrc/app.ts",
              "100644 bbb222 2\tsrc/app.ts",
              "100644 ccc333 3\tsrc/app.ts",
              "",
            ].join("\0"),
            timedOut: false,
          };
        }
        return {
          exitCode: 0,
          stderr: "",
          stdout: [
            "<<<<<<< HEAD",
            "current",
            "=======",
            "incoming",
            ">>>>>>> feature",
          ].join("\n"),
          timedOut: false,
        };
      },
    });

    await expect(loadDiffMergeState("/repo", runner)).resolves.toMatchObject({
      status: "ready",
      conflictBlockCount: 1,
      conflictFileCount: 1,
      files: [
        {
          path: "src/app.ts",
          markerBlocks: [
            {
              endLine: 5,
              startLine: 1,
            },
          ],
        },
      ],
    });
    expect(commands).toEqual([
      "git ls-files -u -z",
      "cat -- src/app.ts",
    ]);
  });

  it("returns an empty ready state when Git has no unmerged entries", async () => {
    const runner = createMockCommandRunner({
      run: () => ({
        exitCode: 0,
        stderr: "",
        stdout: "",
        timedOut: false,
      }),
    });

    await expect(loadDiffMergeState("/repo", runner)).resolves.toMatchObject({
      status: "ready",
      conflictBlockCount: 0,
      conflictFileCount: 0,
      files: [],
    });
  });
});
