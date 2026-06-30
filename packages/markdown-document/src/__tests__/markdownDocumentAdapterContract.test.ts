import {
  applyMarkdownTransactionResultToBlockState,
  assertMarkdownDocumentBlockStateInvariants,
  createMarkdownDocumentBlockState,
  mergeHydratedMarkdownBlocksForRevision,
  type MarkdownDocumentBlockState,
} from "../documentStateModel";
import type {
  MarkdownBlockSnapshot,
  MarkdownDocumentAdapter,
  MarkdownDocumentSnapshot,
  MarkdownTransaction,
  MarkdownTransactionResult,
} from "../types";

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (error: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

type PendingHydrationRequest = {
  count: number;
  deferred: Deferred<MarkdownBlockSnapshot[]>;
  startIndex: number;
};

type PendingTransactionRequest = {
  deferred: Deferred<MarkdownTransactionResult>;
  transaction: MarkdownTransaction;
};

class FakeMarkdownAdapter implements MarkdownDocumentAdapter {
  pendingHydrationRequests: PendingHydrationRequest[] = [];
  pendingTransactionRequests: PendingTransactionRequest[] = [];
  saveCount = 0;

  constructor(private snapshot: MarkdownDocumentSnapshot) {}

  async load(_filename: string) {
    return this.snapshot;
  }

  async getBlock(_documentId: string, blockId: string) {
    const block = (this.snapshot.initialBlocks as MarkdownBlockSnapshot[]).find((candidate) => candidate.id === blockId);
    if (!block) {
      throw new Error(`Missing fake block: ${blockId}`);
    }
    return block;
  }

  getBlocks(_documentId: string, startIndex: number, count: number) {
    const deferred = new Deferred<MarkdownBlockSnapshot[]>();
    this.pendingHydrationRequests.push({ count, deferred, startIndex });
    return deferred.promise;
  }

  async save() {
    this.saveCount += 1;
  }

  async saveAs() {
    this.saveCount += 1;
  }

  async close() {}

  applyTransaction(_documentId: string, transaction: MarkdownTransaction) {
    const deferred = new Deferred<MarkdownTransactionResult>();
    this.pendingTransactionRequests.push({ deferred, transaction });
    return deferred.promise;
  }
}

class MarkdownAdapterHarness {
  private revision = 0;
  private state: MarkdownDocumentBlockState;

  constructor(
    private adapter: MarkdownDocumentAdapter,
    private snapshot: MarkdownDocumentSnapshot,
  ) {
    this.state = createMarkdownDocumentBlockState(snapshot.initialBlocks);
  }

  get blockIds() {
    return this.state.blockIds;
  }

  hydrate(startIndex: number, count: number) {
    const requestRevision = this.revision;
    return this.adapter.getBlocks(this.snapshot.documentId, startIndex, count).then((blocks) => {
      this.state = mergeHydratedMarkdownBlocksForRevision({
        blocks,
        currentRevision: this.revision,
        previousState: this.state,
        requestRevision,
      });
    });
  }

  apply(transaction: MarkdownTransaction) {
    return this.adapter.applyTransaction?.(this.snapshot.documentId, transaction).then((result) => {
      this.revision = result.revision;
      this.state = applyMarkdownTransactionResultToBlockState(this.state, result);
    });
  }

  assertInvariants(retiredBlockIds: string[] = []) {
    assertMarkdownDocumentBlockStateInvariants(this.state, { retiredBlockIds });
  }
}

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

function snapshot(initialBlocks: MarkdownBlockSnapshot[], blockCount = initialBlocks.length): MarkdownDocumentSnapshot {
  return {
    blockCount,
    documentId: "test-document",
    filename: "test.md",
    initialBlocks,
    sourceSize: 100,
    timing: {
      documentMs: 0,
      parseMs: 0,
      readMs: 0,
    },
  };
}

function updateTransaction(blockId: string, markdown: string): MarkdownTransaction {
  return {
    blockId,
    markdown,
    type: "updateBlockMarkdown",
  };
}

function transactionResult({
  blockIds,
  changedBlocks,
  deleteCount,
  retiredBlockIds = [],
  revision,
  startBlockIndex,
}: {
  blockIds: string[];
  changedBlocks: MarkdownBlockSnapshot[];
  deleteCount: number;
  retiredBlockIds?: string[];
  revision: number;
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
    revision,
    sourceLength: 100,
  };
}

describe("markdown document adapter contract", () => {
  it("does not merge stale hydration results after a structural transaction", async () => {
    const adapter = new FakeMarkdownAdapter(snapshot([
      block("d1:b0", 0),
      block("d1:b1", 1),
    ], 4));
    const harness = new MarkdownAdapterHarness(adapter, await adapter.load("test.md"));

    const hydratePromise = harness.hydrate(2, 2);
    expect(adapter.pendingHydrationRequests).toMatchObject([{ count: 2, startIndex: 2 }]);

    const applyPromise = harness.apply(updateTransaction("d1:b0", "Edited\n\nInserted"));
    expect(adapter.pendingTransactionRequests[0]?.transaction).toEqual(updateTransaction("d1:b0", "Edited\n\nInserted"));
    adapter.pendingTransactionRequests[0]?.deferred.resolve(transactionResult({
      blockIds: ["d1:b0", "d1:b4"],
      changedBlocks: [
        block("d1:b0", 0, "Edited"),
        block("d1:b4", 1, "Inserted"),
      ],
      deleteCount: 1,
      revision: 1,
      startBlockIndex: 0,
    }));
    await applyPromise;

    adapter.pendingHydrationRequests[0]?.deferred.resolve([
      block("d1:b2", 2, "Stale hydrated block"),
      block("d1:b3", 3, "Another stale hydrated block"),
    ]);
    await hydratePromise;

    expect(harness.blockIds).toEqual(["d1:b0", "d1:b4", "d1:b1"]);
    expect(() => harness.assertInvariants()).not.toThrow();
  });

  it("merges hydration when no transaction changed the request revision", async () => {
    const adapter = new FakeMarkdownAdapter(snapshot([
      block("d1:b0", 0),
      block("d1:b1", 1),
    ], 4));
    const harness = new MarkdownAdapterHarness(adapter, await adapter.load("test.md"));

    const hydratePromise = harness.hydrate(2, 2);
    adapter.pendingHydrationRequests[0]?.deferred.resolve([
      block("d1:b2", 2),
      block("d1:b3", 3),
    ]);
    await hydratePromise;

    expect(harness.blockIds).toEqual(["d1:b0", "d1:b1", "d1:b2", "d1:b3"]);
    expect(() => harness.assertInvariants()).not.toThrow();
  });

  it("keeps retired ids out of state when a delayed transaction resolves", async () => {
    const adapter = new FakeMarkdownAdapter(snapshot([
      block("d1:b0", 0),
      block("d1:b1", 1),
      block("d1:b2", 2),
    ]));
    const harness = new MarkdownAdapterHarness(adapter, await adapter.load("test.md"));

    const applyPromise = harness.apply({
      endBlockId: "d1:b2",
      markdown: "Replacement",
      startBlockId: "d1:b1",
      type: "replaceBlockRange",
    });

    adapter.pendingTransactionRequests[0]?.deferred.resolve(transactionResult({
      blockIds: ["d1:b1"],
      changedBlocks: [block("d1:b1", 1, "Replacement")],
      deleteCount: 2,
      retiredBlockIds: ["d1:b2"],
      revision: 1,
      startBlockIndex: 1,
    }));
    await applyPromise;

    expect(harness.blockIds).toEqual(["d1:b0", "d1:b1"]);
    expect(() => harness.assertInvariants(["d1:b2"])).not.toThrow();
  });

  it("keeps ids stable for a delayed transaction in a massive document", async () => {
    const blocks = Array.from({ length: 10000 }, (_value, index) => block(`d1:b${index}`, index, `Block ${index}`));
    const adapter = new FakeMarkdownAdapter(snapshot(blocks));
    const harness = new MarkdownAdapterHarness(adapter, await adapter.load("test.md"));

    const applyPromise = harness.apply(updateTransaction("d1:b5000", "Middle edited"));
    adapter.pendingTransactionRequests[0]?.deferred.resolve(transactionResult({
      blockIds: ["d1:b5000"],
      changedBlocks: [block("d1:b5000", 5000, "Middle edited")],
      deleteCount: 1,
      revision: 1,
      startBlockIndex: 5000,
    }));
    await applyPromise;

    expect(harness.blockIds).toHaveLength(10000);
    expect(harness.blockIds[4999]).toBe("d1:b4999");
    expect(harness.blockIds[5000]).toBe("d1:b5000");
    expect(harness.blockIds[5001]).toBe("d1:b5001");
    expect(() => harness.assertInvariants()).not.toThrow();
  });
});
