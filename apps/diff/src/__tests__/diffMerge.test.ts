import { createMockCommandRunner } from "@legend-desktop/command-runner";
import {
  createDiffMergeDisplayRows,
  createDiffMergeHunkDisplayModel,
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
        conflictRanges: [],
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
        conflictRanges: [],
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
      { kind: "line", leftLineNumber: 1, leftText: "before", lineNumber: 1, rightLineNumber: 1, rightText: "before" },
      { conflictBlock: block, conflictLineIndex: 0, kind: "line", leftLineNumber: 2, leftText: "current", lineNumber: 2, rightLineNumber: 2, rightText: "incoming" },
      { kind: "line", leftLineNumber: 7, leftText: "after", lineNumber: 7, rightLineNumber: 7, rightText: "after" },
    ]);
  });

  it("creates merge hunk rows with context and hunk headers", () => {
    const content = [
      "line 1",
      "line 2",
      "<<<<<<< HEAD",
      "current",
      "=======",
      "incoming",
      ">>>>>>> feature",
      "line 8",
      "line 9",
    ].join("\n");
    const [block] = parseConflictMarkerBlocks(content);
    const fullRows = createDiffMergeDisplayRows(content, [block]);
    const hunkModel = createDiffMergeHunkDisplayModel(
      fullRows,
      [{ block, startRow: 2, endRow: 2 }],
      1,
    );

    expect(hunkModel.rows).toEqual([
      {
        hunkHeader: { hunkNumber: 1, lineLabel: "Lines 2-8" },
        hunkIndex: 0,
        kind: "line",
        leftLineNumber: 2,
        leftText: "line 2",
        lineNumber: 2,
        rightLineNumber: 2,
        rightText: "line 2",
      },
      {
        conflictBlock: block,
        conflictLineIndex: 0,
        hunkIndex: 0,
        kind: "line",
        leftLineNumber: 3,
        leftText: "current",
        lineNumber: 3,
        rightLineNumber: 3,
        rightText: "incoming",
      },
      {
        hunkIndex: 0,
        kind: "line",
        leftLineNumber: 8,
        leftText: "line 8",
        lineNumber: 8,
        rightLineNumber: 8,
        rightText: "line 8",
      },
    ]);
    expect(hunkModel.conflictRanges).toEqual([
      { block, startRow: 1, endRow: 1 },
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
