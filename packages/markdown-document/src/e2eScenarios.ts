import { nativeMarkdownDocumentAdapter } from "./adapters/nativeMarkdownDocumentAdapter";
import {
  applyMarkdownTransactionResultToBlockState,
  assertMarkdownDocumentBlockStateInvariants,
  createMarkdownDocumentBlockState,
  mergeHydratedMarkdownBlocksForRevision,
  type MarkdownDocumentBlockState,
} from "./documentStateModel";
import type { MarkdownBlockSnapshot, MarkdownDocumentSnapshot, MarkdownTransactionResult } from "./types";

export type MarkdownDocumentE2EScenarioName =
  | "far-down-structural-edits"
  | "hydrate-while-editing";

export type MarkdownDocumentE2EScenarioOptions = {
  blockCount?: number;
  seed?: number;
};

export type MarkdownDocumentE2EResult = {
  blockCount: number;
  message: string;
  scenario: MarkdownDocumentE2EScenarioName;
  seed: number;
  sourceSize: number;
};

type ScenarioState = {
  blockState: MarkdownDocumentBlockState;
  currentRevision: number;
  retiredBlockIds: string[];
  snapshot: MarkdownDocumentSnapshot;
};

const defaultBlockCount = 2000;
const defaultSeed = 12345;

function createLargeMarkdownSource(blockCount: number, seed: number) {
  const blocks: string[] = [];
  for (let index = 0; index < blockCount; index += 1) {
    const variant = (index + seed) % 8;
    if (variant === 0) {
      blocks.push(`## Heading ${index}`);
    } else if (variant === 1) {
      blocks.push(`- Item ${index}\n- Item ${index + 1}`);
    } else if (variant === 2) {
      blocks.push(`> Quote ${index}\n>\n> More quote ${index}`);
    } else if (variant === 3) {
      blocks.push(`\`\`\`ts\nconst value${index} = ${index};\n\`\`\``);
    } else if (variant === 4) {
      blocks.push(`| A | B |\n|---|---|\n| ${index} | ${index + 1} |`);
    } else {
      blocks.push(`Paragraph ${index}`);
    }
  }
  return `${blocks.join("\n\n")}\n`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertScenarioState(state: ScenarioState) {
  assertMarkdownDocumentBlockStateInvariants(state.blockState, {
    retiredBlockIds: state.retiredBlockIds,
  });
  assert(state.blockState.blockIds.length <= state.snapshot.blockCount, "hydrated state length must not exceed snapshot block count");
}

function applyTransaction(state: ScenarioState, result: MarkdownTransactionResult): ScenarioState {
  const nextState = {
    ...state,
    blockState: applyMarkdownTransactionResultToBlockState(state.blockState, result),
    currentRevision: result.revision,
    retiredBlockIds: [...state.retiredBlockIds, ...result.retiredBlockIds],
    snapshot: {
      ...state.snapshot,
      blockCount:
        state.snapshot.blockCount -
        result.changedRange.deleteCount +
        result.changedRange.blockIds.length,
      sourceSize: result.sourceLength,
    },
  };
  assertScenarioState(nextState);
  return nextState;
}

function mergeHydration(
  state: ScenarioState,
  blocks: MarkdownBlockSnapshot[],
  requestRevision: number,
): ScenarioState {
  const nextState = {
    ...state,
    blockState: mergeHydratedMarkdownBlocksForRevision({
      blocks,
      currentRevision: state.currentRevision,
      previousState: state.blockState,
      requestRevision,
    }),
  };
  assertScenarioState(nextState);
  return nextState;
}

async function runFarDownStructuralEdits({
  blockCount,
  seed,
}: Required<MarkdownDocumentE2EScenarioOptions>): Promise<MarkdownDocumentE2EResult> {
  const source = createLargeMarkdownSource(blockCount, seed);
  const snapshot = await nativeMarkdownDocumentAdapter.loadMarkdown(`e2e-${seed}.md`, source);
  let state: ScenarioState = {
    blockState: createMarkdownDocumentBlockState(snapshot.initialBlocks),
    currentRevision: 0,
    retiredBlockIds: [],
    snapshot,
  };

  try {
    assertScenarioState(state);
    const farStartIndex = Math.max(0, Math.min(blockCount - 8, Math.floor(blockCount * 0.7)));
    const requestRevision = state.currentRevision;
    const staleFarBlocks = await nativeMarkdownDocumentAdapter.getBlocks(snapshot.documentId, farStartIndex, 8);
    state = mergeHydration(state, staleFarBlocks, requestRevision);

    const targetBlock = staleFarBlocks[0];
    assert(targetBlock, "far-down scenario target block must exist");

    const staleAfterTargetBlocks = await nativeMarkdownDocumentAdapter.getBlocks(snapshot.documentId, farStartIndex + 2, 4);
    const staleAfterTargetRevision = state.currentRevision;
    const updateResult = await nativeMarkdownDocumentAdapter.applyTransaction?.(snapshot.documentId, {
      blockId: targetBlock.id,
      markdown: `${targetBlock.markdown}\n\nInserted after far-down edit ${seed}`,
      type: "updateBlockMarkdown",
    });
    assert(updateResult, "native adapter must support markdown transactions");
    state = applyTransaction(state, updateResult);

    const idsBeforeStaleMerge = state.blockState.blockIds;
    state = mergeHydration(state, staleAfterTargetBlocks, staleAfterTargetRevision);
    assert(state.blockState.blockIds === idsBeforeStaleMerge, "stale hydration must be ignored after transaction revision changes");

    const freshFarBlocks = await nativeMarkdownDocumentAdapter.getBlocks(snapshot.documentId, farStartIndex, 8);
    state = mergeHydration(state, freshFarBlocks, state.currentRevision);
    const replaceStart = freshFarBlocks[1];
    const replaceEnd = freshFarBlocks[3];
    assert(replaceStart && replaceEnd, "far-down range replacement endpoints must exist");

    const replaceResult = await nativeMarkdownDocumentAdapter.applyTransaction?.(snapshot.documentId, {
      endBlockId: replaceEnd.id,
      markdown: `Replacement block ${seed}`,
      startBlockId: replaceStart.id,
      type: "replaceBlockRange",
    });
    assert(replaceResult, "native adapter must support range replacement transactions");
    state = applyTransaction(state, replaceResult);

    const savedPath = `/tmp/legend-markdown-e2e-${seed}.md`;
    await nativeMarkdownDocumentAdapter.saveAs(snapshot.documentId, savedPath);

    return {
      blockCount: state.snapshot.blockCount,
      message: `E2E passed: far-down-structural-edits seed=${seed}`,
      scenario: "far-down-structural-edits",
      seed,
      sourceSize: state.snapshot.sourceSize,
    };
  } finally {
    await nativeMarkdownDocumentAdapter.close(snapshot.documentId);
  }
}

export async function runMarkdownDocumentE2EScenario(
  scenario: MarkdownDocumentE2EScenarioName,
  options: MarkdownDocumentE2EScenarioOptions = {},
): Promise<MarkdownDocumentE2EResult> {
  const resolvedOptions = {
    blockCount: options.blockCount ?? defaultBlockCount,
    seed: options.seed ?? defaultSeed,
  };

  if (scenario === "far-down-structural-edits" || scenario === "hydrate-while-editing") {
    return runFarDownStructuralEdits(resolvedOptions);
  }

  throw new Error(`Unsupported markdown E2E scenario: ${scenario}`);
}
