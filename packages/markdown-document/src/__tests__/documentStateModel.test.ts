import {
  applyMarkdownTransactionResultToBlockState,
  assertMarkdownDocumentBlockStateInvariants,
  createMarkdownDocumentBlockState,
  mergeHydratedMarkdownBlocks,
  mergeHydratedMarkdownBlocksForRevision,
  validateMarkdownTransactionResultToBlockState,
} from "../documentStateModel";
import type { MarkdownBlockSnapshot, MarkdownTransactionResult } from "../types";

function block(id: string, index: number, markdown = `Block ${index}`): MarkdownBlockSnapshot {
  return {
    contentEndByte: markdown.length,
    contentStartByte: 0,
    depth: 0,
    headingLevel: 0,
    id,
    index,
    markdown,
    sourceEndByte: markdown.length,
    sourceStartByte: 0,
    textRevision: 0,
    type: "paragraph",
  };
}

function transactionResult({
  blockIds,
  changedBlocks,
  deleteCount,
  retiredBlockIds = [],
  startBlockIndex,
}: {
  blockIds: string[];
  changedBlocks: MarkdownBlockSnapshot[];
  deleteCount: number;
  retiredBlockIds?: string[];
  startBlockIndex: number;
}): MarkdownTransactionResult {
  return {
    changedBlocks,
    changedRange: {
      blockIds,
      deleteCount,
      startBlockIndex,
    },
    retiredBlockIds,
    revision: 1,
    sourceLength: 100,
  };
}

describe("documentStateModel", () => {
  it("creates a block state from initial blocks", () => {
    const state = createMarkdownDocumentBlockState([
      block("d1:b0", 0),
      block("d1:b1", 1),
    ]);

    expect(state.blockIds).toEqual(["d1:b0", "d1:b1"]);
    expect(state.blocksById.get("d1:b1")?.markdown).toBe("Block 1");
    expect(() => assertMarkdownDocumentBlockStateInvariants(state)).not.toThrow();
  });

  it("applies transaction changed ranges and removes retired ids", () => {
    const state = createMarkdownDocumentBlockState([
      block("d1:b0", 0),
      block("d1:b1", 1),
      block("d1:b2", 2),
      block("d1:b3", 3),
    ]);

    const nextState = applyMarkdownTransactionResultToBlockState(
      state,
      transactionResult({
        blockIds: ["d1:b1", "d1:b4"],
        changedBlocks: [
          block("d1:b1", 1, "Edited"),
          block("d1:b4", 2, "Inserted"),
        ],
        deleteCount: 2,
        retiredBlockIds: ["d1:b2"],
        startBlockIndex: 1,
      }),
    );

    expect(nextState.blockIds).toEqual(["d1:b0", "d1:b1", "d1:b4", "d1:b3"]);
    expect(nextState.blocksById.has("d1:b2")).toBe(false);
    expect(nextState.blocksById.get("d1:b1")?.markdown).toBe("Edited");
    expect(nextState.blocksById.get("d1:b4")?.markdown).toBe("Inserted");
    expect(() => assertMarkdownDocumentBlockStateInvariants(nextState, {
      retiredBlockIds: ["d1:b2"],
    })).not.toThrow();
  });

  it("appends hydrated blocks without duplicating existing ids", () => {
    const state = createMarkdownDocumentBlockState([
      block("d1:b0", 0),
      block("d1:b1", 1, "Old markdown"),
    ]);

    const nextState = mergeHydratedMarkdownBlocks(state, [
      block("d1:b1", 1, "Fresh markdown"),
      block("d1:b2", 2),
    ]);

    expect(nextState.blockIds).toEqual(["d1:b0", "d1:b1", "d1:b2"]);
    expect(nextState.blocksById.get("d1:b1")?.markdown).toBe("Fresh markdown");
    expect(() => assertMarkdownDocumentBlockStateInvariants(nextState)).not.toThrow();
  });

  it("ignores hydration results from an older revision", () => {
    const state = createMarkdownDocumentBlockState([
      block("d1:b0", 0),
      block("d1:b1", 1),
    ]);
    const editedState = applyMarkdownTransactionResultToBlockState(
      state,
      transactionResult({
        blockIds: ["d1:b0", "d1:b3"],
        changedBlocks: [
          block("d1:b0", 0, "Edited"),
          block("d1:b3", 1, "Inserted"),
        ],
        deleteCount: 1,
        retiredBlockIds: [],
        startBlockIndex: 0,
      }),
    );

    const staleHydratedState = mergeHydratedMarkdownBlocksForRevision({
      blocks: [
        block("d1:b1", 1, "Stale"),
        block("d1:b2", 2, "Stale shifted block"),
      ],
      currentRevision: 1,
      previousState: editedState,
      requestRevision: 0,
    });

    expect(staleHydratedState).toBe(editedState);
    expect(staleHydratedState.blockIds).toEqual(["d1:b0", "d1:b3", "d1:b1"]);
    expect(staleHydratedState.blocksById.has("d1:b2")).toBe(false);
  });

  it("throws when stale retired ids remain live", () => {
    const state = createMarkdownDocumentBlockState([
      block("d1:b0", 0),
      block("d1:b1", 1),
    ]);

    expect(() => assertMarkdownDocumentBlockStateInvariants(state, {
      activeBlockId: "d1:b0",
      retiredBlockIds: ["d1:b1"],
    })).toThrow("Retired markdown block id remains in document state: d1:b1");
  });

  it.each([
    [
      "out-of-bounds changed range",
      transactionResult({
        blockIds: ["d1:b2"],
        changedBlocks: [block("d1:b2", 2, "Inserted")],
        deleteCount: 1,
        startBlockIndex: 3,
      }),
      "out of bounds",
    ],
    [
      "missing changed block snapshot",
      transactionResult({
        blockIds: ["d1:b0"],
        changedBlocks: [],
        deleteCount: 1,
        startBlockIndex: 0,
      }),
      "do not match",
    ],
    [
      "duplicate changed range id",
      transactionResult({
        blockIds: ["d1:b0", "d1:b0"],
        changedBlocks: [
          block("d1:b0", 0, "Edited"),
          block("d1:b0", 1, "Duplicate"),
        ],
        deleteCount: 1,
        startBlockIndex: 0,
      }),
      "duplicate",
    ],
    [
      "empty changed block id",
      transactionResult({
        blockIds: [""],
        changedBlocks: [block("", 0, "Edited")],
        deleteCount: 1,
        startBlockIndex: 0,
      }),
      "empty id",
    ],
    [
      "empty changed block type",
      transactionResult({
        blockIds: ["d1:b0"],
        changedBlocks: [{ ...block("d1:b0", 0, "Edited"), type: "" }],
        deleteCount: 1,
        startBlockIndex: 0,
      }),
      "empty type",
    ],
    [
      "retired id reused in changed range",
      transactionResult({
        blockIds: ["d1:b0"],
        changedBlocks: [block("d1:b0", 0, "Edited")],
        deleteCount: 1,
        retiredBlockIds: ["d1:b0"],
        startBlockIndex: 0,
      }),
      "retired",
    ],
  ])("rejects malformed transaction result for %s", (_label, result, expectedMessage) => {
    const state = createMarkdownDocumentBlockState([
      block("d1:b0", 0),
      block("d1:b1", 1),
    ]);

    expect(() => validateMarkdownTransactionResultToBlockState(state, result)).toThrow(expectedMessage);
  });
});
