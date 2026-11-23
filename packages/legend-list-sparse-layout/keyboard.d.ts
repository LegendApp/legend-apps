import * as React from 'react';
import { Key } from 'react';
import { ScrollViewComponent, ScrollResponderMixin, Insets as Insets$1, ScrollViewProps, View, LayoutChangeEvent } from 'react-native';
import { KeyboardChatScrollViewProps } from 'react-native-keyboard-controller';
import { SharedValue } from 'react-native-reanimated';
import { AnimatedLegendListDataSourceProps, AnimatedLegendListProps } from '@legendapp/list/reanimated';

interface MaintainVisibleContentPositionNormalized<ItemT = any> {
    autoscrollToTopThreshold?: number;
    data: boolean;
    size: boolean;
    shouldRestorePosition?: (item: ItemT, index: number, data: readonly ItemT[]) => boolean;
}

type ListenerType = "activeStickyIndex" | "alignItemsAtEndPadding" | "anchoredEndSpaceSize" | "containerLayoutEpoch" | "debugComputedScroll" | "debugRawScroll" | "extraData" | "footerSize" | "headerSize" | "lastItemKeys" | "lastPositionUpdate" | "maintainVisibleContentPosition" | "numColumns" | "numContainers" | "numContainersPooled" | "otherAxisSize" | "readyToRender" | "isScrollActive" | "scrollAdjust" | "scrollAdjustPending" | "scrollAdjustUserOffset" | "scrollSize" | "snapToOffsets" | "stickyLayoutEpoch" | "stickySettle" | "stylePaddingTop" | "totalSize" | "isFollowingEnd" | "isAtEnd" | "isAtStart" | "isNearEnd" | "isNearStart" | "isWithinMaintainScrollAtEndThreshold" | "adaptiveRender" | `containerColumn${number}` | `containerDataVersion${number}` | `containerSpan${number}` | `containerItemData${number}` | `containerItemIndex${number}` | `containerItemKey${number}` | `containerLayoutReady${number}` | `containerPosition${number}` | `containerSticky${number}`;
type LegendListListenerType = Extract<ListenerType, "activeStickyIndex" | "anchoredEndSpaceSize" | "footerSize" | "headerSize" | "isFollowingEnd" | "isAtEnd" | "isAtStart" | "isNearEnd" | "isNearStart" | "isWithinMaintainScrollAtEndThreshold" | "adaptiveRender" | "lastItemKeys" | "lastPositionUpdate" | "numContainers" | "numContainersPooled" | "otherAxisSize" | "readyToRender" | "snapToOffsets" | "totalSize">;
type ListenerTypeValueMap = {
    activeStickyIndex: number;
    alignItemsAtEndPadding: number;
    anchoredEndSpaceSize: number;
    containerLayoutEpoch: number;
    stickyLayoutEpoch: number;
    animatedScrollY: any;
    debugComputedScroll: number;
    debugRawScroll: number;
    extraData: any;
    footerSize: number;
    headerSize: number;
    isFollowingEnd: boolean;
    isAtEnd: boolean;
    isAtStart: boolean;
    isNearEnd: boolean;
    isNearStart: boolean;
    isWithinMaintainScrollAtEndThreshold: boolean;
    lastItemKeys: string[];
    lastPositionUpdate: number;
    maintainVisibleContentPosition: MaintainVisibleContentPositionNormalized;
    numColumns: number;
    numContainers: number;
    numContainersPooled: number;
    otherAxisSize: number;
    readyToRender: boolean;
    isScrollActive: boolean;
    scrollAdjust: number;
    scrollAdjustPending: number;
    scrollAdjustUserOffset: number;
    scrollSize: {
        width: number;
        height: number;
    };
    snapToOffsets: number[];
    stickySettle: number;
    stylePaddingTop: number;
    totalSize: number;
    adaptiveRender: "normal" | "light";
} & {
    [K in ListenerType as K extends `containerDataVersion${number}` ? K : never]: number;
} & {
    [K in ListenerType as K extends `containerItemKey${number}` ? K : never]: string;
} & {
    [K in ListenerType as K extends `containerLayoutReady${number}` ? K : never]: boolean;
} & {
    [K in ListenerType as K extends `containerItemData${number}` ? K : never]: any;
} & {
    [K in ListenerType as K extends `containerItemIndex${number}` ? K : never]: number;
} & {
    [K in ListenerType as K extends `containerPosition${number}` ? K : never]: number;
} & {
    [K in ListenerType as K extends `containerColumn${number}` ? K : never]: number;
} & {
    [K in ListenerType as K extends `containerSpan${number}` ? K : never]: number;
} & {
    [K in ListenerType as K extends `containerSticky${number}` ? K : never]: boolean;
};

