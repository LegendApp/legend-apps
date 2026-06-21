import type { LegendListRenderItemProps } from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { MarkdownBlockActivationView } from "@legend-desktop/markdown-block-editor";
import { Fragment, memo, useEffect, useRef, type ReactNode, type RefObject } from "react";
import {
  EnrichedMarkdownText,
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
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
  inputStyleFromMarkdownStyle,
  normalizeSelectionDragOutsideEvent,
} from "./markdownLayout";
import type { MarkdownBlockSnapshot, MarkdownDocumentLayout, MarkdownDocumentProps, MarkdownSelectionAnchor } from "./types";
import { useLatestRef } from "./useLatestRef";

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
            onChangeMarkdownRef.current(block, markdown);
          }
        }}
        onChangeSelection={(selection) => onChangeSelectionRef.current(selection)}
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
          activeBlock ? editableTextStyleForBlock(activeBlock, markdownStyle) : styles.editorInput,
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

export const MarkdownBlockRow = memo(function MarkdownBlockRow({
  activeInputRef,
  commentAnchor,
  getBlockSnapshot,
  hasNextBlock,
  hasPreviousBlock,
  onActivate,
  onBlurRef,
  onChangeMarkdownRef,
  onChangeSelectionRef,
  onSelectionDragOutsideRef,
  onVerticalNavigationOutsideRef,
  documentRenderState$,
  markdownLayout,
  markdownStyle,
  previousBlockId,
  renderCommentBubble,
  selectionOverlayStyle,
  item: blockId,
  index,
}: LegendListRenderItemProps<string> & {
  activeInputRef: RefObject<EnrichedMarkdownTextInputInstance | null>;
  commentAnchor?: MarkdownSelectionAnchor | null;
  getBlockSnapshot: (blockId: string, index: number) => MarkdownBlockSnapshot | undefined;
  hasNextBlock: boolean;
  hasPreviousBlock: boolean;
  documentRenderState$: Observable<MarkdownDocumentRenderState>;
  markdownLayout: MarkdownDocumentLayout;
  markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>;
  onActivate: (block: MarkdownBlockSnapshot, selection: number) => void;
  onBlurRef: RefObject<() => void>;
  onChangeMarkdownRef: RefObject<ChangeMarkdownHandler>;
  onChangeSelectionRef: RefObject<ChangeSelectionHandler>;
  onSelectionDragOutsideRef: RefObject<SelectionDragOutsideHandler>;
  onVerticalNavigationOutsideRef: RefObject<VerticalNavigationOutsideHandler>;
  previousBlockId?: string;
  renderCommentBubble?: (anchor: MarkdownSelectionAnchor) => ReactNode;
  selectionOverlayStyle: StyleProp<ViewStyle>;
}) {
  const observedBlock = useValue(documentRenderState$.blocksById.get(blockId));
  const activeBlock = useValue(documentRenderState$.activeBlocksById.get(blockId));
  const isBlockSelected = useValue(documentRenderState$.selectedBlocksById.get(blockId)) === true;
  const observedPreviousBlock = useValue(documentRenderState$.blocksById.get(previousBlockId ?? ""));
  const block = observedBlock ?? getBlockSnapshot(blockId, index);
  const previousBlock = observedPreviousBlock ?? (previousBlockId ? getBlockSnapshot(previousBlockId, index - 1) : undefined);
  const activeEditorBlock = activeBlock?.block ?? block;
  const draftMarkdown = activeBlock?.draftMarkdown ?? "";
  const initialSelection = activeBlock?.selection ?? 0;
  const isActive = activeBlock !== undefined;
  const rowWidth$ = useObservable(700);
  const rowRef = useRef<View>(null);

  if (!block) {
    return null;
  }

  const layoutBlock = isActive ? activeEditorBlock : block;
  const rowStyle = blockRowSpacingStyle(layoutBlock, previousBlock, hasPreviousBlock, hasNextBlock, markdownLayout);
  const rowPaddingTop = typeof rowStyle.paddingTop === "number" ? rowStyle.paddingTop : 0;
  const rowPaddingBottom = typeof rowStyle.paddingBottom === "number" ? rowStyle.paddingBottom : 0;
  const activeNativeEditorRowStyle = isActive && activeBlock.editorFrame
    ? { height: activeBlock.editorFrame.height + rowPaddingTop + rowPaddingBottom }
    : null;
  const commentBubble = commentAnchor && renderCommentBubble ? renderCommentBubble(commentAnchor) : null;
  const selectionOverlay = isBlockSelected ? (
    <View pointerEvents="none" style={selectionOverlayStyle} testID={`markdown-block-selection-overlay-${block.id}`} />
  ) : null;

  if (isActive && !usesNativeEditorOverlay) {
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

  const isEmptyParagraph = block.type === "paragraph" && block.markdown.length === 0;
  const renderedMarkdown = isEmptyParagraph ? (
    <View style={[styles.emptyParagraphPlaceholder, emptyParagraphPlaceholderStyle(markdownStyle)]} />
  ) : (
    <EnrichedMarkdownText
      allowTrailingMargin={false}
      containerStyle={styles.renderedText}
      flavor="github"
      markdown={block.markdown}
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
      <Fragment>
        <MarkdownBlockActivationView
          ref={rowRef}
          blockId={block.id}
          bottomPadding={rowPaddingBottom}
          contentsHidden={isActive}
          markdown={block.markdown}
          onLayout={(event) => {
            rowWidth$.set(event.nativeEvent.layout.width);
          }}
          style={[rowStyle, styles.blockRow, activeNativeEditorRowStyle]}
          topPadding={rowPaddingTop}
        >
          {renderedMarkdown}
          {selectionOverlay}
        </MarkdownBlockActivationView>
        {commentBubble}
      </Fragment>
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
          onActivate(block, estimateMarkdownSelection(block.markdown, event, rowWidth$.peek(), {
            paddingBottom: rowPaddingBottom,
            paddingTop: rowPaddingTop,
          }));
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
