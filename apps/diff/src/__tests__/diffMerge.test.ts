import { createMockCommandRunner } from "@legend-desktop/command-runner";
import {
  createDiffMergeConflictFileFromContent,
  createDiffMergeDraftFileWithResolvedBlock,
  createDiffMergeDisplayRows,
  createDiffMergeHunkDisplayModel,
  diffMergeConflictLines,
  diffMergeInlineChangeRanges,
  loadDiffMergeState,
  parseConflictMarkerBlocks,
  parseGitUnmergedEntries,
  resolveDiffMergeConflictContent,
  writeDiffMergeFileContent,
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
      { conflictBlock: block, conflictLineIndex: 0, kind: "line", leftChangeType: "modify", leftInlineChangeRanges: [{ length: 7, startColumn: 0 }], leftLineNumber: 2, leftText: "current", lineNumber: 2, rightChangeType: "modify", rightInlineChangeRanges: [{ length: 8, startColumn: 0 }], rightLineNumber: 2, rightText: "incoming" },
      { kind: "line", leftLineNumber: 7, leftText: "after", lineNumber: 7, rightLineNumber: 7, rightText: "after" },
    ]);
  });

  it("diffs inline conflict ranges within modified lines", () => {
    expect(diffMergeInlineChangeRanges("value = oldName + count;", "value = newName + total;")).toEqual({
      leftRanges: [
        { length: 3, startColumn: 8 },
        { length: 5, startColumn: 18 },
      ],
      rightRanges: [
        { length: 3, startColumn: 8 },
        { length: 5, startColumn: 18 },
      ],
    });

    expect(diffMergeInlineChangeRanges("searchTerm", "searchText")).toEqual({
      leftRanges: [{ length: 2, startColumn: 8 }],
      rightRanges: [{ length: 2, startColumn: 8 }],
    });
  });

  it("does not highlight whitespace-only inline ranges in split and combined lines", () => {
    const rows = diffMergeConflictLines(
      [
        "      <VibrancyView",
        "        blendingMode=\"behindWindow\"",
        "        material=\"hudWindow\"",
        "        state=\"active\"",
        "        style={styles.overlaySurface}",
        "      >",
      ],
      [
        "      <VibrancyView blendingMode=\"behindWindow\" material=\"hudWindow\" state=\"active\" style={styles.overlaySurface}>",
      ],
    );

    for (const row of rows) {
      for (const range of row.leftInlineChangeRanges ?? []) {
        expect(row.leftText.slice(range.startColumn, range.startColumn + range.length).trim()).not.toBe("");
      }
      for (const range of row.rightInlineChangeRanges ?? []) {
        expect(row.rightText.slice(range.startColumn, range.startColumn + range.length).trim()).not.toBe("");
      }
    }
  });

  it("aligns conflict lines with side-specific change types", () => {
    expect(diffMergeConflictLines(
      ["same", "left only", "old value", "tail"],
      ["same", "new value", "right only", "tail"],
    )).toEqual([
      { leftChangeType: "none", leftIndex: 0, leftText: "same", rightChangeType: "none", rightIndex: 0, rightText: "same" },
      { leftChangeType: "modify", leftIndex: 1, leftInlineChangeRanges: [{ length: 4, startColumn: 0 }, { length: 4, startColumn: 5 }], leftText: "left only", rightChangeType: "modify", rightIndex: 1, rightInlineChangeRanges: [{ length: 3, startColumn: 0 }, { length: 5, startColumn: 4 }], rightText: "new value" },
      { leftChangeType: "modify", leftIndex: 2, leftInlineChangeRanges: [{ length: 3, startColumn: 0 }, { length: 5, startColumn: 4 }], leftText: "old value", rightChangeType: "modify", rightIndex: 2, rightInlineChangeRanges: [{ length: 5, startColumn: 0 }, { length: 4, startColumn: 6 }], rightText: "right only" },
      { leftChangeType: "none", leftIndex: 3, leftText: "tail", rightChangeType: "none", rightIndex: 3, rightText: "tail" },
    ]);
  });

  it("marks unpaired conflict lines as deletes and adds", () => {
    expect(diffMergeConflictLines(
      ["same", "left only", "tail"],
      ["same", "right only 1", "right only 2", "tail"],
    )).toEqual([
      { leftChangeType: "none", leftIndex: 0, leftText: "same", rightChangeType: "none", rightIndex: 0, rightText: "same" },
      { leftChangeType: "modify", leftIndex: 1, leftInlineChangeRanges: [{ length: 4, startColumn: 0 }], leftText: "left only", rightChangeType: "modify", rightIndex: 1, rightInlineChangeRanges: [{ length: 5, startColumn: 0 }, { length: 1, startColumn: 11 }], rightText: "right only 1" },
      { leftChangeType: "none", leftText: "", rightChangeType: "add", rightIndex: 2, rightText: "right only 2" },
      { leftChangeType: "none", leftIndex: 2, leftText: "tail", rightChangeType: "none", rightIndex: 3, rightText: "tail" },
    ]);
  });

  it("keeps inserted lines from shifting similar modified conflict rows", () => {
    const rows = diffMergeConflictLines(
      [
        "borderRadius: BORDER_RADIUS,",
        "shadowColor: \"#000000\",",
        "shadowOffset: { width: 1, height: 8 },",
        "shadowOpacity: 0.3,",
        "shadowRadius: 8,",
      ],
      [
        "borderRadius: 20,",
        "// backgroundColor: \"#050505\",",
        "// shadowColor: \"#000000\",",
        "// shadowOffset: { width: 0, height: 8 },",
        "// shadowOpacity: 0.3,",
        "// shadowRadius: 8,",
      ],
    );

    expect(rows.map((row) => ({
      leftChangeType: row.leftChangeType,
      leftText: row.leftText,
      rightChangeType: row.rightChangeType,
      rightText: row.rightText,
    }))).toEqual([
      { leftChangeType: "modify", leftText: "borderRadius: BORDER_RADIUS,", rightChangeType: "modify", rightText: "borderRadius: 20," },
      { leftChangeType: "none", leftText: "", rightChangeType: "add", rightText: "// backgroundColor: \"#050505\"," },
      { leftChangeType: "modify", leftText: "shadowColor: \"#000000\",", rightChangeType: "modify", rightText: "// shadowColor: \"#000000\"," },
      { leftChangeType: "modify", leftText: "shadowOffset: { width: 1, height: 8 },", rightChangeType: "modify", rightText: "// shadowOffset: { width: 0, height: 8 }," },
      { leftChangeType: "modify", leftText: "shadowOpacity: 0.3,", rightChangeType: "modify", rightText: "// shadowOpacity: 0.3," },
      { leftChangeType: "modify", leftText: "shadowRadius: 8,", rightChangeType: "modify", rightText: "// shadowRadius: 8," },
    ]);
  });

  it("emits neutral equal rows and modified rows in conflict display", () => {
    const content = [
      "<<<<<<< HEAD",
      "same",
      "left only",
      "tail",
      "=======",
      "same",
      "right only",
      "tail",
      ">>>>>>> feature",
    ].join("\n");
    const [block] = parseConflictMarkerBlocks(content);

    expect(createDiffMergeDisplayRows(content, [block])).toEqual([
      {
        conflictBlock: block,
        conflictLineIndex: 0,
        kind: "line",
        leftChangeType: "none",
        leftLineNumber: 1,
        leftText: "same",
        lineNumber: 1,
        rightChangeType: "none",
        rightLineNumber: 1,
        rightText: "same",
      },
      {
        conflictBlock: block,
        conflictLineIndex: 1,
        kind: "line",
        leftChangeType: "modify",
        leftInlineChangeRanges: [{ length: 4, startColumn: 0 }],
        leftLineNumber: 2,
        leftText: "left only",
        lineNumber: 2,
        rightChangeType: "modify",
        rightInlineChangeRanges: [{ length: 5, startColumn: 0 }],
        rightLineNumber: 2,
        rightText: "right only",
      },
      {
        conflictBlock: block,
        conflictLineIndex: 2,
        kind: "line",
        leftChangeType: "none",
        leftLineNumber: 3,
        leftText: "tail",
        lineNumber: 3,
        rightChangeType: "none",
        rightLineNumber: 3,
        rightText: "tail",
      },
    ]);
  });

  it("emits side-specific add and delete rows in conflict display", () => {
    const deleteContent = [
      "<<<<<<< HEAD",
      "same",
      "left only",
      "tail",
      "=======",
      "same",
      "tail",
      ">>>>>>> feature",
    ].join("\n");
    const [deleteBlock] = parseConflictMarkerBlocks(deleteContent);
    expect(createDiffMergeDisplayRows(deleteContent, [deleteBlock])).toEqual([
      {
        conflictBlock: deleteBlock,
        conflictLineIndex: 0,
        kind: "line",
        leftChangeType: "none",
        leftLineNumber: 1,
        leftText: "same",
        lineNumber: 1,
        rightChangeType: "none",
        rightLineNumber: 1,
        rightText: "same",
      },
      {
        conflictBlock: deleteBlock,
        conflictLineIndex: 1,
        kind: "line",
        leftChangeType: "delete",
        leftLineNumber: 2,
        leftText: "left only",
        lineNumber: 2,
        rightChangeType: "none",
        rightText: "",
      },
      {
        conflictBlock: deleteBlock,
        conflictLineIndex: 2,
        kind: "line",
        leftChangeType: "none",
        leftLineNumber: 3,
        leftText: "tail",
        lineNumber: 3,
        rightChangeType: "none",
        rightLineNumber: 2,
        rightText: "tail",
      },
    ]);

    const addContent = [
      "<<<<<<< HEAD",
      "same",
      "tail",
      "=======",
      "same",
      "right only",
      "tail",
      ">>>>>>> feature",
    ].join("\n");
    const [addBlock] = parseConflictMarkerBlocks(addContent);
    expect(createDiffMergeDisplayRows(addContent, [addBlock])).toEqual([
      {
        conflictBlock: addBlock,
        conflictLineIndex: 0,
        kind: "line",
        leftChangeType: "none",
        leftLineNumber: 1,
        leftText: "same",
        lineNumber: 1,
        rightChangeType: "none",
        rightLineNumber: 1,
        rightText: "same",
      },
      {
        conflictBlock: addBlock,
        conflictLineIndex: 1,
        kind: "line",
        leftChangeType: "none",
        leftText: "",
        lineNumber: 2,
        rightChangeType: "add",
        rightLineNumber: 2,
        rightText: "right only",
      },
      {
        conflictBlock: addBlock,
        conflictLineIndex: 2,
        kind: "line",
        leftChangeType: "none",
        leftLineNumber: 2,
        leftText: "tail",
        lineNumber: 2,
        rightChangeType: "none",
        rightLineNumber: 3,
        rightText: "tail",
      },
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
        leftChangeType: "modify",
        leftInlineChangeRanges: [{ length: 7, startColumn: 0 }],
        leftLineNumber: 3,
        leftText: "current",
        lineNumber: 3,
        rightChangeType: "modify",
        rightInlineChangeRanges: [{ length: 8, startColumn: 0 }],
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

  it("creates a merge conflict file from draft content", () => {
    const file = createDiffMergeConflictFileFromContent({
      content: [
        "before",
        "<<<<<<< HEAD",
        "current",
        "=======",
        "incoming",
        ">>>>>>> feature",
        "after",
      ].join("\n"),
      path: "src/app.ts",
      stages: [{ mode: "100644", oid: "aaa111", stage: 1 }],
    });

    expect(file).toMatchObject({
      path: "src/app.ts",
      markerBlocks: [
        {
          endLine: 6,
          startLine: 2,
        },
      ],
      conflictRanges: [
        {
          endRow: 1,
          startRow: 1,
        },
      ],
    });
    expect(file.displayRows.map((row) => [row.leftText, row.rightText])).toEqual([
      ["before", "before"],
      ["current", "incoming"],
      ["after", "after"],
    ]);
  });

  it("keeps resolved draft conflict rows visible without conflict ranges", () => {
    const content = [
      "before",
      "<<<<<<< HEAD",
      "current",
      "=======",
      "incoming",
      ">>>>>>> feature",
      "after",
    ].join("\n");
    const file = createDiffMergeConflictFileFromContent({
      content,
      path: "src/app.ts",
      stages: [{ mode: "100644", oid: "aaa111", stage: 1 }],
    });
    const block = file.markerBlocks[0]!;
    const resolvedContent = resolveDiffMergeConflictContent(content, block.startLine, "theirs");
    const draftFile = createDiffMergeDraftFileWithResolvedBlock({
      block,
      choice: "theirs",
      content: resolvedContent,
      file,
    });

    expect(draftFile.hasUnsavedDraft).toBe(true);
    expect(draftFile.markerBlocks).toEqual([]);
    expect(draftFile.conflictRanges).toEqual([]);
    expect(draftFile.displayRows.map((row) => ({
      conflictBlock: row.conflictBlock,
      leftChangeType: row.leftChangeType,
      leftText: row.leftText,
      resolvedConflictBlock: row.resolvedConflictBlock,
      rightChangeType: row.rightChangeType,
      rightText: row.rightText,
    }))).toEqual([
      {
        conflictBlock: undefined,
        leftChangeType: undefined,
        leftText: "before",
        resolvedConflictBlock: undefined,
        rightChangeType: undefined,
        rightText: "before",
      },
      {
        conflictBlock: undefined,
        leftChangeType: "modify",
        leftText: "current",
        resolvedConflictBlock: block,
        rightChangeType: "modify",
        rightText: "incoming",
      },
      {
        conflictBlock: undefined,
        leftChangeType: undefined,
        leftText: "after",
        resolvedConflictBlock: undefined,
        rightChangeType: undefined,
        rightText: "after",
      },
    ]);

    const hunkModel = createDiffMergeHunkDisplayModel(draftFile.displayRows, draftFile.conflictRanges, 0);
    expect(hunkModel.rows.map((row) => [row.leftText, row.rightText])).toEqual([
      ["current", "incoming"],
    ]);
    expect(hunkModel.conflictRanges).toEqual([]);
  });

  it("updates later conflict block positions after drafting an earlier resolution", () => {
    const content = [
      "before",
      "<<<<<<< HEAD",
      "current 1",
      "=======",
      "incoming 1",
      ">>>>>>> feature",
      "between",
      "<<<<<<< HEAD",
      "current 2",
      "=======",
      "incoming 2",
      ">>>>>>> feature",
      "after",
    ].join("\n");
    const file = createDiffMergeConflictFileFromContent({
      content,
      path: "src/app.ts",
      stages: [{ mode: "100644", oid: "aaa111", stage: 1 }],
    });
    const firstBlock = file.markerBlocks[0]!;
    const resolvedContent = resolveDiffMergeConflictContent(content, firstBlock.startLine, "ours");
    const draftFile = createDiffMergeDraftFileWithResolvedBlock({
      block: firstBlock,
      choice: "ours",
      content: resolvedContent,
      file,
    });

    expect(draftFile.markerBlocks).toHaveLength(1);
    expect(draftFile.markerBlocks[0]).toMatchObject({
      startLine: 4,
      separatorLine: 6,
      endLine: 8,
    });
    const unresolvedRow = draftFile.displayRows.find((row) => row.conflictBlock);
    expect(unresolvedRow?.conflictBlock).toBe(draftFile.markerBlocks[0]);
    expect(unresolvedRow?.leftLineNumber).toBe(4);
    expect(unresolvedRow?.rightLineNumber).toBe(4);
  });

  it("writes drafted merge content to a worktree file", async () => {
    const commands: Array<{ command: string; args: string[]; input?: string }> = [];
    const runner = createMockCommandRunner({
      run: (params) => {
        commands.push({
          args: params.args ?? [],
          command: params.command,
          input: params.input,
        });
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
          timedOut: false,
        };
      },
    });

    await writeDiffMergeFileContent({
      content: "resolved\n",
      folderPath: "/repo",
      path: "src/app.ts",
      runner,
    });

    expect(commands).toEqual([
      {
        args: ["-c", "cat > \"$1\"", "legend-diff-write", "src/app.ts"],
        command: "sh",
        input: "resolved\n",
      },
    ]);
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