interface Insets {
    top: number;
    left: number;
    bottom: number;
    right: number;
}
interface LayoutRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface AnchoredEndSpaceReadyInfo {
    anchorIndex: number | undefined;
    anchorKey: string | undefined;
    size: number;
}
interface ScrollToEndOptions {
    animated?: boolean;
    viewOffset?: number;
}
interface AnchoredEndSpaceConfig {
    /** Index of the item whose row should remain anchored when trailing space is added. */
    anchorIndex: number;
    /** Desired distance from the viewport's start edge to the anchored row. */
    anchorOffset?: number;
    /** Optional cap for the anchor item's contribution to its row size. */
    anchorMaxSize?: number;
    /** Called whenever the resolved trailing space changes. */
    onSizeChanged?: (size: number) => void;
    /** Called once the anchor and every row after it have authoritative sizes. */
    onReady?: (info: AnchoredEndSpaceReadyInfo) => void;
}
interface LegendListAverageItemSize {
    average: number;
    count: number;
}
type LegendListState = {
    activeStickyIndex: number;
    contentLength: number;
    data: readonly any[];
    dataKey?: Key;
    elementAtIndex: (index: number) => any;
    end: number;
    endBuffered: number;
    /** Distance to the physical scroll edge, including the trailing inset. */
    distanceFromEnd: number;
    isFollowingEnd: boolean;
    isAtEnd: boolean;
    isAtStart: boolean;
    isNearEnd: boolean;
    isNearStart: boolean;
    isEndReached: boolean;
    isStartReached: boolean;
    isWithinMaintainScrollAtEndThreshold: boolean;
    getAverageItemSizes: () => Record<string, LegendListAverageItemSize>;
    indexByKey: (key: string) => number | undefined;
    listen: {
        <T extends Exclude<LegendListListenerType, "isFollowingEnd">>(listenerType: T, callback: (value: Pick<ListenerTypeValueMap, LegendListListenerType>[T]) => void): () => void;
        <T extends LegendListListenerType>(listenerType: T, callback: (value: Pick<ListenerTypeValueMap, LegendListListenerType>[T]) => void): () => void;
    };
    listenToPosition: (key: string, callback: (value: number) => void) => () => void;
    positionAtIndex: (index: number) => number;
    positionByKey: (key: string) => number | undefined;
    scroll: number;
    scrollLength: number;
    scrollVelocity: number;
    sizeAtIndex: (index: number) => number;
    sizes: Map<string, number>;
    start: number;
    startBuffered: number;
};
type LegendListRef$1 = {
    /** Cancels queued and active scrolling, settles its promise, and stops at the observed offset. */
    cancelScroll(): void;
    /** Scrolls by stable item identity through prepends; resolves without scrolling if the key is missing or removed. */
    scrollToKey(params: {
        key: string;
        animated?: boolean;
        viewOffset?: number;
        viewPosition?: number;
    }): Promise<void>;
    /**
     * Captures an item's key and viewport offset, holding it through layout changes by default.
     * Omit key to use the first visible item; set hold to false to read without side effects.
     * Returns undefined before initial placement, during dataset replacement, or if no item is found.
     * While following at the end, returns the anchor without interrupting end following.
     */
    anchorVisibleContent(options?: {
        key?: string;
        hold?: boolean;
    }): {
        key: string;
        offset: number;
    } | undefined;
    /** Releases waitForInteraction viewability tracking and recalculates the visible items. */
    recordInteraction?(): void;
    /**
     * Clears internal virtualization caches.
     * @param options - Cache clearing options.
     * @param options.mode - `sizes` clears measurement caches. `full` also clears key/position caches.
     * @param options.keys - Clears only these items' measurements, for rows whose size changed while the list
     * could not see it (for example, a row that was selected or expanded while offscreen). Each item keeps its
     * last size as a prediction (`full` drops it back to the estimate) until it is measured again: a mounted
     * item is remeasured right away, and a `scrollToOffset` renders the cleared items before its target so the
     * offset lands on their real sizes. Unknown keys are ignored. Without `keys`, offscreen sizes are refreshed
     * only best-effort.
     */
    clearCaches(options?: {
        mode?: "sizes" | "full";
        keys?: readonly string[];
    }): void;
    /**
     * Displays the scroll indicators momentarily.
     */
    flashScrollIndicators(): void;
    /**
     * Returns the native ScrollView component reference.
     */
    getNativeScrollRef(): any;
    /**
     * Returns the underlying animatable scroll component reference.
     */
    getAnimatableRef(): any;
    /**
     * Returns the scroll responder instance for handling scroll events.
     */
    getScrollableNode(): any;
    /**
     * Returns the ScrollResponderMixin for advanced scroll handling.
     */
    getScrollResponder(): any;
    /**
     * Returns the internal state of the scroll virtualization.
     */
    getState(): LegendListState;
    /**
     * Reports an externally measured content inset. Pass null/undefined to clear.
     * Values are merged on top of props/animated/native insets.
     */
    reportContentInset(inset?: Partial<Insets> | null): void;
    /**
     * Scrolls a specific index into view.
     * @param params - Parameters for scrolling.
     * @param params.animated - If true, animates the scroll. Default: true.
     * @param params.index - The index to scroll to.
     * @param params.itemOffset - Region start measured from the item's start along the scroll axis. Default: 0 when itemLength is provided.
     * @param params.itemLength - Region length along the scroll axis. Default: 0 when itemOffset is provided. Omit both to reveal the whole item.
     * @param params.viewportMargin - Space to keep clear at the start and end of the viewport along the scroll axis.
     * The region should be within the item. A visible region does not scroll; otherwise its nearest edge aligns inside the margins. A region larger than the available space aligns its start.
     */
    scrollIndexIntoView(params: {
        animated?: boolean | undefined;
        index: number;
        itemOffset?: number;
        itemLength?: number;
        viewportMargin?: {
            start?: number;
            end?: number;
        };
    }): Promise<void>;
    /**
     * Scrolls a specific item into view.
     * @param params - Parameters for scrolling.
     * @param params.animated - If true, animates the scroll. Default: true.
     * @param params.item - The item to scroll to.
     * @param params.itemOffset - Region start measured from the item's start along the scroll axis. Default: 0 when itemLength is provided.
     * @param params.itemLength - Region length along the scroll axis. Default: 0 when itemOffset is provided. Omit both to reveal the whole item.
     * @param params.viewportMargin - Space to keep clear at the start and end of the viewport along the scroll axis.
     * The region should be within the item. A visible region does not scroll; otherwise its nearest edge aligns inside the margins. A region larger than the available space aligns its start.
     */
    scrollItemIntoView(params: {
        animated?: boolean | undefined;
        item: any;
        itemOffset?: number;
        itemLength?: number;
        viewportMargin?: {
            start?: number;
            end?: number;
        };
    }): Promise<void>;
    /**
     * Scrolls to the end of the list.
     * @param options - Options for scrolling.
     * @param options.animated - If true, animates the scroll. Default: true.
     * @param options.viewOffset - Offset from the target position.
     */
    scrollToEnd(options?: ScrollToEndOptions): Promise<void>;
    /**
     * Scrolls to a specific index in the list.
     * @param params - Parameters for scrolling.
     * @param params.animated - If true, animates the scroll. Default: true.
     * @param params.index - The index to scroll to.
     * @param params.viewOffset - Offset from the target position.
     * @param params.viewPosition - Position of the item in the viewport (0 to 1).
     */
    scrollToIndex(params: {
        animated?: boolean | undefined;
        index: number;
        viewOffset?: number | undefined;
        viewPosition?: number | undefined;
        /** Alignment used only when the item exceeds the viewport. Omit to preserve viewPosition. */
        viewPositionFallback?: "start" | "end";
    }): Promise<void>;
    /**
     * Scrolls to a specific item in the list.
     * @param params - Parameters for scrolling.
     * @param params.animated - If true, animates the scroll. Default: true.
     * @param params.item - The item to scroll to.
     * @param params.viewOffset - Offset from the target position.
     * @param params.viewPosition - Position of the item in the viewport (0 to 1).
     */
    scrollToItem(params: {
        animated?: boolean | undefined;
        item: any;
        viewOffset?: number | undefined;
        viewPosition?: number | undefined;
        /** Alignment used only when the item exceeds the viewport. Omit to preserve viewPosition. */
        viewPositionFallback?: "start" | "end";
    }): Promise<void>;
    /**
     * Scrolls to a specific offset in pixels.
     * @param params - Parameters for scrolling.
     * @param params.offset - The pixel offset to scroll to.
     * @param params.animated - If true, animates the scroll. Default: true.
     */
    scrollToOffset(params: {
        offset: number;
        animated?: boolean | undefined;
    }): Promise<void>;
    /**
     * Sets a measured item size and recalculates list positions as needed.
     * @param itemKey - The key of the item whose size changed.
     * @param size - The measured item size.
     */
    setItemSize(itemKey: string, size: Pick<LayoutRectangle, "height" | "width">): void;
    /**
     * Sets whether scroll processing is enabled.
     * @param enabled - If true, scroll processing is enabled.
     */
    setScrollProcessingEnabled(enabled: boolean): void;
    /**
     * Sets or adds to the offset of the visible content anchor.
     * @param value - The offset to set or add.
     * @param animated - If true, uses Animated to animate the change.
     */
    setVisibleContentAnchorOffset(value: number | ((val: number) => number)): void;
};

