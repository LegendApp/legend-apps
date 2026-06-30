import type { MarkdownBlockSnapshot, MarkdownDocumentSnapshot } from "./types";

export type DocumentState =
  | {
      status: "loading";
      snapshot?: undefined;
      error?: undefined;
    }
  | {
      status: "loaded";
      snapshot: MarkdownDocumentSnapshot;
      error?: undefined;
    }
  | {
      status: "error";
      snapshot?: undefined;
      error: Error;
    };

export type UpdateBlockHistoryEntry = {
  type: "updateBlockMarkdown";
  blockId: string;
  beforeMarkdown: string;
  afterMarkdown: string;
};

export type ReplaceBlockRangeHistoryEntry = {
  type: "replaceBlockRange";
  startBlockId: string;
  endBlockId: string;
  replacementMarkdown: string;
  inverseMarkdown: string;
  inverseSplit?: {
    afterMarkdown: string;
    beforeMarkdown: string;
  };
};

export type SplitBlockHistoryEntry = {
  type: "splitBlock";
  blockId: string;
  beforeMarkdown: string;
  afterMarkdown: string;
  replacementMarkdown: string;
};

export type MoveBlockRangeHistoryEntry = {
  type: "moveBlockRange";
  startBlockId: string;
  endBlockId: string;
  targetBlockId: string;
  placement: "before" | "after";
  inverseTargetBlockId: string;
  inversePlacement: "before" | "after";
};

export type HistoryEntry =
  | UpdateBlockHistoryEntry
  | ReplaceBlockRangeHistoryEntry
  | SplitBlockHistoryEntry
  | MoveBlockRangeHistoryEntry;

export type BlockSelectionState = {
  anchorBlockId: string;
  focusBlockId: string;
};

export type SelectionDragOutsideEvent = {
  direction: string;
  windowX?: number;
  windowY?: number;
};

export type VerticalNavigationOutsideEvent = {
  direction: string;
  preferredX: number;
};

export type NativeSelectionDragOutsideEvent = {
  nativeEvent?: SelectionDragOutsideEvent;
} & SelectionDragOutsideEvent;

export type BlockLayout = {
  y: number;
  height: number;
};

export type OverlayFrame = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type ActiveBlockRenderState = {
  block: MarkdownBlockSnapshot;
  draftMarkdown: string;
  editorFrame?: OverlayFrame;
  selection: number;
};

export type MarkdownDocumentRenderState = {
  activeBlocksById: Map<string, ActiveBlockRenderState>;
  blockIds: string[];
  blockSelection: BlockSelectionState | null;
  blocksById: Map<string, MarkdownBlockSnapshot>;
  selectedBlocksById: Map<string, boolean>;
};

export type ChangeMarkdownHandler = (block: MarkdownBlockSnapshot, markdown: string) => void;
export type ChangeSelectionHandler = (selection: { start: number; end: number }) => void;
export type SelectionDragOutsideHandler = (blockId: string, event: SelectionDragOutsideEvent) => void;
export type VerticalNavigationOutsideHandler = (blockId: string, event: VerticalNavigationOutsideEvent) => void;
