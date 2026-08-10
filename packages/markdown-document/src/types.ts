import type { Observable } from "@legendapp/state";
import type { ReactNode, Ref } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { MarkdownStyle } from "react-native-enriched-markdown";

export type MarkdownBlockMetadata = {
  id: string;
  index: number;
  type: string;
  depth: number;
  headingLevel: number;
  markdownLength?: number;
  sourceStartByte: number;
  sourceEndByte: number;
  contentStartByte?: number;
  contentEndByte?: number;
  textRevision: number;
};

export type MarkdownBlockSnapshot = MarkdownBlockMetadata & {
  markdown: string;
};

export type MarkdownDocumentSnapshot = {
  documentId: string;
  filename: string;
  sourceSize: number;
  blockCount: number;
  initialBlocks: MarkdownBlockMetadata[];
  timing: {
    readMs: number;
    parseMs: number;
    documentMs: number;
  };
};

export type MarkdownTransaction =
  | {
      type: "updateBlockMarkdown";
      blockId: string;
      markdown: string;
    }
  | {
      type: "splitBlock";
      blockId: string;
      beforeMarkdown: string;
      afterMarkdown: string;
    }
  | {
      type: "replaceBlockRange";
      startBlockId: string;
      endBlockId: string;
      markdown?: string;
    }
  | {
      type: "moveBlockRange";
      startBlockId: string;
      endBlockId: string;
      targetBlockId: string;
      placement: "before" | "after";
    };

export type MarkdownTransactionResult = {
  revision: number;
  sourceLength: number;
  changedRange: {
    startBlockIndex: number;
    deleteCount: number;
    blockIds: string[];
  };
  changedBlocks: MarkdownBlockSnapshot[];
  retiredBlockIds: string[];
};

export type MarkdownDocumentAdapter = {
  load(filename: string): Promise<MarkdownDocumentSnapshot>;
  getBlock(documentId: string, blockId: string): Promise<MarkdownBlockSnapshot>;
  getBlockIdAtIndexSync?: (documentId: string, index: number) => string | undefined;
  getBlockIndexForIdSync?: (documentId: string, blockId: string) => number;
  getBlockAtIndexSync?: (documentId: string, index: number) => MarkdownBlockMetadata | undefined;
  getBlockIds?: (documentId: string, startIndex: number, count: number) => Promise<string[]>;
  getBlockMetadata?: (documentId: string, startIndex: number, count: number) => Promise<MarkdownBlockMetadata[]>;
  getBlocks(documentId: string, startIndex: number, count: number): Promise<MarkdownBlockSnapshot[]>;
  save(documentId: string): Promise<void>;
  saveAs(documentId: string, filename: string): Promise<void>;
  close(documentId: string): Promise<void>;
  applyTransaction?: (
    documentId: string,
    transaction: MarkdownTransaction,
  ) => MarkdownTransactionResult | Promise<MarkdownTransactionResult>;
};

export type MarkdownDocumentCommands = {
  reload(): void;
  save(): Promise<void>;
  saveAs(filename: string): Promise<void>;
  undo(): void;
  redo(): void;
  commitAndBlurActiveBlock(): boolean;
  extendBlockSelectionDown(): boolean;
  extendBlockSelectionUp(): boolean;
  focus(): void;
  focusFirstBlock(): void;
  focusLastBlock(): void;
  focusNextBlock(): void;
  focusPreviousBlock(): void;
  invalidateLayoutMeasurements(): void;
  moveActiveBlockDown(): void;
  moveActiveBlockUp(): void;
  setParagraph(): void;
  setHeading(level: 1 | 2 | 3 | 4 | 5 | 6): void;
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
  toggleStrikethrough(): void;
  toggleSpoiler(): void;
  toggleBlockquote(): void;
  toggleCodeBlock(): void;
  toggleOrderedList(): void;
  toggleTaskList(): void;
  toggleUnorderedList(): void;
  insertThematicBreak(): void;
  insertLink(options?: { text?: string; url?: string }): void;
};

export type MarkdownDocumentCommandState = {
  canRedo: boolean;
  canUndo: boolean;
};

export type MarkdownSelectionAnchor = {
  kind: "textSelection" | "blockSelection";
  blockId?: string;
  selectedLength?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  itemY?: number;
  itemHeight?: number;
  itemX?: number;
  itemWidth?: number;
};

export type MarkdownSavePolicy = {
  autosave?: boolean;
  debounceMs?: number;
};

export type MarkdownSaveState = "idle" | "saving" | "error";

export type MarkdownDocumentLoadedInfo = {
  documentId: string;
  filename: string;
  blockCount: number;
  sourceSize: number;
};

export type MarkdownDocumentTheme = {
  backgroundColor?: string;
  foregroundColor?: string;
  mutedForegroundColor?: string;
  errorColor?: string;
  selectionColor?: string;
};

export type MarkdownBlockLayoutStyle = {
  marginTop?: number;
  marginBottom?: number;
};

export type MarkdownDocumentLayout = {
  content?: {
    maxWidth?: number;
    horizontalPadding?: number;
    verticalPadding?: number;
  };
  blockSpacing: {
    paragraph: MarkdownBlockLayoutStyle;
    heading: Record<1 | 2 | 3 | 4 | 5 | 6, MarkdownBlockLayoutStyle>;
    codeBlock: MarkdownBlockLayoutStyle;
    blockquote: MarkdownBlockLayoutStyle;
    list: MarkdownBlockLayoutStyle;
    thematicBreak: MarkdownBlockLayoutStyle;
    table: MarkdownBlockLayoutStyle;
    fallback: MarkdownBlockLayoutStyle;
  };
};

export type MarkdownDocumentProps = {
  filename: string;
  adapter?: MarkdownDocumentAdapter;
  autoFocusFirstBlock?: boolean;
  savePolicy?: MarkdownSavePolicy;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  markdownStyle?: MarkdownStyle;
  markdownLayout?: MarkdownDocumentLayout;
  theme?: MarkdownDocumentTheme;
  commandsRef?: Ref<MarkdownDocumentCommands>;
  onCommandStateChange?: (state: MarkdownDocumentCommandState) => void;
  onLoadError?: (error: Error) => void;
  onLoaded?: (info: MarkdownDocumentLoadedInfo) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSaveStateChange?: (state: MarkdownSaveState) => void;
  onSelectionAnchorChange?: (anchor: MarkdownSelectionAnchor | null) => void;
  selectionAnchor$?: Observable<MarkdownSelectionAnchor | null>;
  commentAnchor?: MarkdownSelectionAnchor | null;
  renderCommentBubble?: (anchor: MarkdownSelectionAnchor) => ReactNode;
  selectionToolbarEnabled?: boolean;
  selectionToolbarAnchor?: MarkdownSelectionAnchor | null;
  renderSelectionToolbar?: (anchor: MarkdownSelectionAnchor) => ReactNode;
  onError?: (error: Error) => void;
};
