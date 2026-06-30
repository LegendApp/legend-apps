import {
  applyMarkdownTransactionResultToBlockState,
  assertMarkdownDocumentBlockStateInvariants,
  createMarkdownDocumentBlockState,
  createMarkdownDocumentBlockStateFromIds,
  mergeHydratedMarkdownBlockIds,
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
    expect(() => assertMarkdownDocumentBlockStateInvariants(nextState, {
      retiredBlockIds: ["d1:b2"],
    })).not.toThrow();
  });

  it("applies move transaction changed ranges without retiring moved ids", () => {
    const state = createMarkdownDocumentBlockState([
      block("d1:b0", 0),
      block("d1:b1", 1),
      block("d1:b2", 2),
      block("d1:b3", 3),
      block("d1:b4", 4),
    ]);

    const nextState = applyMarkdownTransactionResultToBlockState(
      state,
      transactionResult({
        blockIds: ["d1:b0", "d1:b3", "d1:b1", "d1:b2", "d1:b4"],
        changedBlocks: [
          block("d1:b0", 0),
          block("d1:b3", 1),
          block("d1:b1", 2),
          block("d1:b2", 3),
          block("d1:b4", 4),
        ],
        deleteCount: 5,
        startBlockIndex: 0,
      }),
    );

    expect(nextState.blockIds).toEqual(["d1:b0", "d1:b3", "d1:b1", "d1:b2", "d1:b4"]);
    expect(() => assertMarkdownDocumentBlockStateInvariants(nextState)).not.toThrow();
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
    expect(() => assertMarkdownDocumentBlockStateInvariants(nextState)).not.toThrow();
  });

  it("appends hydrated ids without requiring cached block snapshots", () => {
    const state = createMarkdownDocumentBlockStateFromIds(["d1:b0"]);

    const nextState = mergeHydratedMarkdownBlockIds(state, ["d1:b1", "d1:b2"]);

    expect(nextState.blockIds).toEqual(["d1:b0", "d1:b1", "d1:b2"]);
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
    [
      "changed block order mismatch",
      transactionResult({
        blockIds: ["d1:b0", "d1:b2"],
        changedBlocks: [
          block("d1:b2", 1, "Inserted"),
          block("d1:b0", 0, "Edited"),
        ],
        deleteCount: 1,
        startBlockIndex: 0,
      }),
      "order",
    ],
    [
      "changed block index mismatch",
      transactionResult({
        blockIds: ["d1:b0"],
        changedBlocks: [block("d1:b0", 5, "Edited")],
        deleteCount: 1,
        startBlockIndex: 0,
      }),
      "index",
    ],
    [
      "changed block source range exceeds source length",
      {
        ...transactionResult({
          blockIds: ["d1:b0"],
          changedBlocks: [block("d1:b0", 0, "Edited")],
          deleteCount: 1,
          startBlockIndex: 0,
        }),
        changedBlocks: [{ ...block("d1:b0", 0, "Edited"), sourceEndByte: 1000 }],
      },
      "source range",
    ],
    [
      "changed block content range exceeds source length",
      {
        ...transactionResult({
          blockIds: ["d1:b0"],
          changedBlocks: [block("d1:b0", 0, "Edited")],
          deleteCount: 1,
          startBlockIndex: 0,
        }),
        changedBlocks: [{ ...block("d1:b0", 0, "Edited"), contentEndByte: 1000 }],
      },
      "content range",
    ],
  ])("rejects malformed transaction result for %s", (_label, result, expectedMessage) => {
    const state = createMarkdownDocumentBlockState([
      block("d1:b0", 0),
      block("d1:b1", 1),
    ]);

    expect(() => validateMarkdownTransactionResultToBlockState(state, result)).toThrow(expectedMessage);
  });
});