type LegendListRef = Omit<LegendListRef$1, "getAnimatableRef" | "getNativeScrollRef" | "getScrollResponder" | "reportContentInset"> & {
    /** Call cancelScroll() before scrolling it directly so end following and list scrolling stop first. */
    getAnimatableRef(): React.ElementRef<typeof ScrollViewComponent>;
    /** Call cancelScroll() before scrolling it directly so end following and list scrolling stop first. */
    getNativeScrollRef(): React.ElementRef<typeof ScrollViewComponent>;
    getScrollResponder(): ScrollResponderMixin;
    reportContentInset(inset?: Partial<Insets$1> | null): void;
};

type KeyboardChatScrollViewPropsUnique = Omit<KeyboardChatScrollViewProps, keyof ScrollViewProps | "inverted" | "ScrollViewComponent" | "blankSpace" | "extraContentPadding" | "onContentInsetChange" | "offset">;
type KeyboardAwareLegendListPropsOverrides<Props> = Omit<Props, "anchoredEndSpace" | "contentInsetEndAdjustment" | "renderScrollComponent"> & KeyboardChatScrollViewPropsUnique & {
    anchoredEndSpace?: AnchoredEndSpaceConfig;
    contentInsetEndAdjustment?: SharedValue<number>;
    keyboardOffset?: number;
};
type KeyboardAwareLegendListProps<ItemT> = KeyboardAwareLegendListPropsOverrides<AnimatedLegendListProps<ItemT>>;
type KeyboardAwareLegendListDataSourceProps<ItemT> = KeyboardAwareLegendListPropsOverrides<AnimatedLegendListDataSourceProps<ItemT>>;
type ScrollMessageToEndOptions = {
    animated: boolean;
    closeKeyboard: boolean;
};
type KeyboardScrollToEndListRef = {
    current: {
        scrollToEnd: LegendListRef["scrollToEnd"];
    } | null;
};
type UseKeyboardScrollToEndOptions = {
    freeze?: SharedValue<boolean>;
    listRef: KeyboardScrollToEndListRef;
};
type KeyboardChatComposerInsetListRef = {
    current: Pick<LegendListRef, "reportContentInset"> | null;
};
type KeyboardChatComposerRef = {
    current: Pick<View, "measure"> | null;
};
declare function useKeyboardChatComposerInset(_listRef: KeyboardChatComposerInsetListRef, composerRef: KeyboardChatComposerRef, initialHeight?: number): {
    contentInsetEndAdjustment: SharedValue<number>;
    onComposerLayout: (event: LayoutChangeEvent) => void;
};
declare function useKeyboardScrollToEnd({ freeze: freezeProp, listRef }: UseKeyboardScrollToEndOptions): {
    freeze: SharedValue<boolean>;
    scrollMessageToEnd: ({ animated, closeKeyboard }: ScrollMessageToEndOptions) => Promise<void>;
};
declare const KeyboardAwareLegendList: {
    <ItemT>(props: KeyboardAwareLegendListDataSourceProps<ItemT> & React.RefAttributes<LegendListRef>): React.ReactElement | null;
    <ItemT>(props: KeyboardAwareLegendListProps<ItemT> & React.RefAttributes<LegendListRef>): React.ReactElement | null;
};

export { KeyboardAwareLegendList, useKeyboardChatComposerInset, useKeyboardScrollToEnd };
