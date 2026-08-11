import * as React from 'react';
import { ScrollViewComponent, ScrollResponderMixin, Insets as Insets$1 } from 'react-native';
import { ScrollEvent, ScrollHandlerProcessed } from 'react-native-reanimated';
import { AnimatedLegendListProps } from '@legendapp/list/reanimated';

interface MaintainVisibleContentPositionNormalized<ItemT = any> {
    data: boolean;
    size: boolean;
    shouldRestorePosition?: (item: ItemT, index: number, data: readonly ItemT[]) => boolean;
}

type ListenerType = "activeStickyIndex" | "alignItemsAtEndPadding" | "anchoredEndSpaceSize" | "containerLayoutEpoch" | "debugComputedScroll" | "debugRawScroll" | "extraData" | "footerSize" | "headerSize" | "lastItemKeys" | "lastPositionUpdate" | "maintainVisibleContentPosition" | "numColumns" | "numContainers" | "numContainersPooled" | "otherAxisSize" | "readyToRender" | "scrollAdjust" | "scrollAdjustPending" | "scrollAdjustUserOffset" | "scrollSize" | "snapToOffsets" | "stylePaddingTop" | "totalSize" | "isAtEnd" | "isAtStart" | "isNearEnd" | "isNearStart" | "isWithinMaintainScrollAtEndThreshold" | "adaptiveRender" | `containerColumn${number}` | `containerDataVersion${number}` | `containerSpan${number}` | `containerItemData${number}` | `containerItemIndex${number}` | `containerItemKey${number}` | `containerPosition${number}` | `containerSticky${number}`;
type LegendListListenerType = Extract<ListenerType, "activeStickyIndex" | "anchoredEndSpaceSize" | "footerSize" | "headerSize" | "isAtEnd" | "isAtStart" | "isNearEnd" | "isNearStart" | "isWithinMaintainScrollAtEndThreshold" | "adaptiveRender" | "lastItemKeys" | "lastPositionUpdate" | "numContainers" | "numContainersPooled" | "otherAxisSize" | "readyToRender" | "snapToOffsets" | "totalSize">;
type ListenerTypeValueMap = {
    activeStickyIndex: number;
    alignItemsAtEndPadding: number;
    anchoredEndSpaceSize: number;
    containerLayoutEpoch: number;
    animatedScrollY: any;
    debugComputedScroll: number;
    debugRawScroll: number;
    extraData: any;
    footerSize: number;
    headerSize: number;
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
    scrollAdjust: number;
    scrollAdjustPending: number;
    scrollAdjustUserOffset: number;
    scrollSize: {
        width: number;
        height: number;
    };
    snapToOffsets: number[];
    stylePaddingTop: number;
    totalSize: number;
    adaptiveRender: "normal" | "light";
} & {
    [K in ListenerType as K extends `containerDataVersion${number}` ? K : never]: number;
} & {
    [K in ListenerType as K extends `containerItemKey${number}` ? K : never]: string;
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
interface ScrollToEndOptions {
    animated?: boolean;
    viewOffset?: number;
}
interface LegendListAverageItemSize {
    average: number;
    count: number;
}
type LegendListState = {
    activeStickyIndex: number;
    contentLength: number;
    data: readonly any[];
    elementAtIndex: (index: number) => any;
    end: number;
    endBuffered: number;
    isAtEnd: boolean;
    isAtStart: boolean;
    isNearEnd: boolean;
    isNearStart: boolean;
    isEndReached: boolean;
    isStartReached: boolean;
    isWithinMaintainScrollAtEndThreshold: boolean;
    getAverageItemSizes: () => Record<string, LegendListAverageItemSize>;
    indexByKey: (key: string) => number | undefined;
    listen: <T extends LegendListListenerType>(listenerType: T, callback: (value: ListenerTypeValueMap[T]) => void) => () => void;
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
interface LegendListKnownSizeEntry {
    index: number;
    /** Scroll-axis item size, excluding the list gap. */
    size: number;
}
type LegendListRef$1 = {
    /**
     * Clears internal virtualization caches.
     * @param options - Cache clearing options.
     * @param options.mode - `sizes` clears measurement caches. `full` also clears key/position caches.
     */
    clearCaches(options?: {
        mode?: "sizes" | "full";
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
     * Atomically replaces the complete authoritative set of item-size exceptions.
     * Omitted indexes use the currently configured estimated item size.
     * Passing an empty array declares that every item uses the configured estimate.
     * Entries must have strictly increasing, unique indexes. Invalid input is ignored and logged in development.
     */
    replaceKnownSizeEntries(entries: readonly LegendListKnownSizeEntry[]): void;
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
     */
    scrollIndexIntoView(params: {
        animated?: boolean | undefined;
        index: number;
    }): Promise<void>;
    /**
     * Scrolls a specific index into view.
     * @param params - Parameters for scrolling.
     * @param params.animated - If true, animates the scroll. Default: true.
     * @param params.item - The item to scroll to.
     */
    scrollItemIntoView(params: {
        animated?: boolean | undefined;
        item: any;
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
    getAnimatableRef(): React.ElementRef<typeof ScrollViewComponent>;
    getNativeScrollRef(): React.ElementRef<typeof ScrollViewComponent>;
    getScrollResponder(): ScrollResponderMixin;
    reportContentInset(inset?: Partial<Insets$1> | null): void;
};

type KeyboardOnScrollCallback = (event: ScrollEvent) => void;
type KeyboardOnScrollHandler = KeyboardOnScrollCallback | ScrollHandlerProcessed<Record<string, unknown>>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type KeyboardControllerLegendListProps<ItemT> = DistributiveOmit<AnimatedLegendListProps<ItemT>, "onScroll" | "contentInset" | "automaticallyAdjustContentInsets"> & {
    onScroll?: KeyboardOnScrollHandler;
    contentInset?: Insets$1 | undefined;
    safeAreaInsetBottom?: number;
};
declare const KeyboardAvoidingLegendList: <ItemT>(props: KeyboardControllerLegendListProps<ItemT> & React.RefAttributes<LegendListRef>) => React.ReactElement | null;

export { KeyboardAvoidingLegendList };
