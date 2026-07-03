import type { LegendListRenderItemProps } from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { MarkdownBlockActivationView, MarkdownBlockRenderer } from "@legend-desktop/markdown-block-editor";
import { memo, useEffect, useRef, type ReactNode, type RefObject } from "react";
import {
  EnrichedMarkdownText,
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { markdownDocumentStyles as styles } from "./MarkdownDocument.styles";
import { usesNativeEditorOverlay } from "./constants";
import type {
  ChangeSelectionHandler,
  ChangeMarkdownHandler,
  MarkdownDocumentRenderState,
  SelectionDragOutsideHandler,
  VerticalNavigationOutsideHandler,
} from "./internalTypes";
import {
  blockRowSpacingStyle,
  editableTextStyleForBlock,
  emptyParagraphPlaceholderStyle,
  estimateMarkdownEditorHeight,
  estimateMarkdownSelection,
  getHeadingLevel,
  inputStyleFromMarkdownStyle,
  markdownFromEditableMarkdownForBlock,
  markdownSelectionFromEditableSelectionForBlock,
  normalizeSelectionDragOutsideEvent,
} from "./markdownLayout";
import type { MarkdownBlockMetadata, MarkdownBlockSnapshot, MarkdownDocumentLayout, MarkdownDocumentProps, MarkdownSelectionAnchor } from "./types";
import { useLatestRef } from "./useLatestRef";

function isMarkdownBlockSnapshot(block: MarkdownBlockMetadata): block is MarkdownBlockSnapshot {
  return typeof (block as Partial<MarkdownBlockSnapshot>).markdown === "string";
}

export const MarkdownEditorInput = memo(
  function MarkdownEditorInput({
    activeInputRef,
    block,
    initialMarkdown,
    initialSelection,
    markdownStyle,
    onBlurRef,
    onChangeMarkdownRef,
    onChangeSelectionRef,
    onSelectionDragOutsideRef,
    onVerticalNavigationOutsideRef,
    rowWidth$,
  }: {
    activeInputRef: RefObject<EnrichedMarkdownTextInputInstance | null>;
    block: MarkdownBlockSnapshot;
    initialMarkdown: string;
    initialSelection: number;
    markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>;
    onBlurRef: RefObject<() => void>;
    onChangeMarkdownRef: RefObject<ChangeMarkdownHandler>;
    onChangeSelectionRef: RefObject<ChangeSelectionHandler>;
    onSelectionDragOutsideRef: RefObject<SelectionDragOutsideHandler>;
    onVerticalNavigationOutsideRef: RefObject<VerticalNavigationOutsideHandler>;
    rowWidth$: Observable<number>;
  }) {
    const rowWidth = useValue(rowWidth$);

    useEffect(() => {
      const timeout = setTimeout(() => {
        activeInputRef.current?.focus();
        activeInputRef.current?.setSelection(initialSelection, initialSelection);
      }, 0);

      return () => clearTimeout(timeout);
    }, [activeInputRef, initialSelection]);

    return (
      <EnrichedMarkdownTextInput
        ref={activeInputRef}
        autoFocus
        defaultValue={initialMarkdown}
        markdownStyle={inputStyleFromMarkdownStyle(markdownStyle)}
        multiline
        onBlur={() => onBlurRef.current()}
        onChangeMarkdown={(markdown) => onChangeMarkdownRef.current(block, markdown)}
        onChangeSelection={(selection) => onChangeSelectionRef.current(selection)}
        onSelectionDragOutside={(event) => onSelectionDragOutsideRef.current(block.id, normalizeSelectionDragOutsideEvent(event))}
        onVerticalNavigationOutside={(event) => onVerticalNavigationOutsideRef.current(block.id, event)}
        scrollEnabled={false}
        style={StyleSheet.flatten([
          editableTextStyleForBlock(block, markdownStyle),
          { minHeight: estimateMarkdownEditorHeight(initialMarkdown, rowWidth) },
        ])}
      />
    );
  },
  (previousProps, nextProps) =>
    previousProps.activeInputRef === nextProps.activeInputRef &&
    previousProps.block.id === nextProps.block.id &&
    previousProps.block.type === nextProps.block.type &&
    previousProps.block.headingLevel === nextProps.block.headingLevel &&
    previousProps.initialMarkdown === nextProps.initialMarkdown &&
    previousProps.initialSelection === nextProps.initialSelection &&
    previousProps.markdownStyle === nextProps.markdownStyle &&
    previousProps.onBlurRef === nextProps.onBlurRef &&
    previousProps.onChangeMarkdownRef === nextProps.onChangeMarkdownRef &&
    previousProps.onChangeSelectionRef === nextProps.onChangeSelectionRef &&
    previousProps.onSelectionDragOutsideRef === nextProps.onSelectionDragOutsideRef &&
    previousProps.onVerticalNavigationOutsideRef === nextProps.onVerticalNavigationOutsideRef &&
    previousProps.rowWidth$ === nextProps.rowWidth$,
);

export const MarkdownOverlayEditorInput = memo(
  function MarkdownOverlayEditorInput({
    activeBlock,
    activeInputRef,
    markdownStyle,
    onBlurRef,
    onChangeMarkdownRef,
    onChangeSelectionRef,
    onSelectionDragOutsideRef,
    onVerticalNavigationOutsideRef,
    sourceBlockIdRef,
  }: {
    activeBlock?: MarkdownBlockSnapshot;
    activeInputRef: RefObject<EnrichedMarkdownTextInputInstance | null>;
    markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>;
    onBlurRef: RefObject<() => void>;
    onChangeMarkdownRef: RefObject<ChangeMarkdownHandler>;
    onChangeSelectionRef: RefObject<ChangeSelectionHandler>;
    onSelectionDragOutsideRef: RefObject<SelectionDragOutsideHandler>;
    onVerticalNavigationOutsideRef: RefObject<VerticalNavigationOutsideHandler>;
    sourceBlockIdRef: RefObject<string | null>;
  }) {
    const activeBlockRef = useLatestRef(activeBlock);

    return (
      <EnrichedMarkdownTextInput
        ref={activeInputRef}
        defaultValue=""
        markdownStyle={inputStyleFromMarkdownStyle(markdownStyle)}
        multiline
        onBlur={() => onBlurRef.current()}
        onChangeMarkdown={(markdown) => {
          const block = activeBlockRef.current;
          if (block) {
            onChangeMarkdownRef.current(block, markdownFromEditableMarkdownForBlock(block, markdown, block.markdown));
          }
        }}
        onChangeSelection={(selection) => {
          const block = activeBlockRef.current;
          if (block) {
            onChangeSelectionRef.current({
              end: markdownSelectionFromEditableSelectionForBlock(block, selection.end, block.markdown),
              start: markdownSelectionFromEditableSelectionForBlock(block, selection.start, block.markdown),
            });
          } else {
            onChangeSelectionRef.current(selection);
          }
        }}
        onSelectionDragOutside={(event) => {
          const blockId = sourceBlockIdRef.current ?? activeBlockRef.current?.id;
          if (blockId) {
            onSelectionDragOutsideRef.current(blockId, normalizeSelectionDragOutsideEvent(event));
          }
        }}
        onVerticalNavigationOutside={(event) => {
          const blockId = sourceBlockIdRef.current ?? activeBlockRef.current?.id;
          if (blockId) {
            onVerticalNavigationOutsideRef.current(blockId, event);
          }
        }}
        scrollEnabled={false}
        style={StyleSheet.flatten([
          styles.editorInputShell,
          activeBlock ? editableTextStyleForBlock(activeBlock, markdownStyle) : null,
          styles.overlayEditorInput,
        ])}
      />
    );
  },
  (previousProps, nextProps) =>
    previousProps.activeBlock?.id === nextProps.activeBlock?.id &&
    previousProps.activeBlock?.type === nextProps.activeBlock?.type &&
    previousProps.activeBlock?.headingLevel === nextProps.activeBlock?.headingLevel &&
    previousProps.activeInputRef === nextProps.activeInputRef &&
    previousProps.markdownStyle === nextProps.markdownStyle &&
    previousProps.onBlurRef === nextProps.onBlurRef &&
    previousProps.onChangeMarkdownRef === nextProps.onChangeMarkdownRef &&
    previousProps.onChangeSelectionRef === nextProps.onChangeSelectionRef &&
    previousProps.onSelectionDragOutsideRef === nextProps.onSelectionDragOutsideRef &&
    previousProps.onVerticalNavigationOutsideRef === nextProps.onVerticalNavigationOutsideRef &&
    previousProps.sourceBlockIdRef === nextProps.sourceBlockIdRef,
);

function HeadingEditMarker({
  block,
  markdownStyle,
  top,
}: {
  block: MarkdownBlockMetadata | undefined;
  markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>;
  top: number;
}) {
  const headingLevel = block ? getHeadingLevel(block) : undefined;
  const headingStyle = headingLevel === 1
    ? markdownStyle.h1
    : headingLevel === 2
      ? markdownStyle.h2
      : headingLevel === 3
        ? markdownStyle.h3
        : headingLevel === 4
          ? markdownStyle.h4
          : headingLevel === 5
            ? markdownStyle.h5
            : markdownStyle.h6;
  const fontSize = typeof headingStyle?.fontSize === "number" ? headingStyle.fontSize : 24;
  const lineHeight = typeof headingStyle?.lineHeight === "number" ? headingStyle.lineHeight : Math.ceil(fontSize * 1.25);
  const color = headingStyle?.color ?? markdownStyle.paragraph?.color ?? "#6b7280";
  const opacity = headingLevel ? 1 : 0;

  return (
    <View
      pointerEvents="none"
      style={[styles.headingEditMarker, { height: lineHeight, opacity, top }]}
      testID="markdown-heading-edit-marker"
    >
      <Text style={[styles.headingEditMarkerText, { color, fontSize: Math.max(16, Math.round(fontSize * 0.72)), lineHeight }]}>
        H
      </Text>
      <Text style={[styles.headingEditMarkerLevel, { color, fontSize: Math.max(9, Math.round(fontSize * 0.42)), lineHeight }]}>
        {headingLevel ?? ""}
      </Text>
    </View>
  );
}

export const MarkdownBlockRow = memo(function MarkdownBlockRow({
  activeInputRef,
  getBlockCount,
  getBlockIdAtIndex,
  getBlockMetadata,
  onActivate,
  onBlurRef,
  onChangeMarkdownRef,
  onChangeSelectionRef,
  onSelectionDragOutsideRef,
  onVerticalNavigationOutsideRef,
  documentRenderState$,
  markdownLayout,
  markdownStyle,
  renderCommentBubble,
  selectionOverlayStyle,
  item: blockId,
  index,
}: LegendListRenderItemProps<string> & {
  activeInputRef: RefObject<EnrichedMarkdownTextInputInstance | null>;
  getBlockCount: () => number;
  getBlockIdAtIndex: (index: number) => string | undefined;
  getBlockMetadata: (blockId: string, index: number) => MarkdownBlockMetadata | undefined;
  documentRenderState$: Observable<MarkdownDocumentRenderState>;
  markdownLayout: MarkdownDocumentLayout;
  markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>;
  onActivate: (block: MarkdownBlockSnapshot, selection: number) => void;
  onBlurRef: RefObject<() => void>;
  onChangeMarkdownRef: RefObject<ChangeMarkdownHandler>;
  onChangeSelectionRef: RefObject<ChangeSelectionHandler>;
  onSelectionDragOutsideRef: RefObject<SelectionDragOutsideHandler>;
  onVerticalNavigationOutsideRef: RefObject<VerticalNavigationOutsideHandler>;
  renderCommentBubble?: (anchor: MarkdownSelectionAnchor) => ReactNode;
  selectionOverlayStyle: StyleProp<ViewStyle>;
}) {
  const activeBlock = useValue(documentRenderState$.activeBlocksById.get(blockId));
  const isBlockSelected = useValue(documentRenderState$.selectedBlocksById.get(blockId)) === true;
  const rowState = useValue(documentRenderState$.rowStatesById.get(blockId));
  const block = getBlockMetadata(blockId, index);
  const previousBlockId = getBlockIdAtIndex(index - 1);
  const previousBlock = previousBlockId ? getBlockMetadata(previousBlockId, index - 1) : undefined;
  const draftMarkdown = activeBlock?.draftMarkdown ?? "";
  const initialSelection = activeBlock?.selection ?? 0;
  const isActive = activeBlock !== undefined;
  const hasPreviousBlock = index > 0;
  const hasNextBlock = index + 1 < getBlockCount();
  const rowWidth$ = useObservable(700);
  const rowRef = useRef<View>(null);

  if (!block) {
    return null;
  }

  const activeEditorBlock = activeBlock?.block ?? (isMarkdownBlockSnapshot(block) ? block : undefined);
  const layoutBlock = activeEditorBlock ?? block;
  const rowStyle = blockRowSpacingStyle(layoutBlock, previousBlock, hasPreviousBlock, hasNextBlock, markdownLayout);
  const rowPaddingTop = typeof rowStyle.paddingTop === "number" ? rowStyle.paddingTop : 0;
  const rowPaddingBottom = typeof rowStyle.paddingBottom === "number" ? rowStyle.paddingBottom : 0;
  const activeNativeEditorRowStyle = isActive && activeBlock.editorFrame
    ? { height: activeBlock.editorFrame.rowHeight }
    : null;
  const commentAnchor = rowState?.commentAnchor ?? null;
  const commentBubble = commentAnchor && renderCommentBubble ? renderCommentBubble(commentAnchor) : null;
  const selectionOverlay = isBlockSelected ? (
    <View pointerEvents="none" style={selectionOverlayStyle} testID={`markdown-block-selection-overlay-${block.id}`} />
  ) : null;

  if (isActive && !usesNativeEditorOverlay && activeEditorBlock) {
    return (
      <View
        ref={rowRef}
        onLayout={(event) => {
          rowWidth$.set(event.nativeEvent.layout.width);
        }}
        style={[rowStyle, styles.blockRow]}
      >
        <MarkdownEditorInput
          activeInputRef={activeInputRef}
          block={activeEditorBlock}
          initialMarkdown={draftMarkdown}
          initialSelection={initialSelection}
          markdownStyle={markdownStyle}
          onBlurRef={onBlurRef}
          onChangeMarkdownRef={onChangeMarkdownRef}
          onChangeSelectionRef={onChangeSelectionRef}
          onSelectionDragOutsideRef={onSelectionDragOutsideRef}
          onVerticalNavigationOutsideRef={onVerticalNavigationOutsideRef}
          rowWidth$={rowWidth$}
        />
        {commentBubble}
      </View>
    );
  }

  const markdownLength = block.markdownLength ?? (isMarkdownBlockSnapshot(block) ? block.markdown.length : 0);
  const isEmptyParagraph = block.type === "paragraph" && markdownLength === 0;
  const renderRevision = block.textRevision * 1000000 + (rowState?.renderRevision ?? 0);
  const markdown = isMarkdownBlockSnapshot(block) ? block.markdown : "";
  const renderedMarkdown = isEmptyParagraph ? (
    <View style={[styles.emptyParagraphPlaceholder, emptyParagraphPlaceholderStyle(markdownStyle)]} />
  ) : usesNativeEditorOverlay ? (
    <MarkdownBlockRenderer
      allowTrailingMargin={false}
      blockId={block.id}
      containerStyle={styles.renderedText}
      markdownStyle={markdownStyle}
      onLinkPress={(event) => {
        Linking.openURL(event.url).catch(() => {});
      }}
      onSelectionDragOutside={(event) => onSelectionDragOutsideRef.current(block.id, normalizeSelectionDragOutsideEvent(event))}
      renderRevision={renderRevision}
      selectable
    />
  ) : (
    <EnrichedMarkdownText
      allowTrailingMargin={false}
      containerStyle={styles.renderedText}
      flavor="github"
      markdown={markdown}
      markdownStyle={markdownStyle}
      onLinkPress={(event) => {
        Linking.openURL(event.url).catch(() => {});
      }}
      onSelectionDragOutside={(event) => onSelectionDragOutsideRef.current(block.id, normalizeSelectionDragOutsideEvent(event))}
      selectable
    />
  );

  if (usesNativeEditorOverlay) {
    return (
      <View style={styles.blockRow}>
        <MarkdownBlockActivationView
          ref={rowRef}
          blockId={block.id}
          contentsHidden={isActive}
          nextBlockId={getBlockIdAtIndex(index + 1) ?? ""}
          onLayout={(event) => {
            rowWidth$.set(event.nativeEvent.layout.width);
          }}
          previousBlockId={previousBlockId ?? ""}
          renderRevision={renderRevision}
          style={[rowStyle, styles.blockRow, activeNativeEditorRowStyle]}
        >
          {renderedMarkdown}
          {selectionOverlay}
        </MarkdownBlockActivationView>
        <HeadingEditMarker block={isActive ? activeEditorBlock : undefined} markdownStyle={markdownStyle} top={rowPaddingTop} />
        {commentBubble}
      </View>
    );
  }

  return (
    <View
      ref={rowRef}
      onLayout={(event) => {
        rowWidth$.set(event.nativeEvent.layout.width);
      }}
      style={styles.blockRow}
    >
      <Pressable
        delayHoverIn={0}
        delayHoverOut={0}
        onPress={(event) => {
          if (isMarkdownBlockSnapshot(block)) {
            onActivate(block, estimateMarkdownSelection(block.markdown, event, rowWidth$.peek(), {
              paddingBottom: rowPaddingBottom,
              paddingTop: rowPaddingTop,
            }));
          }
        }}
        style={[rowStyle, styles.rowContent]}
      >
        {renderedMarkdown}
      </Pressable>
      {selectionOverlay}
      {commentBubble}
    </View>
  );
});
