import { createMockCommandRunner } from "@legend-desktop/command-runner";
import {
  loadDiffMergeState,
  parseConflictMarkerBlocks,
  parseGitUnmergedEntries,
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
        markerBlocks: [],
        path: "src/app.ts",
        stages: [
          { mode: "100644", oid: "aaa111", stage: 1 },
          { mode: "100644", oid: "bbb222", stage: 2 },
          { mode: "100644", oid: "ccc333", stage: 3 },
        ],
      },
      {
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
        oursLineCount: 2,
        separatorLine: 5,
        startLine: 2,
        theirsLineCount: 1,
      },
    ]);
  });

  it("loads conflict state from git index and worktree files", async () => {
    const runner = createMockCommandRunner({
      run: (params) => {
        if (params.command === "git") {
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
