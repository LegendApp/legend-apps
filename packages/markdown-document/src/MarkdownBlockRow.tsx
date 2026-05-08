import type { LegendListRenderItemProps } from "@legendapp/list/react-native";
import { MarkdownBlockActivationView } from "@legend-desktop/markdown-block-editor";
import { memo, useEffect, useRef, useState, type RefObject } from "react";
import {
  EnrichedMarkdownText,
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { markdownDocumentStyles as styles } from "./MarkdownDocument.styles";
import { usesNativeEditorOverlay } from "./constants";
import type {
  BlockLayout,
  ChangeSelectionHandler,
  ChangeMarkdownHandler,
  OverlayFrame,
  SelectionDragOutsideHandler,
} from "./internalTypes";
import {
  blockRowSpacingStyle,
  editableTextStyleForBlock,
  estimateMarkdownEditorHeight,
  estimateMarkdownSelection,
  inputStyleFromMarkdownStyle,
  normalizeSelectionDragOutsideEvent,
} from "./markdownLayout";
import type { MarkdownBlockSnapshot, MarkdownDocumentLayout, MarkdownDocumentProps } from "./types";
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
    rowWidth,
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
    rowWidth: number;
  }) {
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
    previousProps.initialMarkdown === nextProps.initialMarkdown &&
    previousProps.initialSelection === nextProps.initialSelection &&
    previousProps.markdownStyle === nextProps.markdownStyle &&
    previousProps.onBlurRef === nextProps.onBlurRef &&
    previousProps.onChangeMarkdownRef === nextProps.onChangeMarkdownRef &&
    previousProps.onChangeSelectionRef === nextProps.onChangeSelectionRef &&
    previousProps.onSelectionDragOutsideRef === nextProps.onSelectionDragOutsideRef &&
    previousProps.rowWidth === nextProps.rowWidth,
);

export const MarkdownOverlayEditorInput = memo(
  function MarkdownOverlayEditorInput({
    activeBlock,
    activeInputRef,
    markdownStyle,
    onBlurRef,
    onChangeMarkdownRef,
    onChangeSelectionRef,
    inactiveOverlayWidth,
    onSelectionDragOutsideRef,
    overlayFrame,
    sourceBlockIdRef,
  }: {
    activeBlock?: MarkdownBlockSnapshot;
    activeInputRef: RefObject<EnrichedMarkdownTextInputInstance | null>;
    markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>;
    inactiveOverlayWidth: number;
    onBlurRef: RefObject<() => void>;
    onChangeMarkdownRef: RefObject<ChangeMarkdownHandler>;
    onChangeSelectionRef: RefObject<ChangeSelectionHandler>;
    onSelectionDragOutsideRef: RefObject<SelectionDragOutsideHandler>;
    overlayFrame?: OverlayFrame;
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
        scrollEnabled={false}
        style={StyleSheet.flatten([
          styles.editorInput,
          styles.overlayEditorInput,
          { width: inactiveOverlayWidth },
          overlayFrame,
        ])}
      />
    );
  },
  (previousProps, nextProps) =>
    previousProps.activeBlock?.id === nextProps.activeBlock?.id &&
    previousProps.activeInputRef === nextProps.activeInputRef &&
    previousProps.markdownStyle === nextProps.markdownStyle &&
    previousProps.inactiveOverlayWidth === nextProps.inactiveOverlayWidth &&
    previousProps.onBlurRef === nextProps.onBlurRef &&
    previousProps.onChangeMarkdownRef === nextProps.onChangeMarkdownRef &&
    previousProps.onChangeSelectionRef === nextProps.onChangeSelectionRef &&
    previousProps.onSelectionDragOutsideRef === nextProps.onSelectionDragOutsideRef &&
    previousProps.overlayFrame?.height === nextProps.overlayFrame?.height &&
    previousProps.overlayFrame?.left === nextProps.overlayFrame?.left &&
    previousProps.overlayFrame?.top === nextProps.overlayFrame?.top &&
    previousProps.overlayFrame?.width === nextProps.overlayFrame?.width &&
    previousProps.sourceBlockIdRef === nextProps.sourceBlockIdRef,
);

export function MarkdownBlockRow({
  activeInputRef,
  draftMarkdown,
  hasNextBlock,
  hasPreviousBlock,
  initialSelection,
  isActive,
  onActivate,
  onBlurRef,
  onChangeMarkdownRef,
  onChangeSelectionRef,
  onBlockWindowLayout,
  onSelectionDragOutsideRef,
  block,
  markdownLayout,
  markdownStyle,
  previousBlock,
}: LegendListRenderItemProps<string> & {
  activeInputRef: RefObject<EnrichedMarkdownTextInputInstance | null>;
  block?: MarkdownBlockSnapshot;
  draftMarkdown: string;
  hasNextBlock: boolean;
  hasPreviousBlock: boolean;
  initialSelection: number;
  isActive: boolean;
  markdownLayout: MarkdownDocumentLayout;
  markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>;
  onActivate: (block: MarkdownBlockSnapshot, selection: number) => void;
  onBlockWindowLayout: (blockId: string, layout: BlockLayout) => void;
  onBlurRef: RefObject<() => void>;
  onChangeMarkdownRef: RefObject<ChangeMarkdownHandler>;
  onChangeSelectionRef: RefObject<ChangeSelectionHandler>;
  onSelectionDragOutsideRef: RefObject<SelectionDragOutsideHandler>;
  previousBlock?: MarkdownBlockSnapshot;
}) {
  const [rowWidth, setRowWidth] = useState(700);
  const rowRef = useRef<View>(null);

  if (!block) {
    return null;
  }

  const rowStyle = blockRowSpacingStyle(block, previousBlock, hasPreviousBlock, hasNextBlock, markdownLayout);

  const measureWindowLayout = () => {
    requestAnimationFrame(() => {
      rowRef.current?.measureInWindow((_x, y, _width, height) => {
        onBlockWindowLayout(block.id, { y, height });
      });
    });
  };

  if (isActive && !usesNativeEditorOverlay) {
    return (
      <View
        ref={rowRef}
        onLayout={(event) => {
          setRowWidth(event.nativeEvent.layout.width);
          measureWindowLayout();
        }}
        style={rowStyle}
      >
        <MarkdownEditorInput
          activeInputRef={activeInputRef}
          block={block}
          initialMarkdown={draftMarkdown}
          initialSelection={initialSelection}
          markdownStyle={markdownStyle}
          onBlurRef={onBlurRef}
          onChangeMarkdownRef={onChangeMarkdownRef}
          onChangeSelectionRef={onChangeSelectionRef}
          onSelectionDragOutsideRef={onSelectionDragOutsideRef}
          rowWidth={rowWidth}
        />
      </View>
    );
  }

  const renderedMarkdown = (
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
      <MarkdownBlockActivationView
        ref={rowRef}
        blockId={block.id}
        contentsHidden={isActive}
        markdown={block.markdown}
        onLayout={(event) => {
          setRowWidth(event.nativeEvent.layout.width);
          measureWindowLayout();
        }}
        style={rowStyle}
      >
        {renderedMarkdown}
      </MarkdownBlockActivationView>
    );
  }

  return (
    <Pressable
      ref={rowRef}
      delayHoverIn={0}
      delayHoverOut={0}
      onLayout={(event) => {
        setRowWidth(event.nativeEvent.layout.width);
        measureWindowLayout();
      }}
      onPress={(event) => {
        onActivate(block, estimateMarkdownSelection(block.markdown, event, rowWidth));
      }}
      style={rowStyle}
    >
      {renderedMarkdown}
    </Pressable>
  );
}
