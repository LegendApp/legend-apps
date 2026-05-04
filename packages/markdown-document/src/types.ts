import type { Ref } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { MarkdownStyle } from "react-native-enriched-markdown";

export type MarkdownBlockSnapshot = {
  id: string;
  index: number;
  type: string;
  depth: number;
  headingLevel: number;
  markdown: string;
  sourceStartByte: number;
  sourceEndByte: number;
  contentStartByte?: number;
  contentEndByte?: number;
  textRevision: number;
};

export type MarkdownDocumentSnapshot = {
  documentId: string;
  filename: string;
  sourceSize: number;
  blockCount: number;
  initialBlocks: MarkdownBlockSnapshot[];
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
  getBlocks(documentId: string, startIndex: number, count: number): Promise<MarkdownBlockSnapshot[]>;
  save(documentId: string): Promise<void>;
  close(documentId: string): Promise<void>;
  applyTransaction?: (
    documentId: string,
    transaction: MarkdownTransaction,
  ) => Promise<MarkdownTransactionResult>;
};

export type MarkdownDocumentCommands = {
  save(): void;
  undo(): void;
  redo(): void;
  focus(): void;
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
  toggleStrikethrough(): void;
  toggleSpoiler(): void;
  insertLink(): void;
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
  onLoaded?: (info: MarkdownDocumentLoadedInfo) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSaveStateChange?: (state: MarkdownSaveState) => void;
  onError?: (error: Error) => void;
};
