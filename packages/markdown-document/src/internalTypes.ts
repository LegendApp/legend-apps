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
};

export type HistoryEntry = UpdateBlockHistoryEntry | ReplaceBlockRangeHistoryEntry;

export type BlockSelectionState = {
  anchorBlockId: string;
  focusBlockId: string;
};

export type SelectionDragOutsideEvent = {
  direction: string;
  windowX?: number;
  windowY?: number;
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

export type ChangeMarkdownHandler = (block: MarkdownBlockSnapshot, markdown: string) => void;
export type ChangeSelectionHandler = (selection: { start: number; end: number }) => void;
export type SelectionDragOutsideHandler = (blockId: string, event: SelectionDragOutsideEvent) => void;
