/* sparse-k14-390r-32c462af */
import * as React2 from 'react';
import { useReducer, useEffect, createContext, useRef, useMemo, useCallback, useLayoutEffect, useImperativeHandle, useState, useContext } from 'react';
import * as ReactNative from 'react-native';
import { Animated, Platform as Platform$1, View as View$1, Text as Text$1, PixelRatio as PixelRatio$1, StyleSheet as StyleSheet$1, RefreshControl, AccessibilityInfo, I18nManager, Dimensions } from 'react-native';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

// src/components/LegendList.tsx
Animated.View;
var View = View$1;
var Text = Text$1;

// src/core/IndexedData.ts
var ArrayDataAdapter = class {
  constructor(data, keyExtractor) {
    this.data = data;
    this.keyExtractor = keyExtractor;
    this.kind = "array";
  }
  getItem(index) {
    return index >= 0 && index < this.data.length ? this.data[index] : void 0;
  }
  getKey(index) {
    return this.keyExtractor ? this.keyExtractor(this.data[index], index) : index;
  }
  getLegacyData() {
    return this.data;
  }
  getLength() {
    return this.data.length;
  }
  matches(data, keyExtractor) {
    return this.data === data && this.keyExtractor === keyExtractor;
  }
};
var DataSourceAdapter = class {
  constructor(source) {
    this.source = source;
    this.kind = "dataSource";
  }
  getItem(index) {
    return index >= 0 && index < this.source.getLength() ? this.source.getItem(index) : void 0;
  }
  getKey(index) {
    return this.source.getKey(index);
  }
  getLegacyData() {
    return void 0;
  }
  getLength() {
    return this.source.getLength();
  }
};
function resolveIndexedData(indexedData, data, dataSource, keyExtractor) {
  if (dataSource) {
    return indexedData instanceof DataSourceAdapter && indexedData.source === dataSource ? indexedData : new DataSourceAdapter(dataSource);
  }
  return indexedData instanceof ArrayDataAdapter && indexedData.matches(data, keyExtractor) ? indexedData : new ArrayDataAdapter(data, keyExtractor);
}
var EMPTY_DATA = [];
function getIndexedData(state) {
  const { data, dataSource, keyExtractor } = state.props;
  if (state.indexedData && data === void 0 && dataSource === void 0) {
    return state.indexedData;
  }
  state.indexedData = resolveIndexedData(state.indexedData, data != null ? data : EMPTY_DATA, dataSource, keyExtractor);
  return state.indexedData;
}
function getDataItem(state, index) {
  return getIndexedData(state).getItem(index);
}
function getDataKey(state, index) {
  return getIndexedData(state).getKey(index);
}
function getDataLength(state) {
  return getIndexedData(state).getLength();
}
function getLegacyData(state) {
  return getIndexedData(state).getLegacyData();
}
var Platform = Platform$1;
var PlatformAdjustBreaksScroll = Platform.OS === "android" || Platform.OS === "macos";

// src/utils/rtl.ts
function clampHorizontalOffset(offset, maxOffset) {
  if (maxOffset === void 0) {
    return offset;
  }
  return Math.max(0, Math.min(maxOffset, offset));
}
function getHorizontalMaxOffset(state, contentWidth) {
  if (contentWidth === void 0 || !Number.isFinite(contentWidth) || !Number.isFinite(state.scrollLength)) {
    return void 0;
  }
  return Math.max(0, contentWidth - state.scrollLength);
}
var webScrollTypes = /* @__PURE__ */ new WeakMap();
function getNativeHorizontalRTLScrollType(state) {
  var _a3, _b, _c, _d;
  if (Platform.OS === "web") {
    const owner = (_c = (_b = (_a3 = state == null ? void 0 : state.refScroller) == null ? void 0 : _a3.current) == null ? void 0 : _b.getScrollableNode) == null ? void 0 : _c.call(_b);
    if (owner && typeof getComputedStyle === "function") {
      let mode = webScrollTypes.get(owner);
      if (!mode) {
        mode = getComputedStyle(owner).direction === "ltr" ? "normal" : "negative";
        webScrollTypes.set(owner, mode);
      }
      return mode;
    }
  }
  return (_d = state == null ? void 0 : state.horizontalRTLScrollType) != null ? _d : Platform.OS === "web" ? "negative" : "inverted";
}
function invalidateHorizontalRTLScrollType(state) {
  var _a3, _b, _c;
  if (Platform.OS === "web" && isHorizontalRTL(state)) {
    const owner = (_c = (_b = (_a3 = state.refScroller) == null ? void 0 : _a3.current) == null ? void 0 : _b.getScrollableNode) == null ? void 0 : _c.call(_b);
    if (owner) webScrollTypes.delete(owner);
  }
}
function isHorizontalRTL(state) {
  return isHorizontalRTLProps(state == null ? void 0 : state.props);
}
function isHorizontalRTLProps(props) {
  var _a3;
  return !!(props == null ? void 0 : props.horizontal) && ((_a3 = props.rtl) != null ? _a3 : !!I18nManager.isRTL);
}
function getStylePaddingEnd(props) {
  if (!(props == null ? void 0 : props.horizontal)) {
    return (props == null ? void 0 : props.stylePaddingBottom) || 0;
  }
  return (isHorizontalRTLProps(props) ? props.stylePaddingLeft : props.stylePaddingRight) || 0;
}
function getHorizontalInsetEnd(state, inset) {
  if (!inset) {
    return 0;
  }
  return (isHorizontalRTL(state) ? inset.left : inset.right) || 0;
}
function toPhysicalHorizontalItemPosition(state, logicalPosition, itemSize, listSize) {
  if (!isHorizontalRTL(state) || listSize === void 0 || !Number.isFinite(listSize)) {
    return logicalPosition;
  }
  if (Platform.OS === "web" && getNativeHorizontalRTLScrollType(state) === "normal") return logicalPosition;
  return Math.max(0, listSize - logicalPosition - itemSize);
}
function toNativeHorizontalOffset(state, logicalOffset, contentWidth) {
  if (!state || !isHorizontalRTL(state)) {
    return logicalOffset;
  }
  const maxOffset = getHorizontalMaxOffset(state, contentWidth);
  const clampedLogicalOffset = clampHorizontalOffset(logicalOffset, maxOffset);
  const mode = getNativeHorizontalRTLScrollType(state);
  if (mode === "negative") {
    return clampedLogicalOffset === 0 ? 0 : -clampedLogicalOffset;
  }
  if (mode === "inverted") {
    if (maxOffset === void 0) {
      return clampedLogicalOffset;
    }
    return clampHorizontalOffset(maxOffset - clampedLogicalOffset, maxOffset);
  }
  return clampedLogicalOffset;
}
function peekLogicalHorizontalOffset(state, rawOffset, maxOffset) {
  if (!isHorizontalRTL(state)) {
    return rawOffset;
  }
  let mode = getNativeHorizontalRTLScrollType(state);
  if (rawOffset < 0 && (Platform.OS !== "web" || mode !== "normal")) {
    mode = "negative";
  }
  if (mode === "negative") {
    return clampHorizontalOffset(-rawOffset, maxOffset);
  }
  if (mode === "inverted" && maxOffset !== void 0) {
    return clampHorizontalOffset(maxOffset - rawOffset, maxOffset);
  }
  return clampHorizontalOffset(rawOffset, maxOffset);
}
function toLogicalHorizontalOffset(state, rawOffset, contentWidth) {
  if (!isHorizontalRTL(state)) {
    state.horizontalRTLScrollType = void 0;
    return rawOffset;
  }
  const maxOffset = getHorizontalMaxOffset(state, contentWidth);
  const mode = getNativeHorizontalRTLScrollType(state);
  if (Platform.OS === "web" && mode === "normal") {
    state.horizontalRTLScrollType = "normal";
    return clampHorizontalOffset(rawOffset, maxOffset);
  }
  if (rawOffset < 0 || mode === "negative") {
    state.horizontalRTLScrollType = "negative";
    return clampHorizontalOffset(-rawOffset, maxOffset);
  }
  if (maxOffset === void 0) {
    return rawOffset;
  }
  const normalOffset = rawOffset;
  const invertedOffset = maxOffset - rawOffset;
  if (!Number.isFinite(invertedOffset)) {
    state.horizontalRTLScrollType = "normal";
    return normalOffset;
  }
  const previousMode = state.horizontalRTLScrollType;
  if (previousMode === "inverted") {
    return clampHorizontalOffset(invertedOffset, maxOffset);
  }
  if (previousMode === "normal") {
    return clampHorizontalOffset(normalOffset, maxOffset);
  }
  if (!state.hasScrolled) {
    state.horizontalRTLScrollType = "inverted";
    return clampHorizontalOffset(invertedOffset, maxOffset);
  }
  const referenceScroll = state.scroll;
  const distanceNormal = Math.abs(normalOffset - referenceScroll);
  const distanceInverted = Math.abs(invertedOffset - referenceScroll);
  const useInverted = distanceInverted + 0.5 < distanceNormal;
  state.horizontalRTLScrollType = useInverted ? "inverted" : "normal";
  return clampHorizontalOffset(useInverted ? invertedOffset : normalOffset, maxOffset);
}
var createAnimatedValue = (value) => new Animated.Value(value);

// src/state/state.tsx
var ContextState = React2.createContext(null);
var RenderLayoutContext = React2.createContext(void 0);
var snapshotListeners = /* @__PURE__ */ new WeakSet();
function useRenderLayout(ctx) {
  const layout = React2.useContext(RenderLayoutContext);
  return (layout == null ? void 0 : layout.ctx) === ctx ? layout : void 0;
}
function useRenderStateContext(ctx) {
  var _a3, _b;
  return (_b = (_a3 = useRenderLayout(ctx)) == null ? void 0 : _a3.snapshot) != null ? _b : ctx;
}
function markLayoutChanged(ctx) {
  var _a3;
  ctx.layoutRevision = ((_a3 = ctx.layoutRevision) != null ? _a3 : 0) + 1;
}
function afterLayout(ctx, effect) {
  if (ctx.layoutEffects) ctx.layoutEffects.push(effect);
  else effect(ctx);
}
function notifyLayoutSignals(ctx, previousValues) {
  for (const [name, value] of ctx.values) {
    if (previousValues.get(name) === value) continue;
    const listeners = ctx.listeners.get(name);
    if (listeners) {
      for (const listener of listeners) {
        if (!snapshotListeners.has(listener)) listener(value);
      }
    }
  }
}
var SIGNAL_NAMES_SEPARATOR = "\0";
var contextNum = 0;
function StateProvider({ children }) {
  const [value] = React2.useState(() => ({
    animatedScrollY: createAnimatedValue(0),
    columnWrapperStyle: void 0,
    containerLayoutTriggers: /* @__PURE__ */ new Map(),
    contextNum: contextNum++,
    listeners: /* @__PURE__ */ new Map(),
    mapViewabilityAmountCallbacks: /* @__PURE__ */ new Map(),
    mapViewabilityAmountValues: /* @__PURE__ */ new Map(),
    mapViewabilityCallbacks: /* @__PURE__ */ new Map(),
    mapViewabilityConfigStates: /* @__PURE__ */ new Map(),
    mapViewabilityValues: /* @__PURE__ */ new Map(),
    pendingContainerIds: void 0,
    positionListeners: /* @__PURE__ */ new Map(),
    scrollAxisGap: 0,
    state: void 0,
    values: /* @__PURE__ */ new Map([
      ["alignItemsAtEndPadding", 0],
      ["containerLayoutEpoch", 0],
      ["stylePaddingTop", 0],
      ["headerSize", 0],
      ["numContainers", 0],
      ["activeStickyIndex", -1],
      ["isAtEnd", false],
      ["isAtStart", false],
      ["isNearEnd", false],
      ["isNearStart", false],
      ["isWithinMaintainScrollAtEndThreshold", false],
      ["adaptiveRender", "normal"],
      ["totalSize", 0],
      ["scrollAdjustPending", 0]
    ]),
    viewRefs: /* @__PURE__ */ new Map()
  }));
  return /* @__PURE__ */ React2.createElement(ContextState.Provider, { value }, children);
}
function useStateContext() {
  return React2.useContext(ContextState);
}
function createSelectorFunctionsArr(ctx, signalNames, layout) {
  if (!ctx) {
    const emptyValues = [];
    return {
      get: () => emptyValues,
      subscribe: () => () => {
      }
    };
  }
  let lastValues = [];
  let lastSignalValues = [];
  return {
    get: () => {
      var _a3;
      const values = (_a3 = layout == null ? void 0 : layout.snapshot) != null ? _a3 : ctx;
      const currentValues = [];
      let hasChanged = false;
      for (let i = 0; i < signalNames.length; i++) {
        const value = peek$(values, signalNames[i]);
        currentValues.push(value);
        if (value !== lastSignalValues[i]) {
          hasChanged = true;
        }
      }
      lastSignalValues = currentValues;
      if (hasChanged) {
        lastValues = currentValues;
      }
      return lastValues;
    },
    subscribe: (cb) => {
      const listeners = [];
      for (const signalName of signalNames) {
        listeners.push(listen$(ctx, signalName, cb, true));
      }
      return () => {
        for (const listener of listeners) {
          listener();
        }
      };
    }
  };
}
function getSignalNamesKey(signalNames) {
  return signalNames.length === 1 ? signalNames[0] : signalNames.join(SIGNAL_NAMES_SEPARATOR);
}
function getSignalNamesFromKey(signalNamesKey) {
  return signalNamesKey.split(SIGNAL_NAMES_SEPARATOR);
}
function listen$(ctx, signalName, cb, readsRenderLayout = false) {
  if (readsRenderLayout) snapshotListeners.add(cb);
  const { listeners } = ctx;
  let setListeners = listeners.get(signalName);
  if (!setListeners) {
    setListeners = /* @__PURE__ */ new Set();
    listeners.set(signalName, setListeners);
  }
  setListeners.add(cb);
  return () => setListeners.delete(cb);
}
function peek$(ctx, signalName) {
  const { values } = ctx;
  return values.get(signalName);
}
function set$(ctx, signalName, value) {
  const { listeners, values } = ctx;
  if (values.get(signalName) !== value) {
    values.set(signalName, value);
    markLayoutChanged(ctx);
    const setListeners = listeners.get(signalName);
    if (setListeners) {
      for (const listener of setListeners) {
        listener(value);
      }
    }
  }
}
function listenPosition$(ctx, key, cb) {
  const { positionListeners } = ctx;
  let setListeners = positionListeners.get(key);
  if (!setListeners) {
    setListeners = /* @__PURE__ */ new Set();
    positionListeners.set(key, setListeners);
  }
  setListeners.add(cb);
  return () => setListeners.delete(cb);
}
function notifyPosition$(ctx, key, value) {
  const { positionListeners } = ctx;
  const setListeners = positionListeners.get(key);
  if (setListeners) {
    afterLayout(ctx, () => {
      for (const listener of setListeners) listener(value);
    });
  }
}
function useArr$(signalNames) {
  const ctx = React2.useContext(ContextState);
  const layout = useRenderLayout(ctx);
  const signalNamesKey = getSignalNamesKey(signalNames);
  const { subscribe, get } = React2.useMemo(
    () => createSelectorFunctionsArr(ctx, getSignalNamesFromKey(signalNamesKey), layout),
    [ctx, signalNamesKey, layout]
  );
  const value = useSyncExternalStore(subscribe, get, get);
  return value;
}
function useSelector$(signalName, selector) {
  const ctx = React2.useContext(ContextState);
  const layout = useRenderLayout(ctx);
  const { subscribe, get } = React2.useMemo(
    () => createSelectorFunctionsArr(ctx, [signalName], layout),
    [ctx, signalName, layout]
  );
  const getSelectedValue = React2.useCallback(() => selector(get()[0]), [get, selector]);
  const value = useSyncExternalStore(subscribe, getSelectedValue, getSelectedValue);
  return value;
}

// src/state/getContentInsetEnd.ts
function getContentInsetEndAdjustmentEnd(adjustment) {
  return Math.max(0, adjustment != null ? adjustment : 0);
}
function getContentInsetEnd(ctx, contentInsetEndAdjustmentOverride) {
  var _a3;
  const state = ctx.state;
  const { props } = state;
  const horizontal = props.horizontal;
  const contentInset = Platform.OS === "ios" ? props.contentInset : void 0;
  const baseInset = contentInset != null ? contentInset : state.nativeContentInset;
  const contentInsetEndAdjustment = getContentInsetEndAdjustmentEnd(
    contentInsetEndAdjustmentOverride != null ? contentInsetEndAdjustmentOverride : props.contentInsetEndAdjustment
  );
  const anchoredEndSpaceSize = peek$(ctx, "anchoredEndSpaceSize");
  const anchoredEndInset = props.anchoredEndSpace && anchoredEndSpaceSize ? anchoredEndSpaceSize : 0;
  const overrideInset = (_a3 = state.contentInsetOverride) != null ? _a3 : void 0;
  const mergedInset = overrideInset ? { bottom: 0, left: 0, right: 0, ...baseInset, ...overrideInset } : baseInset;
  const endInset = ((horizontal ? getHorizontalInsetEnd(state, mergedInset) : mergedInset == null ? void 0 : mergedInset.bottom) || 0) + contentInsetEndAdjustment;
  return Platform.OS !== "web" && props.anchoredEndSpaceOwner === "list" && !isHorizontalRTL(state) ? endInset + anchoredEndInset : Math.max(endInset, anchoredEndInset);
}

// src/state/getContentSize.ts
function getContentSize(ctx, includeContentContainerMinSize = true) {
  var _a3, _b, _c;
  const { values, state } = ctx;
  const stylePaddingStart = state.props.horizontal ? state.props.stylePaddingLeft || 0 : values.get("stylePaddingTop") || 0;
  const stylePaddingEnd = state.props.horizontal ? state.props.stylePaddingRight || 0 : state.props.stylePaddingBottom || 0;
  const alignItemsAtEndPadding = values.get("alignItemsAtEndPadding") || 0;
  const headerSize = values.get("headerSize") || 0;
  const footerSize = values.get("footerSize") || 0;
  const contentInsetEnd = getContentInsetEnd(ctx);
  const totalSize = (_b = (_a3 = state.pendingTotalSize) != null ? _a3 : state.totalSize) != null ? _b : values.get("totalSize");
  const layoutSize = Math.max(0, totalSize - (getDataLength(state) > 0 ? ctx.scrollAxisGap : 0));
  const contentSize = headerSize + footerSize + layoutSize + stylePaddingStart + alignItemsAtEndPadding + stylePaddingEnd;
  const inContentInset = Platform.OS === "web" || isHorizontalRTL(state) ? contentInsetEnd : state.props.anchoredEndSpace && state.props.anchoredEndSpaceOwner === "list" ? values.get("anchoredEndSpaceSize") || 0 : 0;
  const containerSize = contentSize + inContentInset;
  return (includeContentContainerMinSize ? Math.max(containerSize, (_c = state.props.contentContainerMinSize) != null ? _c : 0) : containerSize) + contentInsetEnd - inContentInset;
}

// src/components/DebugView.tsx
var DebugRow = ({ children }) => {
  return /* @__PURE__ */ React2.createElement(View, { style: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" } }, children);
};
React2.memo(function DebugView2() {
  const ctx = useStateContext();
  const [
    totalSize = 0,
    scrollAdjust = 0,
    rawScroll = 0,
    scroll = 0,
    _numContainers = 0,
    _numContainersPooled = 0,
    isAtEnd = false
  ] = useArr$([
    "totalSize",
    "scrollAdjust",
    "debugRawScroll",
    "debugComputedScroll",
    "numContainers",
    "numContainersPooled",
    "isAtEnd"
  ]);
  const contentSize = getContentSize(ctx);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  useInterval(() => {
    forceUpdate();
  }, 100);
  return /* @__PURE__ */ React2.createElement(
    View,
    {
      pointerEvents: "none",
      style: {
        // height: 100,
        backgroundColor: "#FFFFFFCC",
        borderRadius: 4,
        padding: 4,
        paddingBottom: 4,
        paddingLeft: 4,
        position: "absolute",
        right: 0,
        top: 0
      }
    },
    /* @__PURE__ */ React2.createElement(DebugRow, null, /* @__PURE__ */ React2.createElement(Text, null, "TotalSize:"), /* @__PURE__ */ React2.createElement(Text, null, totalSize.toFixed(2))),
    /* @__PURE__ */ React2.createElement(DebugRow, null, /* @__PURE__ */ React2.createElement(Text, null, "ContentSize:"), /* @__PURE__ */ React2.createElement(Text, null, contentSize.toFixed(2))),
    /* @__PURE__ */ React2.createElement(DebugRow, null, /* @__PURE__ */ React2.createElement(Text, null, "At end:"), /* @__PURE__ */ React2.createElement(Text, null, String(isAtEnd))),
    /* @__PURE__ */ React2.createElement(DebugRow, null, /* @__PURE__ */ React2.createElement(Text, null, "ScrollAdjust:"), /* @__PURE__ */ React2.createElement(Text, null, scrollAdjust.toFixed(2))),
    /* @__PURE__ */ React2.createElement(DebugRow, null, /* @__PURE__ */ React2.createElement(Text, null, "RawScroll: "), /* @__PURE__ */ React2.createElement(Text, null, rawScroll.toFixed(2))),
    /* @__PURE__ */ React2.createElement(DebugRow, null, /* @__PURE__ */ React2.createElement(Text, null, "ComputedScroll: "), /* @__PURE__ */ React2.createElement(Text, null, scroll.toFixed(2)))
  );
});
function useInterval(callback, delay) {
  useEffect(() => {
    const interval = setInterval(callback, delay);
    return () => clearInterval(interval);
  }, [delay]);
}

// src/constants-platform.native.ts
var f = global.nativeFabricUIManager;
var IsNewArchitecture = f !== void 0 && f != null;

// src/utils/getId.ts
function getId(state, index) {
  if (!state.props.dataSource && !state.props.data) {
    return "";
  }
  if (!(index < getDataLength(state))) return null;
  const id = getDataKey(state, index);
  state.idCache[index] = id;
  return id;
}

// src/core/containerItemMetadata.ts
function createContainerItemMetadata(state, itemIndex, itemData, itemType) {
  return {
    data: state.props.data,
    dataChangeEpoch: state.dataChangeEpoch,
    dataSource: state.props.dataSource,
    getFixedItemSize: state.props.getFixedItemSize,
    getItemType: state.props.getItemType,
    itemData,
    itemIndex,
    itemType
  };
}
function updateContainerItemMetadata(state, containerId, itemIndex, itemData, itemType) {
  var _a3;
  const { getItemType } = state.props;
  const previousMetadata = state.containerItemMetadata.get(containerId);
  if ((previousMetadata == null ? void 0 : previousMetadata.dataChangeEpoch) === state.dataChangeEpoch && previousMetadata.getItemType === getItemType && previousMetadata.itemData === itemData && previousMetadata.itemIndex === itemIndex) {
    return previousMetadata;
  }
  const resolvedItemType = itemData !== void 0 && getItemType ? (_a3 = getItemType(itemData, itemIndex)) != null ? _a3 : "" : void 0;
  const metadata = createContainerItemMetadata(state, itemIndex, itemData, resolvedItemType);
  state.containerItemMetadata.set(containerId, metadata);
  return metadata;
}
function resolveContainerItemMetadata(state, containerId, itemIndex, itemData) {
  var _a3;
  const { getFixedItemSize } = state.props;
  const metadata = updateContainerItemMetadata(state, containerId, itemIndex, itemData);
  if (metadata.getFixedItemSize !== getFixedItemSize) {
    metadata.didResolveFixedItemSize = false;
    metadata.fixedItemSize = void 0;
    metadata.getFixedItemSize = getFixedItemSize;
  }
  if (itemData !== void 0 && getFixedItemSize && !metadata.didResolveFixedItemSize) {
    metadata.fixedItemSize = getFixedItemSize(itemData, itemIndex, (_a3 = metadata.itemType) != null ? _a3 : "");
    metadata.didResolveFixedItemSize = true;
  }
  return metadata;
}
function invalidateFixedItemSizes(state) {
  var _a3, _b, _c;
  for (const key of (_a3 = state.fixedItemSizeKeys) != null ? _a3 : []) {
    state.sizesKnown.delete(key);
  }
  (_b = state.fixedItemSizeKeys) == null ? void 0 : _b.clear();
  const { data, getFixedItemSize, getItemType } = state.props;
  if (getFixedItemSize) {
    const indices = state.props.dataSource ? state.indexByKey.values() : data.keys();
    for (const index of indices) {
      const key = getId(state, index);
      const item = getDataItem(state, index);
      if (state.sizesKnown.has(key) && item !== void 0 && getFixedItemSize(item, index, getItemType ? (_c = getItemType(item, index)) != null ? _c : "" : "") !== void 0) {
        state.sizesKnown.delete(key);
      }
    }
  }
  for (const metadata of state.containerItemMetadata.values()) {
    metadata.didResolveFixedItemSize = false;
    metadata.fixedItemSize = void 0;
  }
}
function invalidateContainerMeasurements(state) {
  var _a3;
  for (let id = 0; id < state.containerItemGenerations.length; id++) {
    state.containerItemGenerations[id] = ((_a3 = state.containerItemGenerations[id]) != null ? _a3 : 0) + 1;
  }
  state.containerItemMetadata.clear();
}
function getTraceListener() {
  const globalListener = globalThis.__LEGEND_LIST_SCROLL_OWNER_TRACE__;
  return typeof globalListener === "function" ? globalListener : void 0;
}
function isItemSizeSource(source) {
  return source === "item-size" || source === "stale-size";
}
function isAbsoluteOffsetTarget(target) {
  return !!target && target.index === void 0 && !target.isScrollToEnd && target.kind !== "end";
}
function isHeldByCommand(state) {
  return isAbsoluteOffsetTarget(state.scrollingTo);
}
function isSupersededByCommand(state, issuedEpoch) {
  return issuedEpoch !== getScrollOwnerEpoch(state) && !!state.scrollingTo;
}
function getScrollOwnerKind(state) {
  const target = state.scrollingTo;
  if (target) {
    if (target.isInitialScroll) return "bootstrap";
    if (state.maintainingScrollAtEnd && (target.isScrollToEnd || target.kind === "end")) return "follow-end";
    return "command";
  }
  if (state.maintainingScrollAtEnd) return "follow-end";
  if (isUserGestureActive(state)) return "user";
  if (state.initialScrollAnchor) return "bootstrap";
  return "idle";
}
function isUserGestureActive(state) {
  return !!state.isDragging || !!state.isMomentumScrolling;
}
function getScrollOwnerEpoch(state) {
  var _a3;
  return (_a3 = state.scrollOwnerEpoch) != null ? _a3 : 0;
}
function setScrollOwnerTarget(state, target) {
  if (state.scrollingTo === target && state.scrollOwnerTarget === target) return;
  state.scrollingTo = target;
  state.scrollOwnerTarget = target;
  state.scrollOwnerEpoch = getScrollOwnerEpoch(state) + 1;
  if (!target) notifyScrollIdle(state);
}
function notifyScrollIdle(state) {
  var _a3;
  (_a3 = state.onScrollIdle) == null ? void 0 : _a3.call(state);
}
function claimInstantAbsoluteWrite(state, source, offset, content, issuedEpoch) {
  const adjust = state.scrollAdjustHandler.getAdjust();
  const length = state.scrollLength;
  const previous = state.scrollOwnerTaskWrite;
  if (previous && Math.abs(previous.offset - offset) < 0.01 && previous.content === content && previous.length === length && previous.adjust === adjust) {
    recordScrollWrite(state, source, "dropped", offset, issuedEpoch);
    return false;
  }
  if (!previous) {
    queueMicrotask(() => {
      state.scrollOwnerTaskWrite = void 0;
    });
  }
  state.scrollOwnerTaskWrite = { adjust, content, length, offset };
  return true;
}
function setFollowEndOwner(state, value) {
  if (!state.maintainingScrollAtEnd !== !value) state.scrollOwnerEpoch = getScrollOwnerEpoch(state) + 1;
  const ended = !!state.maintainingScrollAtEnd && !value;
  state.maintainingScrollAtEnd = value;
  if (ended) notifyScrollIdle(state);
}
function recordScrollWrite(state, source, mode, value, issuedEpoch) {
  const listener = getTraceListener();
  if (!listener) return;
  const epoch = getScrollOwnerEpoch(state);
  const owner = getScrollOwnerKind(state);
  listener(
    {
      epoch,
      heldByCommand: mode !== "absolute" && isHeldByCommand(state),
      issuedEpoch: issuedEpoch != null ? issuedEpoch : epoch,
      mode,
      owner,
      source,
      stale: issuedEpoch !== void 0 && issuedEpoch !== epoch,
      unownedTransition: state.scrollingTo !== state.scrollOwnerTarget,
      value
    },
    state
  );
}

// src/utils/devEnvironment.ts
var metroDev = typeof __DEV__ !== "undefined" ? __DEV__ : void 0;
var _a;
var envMode = typeof process !== "undefined" && typeof process.env === "object" && process.env ? (_a = process.env.NODE_ENV) != null ? _a : process.env.MODE : void 0;
var processDev = typeof envMode === "string" ? envMode.toLowerCase() !== "production" : void 0;
var _a2;
var IS_DEV = (_a2 = processDev != null ? processDev : metroDev) != null ? _a2 : false;

// src/constants.ts
var POSITION_OUT_OF_VIEW = -1e7;
var EDGE_POSITION_EPSILON = 1;
var USER_MOMENTUM_WAIT_TIMEOUT_MS = 100;
var USER_MOMENTUM_STALL_TIMEOUT_MS = 500;
var SCROLL_LANDING_SNAP_DISTANCE = 50;
var ENABLE_DEVMODE = IS_DEV && false;
var ENABLE_DEBUG_VIEW = IS_DEV && false;

// src/core/endOfContentTarget.ts
function getEndAlignedViewOffset(stylePaddingEnd, footerSize = 0) {
  return -stylePaddingEnd - footerSize;
}
function isEndOfContentTarget(target, dataLength) {
  return !!target && dataLength > 0 && target.viewPosition === 1 && !!target.preserveForBottomPadding && target.index !== void 0 && target.index >= dataLength - 1;
}

// src/core/cancelImperativeScroll.ts
function cancelScrollCompletionChecks({ scheduledWork }) {
  scheduledWork.cancel("checkFinishedScrollFrame");
  scheduledWork.cancel("checkFinishedScrollRetryFrame");
  scheduledWork.cancel("checkFinishedScrollFallback");
  scheduledWork.cancel("platformScrollCompletion");
}
function syncScrollActive(ctx) {
  const { state } = ctx;
  set$(
    ctx,
    "isScrollActive",
    !!state.isDragging || !!state.isMomentumScrolling || !!state.scrollingTo || !!state.pendingScrollResolve
  );
}
function settlePendingImperativeScroll(state) {
  const resolvePendingScroll = state.pendingScrollResolve;
  state.pendingScrollResolve = void 0;
  state.pendingScrollToEnd = void 0;
  resolvePendingScroll == null ? void 0 : resolvePendingScroll();
}
function cancelImperativeScroll(state) {
  cancelScrollCompletionChecks(state);
  state.scheduledWork.cancel("imperativeScrollCommit");
  state.scheduledWork.cancel("imperativeScrollReady");
  setScrollOwnerTarget(state, void 0);
  state.scrollTargetPinnedRange = void 0;
  state.scrollTargetRemeasure = void 0;
  settlePendingImperativeScroll(state);
}

// src/core/deferredPublicOnScroll.ts
function withResolvedContentOffset(state, event, resolvedOffset) {
  return {
    ...event,
    nativeEvent: {
      ...event.nativeEvent,
      contentOffset: state.props.horizontal ? { x: resolvedOffset, y: 0 } : { x: 0, y: resolvedOffset }
    }
  };
}
function releaseDeferredPublicOnScroll(ctx, resolvedOffset) {
  var _a3, _b, _c, _d;
  const state = ctx.state;
  const deferredEvent = state.deferredPublicOnScrollEvent;
  state.deferredPublicOnScrollEvent = void 0;
  if (deferredEvent) {
    (_d = (_c = state.props).onScroll) == null ? void 0 : _d.call(
      _c,
      withResolvedContentOffset(
        state,
        deferredEvent,
        (_b = (_a3 = resolvedOffset != null ? resolvedOffset : state.scrollPending) != null ? _a3 : state.scroll) != null ? _b : 0
      )
    );
  }
}

// src/core/clampScrollOffset.ts
function getContentInsetTop(ctx) {
  var _a3, _b, _c, _d;
  const state = ctx.state;
  if (Platform.OS !== "ios" || state.props.horizontal) {
    return 0;
  }
  const baseInset = (_a3 = state.props.contentInset) != null ? _a3 : state.nativeContentInset;
  return Math.max(0, (_d = (_c = (_b = state.contentInsetOverride) == null ? void 0 : _b.top) != null ? _c : baseInset == null ? void 0 : baseInset.top) != null ? _d : 0);
}
function getScrollRangeEnd(ctx, contentSize = getContentSize(ctx)) {
  return Math.max(0 - getContentInsetTop(ctx), contentSize - ctx.state.scrollLength);
}
function clampScrollOffset(ctx, offset, scrollTarget) {
  var _a3, _b, _c;
  const state = ctx.state;
  const minOffset = 0 - getContentInsetTop(ctx);
  const contentSize = getContentSize(ctx, !scrollTarget || !!scrollTarget.clampToContentContainerMinSize);
  let clampedOffset = offset;
  if (Number.isFinite(contentSize) && Number.isFinite(state.scrollLength) && (Platform.OS !== "android" || state.lastLayout)) {
    const committedWebEnd = Platform.OS === "web" && (scrollTarget == null ? void 0 : scrollTarget.kind) === "end" ? (_b = (_a3 = state.refScroller.current) == null ? void 0 : _a3.getMaxScrollOffset) == null ? void 0 : _b.call(_a3) : void 0;
    const baseMaxOffset = committedWebEnd != null ? committedWebEnd : getScrollRangeEnd(ctx, contentSize);
    const viewOffset = Platform.OS === "web" && (scrollTarget == null ? void 0 : scrollTarget.isInitialScroll) ? void 0 : scrollTarget == null ? void 0 : scrollTarget.viewOffset;
    const extraEndOffset = typeof viewOffset === "number" && viewOffset < 0 ? -viewOffset : 0;
    const isRawOffset = (scrollTarget == null ? void 0 : scrollTarget.offset) !== void 0 && (scrollTarget.index === void 0 || scrollTarget.isInitialScroll && ((_c = state.initialScroll) == null ? void 0 : _c.kind) === "offset");
    const maxOffset = Math.max(isRawOffset ? 0 : minOffset, baseMaxOffset + extraEndOffset);
    clampedOffset = Math.min(offset, maxOffset);
  }
  return Math.max(minOffset, clampedOffset);
}

// src/core/updateContentMetricsState.ts
function getRawContentLength(ctx) {
  var _a3, _b, _c;
  const { state, values } = ctx;
  return (values.get("headerSize") || 0) + (values.get("footerSize") || 0) + ((_c = (_b = (_a3 = state.pendingTotalSize) != null ? _a3 : state.totalSize) != null ? _b : values.get("totalSize")) != null ? _c : 0) + (state.props.stylePaddingTop || 0) + (state.props.stylePaddingBottom || 0);
}
function getAlignItemsAtEndPadding(ctx) {
  const { state } = ctx;
  const shouldPad = !!state.props.alignItemsAtEndPaddingEnabled && !state.props.horizontal && getDataLength(state) > 0 && state.scrollLength > 0;
  return shouldPad ? Math.max(0, state.scrollLength - getRawContentLength(ctx) - getContentInsetTop(ctx) - getContentInsetEnd(ctx)) : 0;
}
function updateContentMetricsState(ctx) {
  var _a3;
  const { state } = ctx;
  const previousPadding = peek$(ctx, "alignItemsAtEndPadding") || 0;
  const nextPadding = getAlignItemsAtEndPadding(ctx);
  if (previousPadding !== nextPadding) {
    const isAnimatedMaintainActive = state.maintainingScrollAtEnd === "pending-animated" || state.maintainingScrollAtEnd === "animated";
    const isMaintainExpected = state.didContainersLayout && ((_a3 = state.props.maintainScrollAtEnd) == null ? void 0 : _a3.animated) && (isAnimatedMaintainActive || previousPadding > nextPadding && peek$(ctx, "isWithinMaintainScrollAtEndThreshold"));
    if (isMaintainExpected && !isAnimatedMaintainActive && !state.pendingMaintainScrollAtEnd) {
      afterLayout(ctx, (committedCtx) => {
        const committedState = committedCtx.state;
        committedState.scheduledWork.microtask(() => {
          if (!committedState.maintainingScrollAtEnd && !committedState.pendingMaintainScrollAtEnd) {
            set$(committedCtx, "alignItemsAtEndPadding", getAlignItemsAtEndPadding(committedCtx));
          }
        }, "alignItemsAtEndPaddingFallback");
      });
    } else if (!isMaintainExpected) {
      set$(ctx, "alignItemsAtEndPadding", nextPadding);
    }
  }
}

// src/core/observedScroll.ts
function getObservedScrollOffset(ctx, fallbackOffset = ctx.state.scroll) {
  var _a3, _b, _c;
  const { state } = ctx;
  const scroller = state.refScroller.current;
  const observed = (_a3 = scroller == null ? void 0 : scroller.getCurrentScrollOffset) == null ? void 0 : _a3.call(scroller);
  if (observed === void 0 || !Number.isFinite(observed)) return (_b = state.lastNativeScroll) != null ? _b : fallbackOffset;
  return state.props.horizontal ? peekLogicalHorizontalOffset(state, observed, (_c = scroller.getMaxScrollOffset) == null ? void 0 : _c.call(scroller)) : observed;
}

// src/utils/requestAdjust.ts
function requestAdjust(ctx, positionDiff, source) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const state = ctx.state;
  if (isHeldByCommand(state)) {
    afterLayout(ctx, (committedCtx) => recordScrollWrite(committedCtx.state, source, "dropped", positionDiff));
    return;
  }
  let scroll = state.scroll;
  let scrollCorrection = positionDiff;
  let modelCorrection = positionDiff;
  if (Math.abs(positionDiff) > 0.1 && Platform.OS === "web") {
    if (!ctx.layoutEffects && ((_b = (_a3 = state.scrollAdjustHandler).deferNativeAdjust) == null ? void 0 : _b.call(_a3, positionDiff))) return;
    const target = state.scrollingTo;
    const isInRange = ((_d = (_c = state.refScroller.current) == null ? void 0 : _c.isScrollInRange) == null ? void 0 : _d.call(_c)) !== false;
    const observed = getObservedScrollOffset(ctx);
    const remainder = (_g = (_f = (_e = state.scrollAdjustHandler).getWebAdjustRemainder) == null ? void 0 : _f.call(_e, observed)) != null ? _g : 0;
    const isIdleStartCorrection = source !== "data" && !target && !state.pendingScrollResolve && !state.isDragging && !state.isMomentumScrolling && state.didFinishInitialScroll && peek$(ctx, "readyToRender") && isInRange && observed === 0;
    if (isIdleStartCorrection) return;
    const max = (_i = (_h = state.refScroller.current) == null ? void 0 : _h.getMaxScrollOffset) == null ? void 0 : _i.call(_h);
    if (max !== void 0 && observed !== state.scroll && observed === Math.max(0, Math.min(state.scroll, max))) {
      scrollCorrection -= observed + remainder - state.scroll;
    }
    if (isInRange && observed !== state.lastNativeScroll) {
      scroll = observed + remainder;
      modelCorrection = scrollCorrection;
    }
  }
  if (Math.abs(positionDiff) > 0.1) {
    state.layoutAdjustmentEpoch = ((_j = state.layoutAdjustmentEpoch) != null ? _j : 0) + 1;
    const dataChanged = source === "data";
    const needsScrollWorkaround = Platform.OS === "android" && !IsNewArchitecture && dataChanged && state.scroll <= positionDiff;
    const issuedEpoch = getScrollOwnerEpoch(state);
    const doit = () => {
      var _a4, _b2;
      if (isHeldByCommand(state) || isSupersededByCommand(state, issuedEpoch)) {
        recordScrollWrite(state, source, "dropped", scrollCorrection, issuedEpoch);
        if (state.adjustingFromInitialMount) state.adjustingFromInitialMount--;
        return;
      }
      if (needsScrollWorkaround) {
        const offset = state.scroll;
        afterLayout(
          ctx,
          (committedCtx) => committedCtx.doScrollTo({
            horizontal: committedCtx.state.props.horizontal,
            isAdjustment: true,
            issuedEpoch,
            offset,
            source
          })
        );
      } else {
        const handler = state.scrollAdjustHandler;
        const mode = ((_a4 = handler.willDeferAdjust) == null ? void 0 : _a4.call(handler)) ? "deferred" : "relative";
        afterLayout(
          ctx,
          (committedCtx) => recordScrollWrite(committedCtx.state, source, mode, scrollCorrection, issuedEpoch)
        );
        if (ctx.layoutEffects) {
          ctx.plannedScrollAdjust = ((_b2 = ctx.plannedScrollAdjust) != null ? _b2 : 0) + scrollCorrection;
          set$(ctx, "scrollAdjust", handler.getAdjust() + ctx.plannedScrollAdjust);
        } else {
          handler.requestAdjust(scrollCorrection);
        }
        if (state.adjustingFromInitialMount) {
          state.adjustingFromInitialMount--;
        }
      }
    };
    state.scroll = scroll + modelCorrection;
    if (state.userScrollContentSize !== void 0) {
      state.userScrollContentSize += positionDiff;
    }
    state.scrollForNextCalculateItemsInView = void 0;
    const readyToRender = peek$(ctx, "readyToRender");
    if (readyToRender) {
      doit();
      if (Platform.OS !== "web" && !isItemSizeSource(source)) {
        const threshold = state.scroll - positionDiff / 2;
        if (!state.ignoreScrollFromMVCP) {
          state.ignoreScrollFromMVCP = {};
        }
        if (positionDiff > 0) {
          state.ignoreScrollFromMVCP.lt = threshold;
        } else {
          state.ignoreScrollFromMVCP.gt = threshold;
        }
        const delay = needsScrollWorkaround ? 250 : 100;
        afterLayout(ctx, (committedCtx) => {
          const committedState = committedCtx.state;
          committedState.scheduledWork.timeout(
            () => {
              var _a4;
              committedState.ignoreScrollFromMVCP = void 0;
              const shouldForceUpdate = committedState.ignoreScrollFromMVCPIgnored && committedState.scrollProcessingEnabled !== false;
              if (shouldForceUpdate) {
                committedState.ignoreScrollFromMVCPIgnored = false;
                committedState.scrollPending = committedState.scroll;
                (_a4 = committedState.reprocessCurrentScroll) == null ? void 0 : _a4.call(committedState);
              }
            },
            delay,
            "ignoreScrollFromMVCP"
          );
        });
      }
    } else {
      state.adjustingFromInitialMount = (state.adjustingFromInitialMount || 0) + 1;
      requestAnimationFrame(doit);
    }
  }
}

// src/core/finishMaintainScrollAtEnd.ts
function setEndFollowIntent(ctx, interrupted, following) {
  ctx.state.endFollowInterrupted = interrupted;
  ctx.state.endFollowRearmPending = false;
  if (!following || ctx.state.props.maintainScrollAtEnd) set$(ctx, "isFollowingEnd", following);
}
function resetEndFollowIntent(ctx) {
  setEndFollowIntent(ctx, false, false);
}
function requestEndFollow(ctx, source) {
  if (source === "initial" && (ctx.state.endFollowInterrupted || !ctx.state.props.maintainScrollAtEnd || !isEndOfContentTarget(ctx.state.initialScroll, getDataLength(ctx.state))))
    return;
  setEndFollowIntent(ctx, false, true);
}
function requestEndFollowMaintenance(ctx) {
  var _a3, _b, _c, _d;
  const state = ctx.state;
  const {
    didContainersLayout,
    didFinishInitialScroll,
    props: { maintainScrollAtEnd }
  } = state;
  const initialOwnsViewport = ((_a3 = state.scrollingTo) == null ? void 0 : _a3.isInitialScroll) || Platform.OS === "web" && !didFinishInitialScroll && !state.scrollingTo && didContainersLayout && state.initialScroll && state.initialScroll.kind !== "offset" && !state.initialScroll.bootstrap && state.initialScroll.completion;
  if (initialOwnsViewport && maintainScrollAtEnd && !state.endFollowInterrupted && !((_b = ctx.scrollRequestTracker) == null ? void 0 : _b.isWaitingToRun()) && isEndOfContentTarget(state.initialScroll, getDataLength(state))) {
    state.pendingMaintainScrollAtEnd = true;
    return "deferred";
  }
  const admitted = !!(!((_c = ctx.scrollRequestTracker) == null ? void 0 : _c.isWaitingToRun()) && (!state.scrollingTo || state.scrollingTo.isScrollToEnd) && !state.endFollowInterrupted && (peek$(ctx, "isFollowingEnd") || peek$(ctx, "isWithinMaintainScrollAtEndThreshold") || state.pendingMaintainScrollAtEnd || ((_d = state.scrollingTo) == null ? void 0 : _d.isScrollToEnd)) && maintainScrollAtEnd && didFinishInitialScroll);
  if (admitted) setEndFollowIntent(ctx, false, true);
  return admitted ? maintainScrollAtEnd : void 0;
}
function observeEndFollowUserScroll(ctx, previousScroll) {
  var _a3;
  const state = ctx.state;
  const distance = getContentSize(ctx) - state.scroll - state.scrollLength;
  state.endFollowRearmPending = distance <= Math.max(EDGE_POSITION_EPSILON, ((_a3 = state.props.maintainScrollAtEndThreshold) != null ? _a3 : 0) * state.scrollLength);
  if (!state.isDragging && !state.isMomentumScrolling && state.userScrollContentSize === void 0 && state.scroll > previousScroll && distance <= 1) {
    setEndFollowIntent(ctx, false, true);
  }
}
function settleEndFollowUserScroll(ctx, baseline) {
  var _a3, _b;
  const state = ctx.state;
  if (baseline === void 0) {
    rearmEndFollowIfSettled(ctx, "user");
    return false;
  }
  if (state.scrollingTo || state.pendingScrollResolve || ((_a3 = ctx.scrollRequestTracker) == null ? void 0 : _a3.isWaitingToRun()) || state.scheduledWork.has("appScrollRearm"))
    return false;
  const contentSize = getContentSize(ctx);
  const distance = Math.max(0, contentSize - state.scroll - state.scrollLength);
  const credit = Math.max(0, contentSize - baseline);
  set$(
    ctx,
    "isWithinMaintainScrollAtEndThreshold",
    distance - credit <= Math.max(EDGE_POSITION_EPSILON, ((_b = state.props.maintainScrollAtEndThreshold) != null ? _b : 0) * state.scrollLength)
  );
  setEndFollowIntent(ctx, true, false);
  rearmEndFollowIfSettled(ctx, "user");
  return !!peek$(ctx, "isFollowingEnd") && credit > 0 && distance > EDGE_POSITION_EPSILON;
}
function interruptMaintainScrollAtEnd(ctx) {
  var _a3;
  const { state } = ctx;
  const maintaining = state.maintainingScrollAtEnd;
  setEndFollowIntent(ctx, true, false);
  if (maintaining === "animated" || maintaining === "instant" || maintaining && ((_a3 = state.scrollingTo) == null ? void 0 : _a3.isScrollToEnd)) {
    cancelImperativeScroll(state);
    syncScrollActive(ctx);
  }
  if (maintaining || state.pendingMaintainScrollAtEnd) {
    finishMaintainScrollAtEnd(ctx);
  }
}
function armAppScrollRearm(ctx) {
  ctx.state.scheduledWork.timeout(
    () => rearmEndFollowIfSettled(ctx),
    USER_MOMENTUM_STALL_TIMEOUT_MS,
    "appScrollRearm"
  );
}
function rearmEndFollowIfSettled(ctx, source) {
  const { state } = ctx;
  if (source) state.endFollowRearmPending = !!peek$(ctx, "isWithinMaintainScrollAtEndThreshold");
  if (!state.endFollowRearmPending) return;
  if (state.endFollowInterrupted && (!state.visibleContentAnchor || state.visibleContentAnchor.sizeOnly) && !state.isDragging && state.userScrollContentSize === void 0 && !state.scheduledWork.has("appScrollRearm") && !state.scrollingTo && !state.pendingScrollResolve && !state.dataSourceAnchorPositions && !state.pendingNativeMVCPAdjust && peek$(ctx, "isWithinMaintainScrollAtEndThreshold")) {
    const length = state.props.dataSource ? getDataLength(state) : 0;
    if (length > 0 && !state.sizesKnown.has(getId(state, length - 1))) return;
    setEndFollowIntent(ctx, false, true);
  }
}
function finishMaintainScrollAtEnd(ctx) {
  var _a3, _b;
  const { state } = ctx;
  const currentPadding = peek$(ctx, "alignItemsAtEndPadding") || 0;
  const nextPadding = getAlignItemsAtEndPadding(ctx);
  setFollowEndOwner(state, void 0);
  state.pendingMaintainScrollAtEnd = false;
  for (const key of (_a3 = state.pendingEndMeasurements) != null ? _a3 : []) {
    if (!state.containerItemKeys.has(key)) state.pendingEndMeasurements.delete(key);
  }
  if (currentPadding !== nextPadding) {
    set$(ctx, "alignItemsAtEndPadding", nextPadding);
    state.scrollForNextCalculateItemsInView = void 0;
    (_b = state.triggerCalculateItemsInView) == null ? void 0 : _b.call(state, { forceFullItemPositions: true });
    const nextScroll = clampScrollOffset(ctx, state.scroll + nextPadding - currentPadding);
    const nativeScroll = Platform.OS === "ios" ? clampScrollOffset(ctx, state.scroll) : state.scroll;
    state.scroll = nativeScroll;
    requestAdjust(ctx, nextScroll - nativeScroll, "end-padding");
  }
}

// src/core/initialScrollSession.ts
var INITIAL_SCROLL_MIN_TARGET_OFFSET = 1;
function ensureInitialScrollSessionCompletion(state) {
  var _a3, _b;
  if (!state.initialScroll) return void 0;
  (_b = (_a3 = state.initialScroll).completion) != null ? _b : _a3.completion = {};
  return state.initialScroll.completion;
}
var initialScrollCompletion = {
  didDispatchNativeScroll(state) {
    var _a3, _b;
    return !!((_b = (_a3 = state.initialScroll) == null ? void 0 : _a3.completion) == null ? void 0 : _b.didDispatchNativeScroll);
  },
  didRetrySilentInitialScroll(state) {
    var _a3, _b;
    return !!((_b = (_a3 = state.initialScroll) == null ? void 0 : _a3.completion) == null ? void 0 : _b.didRetrySilentInitialScroll);
  },
  markInitialScrollNativeDispatch(state) {
    const completion = ensureInitialScrollSessionCompletion(state);
    if (completion) completion.didDispatchNativeScroll = true;
  },
  markSilentInitialScrollRetry(state) {
    const completion = ensureInitialScrollSessionCompletion(state);
    if (completion) completion.didRetrySilentInitialScroll = true;
  },
  resetFlags(state) {
    var _a3;
    const completion = (_a3 = state.initialScroll) == null ? void 0 : _a3.completion;
    if (!completion) return;
    completion.didDispatchNativeScroll = void 0;
    completion.didRetrySilentInitialScroll = void 0;
  }
};
var initialScrollWatchdog = {
  clear(state) {
    initialScrollWatchdog.set(state, void 0);
  },
  didReachTarget(newScroll, watchdog) {
    const nextDistance = Math.abs(newScroll - watchdog.targetOffset);
    return nextDistance <= INITIAL_SCROLL_MIN_TARGET_OFFSET;
  },
  get(state) {
    var _a3, _b;
    return (_b = (_a3 = state.initialScroll) == null ? void 0 : _a3.completion) == null ? void 0 : _b.watchdog;
  },
  hasNonZeroTargetOffset(targetOffset) {
    return targetOffset !== void 0 && targetOffset > INITIAL_SCROLL_MIN_TARGET_OFFSET;
  },
  isAtZeroTargetOffset(targetOffset) {
    return targetOffset <= INITIAL_SCROLL_MIN_TARGET_OFFSET;
  },
  set(state, watchdog) {
    var _a3, _b;
    if (!watchdog && !((_b = (_a3 = state.initialScroll) == null ? void 0 : _a3.completion) == null ? void 0 : _b.watchdog)) {
      return;
    }
    const completion = ensureInitialScrollSessionCompletion(state);
    if (!completion) return;
    completion.watchdog = watchdog;
  }
};

// src/core/shouldMaintainScrollAtEndOnDataChange.ts
function shouldMaintainScrollAtEndOnDataChange(state, didColumnsChange = state.didColumnsChange) {
  var _a3;
  const {
    previousData,
    props: { data, keyExtractor, maintainScrollAtEnd }
  } = state;
  const onDataChange = maintainScrollAtEnd == null ? void 0 : maintainScrollAtEnd.onDataChange;
  if (state.props.dataSource && onDataChange === "append") {
    const batches = state.pendingDataSourceBatches;
    if (didColumnsChange || state.dataSourceNeedsReset || !(batches == null ? void 0 : batches.length)) return false;
    const previousLength = (_a3 = state.dataSourcePreviousLength) != null ? _a3 : batches[0].previousLength;
    let length = previousLength;
    for (const batch of batches) {
      if (batch.previousLength !== length) return false;
      for (const operation of batch.operations) {
        if (operation.type === "update") continue;
        if (operation.type !== "splice" || operation.index !== length || operation.deleteCount !== 0)
          return false;
        length += operation.insertCount;
      }
      if (batch.length !== length) return false;
    }
    return length > previousLength && length === getDataLength(state);
  }
  return !!(!didColumnsChange && onDataChange && (onDataChange !== "append" || previousData && data.length > previousData.length && previousData.every(
    (item, index) => {
      var _a4;
      return item === data[index] || ((_a4 = keyExtractor == null ? void 0 : keyExtractor(item, index)) != null ? _a4 : index) === getId(state, index);
    }
  )));
}

// src/core/webLayoutCommit.ts
var measurementDepth = /* @__PURE__ */ new WeakMap();
function isWebLayoutMeasurement(ctx) {
  var _a3;
  return ((_a3 = measurementDepth.get(ctx)) != null ? _a3 : 0) > 0;
}

// src/utils/checkThreshold.ts
var HYSTERESIS_MULTIPLIER = 1.3;
function isOutsideThresholdHysteresis(distance, atThreshold, threshold) {
  const absDistance = Math.abs(distance);
  return !atThreshold && threshold > 0 && absDistance >= threshold * HYSTERESIS_MULTIPLIER || !atThreshold && threshold <= 0 && absDistance > 0;
}
function didThresholdDataChange(snapshot, context) {
  return !!snapshot && !snapshot.isRequestPending && (snapshot.dataLength !== context.dataLength || (snapshot.data !== context.data || snapshot.dataRevision !== context.dataRevision || !!snapshot.didRequestSettle && !snapshot.didRearmForSettle) && snapshot.contentSize !== context.contentSize);
}
var checkThreshold = (distance, atThreshold, threshold, wasReached, snapshot, context, onReached, setSnapshot, allowEmptyDataChange = false) => {
  const absDistance = Math.abs(distance);
  const within = (context.dataLength !== 0 || allowEmptyDataChange) && (atThreshold || threshold > 0 && absDistance <= threshold);
  const didScroll = (snapshot == null ? void 0 : snapshot.scroll) !== context.scroll;
  if (snapshot) snapshot.scroll = context.scroll;
  if (!within) {
    if ((context.dataLength === 0 || didScroll && isOutsideThresholdHysteresis(distance, atThreshold, threshold)) && (wasReached || snapshot)) {
      setSnapshot(void 0);
    }
    return false;
  }
  if ((!wasReached || didThresholdDataChange(snapshot, context)) && onReached(distance)) {
    return true;
  }
  return !!wasReached;
};

// src/utils/edgeReachedGate.ts
function getDistanceFromStart(ctx) {
  return ctx.state.scroll + getContentInsetTop(ctx);
}
function resetSharedEdgeGateIfOutsideHysteresis(ctx) {
  const state = ctx.state;
  if (!state.edgeReachedGate || state.edgeReachedGateScroll === state.scroll) {
    return;
  }
  state.edgeReachedGateScroll = state.scroll;
  const contentSize = getContentSize(ctx);
  const endDistance = contentSize - state.scroll - state.scrollLength;
  const isContentLess = contentSize < state.scrollLength;
  const startThreshold = state.props.onStartReachedThreshold * state.scrollLength;
  const endThreshold = state.props.onEndReachedThreshold * state.scrollLength;
  const isOutsideStart = isOutsideThresholdHysteresis(getDistanceFromStart(ctx), false, startThreshold);
  const isOutsideEnd = isOutsideThresholdHysteresis(endDistance, isContentLess, endThreshold);
  if (isOutsideStart && isOutsideEnd) {
    state.edgeReachedGate = void 0;
  }
}
function canDispatchReachedEdge(ctx, edge, allowedEdge, allowGateCreatedInCurrentCheck) {
  const state = ctx.state;
  return !state.edgeReachedGate || allowedEdge === edge || !!allowGateCreatedInCurrentCheck || didThresholdDataChange(
    edge === "start" ? state.startReachedSnapshot : state.endReachedSnapshot,
    getThresholdSnapshot(ctx)
  );
}
function markReachedEdge(ctx, edge) {
  const state = ctx.state;
  state.edgeReachedGate = "closed";
  state.edgeReachedGateScroll = state.scroll;
  const snapshotKey = edge === "start" ? "startReachedSnapshot" : "endReachedSnapshot";
  const previous = state[snapshotKey];
  const snapshot = getThresholdSnapshot(ctx);
  snapshot.didRearmForData = didThresholdDataChange(previous, snapshot);
  snapshot.didRearmForSettle = snapshot.didRearmForData && previous.dataLength === snapshot.dataLength && previous.data === snapshot.data && previous.dataRevision === snapshot.dataRevision;
  state[snapshotKey] = snapshot;
}
function dispatchReachedEdge(ctx, edge, dispatch) {
  markReachedEdge(ctx, edge);
  const snapshot = ctx.state[edge === "start" ? "startReachedSnapshot" : "endReachedSnapshot"];
  snapshot.isRequestPending = true;
  let result;
  try {
    result = dispatch();
  } catch (error) {
    snapshot.isRequestPending = false;
    throw error;
  }
  if (typeof (result == null ? void 0 : result.then) === "function") {
    const settle = () => {
      snapshot.isRequestPending = false;
      snapshot.didRequestSettle = true;
      if (!ctx.state.isUnmounted) {
        ctx.state.scheduledWork.frame(() => {
          var _a3, _b;
          return (_b = (_a3 = ctx.state).reprocessCurrentScroll) == null ? void 0 : _b.call(_a3);
        }, "reachedEdgeSettle");
      }
    };
    result.then(settle, settle);
  } else {
    snapshot.isRequestPending = false;
  }
}
function getThresholdSnapshot(ctx, contentSize = getContentSize(ctx)) {
  const { data, dataSource } = ctx.state.props;
  return {
    contentSize,
    data: dataSource != null ? dataSource : data,
    dataLength: getDataLength(ctx.state),
    dataRevision: dataSource == null ? void 0 : dataSource.getRevision(),
    scroll: ctx.state.scroll
  };
}
function prepareReachedEdgeForNextUserScroll(ctx) {
  if (ctx.state.edgeReachedGate) {
    ctx.state.edgeReachedGate = "prepared";
  }
}
function beginReachedEdgeUserScroll(ctx, scrollDelta) {
  var _a3, _b;
  const state = ctx.state;
  const allowedEdge = scrollDelta < 0 ? "start" : "end";
  if (state.edgeReachedGate !== "prepared" && state.edgeReachedGate !== (allowedEdge === "start" ? "consumed-end" : "consumed-start")) {
    return void 0;
  }
  const snapshotKey = allowedEdge === "start" ? "startReachedSnapshot" : "endReachedSnapshot";
  const snapshot = state[snapshotKey];
  if ((snapshot == null ? void 0 : snapshot.didRearmForData) && !snapshot.didRequestSettle && snapshot.data === ((_a3 = state.props.dataSource) != null ? _a3 : state.props.data) && snapshot.dataRevision === ((_b = state.props.dataSource) == null ? void 0 : _b.getRevision())) {
    snapshot.didRearmForData = false;
    state.edgeReachedGate = state.edgeReachedGate === "prepared" ? `consumed-${allowedEdge}` : "closed";
    return void 0;
  }
  state[allowedEdge === "start" ? "isStartReached" : "isEndReached"] = false;
  state[snapshotKey] = void 0;
  return allowedEdge;
}
function rearmReachedEdgeAfterScroll(ctx, scrollDelta) {
  const state = ctx.state;
  if (scrollDelta >= -1 || !isOutsideThresholdHysteresis(
    getDistanceFromStart(ctx) - scrollDelta,
    false,
    state.props.onStartReachedThreshold * state.scrollLength
  ))
    return void 0;
  state.isStartReached = false;
  state.startReachedSnapshot = void 0;
  return "start";
}

// src/utils/hasActiveInitialScroll.ts
function hasActiveInitialScroll(state) {
  return !!(state == null ? void 0 : state.initialScroll) && !state.didFinishInitialScroll;
}

// src/utils/checkAtBottom.ts
function checkAtBottom(ctx, allowedEdge, allowGateCreatedInCurrentCheck) {
  var _a3, _b, _c;
  const state = ctx.state;
  if (!state) {
    return;
  }
  const {
    queuedInitialLayout,
    scrollLength,
    scroll,
    maintainingScrollAtEnd,
    props: { maintainScrollAtEndThreshold, onEndReachedThreshold }
  } = state;
  const contentSize = getContentSize(ctx);
  const distanceFromEnd = contentSize - scroll - scrollLength;
  const allowEmptyDataChange = getDataLength(state) === 0 && !!((_a3 = state.endReachedSnapshot) == null ? void 0 : _a3.dataLength) && contentSize - (peek$(ctx, "alignItemsAtEndPadding") || 0) > ((_b = state.pendingTotalSize) != null ? _b : state.totalSize);
  resetSharedEdgeGateIfOutsideHysteresis(ctx);
  if (getDataLength(state) === 0 && scrollLength > 0 && contentSize <= scrollLength && !allowEmptyDataChange) {
    set$(ctx, "isAtEnd", true);
    set$(ctx, "isNearEnd", true);
    set$(ctx, "isWithinMaintainScrollAtEndThreshold", true);
    return;
  }
  if (contentSize > 0 && queuedInitialLayout) {
    const isContentLess = contentSize < scrollLength;
    const isAtEnd = isContentLess || distanceFromEnd <= EDGE_POSITION_EPSILON;
    const deferEndChange = !isAtEnd && peek$(ctx, "isAtEnd") && state.didDataChange && !state.endFollowInterrupted && isWebLayoutMeasurement(ctx) && shouldMaintainScrollAtEndOnDataChange(state);
    if (!deferEndChange) set$(ctx, "isAtEnd", isAtEnd);
    set$(ctx, "isNearEnd", isContentLess || distanceFromEnd <= onEndReachedThreshold * scrollLength);
    set$(
      ctx,
      "isWithinMaintainScrollAtEndThreshold",
      isContentLess || // A zero threshold still includes fractional offsets considered
      // at the end; otherwise following can stop after rounding/layout.
      distanceFromEnd <= Math.max(EDGE_POSITION_EPSILON, maintainScrollAtEndThreshold * scrollLength) || state.pendingMaintainScrollAtEnd || !!maintainingScrollAtEnd || !!peek$(ctx, "isFollowingEnd")
    );
    const shouldSkipThresholdChecks = hasActiveInitialScroll(state) || maintainingScrollAtEnd || !!((_c = state.scrollingTo) == null ? void 0 : _c.ownerPhase);
    if (!shouldSkipThresholdChecks) {
      state.isEndReached = checkThreshold(
        distanceFromEnd,
        isContentLess,
        onEndReachedThreshold * scrollLength,
        state.isEndReached,
        state.endReachedSnapshot,
        getThresholdSnapshot(ctx, contentSize),
        (distance) => {
          if (state.props.onEndReached && canDispatchReachedEdge(ctx, "end", allowedEdge, allowGateCreatedInCurrentCheck)) {
            dispatchReachedEdge(ctx, "end", () => state.props.onEndReached({ distanceFromEnd: distance }));
            return true;
          }
          return false;
        },
        (snapshot) => {
          state.endReachedSnapshot = snapshot;
        },
        allowEmptyDataChange
      );
    }
  }
}

// src/utils/checkAtTop.ts
function checkAtTop(ctx, allowedEdge, allowGateCreatedInCurrentCheck) {
  const state = ctx == null ? void 0 : ctx.state;
  if (!state) {
    return;
  }
  const {
    props: { onStartReachedThreshold },
    scrollLength
  } = state;
  const threshold = onStartReachedThreshold * scrollLength;
  const distanceFromStart = getDistanceFromStart(ctx);
  resetSharedEdgeGateIfOutsideHysteresis(ctx);
  set$(ctx, "isAtStart", distanceFromStart <= EDGE_POSITION_EPSILON);
  set$(ctx, "isNearStart", distanceFromStart <= threshold);
  const shouldSkipThresholdChecks = !state.queuedInitialLayout || hasActiveInitialScroll(state) || !!state.scrollingTo;
  if (shouldSkipThresholdChecks && state.startReachedSnapshot && isOutsideThresholdHysteresis(distanceFromStart, false, threshold))
    state.startReachedSnapshot.didLeaveHysteresis = true;
  if (!shouldSkipThresholdChecks) {
    state.isStartReached = checkThreshold(
      distanceFromStart,
      false,
      threshold,
      state.isStartReached,
      state.startReachedSnapshot,
      getThresholdSnapshot(ctx),
      (distance) => {
        if (state.props.onStartReached && canDispatchReachedEdge(ctx, "start", allowedEdge, allowGateCreatedInCurrentCheck)) {
          dispatchReachedEdge(
            ctx,
            "start",
            () => state.props.onStartReached({ distanceFromStart: distance })
          );
          return true;
        }
        return false;
      },
      (snapshot) => {
        state.startReachedSnapshot = snapshot;
      }
    );
  }
}

// src/utils/checkThresholds.ts
function checkThresholds(ctx, allowedEdge) {
  const allowGateCreatedInCurrentCheck = !ctx.state.edgeReachedGate;
  checkAtBottom(ctx, allowedEdge, allowGateCreatedInCurrentCheck);
  checkAtTop(ctx, allowedEdge, allowGateCreatedInCurrentCheck);
  rearmEndFollowIfSettled(ctx);
}

// src/core/recalculateSettledScroll.ts
function recalculateSettledScroll(ctx, allowedEdge) {
  var _a3, _b;
  const state = ctx.state;
  if ((_a3 = state.props) == null ? void 0 : _a3.data) {
    (_b = state.triggerCalculateItemsInView) == null ? void 0 : _b.call(state, { forceFullItemPositions: true });
  }
  checkThresholds(ctx, allowedEdge);
}

// src/core/adaptiveRender.ts
var DEFAULT_ADAPTIVE_RENDER_ENTER_VELOCITY = 3;
var DEFAULT_ADAPTIVE_RENDER_EXIT_VELOCITY = 1;
var DEFAULT_ADAPTIVE_RENDER_EXIT_DELAY = 250;
var DEFAULT_WEB_ADAPTIVE_RENDER_ENTER_VELOCITY = 6;
var DEFAULT_WEB_ADAPTIVE_RENDER_EXIT_VELOCITY = 3;
var DEFAULT_WEB_ADAPTIVE_RENDER_EXIT_DELAY = 250;
function clearAdaptiveRenderExitTimeout(ctx) {
  afterLayout(ctx, (committedCtx) => committedCtx.state.scheduledWork.cancel("adaptiveRender"));
}
function scheduleAdaptiveRenderExit(ctx, exitDelay) {
  const state = ctx.state;
  clearAdaptiveRenderExitTimeout(ctx);
  if (exitDelay <= 0) {
    setAdaptiveRender(ctx, "normal", "scroll");
  } else {
    state.scheduledWork.timeout(() => setAdaptiveRender(ctx, "normal", "scroll"), exitDelay, "adaptiveRender");
  }
}
function setAdaptiveRender(ctx, mode, reason) {
  var _a3;
  const previousMode = peek$(ctx, "adaptiveRender");
  if (previousMode !== mode) {
    set$(ctx, "adaptiveRender", mode);
    const onChange = (_a3 = ctx.state.props.adaptiveRender) == null ? void 0 : _a3.onChange;
    if (onChange) afterLayout(ctx, () => onChange(mode, reason));
  }
}
function resetAdaptiveRender(ctx) {
  var _a3, _b;
  clearAdaptiveRenderExitTimeout(ctx);
  const mode = (_b = (_a3 = ctx.state.props.adaptiveRender) == null ? void 0 : _a3.initialMode) != null ? _b : "normal";
  if (peek$(ctx, "adaptiveRender") !== mode) {
    setAdaptiveRender(ctx, mode, "initial");
  }
}
function updateAdaptiveRender(ctx, scrollVelocity, options) {
  var _a3, _b, _c;
  const state = ctx.state;
  const adaptiveRender = state.props.adaptiveRender;
  const currentMode = peek$(ctx, "adaptiveRender");
  if (peek$(ctx, "readyToRender")) {
    if (adaptiveRender) {
      const isWeb = Platform.OS === "web";
      const enterVelocity = (_a3 = adaptiveRender.enterVelocity) != null ? _a3 : isWeb ? DEFAULT_WEB_ADAPTIVE_RENDER_ENTER_VELOCITY : DEFAULT_ADAPTIVE_RENDER_ENTER_VELOCITY;
      const exitVelocity = (_b = adaptiveRender.exitVelocity) != null ? _b : isWeb ? DEFAULT_WEB_ADAPTIVE_RENDER_EXIT_VELOCITY : DEFAULT_ADAPTIVE_RENDER_EXIT_VELOCITY;
      const exitDelay = (_c = adaptiveRender.exitDelay) != null ? _c : isWeb ? DEFAULT_WEB_ADAPTIVE_RENDER_EXIT_DELAY : DEFAULT_ADAPTIVE_RENDER_EXIT_DELAY;
      const threshold = currentMode === "light" ? exitVelocity : enterVelocity;
      const nextMode = (options == null ? void 0 : options.forceLight) || Math.abs(scrollVelocity) > threshold ? "light" : "normal";
      const previousMode = state.scheduledWork.has("adaptiveRender") ? "normal" : currentMode;
      if (nextMode !== previousMode) {
        if (nextMode === "light") {
          setAdaptiveRender(ctx, "light", "scroll");
          scheduleAdaptiveRenderExit(ctx, exitDelay);
        } else if (currentMode === "light") {
          scheduleAdaptiveRenderExit(ctx, exitDelay);
        }
      }
    } else {
      resetAdaptiveRender(ctx);
    }
  }
}

// src/utils/getEffectiveDrawDistance.ts
var INITIAL_DRAW_DISTANCE = 50;
function getEffectiveDrawDistance(ctx, mode) {
  var _a3, _b, _c;
  const drawDistance = Math.min(ctx.state.props.drawDistance, (_b = (_a3 = ctx.state.drawDistanceHold) == null ? void 0 : _a3.distance) != null ? _b : Infinity);
  const initialScroll = ctx.state.initialScroll;
  const needsFullInitialDrawDistance = initialScroll !== void 0 && ((_c = initialScroll.viewPosition) != null ? _c : 0) > 0;
  const shouldCapDrawDistance = mode === "visible-first" || mode !== "full" && !needsFullInitialDrawDistance && (!peek$(ctx, "readyToRender") || !ctx.state.hasScrolled && ctx.state.scheduledWork.has("fullDrawDistancePrewarm"));
  return shouldCapDrawDistance ? Math.min(drawDistance, INITIAL_DRAW_DISTANCE) : drawDistance;
}
function scheduleFullDrawDistancePrewarm(ctx) {
  const { state } = ctx;
  if (state.props.drawDistance <= INITIAL_DRAW_DISTANCE || state.scheduledWork.has("fullDrawDistancePrewarm")) {
    return;
  }
  state.scheduledWork.frame(() => {
    var _a3, _b, _c;
    if (state.props.hasExternalScroll && !hasActiveInitialScroll(state) && !state.scrollingTo && !state.pendingNativeMVCPAdjust) {
      const offset = (_b = (_a3 = state.refScroller.current) == null ? void 0 : _a3.getRawScrollOffset) == null ? void 0 : _b.call(_a3);
      if (offset !== void 0) {
        state.scroll = state.scrollPending = state.props.horizontal ? toLogicalHorizontalOffset(state, offset, state.totalSize) : offset;
      }
    }
    (_c = state.triggerCalculateItemsInView) == null ? void 0 : _c.call(state);
  }, "fullDrawDistancePrewarm");
}
function holdRaisedDrawDistance(ctx, previous) {
  var _a3;
  const state = ctx.state;
  const next = state.props.drawDistance;
  if (previous !== void 0 && next > previous && peek$(ctx, "readyToRender")) {
    (_a3 = state.drawDistanceHold) != null ? _a3 : state.drawDistanceHold = { distance: previous, scroll: state.scroll };
  } else if (state.drawDistanceHold && next <= state.drawDistanceHold.distance) {
    state.drawDistanceHold = void 0;
  }
}

// src/utils/setInitialRenderState.ts
function resetInitialRenderState(ctx, {
  resetLayout,
  resetInitialScroll
}) {
  const { state } = ctx;
  if (resetLayout) {
    state.didContainersLayout = false;
    state.queuedInitialLayout = false;
    state.scrollBufferDirection = void 0;
    state.scrollHistory.length = 0;
    state.scheduledWork.cancel("renderRangeProjection");
    state.drawDistanceHold = void 0;
    state.edgeReachedGate = void 0;
    state.isStartReached = null;
    state.isEndReached = null;
    state.startReachedSnapshot = void 0;
    state.endReachedSnapshot = void 0;
  }
  if (resetInitialScroll) {
    state.didFinishInitialScroll = false;
  }
  set$(ctx, "readyToRender", false);
  resetAdaptiveRender(ctx);
}
function setInitialRenderState(ctx, {
  didLayout,
  didInitialScroll
}) {
  const { state } = ctx;
  const {
    loadStartTime,
    props: { onLoad, onReady }
  } = state;
  if (didLayout) {
    state.didContainersLayout = true;
  }
  if (didInitialScroll) {
    state.didFinishInitialScroll = true;
  }
  if (didLayout || didInitialScroll) notifyScrollIdle(state);
  const isReadyToRender = Boolean(state.didContainersLayout && state.didFinishInitialScroll);
  if (isReadyToRender && !peek$(ctx, "readyToRender")) {
    set$(ctx, "readyToRender", true);
    setAdaptiveRender(ctx, "normal", "ready");
    if (state.props.drawDistance > INITIAL_DRAW_DISTANCE) {
      scheduleFullDrawDistancePrewarm(ctx);
    }
    if (!state.didLoad) {
      state.didLoad = true;
      if (onLoad) {
        onLoad({ elapsedTimeInMs: Date.now() - loadStartTime });
      }
    }
    onReady == null ? void 0 : onReady();
  }
}

// src/core/finishInitialScroll.ts
function syncInitialScrollOffset(state, offset) {
  state.scroll = offset;
  state.scrollPending = offset;
}
function clearInitialScrollAnchor(state) {
  state.scheduledWork.cancel("preservedInitialScroll");
  state.scheduledWork.cancel("initialScrollAlignment");
  state.initialScrollAnchor = void 0;
}
function preserveInitialScrollAnchor(state, target) {
  var _a3;
  const { bootstrap: _, completion: __, previousDataLength: ___, ...anchor } = target;
  state.initialScrollAnchor = { ...anchor, contentOffset: (_a3 = state.scrollPending) != null ? _a3 : state.scroll };
  state.scheduledWork.timeout(() => clearInitialScrollAnchor(state), 2e3, "preservedInitialScroll");
}
function clearPreservedInitialScrollTarget(state) {
  state.scheduledWork.cancel("initialScrollCompletion");
  clearInitialScrollAnchor(state);
  state.initialScroll = void 0;
}
function supersedeInitialScroll(ctx) {
  var _a3, _b;
  const state = ctx.state;
  if (state.initialScroll || state.initialScrollAnchor || ((_a3 = state.scrollingTo) == null ? void 0 : _a3.isInitialScroll)) {
    state.scheduledWork.cancel("initialScrollFrame");
    state.scheduledWork.cancel("initialScrollLayout");
    if ((_b = state.scrollingTo) == null ? void 0 : _b.isInitialScroll) {
      cancelScrollCompletionChecks(state);
      setScrollOwnerTarget(state, void 0);
      state.scrollTargetPinnedRange = void 0;
    }
    initialScrollCompletion.resetFlags(state);
    if (state.initialScroll) state.initialScroll.bootstrap = void 0;
    finishInitialScroll(ctx);
  }
}
function finishInitialScroll(ctx, options) {
  var _a3;
  const state = ctx.state;
  const freshDataTransitionEpoch = state.freshDataTransitionEpoch;
  const target = state.initialScroll;
  state.scheduledWork.cancel("initialScrollCompletion");
  if ((options == null ? void 0 : options.resolvedOffset) !== void 0) {
    syncInitialScrollOffset(state, options.resolvedOffset);
  } else if ((options == null ? void 0 : options.syncObservedOffset) && ((_a3 = state.initialScroll) == null ? void 0 : _a3.kind) === "offset") {
    const observedOffset = getObservedScrollOffset(ctx, state.scrollPending);
    if (typeof observedOffset === "number" && Number.isFinite(observedOffset)) {
      syncInitialScrollOffset(state, observedOffset);
    }
  }
  const complete = () => {
    var _a4, _b, _c, _d, _e;
    if (state.isUnmounted) return;
    if (freshDataTransitionEpoch !== state.freshDataTransitionEpoch) {
      (_a4 = options == null ? void 0 : options.onFinished) == null ? void 0 : _a4.call(options);
      return;
    }
    if (state.initialScroll !== target) return;
    const shouldReleaseDeferredPublicOnScroll = Platform.OS === "web" && !!state.initialScroll && state.initialScroll.kind !== "offset";
    requestEndFollow(ctx, "initial");
    const finalScrollOffset = (_d = (_c = (_b = options == null ? void 0 : options.resolvedOffset) != null ? _b : state.scrollPending) != null ? _c : state.scroll) != null ? _d : 0;
    initialScrollWatchdog.clear(state);
    if ((options == null ? void 0 : options.preserveTarget) && state.initialScroll && getDataLength(state) === 0) {
      state.initialScroll.bootstrap = void 0;
    } else {
      const preserved = (options == null ? void 0 : options.preserveTarget) ? state.initialScroll : void 0;
      clearPreservedInitialScrollTarget(state);
      if (preserved) preserveInitialScrollAnchor(state, preserved);
    }
    if (options == null ? void 0 : options.recalculateItems) {
      recalculateSettledScroll(ctx);
    }
    setInitialRenderState(ctx, { didInitialScroll: true });
    if (shouldReleaseDeferredPublicOnScroll) {
      releaseDeferredPublicOnScroll(ctx, finalScrollOffset);
    }
    (_e = options == null ? void 0 : options.onFinished) == null ? void 0 : _e.call(options);
  };
  if (options == null ? void 0 : options.waitForCompletionFrame) {
    state.scheduledWork.frame(complete, "initialScrollCompletion");
    return;
  }
  complete();
}

// src/core/sparseLayoutSwitches.ts
var switches = globalThis;
function isAnchorLedgerEnabled() {
  return switches.__LEGEND_LIST_ANCHOR_LEDGER__ !== false;
}
function isBoundedSourceSpanUpdateEnabled() {
  return switches.__LEGEND_LIST_BOUNDED_SOURCE_SPANS__ !== false;
}
function isBulkPrefixReseedEnabled() {
  return switches.__LEGEND_LIST_BULK_PREFIX_RESEED__ !== false;
}
function isPackedGridRowIndexEnabled() {
  return switches.__LEGEND_LIST_PACKED_GRID_ROWS__ !== false;
}

// src/core/PrefixLayoutStore.ts
var PIECE_UNKNOWN = 0;
var PIECE_KNOWN = 1;
var SIZE_CACHED = 1;
var SIZE_MEASURED = 2;
var SIZE_CACHED_CONSUMED = 4;
var PREDICTION_OFFSET = 3;
var KNOWN_BLOCK_CAPACITY = 128;
var reseedAggregateUpdates;
var reseedTrace = globalThis;
var SparseSequenceLayoutStore = class {
  constructor(length, estimatedSize) {
    this.frozenThrough = -1;
    this.nextNodeId = 1;
    this.lengthValue = normalizeLength(length);
    this.estimatedSize = normalizeSize(estimatedSize);
    this.root = createUnknownNode(this, this.lengthValue);
  }
  fork() {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this, {
      root: cloneTree(this.root)
    });
  }
  nextPriority() {
    const id = this.nextNodeId;
    this.nextNodeId += 1;
    return getNodePriority(id);
  }
  get length() {
    return this.lengthValue;
  }
  findIndexAtOffset(offset) {
    let index;
    if (this.length > 0 && !Number.isNaN(offset)) {
      let node = this.root;
      let logicalIndex = 0;
      let prefixSize = 0;
      while (node) {
        const leftSize = getEffectiveSize(node.left, this.estimatedSize);
        const leftEnd = prefixSize + leftSize;
        if (!isLessThanOrEqualOffset(leftEnd, offset)) {
          if (node.left) {
            node = node.left;
          } else {
            index = logicalIndex;
            break;
          }
        } else {
          prefixSize = leftEnd;
          logicalIndex += getLogicalCount(node.left);
          const pieceSize = getPieceEffectiveSize(node.piece, this.estimatedSize);
          const pieceEnd = prefixSize + pieceSize;
          if (!isLessThanOrEqualOffset(pieceEnd, offset)) {
            index = logicalIndex + findIndexInPiece(node.piece, prefixSize, offset, this.estimatedSize);
            break;
          }
          prefixSize = pieceEnd;
          logicalIndex += node.piece.count;
          node = node.right;
        }
      }
    }
    return index;
  }
  findIndexRangeAtOffsets(startOffset, endOffset) {
    var _a3, _b;
    let range;
    if (this.length > 0) {
      const start = (_a3 = this.findIndexAtOffset(startOffset)) != null ? _a3 : this.length - 1;
      const end = (_b = this.findIndexAtOffset(endOffset)) != null ? _b : this.length - 1;
      range = { end: Math.max(start, end), start };
    }
    return range;
  }
  findFirstUnmeasuredIndex(fromIndex = 0) {
    return findFirstUnmeasuredIndex(this.root, 0, fromIndex);
  }
  clearKnownSizes() {
    this.frozenThrough = -1;
    this.root = createUnknownNode(this, this.length);
  }
  clearKnownSize(index) {
    this.assertIndex(index);
    const located = findPieceAtIndex(this.root, index);
    const piece = located == null ? void 0 : located.node.piece;
    const knownSize = located && (piece == null ? void 0 : piece.type) === PIECE_KNOWN ? piece.sizes[located.offset] : void 0;
    const didChange = knownSize !== void 0 && knownSize !== this.estimatedSize;
    if (knownSize !== void 0) {
      this.frozenThrough = -1;
      const [before, fromIndex] = splitTree(this, this.root, index);
      const [, after] = splitTree(this, fromIndex, 1);
      this.root = joinTrees(joinTrees(before, createUnknownNode(this, 1)), after);
    }
    return didChange;
  }
  // Resolves the unmeasured rows of [startIndex, endIndex] with one rebuild of that range,
  // instead of a tree edit per row. Rows the resolver leaves undefined keep their state.
  // The resolver runs before the tree is split, so it can read or throw safely.
  // When the resolver leaves every row undefined, the tree is left untouched.
  fillUnmeasuredRange(startIndex, endIndex, resolveSize) {
    const start = Math.max(0, Math.trunc(startIndex));
    const end = Math.min(this.length - 1, Math.trunc(endIndex));
    if (start === end) {
      const size = this.findFirstUnmeasuredIndex(start) === start ? resolveSize(start) : void 0;
      return size !== void 0 && this.setMeasuredSize(start, size);
    }
    let didChange = false;
    let didResolve = false;
    if (start <= end) {
      const count = end - start + 1;
      const sizes = new Float64Array(count).fill(Number.NaN);
      const kinds = new Uint8Array(count);
      copyRange(this.root, 0, start, end, sizes, kinds);
      for (let offset = 0; offset < count; offset++) {
        if (kinds[offset] !== SIZE_MEASURED) {
          const resolved = resolveSize(start + offset);
          if (resolved !== void 0) {
            const size = normalizeSize(resolved);
            didChange || (didChange = size !== (Number.isNaN(sizes[offset]) ? this.estimatedSize : sizes[offset]));
            sizes[offset] = size;
            kinds[offset] = SIZE_MEASURED;
            didResolve = true;
          }
        }
      }
      if (didResolve) {
        const nodes = [];
        for (let runStart = 0; runStart < count; ) {
          let runEnd = runStart + 1;
          if (kinds[runStart] && kinds[runStart] !== PREDICTION_OFFSET) {
            while (runEnd < count && kinds[runEnd] && kinds[runEnd] !== PREDICTION_OFFSET && runEnd - runStart < KNOWN_BLOCK_CAPACITY)
              runEnd++;
            const blockSizes = new Float64Array(KNOWN_BLOCK_CAPACITY);
            const blockKinds = new Uint8Array(KNOWN_BLOCK_CAPACITY);
            blockSizes.set(sizes.subarray(runStart, runEnd));
            blockKinds.set(kinds.subarray(runStart, runEnd));
            nodes.push(createNode(this, createKnownPiece(blockSizes, blockKinds, runEnd - runStart)));
          } else {
            while (runEnd < count && kinds[runEnd] === kinds[runStart] && Object.is(sizes[runEnd], sizes[runStart]))
              runEnd++;
            nodes.push(
              createNode(this, {
                count: runEnd - runStart,
                estimate: Number.isNaN(sizes[runStart]) ? void 0 : sizes[runStart],
                offsetPrediction: kinds[runStart] === PREDICTION_OFFSET,
                type: PIECE_UNKNOWN
              })
            );
          }
          runStart = runEnd;
        }
        const [before, fromStart] = splitTree(this, this.root, start);
        const [, after] = splitTree(this, fromStart, count);
        this.root = joinTrees(joinTrees(before, buildTree(nodes)), after);
      }
    }
    return didChange;
  }
  // Freezing a prefix is a run operation, including gaps skipped by a distant target.
  // It neither resolves identities nor allocates a size entry for each logical row.
  freezePredictionsThrough(index, preserveForOffset = false) {
    const count = Math.min(this.length, Math.max(0, Math.trunc(index) + 1));
    if (preserveForOffset || count > this.frozenThrough + 1) {
      this.freezePredictionRange(0, count, this.estimatedSize, preserveForOffset);
      this.frozenThrough = Math.max(this.frozenThrough, count - 1);
    }
  }
  freezePredictionRange(start, count, estimate, preserveForOffset = false) {
    if (needsFrozenPredictions(this.root, preserveForOffset)) {
      const [before, fromStart] = splitTree(this, this.root, start);
      const [range, after] = splitTree(this, fromStart, count);
      freezePredictions(range, estimate, preserveForOffset);
      this.root = joinTrees(joinTrees(before, range), after);
    }
  }
  isSizePredictionConsumed(index) {
    this.assertIndex(index);
    const located = findPieceAtIndex(this.root, index);
    const piece = located == null ? void 0 : located.node.piece;
    return (piece == null ? void 0 : piece.type) === PIECE_UNKNOWN ? piece.estimate !== void 0 : !!located && (piece == null ? void 0 : piece.kinds[located.offset]) === SIZE_CACHED_CONSUMED;
  }
  hasAssignedSize(index) {
    var _a3;
    this.assertIndex(index);
    const piece = (_a3 = findPieceAtIndex(this.root, index)) == null ? void 0 : _a3.node.piece;
    return (piece == null ? void 0 : piece.type) === PIECE_KNOWN || (piece == null ? void 0 : piece.type) === PIECE_UNKNOWN && piece.estimate !== void 0;
  }
  setEstimatedSize(estimatedSize) {
    this.estimatedSize = normalizeSize(estimatedSize);
  }
  getEstimatedSize() {
    return this.estimatedSize;
  }
  getMeasuredAverageSize() {
    const measuredCount = this.getMeasuredCount();
    return measuredCount > 0 ? getMeasuredSizeTotal(this.root) / measuredCount : void 0;
  }
  getPositiveMeasuredAverageSize() {
    const count = getPositiveMeasuredCount(this.root);
    return count > 0 ? getMeasuredSizeTotal(this.root) / count : void 0;
  }
  getMeasuredCount() {
    return getMeasuredCount(this.root);
  }
  getDebugStats() {
    const stats = {
      allocatedKnownSlots: 0,
      knownBlockCount: 0,
      knownCount: getKnownCount(this.root),
      nodeCount: 0,
      unknownRunCount: 0
    };
    visitNodes(this.root, (node) => {
      stats.nodeCount++;
      if (node.piece.type === PIECE_KNOWN) {
        stats.knownBlockCount++;
        stats.allocatedKnownSlots += node.piece.sizes.length;
      } else {
        stats.unknownRunCount++;
      }
    });
    return stats;
  }
  hasIndex(index) {
    return index !== void 0 && Number.isInteger(index) && index >= 0 && index < this.length;
  }
  getOffset(index) {
    this.assertIndex(index);
    let node = this.root;
    let remaining = index;
    let offset = 0;
    while (node) {
      const leftCount = getLogicalCount(node.left);
      if (remaining < leftCount) {
        node = node.left;
      } else {
        offset += getEffectiveSize(node.left, this.estimatedSize);
        remaining -= leftCount;
        if (remaining < node.piece.count) {
          offset += getPiecePrefixSize(node.piece, remaining, this.estimatedSize);
          break;
        }
        offset += getPieceEffectiveSize(node.piece, this.estimatedSize);
        remaining -= node.piece.count;
        node = node.right;
      }
    }
    return offset;
  }
  getSize(index) {
    var _a3;
    this.assertIndex(index);
    let node = this.root;
    let remaining = index;
    let size = this.estimatedSize;
    while (node) {
      const leftCount = getLogicalCount(node.left);
      if (remaining < leftCount) {
        node = node.left;
      } else if (remaining < leftCount + node.piece.count) {
        size = node.piece.type === PIECE_KNOWN ? node.piece.sizes[remaining - leftCount] : (_a3 = node.piece.estimate) != null ? _a3 : this.estimatedSize;
        break;
      } else {
        remaining -= leftCount + node.piece.count;
        node = node.right;
      }
    }
    return size;
  }
  getTotalSize() {
    return getEffectiveSize(this.root, this.estimatedSize);
  }
  forEachLayout(startIndex, endIndex, callback) {
    const start = Math.max(0, Math.trunc(startIndex));
    const end = Math.min(this.length - 1, Math.trunc(endIndex));
    if (start <= end) {
      let offset = this.getOffset(start);
      const visit = (node, baseIndex) => {
        var _a3;
        if (!node) return;
        const pieceStart = baseIndex + getLogicalCount(node.left);
        const pieceEnd = pieceStart + node.piece.count;
        if (start < pieceStart) visit(node.left, baseIndex);
        const first = Math.max(start, pieceStart);
        const last = Math.min(end, pieceEnd - 1);
        for (let index = first; index <= last; index++) {
          const size = node.piece.type === PIECE_KNOWN ? node.piece.sizes[index - pieceStart] : (_a3 = node.piece.estimate) != null ? _a3 : this.estimatedSize;
          callback(index, offset, size);
          offset += size;
        }
        if (end >= pieceEnd) visit(node.right, pieceEnd);
      };
      visit(this.root, 0);
    }
  }
  replaceKnownSizeEntries(entries, estimatedSize = this.estimatedSize, retainPredictions = false, deferTrace) {
    const normalizedEstimate = normalizeSize(estimatedSize);
    const byIndex = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      this.assertIndex(entry.index);
      normalizeSize(entry.size);
      const existing = byIndex.get(entry.index);
      if (entry.type === "measured") {
        byIndex.set(entry.index, { kind: SIZE_MEASURED, size: entry.size });
      } else if ((existing == null ? void 0 : existing.kind) !== SIZE_MEASURED) {
        byIndex.set(entry.index, {
          kind: retainPredictions && this.isSizePredictionConsumed(entry.index) ? SIZE_CACHED_CONSUMED : SIZE_CACHED,
          size: entry.size
        });
      }
    }
    const sortedEntries = Array.from(byIndex, ([index, entry]) => ({ index, ...entry })).sort(
      (first, second) => first.index - second.index
    );
    const trace = IS_DEV ? reseedTrace.__LEGEND_LIST_PREFIX_RESEED_TRACE__ : void 0;
    if (trace) reseedAggregateUpdates = 0;
    const nodes = isBulkPrefixReseedEnabled() ? [] : void 0;
    let root;
    const append = (node) => {
      if (nodes) nodes.push(node);
      else root = joinTrees(root, node);
    };
    let cursor = 0;
    let entryIndex = 0;
    while (entryIndex < sortedEntries.length) {
      const first = sortedEntries[entryIndex];
      if (first.index > cursor) {
        append(createUnknownNode(this, first.index - cursor));
        cursor = first.index;
      }
      const blockEntries = [];
      while (entryIndex < sortedEntries.length && sortedEntries[entryIndex].index === cursor && blockEntries.length < KNOWN_BLOCK_CAPACITY) {
        const entry = sortedEntries[entryIndex];
        blockEntries.push(entry);
        cursor++;
        entryIndex++;
      }
      append(createKnownNodeFromEntries(this, blockEntries));
    }
    if (cursor < this.length) {
      append(createUnknownNode(this, this.length - cursor));
    }
    if (nodes) root = nodes.length > 1 ? buildTree(nodes) : nodes[0];
    const previousRoot = retainPredictions ? this.root : void 0;
    this.frozenThrough = -1;
    this.estimatedSize = normalizedEstimate;
    this.root = root;
    const aggregateUpdates = reseedAggregateUpdates;
    reseedAggregateUpdates = void 0;
    const restore = (node, start) => {
      if (!node || node.frozenCount === 0 && node.knownCount === 0) return;
      restore(node.left, start);
      start += getLogicalCount(node.left);
      if (node.piece.type === PIECE_UNKNOWN && node.piece.estimate !== void 0) {
        this.freezePredictionRange(start, node.piece.count, node.piece.estimate, node.piece.offsetPrediction);
      } else if (node.piece.type === PIECE_KNOWN) {
        for (let offset = 0; offset < node.piece.count; offset++) {
          if (node.piece.kinds[offset] === SIZE_CACHED_CONSUMED) {
            this.freezePredictionRange(start + offset, 1, node.piece.sizes[offset]);
          }
        }
      }
      restore(node.right, start + node.piece.count);
    };
    restore(previousRoot, 0);
    if (trace) {
      if (deferTrace) deferTrace(() => trace(aggregateUpdates));
      else trace(aggregateUpdates);
    }
  }
  invalidateRange(index, count) {
    assertMutationRange(this.length, index, count, "invalidateRange");
    if (count > 0) {
      this.frozenThrough = -1;
      const [before, fromIndex] = splitTree(this, this.root, index);
      const [, after] = splitTree(this, fromIndex, count);
      this.root = joinTrees(joinTrees(before, createUnknownNode(this, count)), after);
    }
  }
  move(from, to, count) {
    assertMoveRange(this.length, from, to, count);
    if (count > 0 && from !== to) {
      this.frozenThrough = -1;
      const [before, fromIndex] = splitTree(this, this.root, from);
      const [moved, after] = splitTree(this, fromIndex, count);
      const withoutMoved = joinTrees(before, after);
      const [atDestination, afterDestination] = splitTree(this, withoutMoved, to);
      this.root = joinTrees(joinTrees(atDestination, moved), afterDestination);
    }
  }
  resize(length) {
    const normalizedLength = normalizeLength(length);
    if (normalizedLength > this.length) {
      this.splice(this.length, 0, normalizedLength - this.length);
    } else if (normalizedLength < this.length) {
      this.splice(normalizedLength, this.length - normalizedLength, 0);
    }
  }
  splice(index, deleteCount, insertCount) {
    assertMutationRange(this.length, index, deleteCount, "splice");
    normalizeLength(insertCount);
    if (deleteCount > 0 || insertCount > 0) {
      const prediction = findOffsetPrediction(this.root, 0, index);
      this.frozenThrough = -1;
      const [before, fromIndex] = splitTree(this, this.root, index);
      const [, after] = splitTree(this, fromIndex, deleteCount);
      this.lengthValue += insertCount - deleteCount;
      this.root = joinTrees(joinTrees(before, createUnknownNode(this, insertCount, prediction)), after);
    }
  }
  setCachedSize(index, size) {
    return this.setKnownSize(index, size, SIZE_CACHED);
  }
  setMeasuredSize(index, size) {
    return this.setKnownSize(index, size, SIZE_MEASURED);
  }
  setKnownSize(index, size, kind) {
    var _a3;
    this.assertIndex(index);
    const normalizedSize = normalizeSize(size);
    const located = findPieceAtIndexWithPath(this.root, index);
    const existingPiece = located == null ? void 0 : located.node.piece;
    if (kind === SIZE_CACHED && (index <= this.frozenThrough || (existingPiece == null ? void 0 : existingPiece.type) === PIECE_UNKNOWN && existingPiece.estimate !== void 0 || located && (existingPiece == null ? void 0 : existingPiece.type) === PIECE_KNOWN && existingPiece.kinds[located.offset] === SIZE_CACHED_CONSUMED))
      kind = SIZE_CACHED_CONSUMED;
    const previousSize = located && (existingPiece == null ? void 0 : existingPiece.type) === PIECE_KNOWN ? existingPiece.sizes[located.offset] : (_a3 = (existingPiece == null ? void 0 : existingPiece.type) === PIECE_UNKNOWN ? existingPiece.estimate : void 0) != null ? _a3 : this.estimatedSize;
    const didChange = previousSize !== normalizedSize;
    if (located && (existingPiece == null ? void 0 : existingPiece.type) === PIECE_KNOWN) {
      const wasMeasured = existingPiece.kinds[located.offset] === SIZE_MEASURED;
      if (didChange || existingPiece.kinds[located.offset] !== kind) {
        const previousMeasuredSize = wasMeasured ? previousSize : 0;
        existingPiece.sizes[located.offset] = normalizedSize;
        existingPiece.unconsumedCachedCount += Number(kind === SIZE_CACHED) - Number(existingPiece.kinds[located.offset] === SIZE_CACHED);
        existingPiece.kinds[located.offset] = kind;
        existingPiece.prefixSizes = void 0;
        existingPiece.knownSizeTotal += normalizedSize - previousSize;
        existingPiece.measuredCount += Number(kind === SIZE_MEASURED) - Number(wasMeasured);
        const measuredSize = kind === SIZE_MEASURED ? normalizedSize : 0;
        existingPiece.measuredSizeTotal += measuredSize - previousMeasuredSize;
        existingPiece.positiveMeasuredCount += Number(measuredSize > 0) - Number(previousMeasuredSize > 0);
        updatePath(located.path);
      }
    } else if (!this.tryAppendKnownToPreviousBlock(index, normalizedSize, kind, located)) {
      const [before, fromIndex] = splitTree(this, this.root, index);
      const [, after] = splitTree(this, fromIndex, 1);
      const known = createKnownNodeFromEntries(this, [{ kind, size: normalizedSize }]);
      this.root = joinTrees(joinTrees(before, known), after);
    }
    return didChange;
  }
  assertIndex(index) {
    if (!this.hasIndex(index)) {
      throw new RangeError(`PrefixLayoutStore index ${index} is out of bounds for length ${this.length}`);
    }
  }
  tryAppendKnownToPreviousBlock(index, size, kind, current) {
    let didAppend = false;
    const currentPiece = current == null ? void 0 : current.node.piece;
    if (index > 0 && (current == null ? void 0 : current.offset) === 0 && (currentPiece == null ? void 0 : currentPiece.type) === PIECE_UNKNOWN && currentPiece.count > 1) {
      const previous = findPieceAtIndexWithPath(this.root, index - 1);
      const previousPiece = previous == null ? void 0 : previous.node.piece;
      if (previous && (previousPiece == null ? void 0 : previousPiece.type) === PIECE_KNOWN && previous.offset === previousPiece.count - 1 && previousPiece.count < KNOWN_BLOCK_CAPACITY) {
        ensureKnownPieceCapacity(previousPiece, previousPiece.count + 1);
        previousPiece.sizes[previousPiece.count] = size;
        previousPiece.kinds[previousPiece.count] = kind;
        previousPiece.count++;
        previousPiece.prefixSizes = void 0;
        previousPiece.knownSizeTotal += size;
        previousPiece.unconsumedCachedCount += Number(kind === SIZE_CACHED);
        if (kind === SIZE_MEASURED) {
          previousPiece.measuredCount++;
          previousPiece.positiveMeasuredCount += Number(size > 0);
          previousPiece.measuredSizeTotal += size;
        }
        currentPiece.count--;
        updatePath(previous.path);
        updatePath(current.path);
        didAppend = true;
      }
    }
    return didAppend;
  }
};
var PrefixLayoutStore = class extends SparseSequenceLayoutStore {
};
function cloneTree(node) {
  if (!node) return void 0;
  const piece = node.piece;
  return {
    ...node,
    left: cloneTree(node.left),
    piece: piece.type === PIECE_UNKNOWN ? { ...piece } : { ...piece, kinds: piece.kinds.slice(), sizes: piece.sizes.slice() },
    right: cloneTree(node.right)
  };
}
function findOffsetPrediction(node, start, from) {
  if (!node || node.offsetPredictionCount === 0 || start + node.logicalCount <= from) return void 0;
  const left = findOffsetPrediction(node.left, start, from);
  if (left !== void 0) return left;
  start += getLogicalCount(node.left);
  if (start + node.piece.count > from && node.piece.type === PIECE_UNKNOWN && node.piece.offsetPrediction)
    return node.piece.estimate;
  return findOffsetPrediction(node.right, start + node.piece.count, from);
}
function findFirstUnmeasuredIndex(node, index, fromIndex) {
  if (!node || index + node.logicalCount <= fromIndex || node.measuredCount === node.logicalCount) return void 0;
  const left = findFirstUnmeasuredIndex(node.left, index, fromIndex);
  if (left !== void 0) return left;
  index += getLogicalCount(node.left);
  const piece = node.piece;
  if (index + piece.count > fromIndex) {
    if (piece.type === PIECE_UNKNOWN) return Math.max(index, fromIndex);
    if (piece.measuredCount < piece.count) {
      for (let offset = Math.max(0, fromIndex - index); offset < piece.count; offset++) {
        if (piece.kinds[offset] !== SIZE_MEASURED) return index + offset;
      }
    }
  }
  return findFirstUnmeasuredIndex(node.right, index + piece.count, fromIndex);
}
function copyRange(node, baseIndex, start, end, sizes, kinds) {
  if (!node) return;
  const pieceStart = baseIndex + getLogicalCount(node.left);
  const pieceEnd = pieceStart + node.piece.count;
  if (start < pieceStart) copyRange(node.left, baseIndex, start, end, sizes, kinds);
  const piece = node.piece;
  if (piece.type === PIECE_KNOWN) {
    for (let index = Math.max(start, pieceStart); index <= Math.min(end, pieceEnd - 1); index++) {
      sizes[index - start] = piece.sizes[index - pieceStart];
      kinds[index - start] = piece.kinds[index - pieceStart];
    }
  }
  if (piece.type === PIECE_UNKNOWN && piece.estimate !== void 0 && start < pieceEnd && end >= pieceStart) {
    sizes.fill(piece.estimate, Math.max(start, pieceStart) - start, Math.min(end + 1, pieceEnd) - start);
    if (piece.offsetPrediction)
      kinds.fill(PREDICTION_OFFSET, Math.max(start, pieceStart) - start, Math.min(end + 1, pieceEnd) - start);
  }
  if (end >= pieceEnd) copyRange(node.right, pieceEnd, start, end, sizes, kinds);
}
function createUnknownNode(store, count, estimate) {
  return count > 0 ? createNode(store, { count, estimate, offsetPrediction: estimate !== void 0, type: PIECE_UNKNOWN }) : void 0;
}
function createKnownNodeFromEntries(store, entries) {
  const sizes = new Float64Array(entries.length);
  const kinds = new Uint8Array(entries.length);
  for (let index = 0; index < entries.length; index++) {
    sizes[index] = entries[index].size;
    kinds[index] = entries[index].kind;
  }
  return createNode(store, createKnownPiece(sizes, kinds, entries.length));
}
function createNode(store, piece) {
  return updateNode({
    frozenCount: 0,
    frozenSizeTotal: 0,
    knownCount: 0,
    knownSizeTotal: 0,
    logicalCount: 0,
    measuredCount: 0,
    measuredSizeTotal: 0,
    offsetPredictionCount: 0,
    piece,
    positiveMeasuredCount: 0,
    priority: store.nextPriority(),
    unconsumedCachedCount: 0
  });
}
function updateNode(node) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w;
  if (IS_DEV && reseedAggregateUpdates !== void 0) reseedAggregateUpdates++;
  const knownPiece = node.piece.type === PIECE_KNOWN ? node.piece : void 0;
  const frozenPiece = node.piece.type === PIECE_UNKNOWN && node.piece.estimate !== void 0 ? node.piece : void 0;
  node.unconsumedCachedCount = ((_b = (_a3 = node.left) == null ? void 0 : _a3.unconsumedCachedCount) != null ? _b : 0) + ((_c = knownPiece == null ? void 0 : knownPiece.unconsumedCachedCount) != null ? _c : 0) + ((_e = (_d = node.right) == null ? void 0 : _d.unconsumedCachedCount) != null ? _e : 0);
  node.frozenCount = ((_g = (_f = node.left) == null ? void 0 : _f.frozenCount) != null ? _g : 0) + ((_h = frozenPiece == null ? void 0 : frozenPiece.count) != null ? _h : 0) + ((_j = (_i = node.right) == null ? void 0 : _i.frozenCount) != null ? _j : 0);
  node.offsetPredictionCount = ((_l = (_k = node.left) == null ? void 0 : _k.offsetPredictionCount) != null ? _l : 0) + ((frozenPiece == null ? void 0 : frozenPiece.offsetPrediction) ? frozenPiece.count : 0) + ((_n = (_m = node.right) == null ? void 0 : _m.offsetPredictionCount) != null ? _n : 0);
  node.frozenSizeTotal = ((_p = (_o = node.left) == null ? void 0 : _o.frozenSizeTotal) != null ? _p : 0) + (frozenPiece ? frozenPiece.count * frozenPiece.estimate : 0) + ((_r = (_q = node.right) == null ? void 0 : _q.frozenSizeTotal) != null ? _r : 0);
  node.logicalCount = getLogicalCount(node.left) + node.piece.count + getLogicalCount(node.right);
  node.knownCount = getKnownCount(node.left) + ((_s = knownPiece == null ? void 0 : knownPiece.count) != null ? _s : 0) + getKnownCount(node.right);
  node.knownSizeTotal = getKnownSizeTotal(node.left) + ((_t = knownPiece == null ? void 0 : knownPiece.knownSizeTotal) != null ? _t : 0) + getKnownSizeTotal(node.right);
  node.measuredCount = getMeasuredCount(node.left) + ((_u = knownPiece == null ? void 0 : knownPiece.measuredCount) != null ? _u : 0) + getMeasuredCount(node.right);
  node.positiveMeasuredCount = getPositiveMeasuredCount(node.left) + ((_v = knownPiece == null ? void 0 : knownPiece.positiveMeasuredCount) != null ? _v : 0) + getPositiveMeasuredCount(node.right);
  node.measuredSizeTotal = getMeasuredSizeTotal(node.left) + ((_w = knownPiece == null ? void 0 : knownPiece.measuredSizeTotal) != null ? _w : 0) + getMeasuredSizeTotal(node.right);
  return node;
}
function getLogicalCount(node) {
  var _a3;
  return (_a3 = node == null ? void 0 : node.logicalCount) != null ? _a3 : 0;
}
function getKnownCount(node) {
  var _a3;
  return (_a3 = node == null ? void 0 : node.knownCount) != null ? _a3 : 0;
}
function getKnownSizeTotal(node) {
  var _a3;
  return (_a3 = node == null ? void 0 : node.knownSizeTotal) != null ? _a3 : 0;
}
function getMeasuredCount(node) {
  var _a3;
  return (_a3 = node == null ? void 0 : node.measuredCount) != null ? _a3 : 0;
}
function getPositiveMeasuredCount(node) {
  var _a3;
  return (_a3 = node == null ? void 0 : node.positiveMeasuredCount) != null ? _a3 : 0;
}
function getMeasuredSizeTotal(node) {
  var _a3;
  return (_a3 = node == null ? void 0 : node.measuredSizeTotal) != null ? _a3 : 0;
}
function getFloatingCount(node) {
  return node ? node.logicalCount - node.knownCount - node.frozenCount : 0;
}
function needsFrozenPredictions(node, preserveForOffset) {
  return !!node && (getFloatingCount(node) > 0 || node.unconsumedCachedCount > 0 || preserveForOffset && node.offsetPredictionCount < node.logicalCount - node.knownCount);
}
function freezePredictions(node, estimate, preserveForOffset) {
  var _a3, _b;
  if (node && needsFrozenPredictions(node, preserveForOffset)) {
    freezePredictions(node.left, estimate, preserveForOffset);
    if (node.piece.type === PIECE_UNKNOWN) {
      (_b = (_a3 = node.piece).estimate) != null ? _b : _a3.estimate = estimate;
      if (preserveForOffset) node.piece.offsetPrediction = true;
    } else if (node.piece.unconsumedCachedCount > 0) {
      for (let index = 0; index < node.piece.count; index++) {
        if (node.piece.kinds[index] === SIZE_CACHED) node.piece.kinds[index] = SIZE_CACHED_CONSUMED;
      }
      node.piece.unconsumedCachedCount = 0;
    }
    freezePredictions(node.right, estimate, preserveForOffset);
    updateNode(node);
  }
}
function getEffectiveSize(node, estimatedSize) {
  return node ? node.knownSizeTotal + node.frozenSizeTotal + getFloatingCount(node) * estimatedSize : 0;
}
function getPieceEffectiveSize(piece, estimatedSize) {
  var _a3;
  let size = piece.count * (piece.type === PIECE_UNKNOWN ? (_a3 = piece.estimate) != null ? _a3 : estimatedSize : estimatedSize);
  if (piece.type === PIECE_KNOWN) {
    size = piece.knownSizeTotal;
  }
  return size;
}
function getPiecePrefixSize(piece, count, estimatedSize) {
  var _a3;
  return piece.type === PIECE_KNOWN ? getKnownPrefixSizes(piece)[count] : count * ((_a3 = piece.estimate) != null ? _a3 : estimatedSize);
}
function getKnownPrefixSizes(piece) {
  let prefixSizes = piece.prefixSizes;
  if (!prefixSizes || prefixSizes.length !== piece.count + 1) {
    prefixSizes = new Float64Array(piece.count + 1);
    for (let index = 0; index < piece.count; index++) {
      prefixSizes[index + 1] = prefixSizes[index] + piece.sizes[index];
    }
    piece.prefixSizes = prefixSizes;
  }
  return prefixSizes;
}
function findPieceAtIndex(root, index) {
  let node = root;
  let remaining = index;
  while (node) {
    const leftCount = getLogicalCount(node.left);
    if (remaining < leftCount) {
      node = node.left;
    } else if (remaining < leftCount + node.piece.count) {
      return { node, offset: remaining - leftCount };
    } else {
      remaining -= leftCount + node.piece.count;
      node = node.right;
    }
  }
  return void 0;
}
function findPieceAtIndexWithPath(root, index) {
  let node = root;
  let remaining = index;
  const path = [];
  let result;
  while (node) {
    path.push(node);
    const leftCount = getLogicalCount(node.left);
    if (remaining < leftCount) {
      node = node.left;
    } else if (remaining < leftCount + node.piece.count) {
      result = { node, offset: remaining - leftCount, path };
      break;
    } else {
      remaining -= leftCount + node.piece.count;
      node = node.right;
    }
  }
  return result;
}
function updatePath(path) {
  for (let index = path.length - 1; index >= 0; index--) {
    updateNode(path[index]);
  }
}
function ensureKnownPieceCapacity(piece, count) {
  if (piece.sizes.length < count) {
    const sizes = new Float64Array(KNOWN_BLOCK_CAPACITY);
    const kinds = new Uint8Array(KNOWN_BLOCK_CAPACITY);
    sizes.set(piece.sizes.subarray(0, piece.count));
    kinds.set(piece.kinds.subarray(0, piece.count));
    piece.sizes = sizes;
    piece.kinds = kinds;
  }
}
function findIndexInPiece(piece, prefixSize, offset, estimatedSize) {
  var _a3, _b;
  let index = 0;
  if (piece.type === PIECE_KNOWN) {
    const prefixSizes = getKnownPrefixSizes(piece);
    let low = 0;
    let high = piece.count;
    while (low < high) {
      const middle = low + high >>> 1;
      if (isLessThanOrEqualOffset(prefixSize + prefixSizes[middle + 1], offset)) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    index = low < piece.count ? low : 0;
  } else if (((_a3 = piece.estimate) != null ? _a3 : estimatedSize) > 0) {
    estimatedSize = (_b = piece.estimate) != null ? _b : estimatedSize;
    index = Math.max(0, Math.min(piece.count - 1, Math.floor((offset - prefixSize) / estimatedSize)));
    while (index < piece.count - 1 && isLessThanOrEqualOffset(prefixSize + (index + 1) * estimatedSize, offset)) {
      index++;
    }
    while (index > 0 && !isLessThanOrEqualOffset(prefixSize + index * estimatedSize, offset)) {
      index--;
    }
  }
  return index;
}
function splitTree(store, root, leftLogicalCount) {
  if (!root) {
    return [void 0, void 0];
  }
  const leftCount = getLogicalCount(root.left);
  if (leftLogicalCount < leftCount) {
    const [before, after] = splitTree(store, root.left, leftLogicalCount);
    root.left = after;
    return [before, updateNode(root)];
  }
  if (leftLogicalCount > leftCount + root.piece.count) {
    const [before, after] = splitTree(store, root.right, leftLogicalCount - leftCount - root.piece.count);
    root.right = before;
    return [updateNode(root), after];
  }
  if (leftLogicalCount === leftCount) {
    const before = root.left;
    root.left = void 0;
    return [before, updateNode(root)];
  }
  if (leftLogicalCount === leftCount + root.piece.count) {
    const after = root.right;
    root.right = void 0;
    return [updateNode(root), after];
  }
  const pieceOffset = leftLogicalCount - leftCount;
  const [leftPiece, rightPiece] = splitPiece(root.piece, pieceOffset);
  return [joinTrees(root.left, createNode(store, leftPiece)), joinTrees(createNode(store, rightPiece), root.right)];
}
function splitPiece(piece, count) {
  return piece.type === PIECE_UNKNOWN ? [
    { count, estimate: piece.estimate, offsetPrediction: piece.offsetPrediction, type: PIECE_UNKNOWN },
    {
      count: piece.count - count,
      estimate: piece.estimate,
      offsetPrediction: piece.offsetPrediction,
      type: PIECE_UNKNOWN
    }
  ] : [
    createKnownPiece(piece.sizes.slice(0, count), piece.kinds.slice(0, count), count),
    createKnownPiece(
      piece.sizes.slice(count, piece.count),
      piece.kinds.slice(count, piece.count),
      piece.count - count
    )
  ];
}
function joinTrees(left, right) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  const [leftRest, last] = popRightNode(left);
  const [first, rightRest] = popLeftNode(right);
  const mergedPiece = mergePieces(last.piece, first.piece);
  if (mergedPiece) {
    last.piece = mergedPiece;
    return joinTrees(joinTrees(leftRest, updateNode(last)), rightRest);
  }
  return mergeTreesRaw(mergeTreesRaw(leftRest, last), mergeTreesRaw(first, rightRest));
}
function mergePieces(left, right) {
  let merged;
  if (left.type === PIECE_UNKNOWN && right.type === PIECE_UNKNOWN && left.estimate === right.estimate && left.offsetPrediction === right.offsetPrediction) {
    merged = {
      count: left.count + right.count,
      estimate: left.estimate,
      offsetPrediction: left.offsetPrediction,
      type: PIECE_UNKNOWN
    };
  } else if (left.type === PIECE_KNOWN && right.type === PIECE_KNOWN && left.count + right.count <= KNOWN_BLOCK_CAPACITY) {
    const count = left.count + right.count;
    let sizes = left.sizes;
    let kinds = left.kinds;
    if (sizes.length < count) {
      sizes = new Float64Array(KNOWN_BLOCK_CAPACITY);
      kinds = new Uint8Array(KNOWN_BLOCK_CAPACITY);
      sizes.set(left.sizes.subarray(0, left.count));
      kinds.set(left.kinds.subarray(0, left.count));
    }
    sizes.set(right.sizes.subarray(0, right.count), left.count);
    kinds.set(right.kinds.subarray(0, right.count), left.count);
    merged = {
      count,
      kinds,
      knownSizeTotal: left.knownSizeTotal + right.knownSizeTotal,
      measuredCount: left.measuredCount + right.measuredCount,
      measuredSizeTotal: left.measuredSizeTotal + right.measuredSizeTotal,
      positiveMeasuredCount: left.positiveMeasuredCount + right.positiveMeasuredCount,
      prefixSizes: void 0,
      sizes,
      type: PIECE_KNOWN,
      unconsumedCachedCount: left.unconsumedCachedCount + right.unconsumedCachedCount
    };
  }
  return merged;
}
function createKnownPiece(sizes, kinds, count) {
  let knownSizeTotal = 0;
  let unconsumedCachedCount = 0;
  let measuredCount = 0;
  let positiveMeasuredCount = 0;
  let measuredSizeTotal = 0;
  for (let index = 0; index < count; index++) {
    const size = sizes[index];
    knownSizeTotal += size;
    unconsumedCachedCount += Number(kinds[index] === SIZE_CACHED);
    if (kinds[index] === SIZE_MEASURED) {
      measuredCount++;
      positiveMeasuredCount += Number(size > 0);
      measuredSizeTotal += size;
    }
  }
  return {
    count,
    kinds,
    knownSizeTotal,
    measuredCount,
    measuredSizeTotal,
    positiveMeasuredCount,
    prefixSizes: void 0,
    sizes,
    type: PIECE_KNOWN,
    unconsumedCachedCount
  };
}
function buildTree(nodes) {
  const spine = [];
  for (const node of nodes) {
    let left;
    while (spine.length > 0 && spine[spine.length - 1].priority >= node.priority) {
      left = spine.pop();
    }
    node.left = left;
    if (spine.length > 0) spine[spine.length - 1].right = node;
    spine.push(node);
  }
  return updateSubtree(spine[0]);
}
function updateSubtree(node) {
  if (node) {
    updateSubtree(node.left);
    updateSubtree(node.right);
    updateNode(node);
  }
  return node;
}
function mergeTreesRaw(left, right) {
  let root;
  if (!left) {
    root = right;
  } else if (!right) {
    root = left;
  } else if (left.priority < right.priority) {
    left.right = mergeTreesRaw(left.right, right);
    root = updateNode(left);
  } else {
    right.left = mergeTreesRaw(left, right.left);
    root = updateNode(right);
  }
  return root;
}
function popRightNode(root) {
  if (root.right) {
    const [remainingRight, last] = popRightNode(root.right);
    root.right = remainingRight;
    return [updateNode(root), last];
  }
  const remainingTree = root.left;
  root.left = void 0;
  root.right = void 0;
  return [remainingTree, updateNode(root)];
}
function popLeftNode(root) {
  if (root.left) {
    const [first, remainingLeft] = popLeftNode(root.left);
    root.left = remainingLeft;
    return [first, updateNode(root)];
  }
  const remainingTree = root.right;
  root.left = void 0;
  root.right = void 0;
  return [updateNode(root), remainingTree];
}
function visitNodes(node, visit) {
  if (node) {
    visitNodes(node.left, visit);
    visit(node);
    visitNodes(node.right, visit);
  }
}
function getNodePriority(id) {
  let value = id + 2654435769 >>> 0;
  value = Math.imul(value ^ value >>> 16, 2246822507) >>> 0;
  value = Math.imul(value ^ value >>> 13, 3266489909) >>> 0;
  return (value ^ value >>> 16) >>> 0;
}
function assertMoveRange(length, from, to, count) {
  assertMutationRange(length, from, count, "move");
  if (!Number.isInteger(to) || to < 0 || to > length - count) {
    throw new RangeError(
      `PrefixLayoutStore move destination ${to} is invalid for length ${length} and count ${count}`
    );
  }
}
function assertMutationRange(length, index, count, operation) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 0 || count < 0 || index + count > length) {
    throw new RangeError(`PrefixLayoutStore ${operation} range ${index}:${count} is invalid for length ${length}`);
  }
}
function normalizeLength(length) {
  if (!Number.isInteger(length) || length < 0) {
    throw new RangeError(`PrefixLayoutStore length must be a non-negative integer. Received ${length}`);
  }
  return length;
}
function normalizeSize(size) {
  if (!Number.isFinite(size) || size < 0) {
    throw new RangeError(`Layout size must be a finite non-negative number. Received ${size}`);
  }
  return size;
}
function isLessThanOrEqualOffset(prefixSize, offset) {
  return prefixSize <= offset || Number.isFinite(prefixSize) && Number.isFinite(offset) && Math.abs(prefixSize - offset) <= Number.EPSILON * Math.max(1, Math.abs(prefixSize), Math.abs(offset)) * 16;
}

// src/core/addTotalSize.ts
function addTotalSize(ctx, key, add, notifyTotalSize = true) {
  const state = ctx.state;
  const prevTotalSize = state.totalSize;
  let totalSize = state.totalSize;
  if (key === null) {
    totalSize = add;
    if (state.timeoutSetPaddingTop) {
      const timeout = state.timeoutSetPaddingTop;
      state.timeoutSetPaddingTop = void 0;
      afterLayout(ctx, () => clearTimeout(timeout));
    }
  } else {
    totalSize += add;
  }
  if (prevTotalSize !== totalSize) {
    if (!IsNewArchitecture && state.initialScroll && totalSize < prevTotalSize) {
      state.pendingTotalSize = totalSize;
    } else {
      state.pendingTotalSize = void 0;
      state.totalSize = totalSize;
      if (notifyTotalSize) {
        set$(ctx, "totalSize", totalSize);
      }
      updateContentMetricsState(ctx);
    }
  } else if (notifyTotalSize && ctx.values.get("totalSize") !== totalSize) {
    set$(ctx, "totalSize", totalSize);
  }
}

// src/core/setSize.ts
function setSize(ctx, itemKey, size, notifyTotalSize = true) {
  const state = ctx.state;
  const { sizes } = state;
  const previousSize = sizes.get(itemKey);
  const diff = previousSize !== void 0 ? size - previousSize : size;
  if (diff !== 0) {
    addTotalSize(ctx, itemKey, diff, notifyTotalSize);
  }
  sizes.set(itemKey, size);
}
var PixelRatio = PixelRatio$1;

// src/utils/helpers.ts
function isFunction(obj) {
  return typeof obj === "function";
}
function isArray(obj) {
  return Array.isArray(obj);
}
var warned = /* @__PURE__ */ new Set();
function warnDevOnce(id, text) {
  if (IS_DEV && !warned.has(id)) {
    warned.add(id);
    console.warn(`[legend-list] ${text}`);
  }
}
function roundSize(size) {
  return Math.floor(size * 8) / 8;
}
function isNullOrUndefined(value) {
  return value === null || value === void 0;
}
function getPadding(s, type) {
  var _a3, _b, _c;
  const axisPadding = type === "Left" || type === "Right" ? s.paddingHorizontal : s.paddingVertical;
  return (_c = (_b = (_a3 = s[`padding${type}`]) != null ? _a3 : axisPadding) != null ? _b : s.padding) != null ? _c : 0;
}
function extractPadding(style, contentContainerStyle, type) {
  return getPadding(style, type) + getPadding(contentContainerStyle, type);
}
function findContainerId(ctx, key) {
  var _a3, _b;
  const directMatch = (_b = (_a3 = ctx.state) == null ? void 0 : _a3.containerItemKeys) == null ? void 0 : _b.get(key);
  if (directMatch !== void 0) {
    return directMatch;
  }
  const numContainers = peek$(ctx, "numContainers");
  for (let i = 0; i < numContainers; i++) {
    const itemKey = peek$(ctx, `containerItemKey${i}`);
    if (itemKey === key) {
      return i;
    }
  }
  return -1;
}

// src/utils/layoutMeasurement.ts
var FLOATING_POINT_SLACK = 0.01;
var NATIVE_LAYOUT_MEASUREMENT_EPSILON = 1 / PixelRatio.get() + FLOATING_POINT_SLACK;
function isWithinEpsilon(delta) {
  return Math.abs(delta) <= NATIVE_LAYOUT_MEASUREMENT_EPSILON;
}
function isNativeLayoutNoise(delta) {
  return isWithinEpsilon(delta);
}
function normalizeLayoutSize(size, fallback = 0) {
  if (!Number.isFinite(size) || size < 0) {
    warnDevOnce(
      "invalid-layout-size",
      `Item sizes must be finite non-negative numbers. Received ${size}; using ${fallback} instead.`
    );
    return fallback;
  }
  return size;
}

// src/utils/getItemSize.ts
function getFixedItemLayoutSize(ctx, index, data, resolved) {
  var _a3, _b;
  const state = ctx.state;
  const { getFixedItemSize, getItemType } = state.props;
  let size;
  if (getFixedItemSize && data !== void 0) {
    const itemType = (_b = resolved == null ? void 0 : resolved.itemType) != null ? _b : getItemType ? (_a3 = getItemType(data, index)) != null ? _a3 : "" : "";
    const fixedSize = (resolved == null ? void 0 : resolved.didResolveFixedItemSize) ? resolved.fixedItemSize : getFixedItemSize(data, index, itemType);
    if (fixedSize !== void 0) {
      size = normalizeLayoutSize(normalizeLayoutSize(fixedSize) + ctx.scrollAxisGap);
    }
  }
  return size;
}
function getKnownOrFixedSize(ctx, key, index, data, resolved) {
  var _a3, _b;
  const state = ctx.state;
  let size = key ? state.sizesKnown.get(key) : void 0;
  if (size === void 0 && key) {
    const fixedLayoutSize = getFixedItemLayoutSize(ctx, index, data, resolved);
    if (fixedLayoutSize !== void 0) {
      size = fixedLayoutSize;
      state.scrollForNextCalculateItemsInView = void 0;
      state.sizesKnown.set(key, size);
      const store = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
      if ((store == null ? void 0 : store.hasIndex(index)) && store.setMeasuredSize(index, size)) {
        addTotalSize(ctx, null, store.getTotalSize(), false);
      }
      (_b = state.fixedItemSizeKeys) != null ? _b : state.fixedItemSizeKeys = /* @__PURE__ */ new Set();
      state.fixedItemSizeKeys.add(key);
    }
  }
  return size;
}
function getKnownOrFixedItemSize(ctx, index) {
  const key = getId(ctx.state, index);
  return getKnownOrFixedSize(ctx, key, index, getDataItem(ctx.state, index));
}
function areKnownOrFixedItemSizesAvailable(ctx, startIndex, endIndex) {
  for (let index = startIndex; index <= endIndex; index++) {
    if (getKnownOrFixedItemSize(ctx, index) === void 0) {
      return false;
    }
  }
  return true;
}
function getItemSize(ctx, key, index, data, notifyTotalSize, resolved) {
  var _a3;
  const state = ctx.state;
  const sizeKnown = state.sizesKnown.get(key);
  if (sizeKnown !== void 0) {
    return sizeKnown;
  }
  const fixedSize = getKnownOrFixedSize(ctx, key, index, data, resolved);
  const store = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  if (fixedSize !== void 0) {
    if (store == null ? void 0 : store.hasIndex(index)) state.sizes.set(key, fixedSize);
    else setSize(ctx, key, fixedSize, notifyTotalSize);
    return fixedSize;
  }
  if (store == null ? void 0 : store.hasIndex(index)) return store.getSize(index);
  const renderedSize = state.sizes.get(key);
  if (renderedSize !== void 0) {
    return renderedSize;
  }
  const size = state.props.estimatedItemSize + ctx.scrollAxisGap;
  setSize(ctx, key, size, notifyTotalSize);
  return size;
}
function getItemSizeAtIndex(ctx, index) {
  if (index === void 0 || index < 0) {
    return void 0;
  }
  const targetId = getId(ctx.state, index);
  return getItemSize(ctx, targetId, index, getDataItem(ctx.state, index));
}

// src/core/fixedLayoutMaterialization.ts
function materializeFixedLayoutStoreRange(ctx, startIndex, endIndex, lookAhead = false) {
  var _a3;
  const state = ctx.state;
  const store = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  let didChange = false;
  if (store && state.props.getFixedItemSize) {
    const start = Math.max(0, Math.trunc(startIndex));
    const end = Math.min(store.length - 1, Math.trunc(endIndex));
    const first = store.findFirstUnmeasuredIndex(start);
    if (first !== void 0 && first <= end) {
      if (store instanceof PrefixLayoutStore) {
        const fillEnd = lookAhead && !state.props.dataSource ? Math.max(end, first + KNOWN_BLOCK_CAPACITY - 1) : end;
        let isLookAheadDone = false;
        didChange = store.fillUnmeasuredRange(first, fillEnd, (index) => {
          const size = isLookAheadDone ? void 0 : resolveFixedSize(ctx, index);
          isLookAheadDone || (isLookAheadDone = size === void 0 && index > end);
          return size;
        });
      } else {
        for (let index = first; index !== void 0 && index <= end; index = store.findFirstUnmeasuredIndex(index + 1)) {
          const fixedSize = resolveFixedSize(ctx, index);
          if (fixedSize !== void 0) {
            didChange = store.setMeasuredSize(index, fixedSize) || didChange;
          }
        }
      }
    }
  }
  return didChange;
}
function resolveFixedSize(ctx, index) {
  const state = ctx.state;
  const existingKey = state.idCache[index];
  const knownSize = existingKey !== void 0 ? state.sizesKnown.get(existingKey) : void 0;
  const fixedSize = knownSize != null ? knownSize : getFixedItemLayoutSize(ctx, index, getDataItem(state, index));
  if (fixedSize !== void 0 && existingKey !== void 0) {
    state.sizesKnown.set(existingKey, fixedSize);
    state.sizes.set(existingKey, fixedSize);
  }
  return fixedSize;
}
function materializeFixedLayoutStoreIndex(ctx, index) {
  let didChange = false;
  if (index !== void 0 && Number.isInteger(index)) {
    didChange = materializeFixedLayoutStoreRange(ctx, index, index);
  }
  return didChange;
}
function materializeFixedLayoutStoreRangeAtOffsets(ctx, startOffset, endOffset, lookAhead = false) {
  var _a3, _b;
  const store = (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  let range = store == null ? void 0 : store.findIndexRangeAtOffsets(startOffset, endOffset);
  let didChange = false;
  if (store && range && ctx.state.props.getFixedItemSize) {
    let materializedEnd = range.start - 1;
    let nextEnd = range.end;
    while (nextEnd > materializedEnd) {
      if (!materializeFixedLayoutStoreRange(ctx, materializedEnd + 1, nextEnd, lookAhead)) break;
      didChange = true;
      materializedEnd = nextEnd;
      range = store.findIndexRangeAtOffsets(startOffset, endOffset);
      nextEnd = (_b = range == null ? void 0 : range.end) != null ? _b : materializedEnd;
    }
  }
  return { didChange, range };
}

// src/core/getStartOffsetAdjustment.ts
function getStartOffsetAdjustment(ctx) {
  const { state } = ctx;
  const stylePaddingStart = state.props.horizontal ? (isHorizontalRTL(state) ? state.props.stylePaddingRight : state.props.stylePaddingLeft) || 0 : peek$(ctx, "stylePaddingTop") || 0;
  return stylePaddingStart + (peek$(ctx, "alignItemsAtEndPadding") || 0) + (peek$(ctx, "headerSize") || 0);
}
function getItemSpaceOffset(ctx, scrollOffset, pending = ((_a3) => (_a3 = peek$(ctx, "scrollAdjustPending")) != null ? _a3 : 0)(), startOffset = getStartOffsetAdjustment(ctx)) {
  return Math.round(scrollOffset + (pending - startOffset));
}

// src/core/layoutAccessors.ts
function getLayoutOffset(ctx, index) {
  var _a3, _b;
  const store = (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  return getLayoutOffsetForStore(
    store,
    index,
    !!ctx.state.didFinishInitialScroll && !!((_b = ctx.state.layoutStoreRuntime) == null ? void 0 : _b.didFlushInitialEstimate)
  );
}
function getLayoutSize(ctx, index) {
  var _a3;
  const store = (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  return getLayoutSizeForStore(store, index);
}
function getLayoutColumnForStore(store, index) {
  let column;
  if (hasColumnLayout(store) && store.hasIndex(index)) {
    column = store.getColumn(index);
  }
  return column;
}
function getLayoutOffsetForStore(store, index, consume = false) {
  var _a3;
  let offset;
  if (store == null ? void 0 : store.hasIndex(index)) {
    if (consume) (_a3 = store.freezePredictionsThrough) == null ? void 0 : _a3.call(store, index);
    offset = store.getOffset(index);
  }
  return offset;
}
function getLayoutSizeForStore(store, index) {
  let size;
  if (store == null ? void 0 : store.hasIndex(index)) {
    size = store.getSize(index);
  }
  return size;
}
function getLayoutSpanForStore(store, index) {
  let span;
  if (hasColumnLayout(store) && store.hasIndex(index)) {
    span = store.getSpan(index);
  }
  return span;
}
function hasColumnLayout(store) {
  return !!store && "getColumn" in store && "getSpan" in store;
}

// src/core/calculateOffsetForIndex.ts
function calculateOffsetForIndex(ctx, index) {
  var _a3;
  return (_a3 = getLayoutOffset(ctx, index)) != null ? _a3 : 0;
}

// src/core/calculateOffsetWithOffsetPosition.ts
function getViewPositionOffset(availableSpace, viewPosition, viewPositionFallback) {
  let alignment = viewPosition;
  if (availableSpace < 0 && viewPositionFallback !== void 0) {
    alignment = viewPositionFallback === "start" ? 0 : 1;
  }
  return -alignment * availableSpace;
}
function calculateOffsetWithOffsetPosition(ctx, offsetParam, params) {
  var _a3, _b;
  const state = ctx.state;
  const { index, viewOffset, viewPosition, viewPositionFallback } = params;
  let offset = offsetParam;
  const leadingInset = index !== void 0 ? getContentInsetTop(ctx) : 0;
  if (index !== void 0) {
    offset += getStartOffsetAdjustment(ctx);
    if (Platform.OS === "ios" && (viewPosition != null ? viewPosition : 0) === 0) {
      const scale = PixelRatio.get();
      offset = Math.round(offset * scale) / scale;
    }
    offset -= leadingInset;
  }
  if (viewOffset) offset -= viewOffset;
  if (viewPosition !== void 0 && index !== void 0) {
    const dataLength = getDataLength(state);
    if (dataLength === 0) {
      return offset;
    }
    const isOutOfBounds = index < 0 || index >= dataLength;
    const fallbackEstimatedSize = (_a3 = state.props.estimatedItemSize) != null ? _a3 : 0;
    const measuredItemSize = isOutOfBounds ? fallbackEstimatedSize : (_b = getLayoutSize(ctx, index)) != null ? _b : fallbackEstimatedSize;
    const itemSize = Math.max(0, measuredItemSize - (isOutOfBounds ? 0 : ctx.scrollAxisGap));
    const trailingInset = getContentInsetEnd(ctx);
    const availableSpace = state.scrollLength - leadingInset - trailingInset - itemSize;
    offset += getViewPositionOffset(availableSpace, viewPosition, viewPositionFallback);
  }
  if (index !== void 0 && params.clampToContentContainerMinSize) {
    offset += getContentSize(ctx) - getContentSize(ctx, false);
  }
  return offset;
}

// src/core/rowSpanMutations.ts
function moveSpans(spans, from, to, count) {
  const moved = spans.slice(from, from + count);
  if (to < from) {
    spans.copyWithin(to + count, to, from);
  } else {
    spans.copyWithin(from, from + count, to + count);
  }
  for (let index = 0; index < count; index++) {
    spans[to + index] = moved[index];
  }
}
function spliceSpans(spans, index, deleteCount, insertCount, insertedSpan) {
  const previousLength = spans.length;
  const nextLength = previousLength - deleteCount + insertCount;
  if (insertCount > deleteCount) {
    spans.length = nextLength;
    spans.copyWithin(index + insertCount, index + deleteCount, previousLength);
  } else if (insertCount < deleteCount) {
    spans.copyWithin(index + insertCount, index + deleteCount, previousLength);
    spans.length = nextLength;
  }
  spans.fill(insertedSpan, index, index + insertCount);
}

// src/core/LayoutStoreRuntime.ts
var LayoutStoreRuntime = class _LayoutStoreRuntime {
  constructor(store, estimatedSize) {
    this.didFlushInitialEstimate = false;
    this.didSealInitialPredictions = false;
    this.pendingEstimateMeasurements = 0;
    /** Advances on every changed or first measurement; the idle flush waits for a frame without one. */
    this.estimateMeasurementSerial = 0;
    /** The pending idle flush owes an initial-estimate retry. */
    this.idleFlushRetryInitial = false;
    this.pendingEstimateKeys = /* @__PURE__ */ new Set();
    // Invalidating content revokes certainty, not the lifetime of a measured or consumed hint.
    this.retainedInvalidationHints = /* @__PURE__ */ new Map();
    this.propEstimatedSize = estimatedSize;
    this.store = store;
  }
  fork() {
    return Object.assign(Object.create(_LayoutStoreRuntime.prototype), this, {
      pendingEstimateKeys: new Set(this.pendingEstimateKeys),
      positionListenerOffsets: this.positionListenerOffsets && new Map(this.positionListenerOffsets),
      retainedInvalidationHints: new Map(this.retainedInvalidationHints),
      store: this.store.fork()
    });
  }
  resetTransientState() {
    this.didFlushInitialEstimate = false;
    this.didSealInitialPredictions = false;
    this.pendingEstimateMeasurements = 0;
    this.pendingEstimateKeys.clear();
    this.idleFlushRetryInitial = false;
    this.positionListenerOffsets = void 0;
  }
  recordEstimateMeasurement(key, limit) {
    if (this.pendingEstimateMeasurements === 0) this.pendingEstimateKeys.clear();
    if (this.pendingEstimateMeasurements >= limit) return;
    if (!this.pendingEstimateKeys.has(key)) {
      this.pendingEstimateKeys.add(key);
      this.pendingEstimateMeasurements++;
    }
  }
  clearRowSpanCache() {
    this.pendingRowSpanUpdates = void 0;
    this.rowSpanCache = void 0;
  }
  getCachedRowSpans(input) {
    return this.rowSpanCache && areRowSpanCacheInputsEqual(this.rowSpanCache.input, input) ? this.rowSpanCache.spans : void 0;
  }
  setCachedRowSpans(input, spans) {
    this.rowSpanCache = { input, spans };
  }
  transformCachedRowSpans(operations) {
    var _a3;
    const spans = (_a3 = this.rowSpanCache) == null ? void 0 : _a3.spans;
    if (spans) {
      for (const operation of operations) {
        if (operation.type === "splice") {
          spliceSpans(spans, operation.index, operation.deleteCount, operation.insertCount, void 0);
        } else if (operation.type === "move" && operation.count > 0 && operation.from !== operation.to) {
          moveSpans(spans, operation.from, operation.to, operation.count);
        }
      }
    }
    return spans;
  }
};
function areRowSpanCacheInputsEqual(prev, next) {
  return prev.data === next.data && Object.is(prev.dataKey, next.dataKey) && Object.is(prev.dataVersion, next.dataVersion) && Object.is(prev.extraData, next.extraData) && prev.numColumns === next.numColumns && prev.overrideItemLayout === next.overrideItemLayout;
}

// src/core/mvcp.ts
var MVCP_POSITION_EPSILON = 0.1;
var MVCP_ANCHOR_LOCK_TTL_MS = 300;
var MVCP_ANCHOR_LOCK_QUIET_PASSES_TO_RELEASE = 2;
var NATIVE_END_CLAMP_EPSILON = 1;
function getAnchorDisplacement(ctx, previous, next) {
  const diff = next - previous;
  if (Platform.OS === "web") return diff;
  const scale = PixelRatio.get();
  const scrollPixels = ctx.state.scroll * scale;
  if (Math.abs(scrollPixels - Math.round(scrollPixels)) > 1e-6) return diff;
  const start = getStartOffsetAdjustment(ctx);
  const painted = Math.round((next + start) * scale) - Math.round((previous + start) * scale);
  const applied = Math.abs(diff) > MVCP_POSITION_EPSILON ? Math.round(scrollPixels + diff * scale) - scrollPixels : 0;
  return Math.abs(applied - painted) < 1e-6 ? diff : painted / scale;
}
function resolveAnchorLock(state, enableMVCPAnchorLock, mvcpData, now) {
  if (!enableMVCPAnchorLock) {
    state.mvcpAnchorLock = void 0;
    return void 0;
  }
  const lock = state.mvcpAnchorLock;
  if (!lock) {
    return void 0;
  }
  const isExpired = now > lock.expiresAt;
  const isMissing = state.indexByKey.get(lock.id) === void 0;
  if (isExpired || isMissing || !mvcpData) {
    state.mvcpAnchorLock = void 0;
    return void 0;
  }
  return lock;
}
function updateAnchorLock(state, params) {
  if (Platform.OS === "web") {
    const { anchorId, anchorPosition, dataChanged, now, positionDiff } = params;
    const enableMVCPAnchorLock = !!dataChanged || !!state.mvcpAnchorLock;
    const mvcpData = state.props.maintainVisibleContentPosition.data;
    if (!enableMVCPAnchorLock || !mvcpData || state.scrollingTo || !anchorId || anchorPosition === void 0) {
      return;
    }
    const existingLock = state.mvcpAnchorLock;
    const quietPasses = !dataChanged && Math.abs(positionDiff) <= MVCP_POSITION_EPSILON && (existingLock == null ? void 0 : existingLock.id) === anchorId ? existingLock.quietPasses + 1 : 0;
    if (!dataChanged && quietPasses >= MVCP_ANCHOR_LOCK_QUIET_PASSES_TO_RELEASE) {
      state.mvcpAnchorLock = void 0;
      return;
    }
    state.mvcpAnchorLock = {
      expiresAt: now + MVCP_ANCHOR_LOCK_TTL_MS,
      id: anchorId,
      position: anchorPosition,
      quietPasses
    };
  }
}
function shouldQueueNativeMVCPAdjust(dataChanged, ctx, positionDiff, prevTotalSize, prevScroll, scrollTarget) {
  const state = ctx.state;
  if (!dataChanged || Platform.OS === "web" || // A horizontal Android ScrollView never clamps on layout, so no clamp would ever settle a handoff.
  isAndroidHorizontal(state) || !state.props.maintainVisibleContentPosition.data || scrollTarget !== void 0 || positionDiff >= -MVCP_POSITION_EPSILON || getScrollRangeEnd(ctx) >= prevScroll - MVCP_POSITION_EPSILON) {
    return false;
  }
  const distanceFromEnd = prevTotalSize - prevScroll - state.scrollLength;
  return distanceFromEnd < Math.abs(positionDiff) - MVCP_POSITION_EPSILON;
}
function getNativeScrollRangeEnd(ctx, geometry) {
  const nativeInset = getContentInsetEnd(ctx) - (ctx.state.props.anchoredEndSpaceOwner === "list" ? peek$(ctx, "anchoredEndSpaceSize") || 0 : 0);
  return Math.max(-getContentInsetTop(ctx), geometry.content + nativeInset - geometry.length);
}
function cancelPendingNativeMVCPAdjust(state) {
  state.pendingNativeMVCPAdjust = void 0;
  notifyScrollIdle(state);
  state.ignoreScrollFromMVCP = void 0;
  state.ignoreScrollFromMVCPIgnored = false;
}
function settlePendingNativeMVCPAdjust(ctx, nativeRemainder, skipSizeCorrection = false, source = "data") {
  var _a3;
  const state = ctx.state;
  const anchor = (_a3 = state.pendingNativeMVCPAdjust) == null ? void 0 : _a3.anchor;
  state.pendingNativeMVCPAdjust = void 0;
  notifyScrollIdle(state);
  const sizeDiff = !skipSizeCorrection && !state.scrollingTo && state.props.maintainVisibleContentPosition.size && anchor && state.indexByKey.has(anchor.id) ? anchor.sizeDiff : 0;
  let remaining = nativeRemainder + sizeDiff;
  if (remaining > 0) remaining = Math.min(remaining, Math.max(0, getScrollRangeEnd(ctx) - state.scroll));
  else remaining = Math.max(remaining, Math.min(0, -getContentInsetTop(ctx) - state.scroll));
  if (Math.abs(remaining) > MVCP_POSITION_EPSILON) {
    requestAdjust(ctx, remaining, sizeDiff ? "item-size" : source);
  }
}
function updatePendingNativeGeometry(ctx) {
  const pending = ctx.state.pendingNativeMVCPAdjust;
  if (!pending) return;
  const rangeEnd = getScrollRangeEnd(ctx);
  pending.minimumNativeEnd = Math.min(pending.minimumNativeEnd, rangeEnd);
  if (rangeEnd !== pending.publishedNativeEnd) {
    pending.previousNativeEnds.add(pending.publishedNativeEnd);
    pending.publishedNativeEnd = rangeEnd;
  }
}
function resolvePendingNativeMVCPAdjust(ctx, newScroll, options) {
  var _a3, _b;
  const state = ctx.state;
  const pending = state.pendingNativeMVCPAdjust;
  if (!pending) {
    return false;
  }
  if (state.scrollingTo || !state.props.maintainVisibleContentPosition.data) {
    settlePendingNativeMVCPAdjust(ctx, 0, options == null ? void 0 : options.skipSizeCorrection, "item-size");
    return false;
  }
  if (!(options == null ? void 0 : options.fromNativeEvent)) return false;
  const geometry = state.nativeScrollGeometry;
  if (!geometry) return false;
  const nativeEnd = getNativeScrollRangeEnd(ctx, geometry);
  const baseline = pending.startScroll;
  const initialGeometry = pending.initialNativeGeometry;
  const isInitialGeometry = initialGeometry && geometry.content === initialGeometry.content && geometry.length === initialGeometry.length;
  const isCurrentViewport = Math.abs(geometry.length - state.scrollLength) <= NATIVE_END_CLAMP_EPSILON;
  const acknowledgedClamp = !isInitialGeometry && isCurrentViewport && nativeEnd < baseline - MVCP_POSITION_EPSILON && Math.abs(nativeEnd - pending.minimumNativeEnd) <= NATIVE_END_CLAMP_EPSILON && newScroll <= nativeEnd + NATIVE_END_CLAMP_EPSILON;
  const currentRangeEnd = getScrollRangeEnd(ctx);
  const isCurrentGeometry = Math.abs(nativeEnd - currentRangeEnd) <= NATIVE_END_CLAMP_EPSILON && isCurrentViewport;
  let isRepeatedGeometry = false;
  for (const end of pending.previousNativeEnds) {
    if (Math.abs(end - nativeEnd) <= NATIVE_END_CLAMP_EPSILON) {
      isRepeatedGeometry = true;
      break;
    }
  }
  const isFreshCurrentGeometry = isCurrentGeometry && !isRepeatedGeometry;
  const progress = baseline - newScroll;
  if (isCurrentGeometry || acknowledgedClamp) {
    const structuralTarget = baseline + pending.amount;
    if (newScroll < Math.min(pending.minimumNativeEnd, structuralTarget) - NATIVE_END_CLAMP_EPSILON || newScroll > Math.max(baseline, structuralTarget) + MVCP_POSITION_EPSILON || pending.furthestProgressTowardAmount > MVCP_POSITION_EPSILON && progress < pending.furthestProgressTowardAmount - MVCP_POSITION_EPSILON) {
      cancelPendingNativeMVCPAdjust(state);
      return false;
    }
    pending.furthestProgressTowardAmount = Math.max(pending.furthestProgressTowardAmount, progress);
  }
  const nativeRemainder = pending.amount - (newScroll - baseline);
  if (isCurrentGeometry && pending.amount < -MVCP_POSITION_EPSILON && (Math.abs(nativeRemainder) <= MVCP_POSITION_EPSILON || Math.abs(nativeRemainder) <= NATIVE_END_CLAMP_EPSILON && (nativeRemainder > 0 || Math.abs(newScroll - currentRangeEnd) <= NATIVE_END_CLAMP_EPSILON)) && Math.abs((_b = (_a3 = pending.anchor) == null ? void 0 : _a3.sizeDiff) != null ? _b : 0) <= MVCP_POSITION_EPSILON) {
    cancelPendingNativeMVCPAdjust(state);
    if (Math.abs(nativeRemainder) > MVCP_POSITION_EPSILON) {
      settlePendingNativeMVCPAdjust(ctx, nativeRemainder);
    }
    return true;
  }
  if (!acknowledgedClamp && !isFreshCurrentGeometry) return false;
  const reachedStructuralTarget = pending.amount < 0 ? progress >= -pending.amount - MVCP_POSITION_EPSILON : -progress >= pending.amount - MVCP_POSITION_EPSILON;
  if (acknowledgedClamp || reachedStructuralTarget || Math.abs(newScroll - nativeEnd) <= NATIVE_END_CLAMP_EPSILON || state.pendingMaintainScrollAtEnd && peek$(ctx, "isWithinMaintainScrollAtEndThreshold") && progress > MVCP_POSITION_EPSILON) {
    settlePendingNativeMVCPAdjust(ctx, nativeRemainder);
    return true;
  }
  return false;
}
function shouldPreserveEstimatedEnd(ctx, materializing = false) {
  const state = ctx.state;
  const length = getDataLength(state);
  return Platform.OS === "web" && state.props.maintainVisibleContentPosition.size && !state.props.maintainVisibleContentPosition.data && !state.visibleContentAnchor && !state.scrollingTo && state.didContainersLayout && length > 0 && getScrollRangeEnd(ctx) > -getContentInsetTop(ctx) && (materializing || !state.sizesKnown.has(getId(state, length - 1))) && Math.abs(state.scroll - getScrollRangeEnd(ctx)) <= 1;
}
function captureFixedRangeAnchor(ctx) {
  var _a3;
  const state = ctx.state;
  const key = state.idsInView.find((id) => state.indexByKey.has(id));
  const index = key === void 0 ? void 0 : state.indexByKey.get(key);
  const position = getLayoutOffset(ctx, index);
  const store = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  if (key === void 0 || position === void 0 || !(store == null ? void 0 : store.hasIndex(index))) return;
  const scroll = state.scroll;
  const epoch = getScrollOwnerEpoch(state);
  const owner = getScrollOwnerKind(state);
  const dataEpoch = state.dataChangeEpoch;
  const ownsAnchor = () => {
    var _a4;
    return state.indexByKey.get(key) === index && ((_a4 = state.layoutStoreRuntime) == null ? void 0 : _a4.store) === store && state.dataChangeEpoch === dataEpoch && !state.dataSourceAnchorPositions && state.props.maintainVisibleContentPosition.size && getScrollOwnerEpoch(state) === epoch && getScrollOwnerKind(state) === owner && state.scroll === scroll && store.hasIndex(index);
  };
  const getDelta = () => getAnchorDisplacement(ctx, position, store.getOffset(index));
  return {
    anchor: { key, position },
    drain(apply) {
      if (!ownsAnchor()) return;
      const shadow = globalThis.__LEGEND_LIST_ANCHOR_SHADOW__;
      const delta = shadow ? getDelta() : 0;
      const clamp = !!shadow && scroll > getScrollRangeEnd(ctx) + MVCP_POSITION_EPSILON;
      apply == null ? void 0 : apply();
      shadow == null ? void 0 : shadow(delta, state.scroll - scroll, clamp);
    },
    project() {
      const delta = ownsAnchor() ? getDelta() : 0;
      return Math.abs(delta) > MVCP_POSITION_EPSILON ? scroll + delta : state.scroll;
    }
  };
}
function prepareMVCP(ctx, dataChanged, adjustmentSource, readerAnchor) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i;
  const state = ctx.state;
  const { idsInView, props } = state;
  const {
    maintainVisibleContentPosition: {
      autoscrollToTopThreshold,
      data: mvcpData,
      size: mvcpScroll,
      shouldRestorePosition
    }
  } = props;
  const isWeb = Platform.OS === "web";
  const now = Date.now();
  const enableMVCPAnchorLock = isWeb && (!!dataChanged || !!state.mvcpAnchorLock);
  const scrollingTo = state.scrollingTo;
  if ((scrollingTo == null ? void 0 : scrollingTo.key) !== void 0) {
    const nextIndex = state.indexByKey.get(scrollingTo.key);
    if (nextIndex !== void 0) scrollingTo.index = nextIndex;
  }
  if (isWeb && dataChanged && state.pendingScrollToEnd && scrollingTo === void 0) {
    state.mvcpAnchorLock = void 0;
    return void 0;
  }
  const anchorLock = isWeb ? resolveAnchorLock(state, enableMVCPAnchorLock, mvcpData, now) : void 0;
  let prevPosition;
  let targetId;
  const idsInViewWithPositions = [];
  const scrollTarget = scrollingTo == null ? void 0 : scrollingTo.index;
  const dataSourceAnchorPositions = dataChanged && mvcpData || scrollTarget !== void 0 ? state.dataSourceAnchorPositions : void 0;
  const isPendingSourceSizeCorrection = !dataChanged && scrollTarget === void 0 && state.dataSourceAnchorPositions !== void 0;
  const scrollingToViewPosition = scrollingTo == null ? void 0 : scrollingTo.viewPosition;
  const isEndAnchoredScrollTarget = scrollTarget !== void 0 && getDataLength(state) > 0 && scrollTarget >= getDataLength(state) - 1 && (scrollingToViewPosition != null ? scrollingToViewPosition : 0) > 0;
  if (dataChanged && ((_a3 = state.visibleContentAnchor) == null ? void 0 : _a3.sizeOnly)) {
    state.visibleContentAnchor = void 0;
  }
  const explicitAnchor = state.visibleContentAnchor;
  const shouldMVCP = !!explicitAnchor || (dataChanged ? mvcpData : mvcpScroll);
  const indexByKey = state.indexByKey;
  const pendingDataHandoff = !isWeb && dataChanged && scrollTarget === void 0 ? state.pendingNativeMVCPAdjust : void 0;
  const prevScroll = state.scroll;
  const prevTotalSize = getContentSize(ctx);
  const preserveEstimatedEnd = !dataChanged && shouldPreserveEstimatedEnd(ctx, !isItemSizeSource(adjustmentSource));
  if (shouldMVCP) {
    if (!isWeb && !dataChanged && state.pendingNativeMVCPAdjust && scrollTarget === void 0) {
      const pending = state.pendingNativeMVCPAdjust;
      if (pending.anchor && mvcpScroll) {
        const anchor = pending.anchor;
        if (!indexByKey.has(anchor.id)) {
          const fallback = (_b = anchor.fallbackKeys) == null ? void 0 : _b.find((id) => indexByKey.has(id));
          if (fallback !== void 0) anchor.id = fallback;
        }
        const previousPosition = getLayoutOffset(ctx, indexByKey.get(anchor.id));
        return () => {
          if (state.pendingNativeMVCPAdjust === pending) {
            const position = getLayoutOffset(ctx, indexByKey.get(anchor.id));
            if (position !== void 0 && previousPosition !== void 0) {
              const sizeDiff = position - previousPosition;
              anchor.sizeDiff += sizeDiff;
              shiftDataSourceAnchorPositions(state, sizeDiff);
            }
            updatePendingNativeGeometry(ctx);
          }
        };
      }
      updatePendingNativeGeometry(ctx);
      return void 0;
    }
    if (explicitAnchor && scrollTarget === void 0) {
      targetId = explicitAnchor.key;
      prevPosition = state.scroll - explicitAnchor.offset;
    } else if (anchorLock && scrollTarget === void 0) {
      targetId = anchorLock.id;
      prevPosition = anchorLock.position;
    } else if (scrollTarget !== void 0) {
      if (!IsNewArchitecture && (scrollingTo == null ? void 0 : scrollingTo.isInitialScroll)) {
        return void 0;
      }
      targetId = (_c = scrollingTo == null ? void 0 : scrollingTo.key) != null ? _c : getId(state, scrollTarget);
    } else if (readerAnchor) {
      targetId = readerAnchor.key;
      prevPosition = readerAnchor.position;
    } else if (idsInView.length > 0 && state.didContainersLayout && !dataChanged) {
      targetId = idsInView.find((id) => indexByKey.get(id) !== void 0);
    }
    if (dataChanged && state.didContainersLayout) {
      for (const id of (_f = (_e = dataSourceAnchorPositions == null ? void 0 : dataSourceAnchorPositions.keys()) != null ? _e : (_d = pendingDataHandoff == null ? void 0 : pendingDataHandoff.anchor) == null ? void 0 : _d.fallbackKeys) != null ? _f : idsInView) {
        const anchor = dataSourceAnchorPositions == null ? void 0 : dataSourceAnchorPositions.get(id);
        if (anchor && !anchor.isVisible) continue;
        const index = indexByKey.get(id);
        if (index !== void 0) {
          const position = (_g = anchor == null ? void 0 : anchor.position) != null ? _g : getLayoutOffset(ctx, index);
          if (position !== void 0) {
            idsInViewWithPositions.push({ id, position });
          }
        }
      }
    }
    if (targetId !== void 0 && (prevPosition === void 0 || isPendingSourceSizeCorrection || (anchorLock == null ? void 0 : anchorLock.id) === targetId && (dataSourceAnchorPositions == null ? void 0 : dataSourceAnchorPositions.has(targetId)))) {
      const targetIndex = indexByKey.get(targetId);
      if (targetIndex !== void 0) {
        prevPosition = (_i = (_h = dataSourceAnchorPositions == null ? void 0 : dataSourceAnchorPositions.get(targetId)) == null ? void 0 : _h.position) != null ? _i : getLayoutOffset(ctx, targetIndex);
      }
    }
    return (waitForNativeClamp = false) => {
      var _a4, _b2, _c2, _d2, _e2, _f2, _g2;
      if (scrollTarget !== void 0 && state.scrollingTo !== scrollingTo) {
        return;
      }
      let positionDiff = 0;
      let anchorIdForLock = anchorLock == null ? void 0 : anchorLock.id;
      let anchorPositionForLock;
      let skipTargetAnchor = false;
      const data = (_a4 = getLegacyData(state)) != null ? _a4 : [];
      const shouldValidateLockedAnchor = isWeb && dataChanged && mvcpData && scrollTarget === void 0 && targetId !== void 0 && (anchorLock == null ? void 0 : anchorLock.id) === targetId && shouldRestorePosition !== void 0;
      if (shouldValidateLockedAnchor && targetId !== void 0) {
        const index = indexByKey.get(targetId);
        if (index !== void 0) {
          const item = getDataItem(state, index);
          skipTargetAnchor = item === void 0 || !shouldRestorePosition(item, index, data);
          if (skipTargetAnchor && (anchorLock == null ? void 0 : anchorLock.id) === targetId) {
            state.mvcpAnchorLock = void 0;
          }
        }
      }
      const shouldUseFallbackVisibleAnchor = dataChanged && mvcpData && scrollTarget === void 0 && (() => {
        if (targetId === void 0 || skipTargetAnchor) {
          return true;
        }
        const targetIndex = indexByKey.get(targetId);
        return targetIndex === void 0 || getLayoutOffset(ctx, targetIndex) === void 0;
      })();
      if (shouldUseFallbackVisibleAnchor) {
        for (let i = 0; i < idsInViewWithPositions.length; i++) {
          const { id, position } = idsInViewWithPositions[i];
          const index = indexByKey.get(id);
          if (index !== void 0 && shouldRestorePosition) {
            const item = getDataItem(state, index);
            if (item === void 0 || !shouldRestorePosition(item, index, data)) {
              continue;
            }
          }
          const newPosition = getLayoutOffset(ctx, index);
          if (newPosition !== void 0) {
            positionDiff = getAnchorDisplacement(ctx, position, newPosition);
            anchorIdForLock = id;
            anchorPositionForLock = newPosition;
            break;
          }
        }
      }
      if (!skipTargetAnchor && targetId !== void 0 && prevPosition !== void 0) {
        const targetIndex = indexByKey.get(targetId);
        const newPosition = getLayoutOffset(ctx, targetIndex);
        if (newPosition !== void 0) {
          if ((scrollingTo == null ? void 0 : scrollingTo.key) === targetId) scrollingTo.index = targetIndex;
          const totalSize = getContentSize(ctx);
          let diff = getAnchorDisplacement(ctx, prevPosition, newPosition);
          if (diff !== 0 && isEndAnchoredScrollTarget && state.scroll + state.scrollLength > totalSize) {
            if (diff > 0) {
              diff = Math.max(0, totalSize - state.scroll - state.scrollLength);
            } else {
              const maxScroll = getScrollRangeEnd(ctx, totalSize);
              state.scroll = maxScroll;
              state.scrollPending = maxScroll;
              diff = 0;
            }
          }
          positionDiff = diff;
          anchorIdForLock = targetId;
          anchorPositionForLock = newPosition;
        }
      }
      if (scrollingTo && scrollingToViewPosition !== void 0 && (scrollingToViewPosition > 0 || scrollingTo.viewPositionFallback)) {
        const targetIndex = scrollingTo.index;
        const newSize = getItemSize(
          ctx,
          getId(state, targetIndex),
          targetIndex,
          getDataItem(state, targetIndex)
        );
        const prevSize = scrollingTo.itemSize;
        if (prevSize !== void 0 && newSize !== prevSize) {
          if (scrollingTo.viewPositionFallback) {
            const viewport = state.scrollLength - getContentInsetTop(ctx) - getContentInsetEnd(ctx);
            const previousSpace = viewport - Math.max(0, prevSize - ctx.scrollAxisGap);
            const nextSpace = viewport - Math.max(0, newSize - ctx.scrollAxisGap);
            positionDiff += getViewPositionOffset(
              nextSpace,
              scrollingToViewPosition,
              scrollingTo.viewPositionFallback
            ) - getViewPositionOffset(
              previousSpace,
              scrollingToViewPosition,
              scrollingTo.viewPositionFallback
            );
          } else {
            positionDiff += (newSize - prevSize) * scrollingToViewPosition;
          }
          scrollingTo.itemSize = newSize;
        }
      }
      if (preserveEstimatedEnd && !state.visibleContentAnchor) {
        positionDiff = getScrollRangeEnd(ctx) - getScrollRangeEnd(ctx, prevTotalSize);
      }
      updateAnchorLock(state, {
        anchorId: anchorIdForLock,
        anchorPosition: anchorPositionForLock,
        dataChanged,
        now,
        positionDiff
      });
      const follow = props.maintainScrollAtEnd;
      const shouldMaintainEnd = follow && !follow.animated && (dataChanged ? shouldMaintainScrollAtEndOnDataChange(state) : isItemSizeSource(adjustmentSource) ? follow.onItemLayout : adjustmentSource === "layout" && follow.onLayout) && state.didFinishInitialScroll && !isUserGestureActive(state) && state.userScrollContentSize === void 0 && !state.visibleContentAnchor && !state.scrollingTo && !((_b2 = ctx.scrollRequestTracker) == null ? void 0 : _b2.isWaitingToRun()) && peek$(ctx, "isFollowingEnd");
      if (shouldMaintainEnd) {
        const endOffset = getScrollRangeEnd(ctx);
        if (state.scroll > endOffset) {
          state.scroll = endOffset;
          state.scrollPending = endOffset;
        }
        positionDiff = endOffset - state.scroll;
      }
      const androidHorizontal = isAndroidHorizontal(state);
      if (!isWeb && (!dataChanged || androidHorizontal) && scrollTarget === void 0) {
        const maxScroll = getScrollRangeEnd(ctx);
        if (getContentSize(ctx) < prevTotalSize - MVCP_POSITION_EPSILON && state.scroll > maxScroll + MVCP_POSITION_EPSILON && (predictsNativeShrinkClamp(state) || Math.abs(getObservedScrollOffset(ctx) - maxScroll) <= MVCP_POSITION_EPSILON)) {
          const targetScroll = Math.max(
            -getContentInsetTop(ctx),
            Math.min(state.scroll + positionDiff, maxScroll)
          );
          if (androidHorizontal) {
            positionDiff = targetScroll - state.scroll;
          } else {
            state.scroll = maxScroll;
            state.scrollPending = maxScroll;
            positionDiff = targetScroll - maxScroll;
            if (Math.abs(positionDiff) <= MVCP_POSITION_EPSILON) {
              if (isPendingSourceSizeCorrection) {
                shiftDataSourceAnchorPositions(state, state.scroll - prevScroll);
              } else {
                state.dataSourceAnchorPositions = void 0;
              }
            }
          }
        }
      }
      const pending = !isWeb && scrollTarget === void 0 ? state.pendingNativeMVCPAdjust : void 0;
      if (dataChanged && pending) {
        if (pending.anchor && !indexByKey.has(pending.anchor.id) && !((_c2 = pending.anchor.fallbackKeys) == null ? void 0 : _c2.some((id) => indexByKey.has(id)))) {
          cancelPendingNativeMVCPAdjust(state);
          return;
        }
        pending.amount += positionDiff;
        if (pending.anchor && anchorIdForLock !== void 0) pending.anchor.id = anchorIdForLock;
        updatePendingNativeGeometry(ctx);
        return;
      }
      if (shouldQueueNativeMVCPAdjust(
        dataChanged || waitForNativeClamp,
        ctx,
        positionDiff,
        prevTotalSize,
        prevScroll,
        scrollTarget
      )) {
        state.pendingNativeMVCPAdjust = {
          amount: positionDiff,
          anchor: anchorIdForLock !== void 0 ? {
            fallbackKeys: idsInViewWithPositions.map((anchor) => anchor.id),
            id: anchorIdForLock,
            sizeDiff: 0
          } : void 0,
          furthestProgressTowardAmount: 0,
          initialNativeGeometry: state.nativeScrollGeometry,
          minimumNativeEnd: getScrollRangeEnd(ctx),
          previousNativeEnds: /* @__PURE__ */ new Set([getScrollRangeEnd(ctx, prevTotalSize)]),
          publishedNativeEnd: getScrollRangeEnd(ctx),
          startScroll: prevScroll
        };
        if (state.nativeScrollGeometry) {
          state.pendingNativeMVCPAdjust.previousNativeEnds.add(
            getNativeScrollRangeEnd(ctx, state.nativeScrollGeometry)
          );
        }
        updatePendingNativeGeometry(ctx);
        return;
      }
      if (Math.abs(positionDiff) > MVCP_POSITION_EPSILON) {
        const shouldSkipAdjustForMaintainedEnd = (state.maintainingScrollAtEnd === "pending-animated" || state.maintainingScrollAtEnd === "animated") && peek$(ctx, "isWithinMaintainScrollAtEndThreshold") || // Web following retains ownership between animation requests, even when
        // streaming growth moves the end beyond the threshold before the next frame.
        isWeb && ((_d2 = props.maintainScrollAtEnd) == null ? void 0 : _d2.animated) && (state.pendingMaintainScrollAtEnd || (dataChanged ? shouldMaintainScrollAtEndOnDataChange(state) : isItemSizeSource(adjustmentSource) && props.maintainScrollAtEnd.onItemLayout)) && state.didFinishInitialScroll && !state.endFollowInterrupted && peek$(ctx, "isFollowingEnd") && (!state.scrollingTo || state.scrollingTo.isScrollToEnd) && !((_e2 = ctx.scrollRequestTracker) == null ? void 0 : _e2.isWaitingToRun());
        if (!shouldSkipAdjustForMaintainedEnd) {
          const isDataAdjustment = dataChanged && mvcpData;
          const autoscrollToStart = isWeb && isDataAdjustment && autoscrollToTopThreshold !== void 0 && !shouldMaintainEnd && !state.scrollingTo && ((_g2 = (_f2 = state.refScroller.current) == null ? void 0 : _f2.isScrollInRange) == null ? void 0 : _g2.call(_f2)) !== false && getObservedScrollOffset(ctx, prevScroll) <= autoscrollToTopThreshold;
          if (isPendingSourceSizeCorrection) {
            shiftDataSourceAnchorPositions(state, state.scroll - prevScroll + positionDiff);
          } else {
            state.dataSourceAnchorPositions = void 0;
          }
          requestAdjust(ctx, positionDiff, isDataAdjustment ? "data" : adjustmentSource != null ? adjustmentSource : "anchor");
          if (autoscrollToStart) {
            state.scheduledWork.frame(() => {
              if (!state.scrollingTo && !state.pendingScrollToEnd) {
                state.mvcpAnchorLock = void 0;
                ctx.scrollTo({ animated: true, offset: 0 });
              }
            }, "mvcpAutoscrollToStart");
          }
        }
      }
    };
  }
}
function predictsNativeShrinkClamp(state) {
  return Platform.OS === "android" || Platform.OS === "ios" && !isUserGestureActive(state);
}
function isAndroidHorizontal(state) {
  return Platform.OS === "android" && !!state.props.horizontal;
}
function shiftDataSourceAnchorPositions(state, amount) {
  const positions = state.dataSourceAnchorPositions;
  if (positions && amount !== 0) {
    for (const anchor of positions.values()) {
      anchor.position += amount;
    }
  }
}

// src/core/RowLayoutStore.ts
var ROW_INDEX_BLOCK_SIZE = 256;
var SIZE_CACHED2 = 1;
var SIZE_MEASURED2 = 2;
var RowLayoutStore = class _RowLayoutStore {
  constructor(options) {
    this.knownSizes = /* @__PURE__ */ new Map();
    this.measuredCount = 0;
    this.positiveMeasuredCount = 0;
    this.measuredSizeTotal = 0;
    this.lengthValue = normalizeLength2(options.length);
    this.estimatedSize = normalizeSize2(options.estimatedSize);
    this.numColumns = normalizeNumColumns(options.numColumns);
    this.spanInput = options.spans;
    this.spanTopology = options.spans ? createSpanTopology(this.length, this.numColumns, options.spans) : void 0;
    this.rowLayout = new PrefixLayoutStore(this.getRowCount(), this.estimatedSize);
  }
  fork() {
    return Object.assign(Object.create(_RowLayoutStore.prototype), this, {
      knownSizes: new Map(this.knownSizes),
      rowLayout: this.rowLayout.fork()
    });
  }
  get length() {
    return this.lengthValue;
  }
  clearKnownSizes() {
    this.knownSizes.clear();
    this.measuredCount = 0;
    this.positiveMeasuredCount = 0;
    this.measuredSizeTotal = 0;
    this.rowLayout = new PrefixLayoutStore(this.getRowCount(), this.estimatedSize);
  }
  findIndexRangeAtOffsets(startOffset, endOffset) {
    const rowRange = this.rowLayout.findIndexRangeAtOffsets(startOffset, endOffset);
    return rowRange ? {
      end: this.getRowEndIndex(rowRange.end),
      start: this.getRowStartIndex(rowRange.start)
    } : void 0;
  }
  forEachLayout(startIndex, endIndex, callback) {
    const start = Math.max(0, Math.trunc(startIndex));
    const end = Math.min(this.length - 1, Math.trunc(endIndex));
    if (start <= end) {
      let previousRowIndex = -1;
      let offset = 0;
      for (let index = start; index <= end; index++) {
        const rowIndex = this.getRowIndex(index);
        if (rowIndex !== previousRowIndex) {
          offset = this.rowLayout.getOffset(rowIndex);
          previousRowIndex = rowIndex;
        }
        callback(index, offset, this.getSize(index));
      }
    }
  }
  getColumn(index) {
    var _a3;
    this.assertIndex(index);
    return ((_a3 = this.spanTopology) == null ? void 0 : _a3.columns[index]) || index % this.numColumns + 1;
  }
  getOffset(index) {
    this.assertIndex(index);
    return this.rowLayout.getOffset(this.getRowIndex(index));
  }
  getSize(index) {
    var _a3, _b;
    this.assertIndex(index);
    return (_b = (_a3 = this.knownSizes.get(index)) == null ? void 0 : _a3.size) != null ? _b : this.estimatedSize;
  }
  getSpan(index) {
    var _a3;
    this.assertIndex(index);
    return ((_a3 = this.spanTopology) == null ? void 0 : _a3.spans[index]) || 1;
  }
  getTotalSize() {
    return this.rowLayout.getTotalSize();
  }
  getMeasuredAverageSize() {
    return this.measuredCount > 0 ? this.measuredSizeTotal / this.measuredCount : void 0;
  }
  getPositiveMeasuredAverageSize() {
    return this.positiveMeasuredCount > 0 ? this.measuredSizeTotal / this.positiveMeasuredCount : void 0;
  }
  findFirstUnmeasuredIndex(fromIndex = 0) {
    var _a3;
    if (fromIndex < this.length && this.measuredCount < this.length) {
      let row = this.rowLayout.findFirstUnmeasuredIndex(this.getRowIndex(fromIndex));
      while (row !== void 0) {
        for (let index = Math.max(fromIndex, this.getRowStartIndex(row)); index <= this.getRowEndIndex(row); index++) {
          if (((_a3 = this.knownSizes.get(index)) == null ? void 0 : _a3.kind) !== SIZE_MEASURED2) return index;
        }
        row = this.rowLayout.findFirstUnmeasuredIndex(row + 1);
      }
    }
    return void 0;
  }
  getMeasuredCount() {
    return this.measuredCount;
  }
  getEstimatedSize() {
    return this.estimatedSize;
  }
  hasIndex(index) {
    return index !== void 0 && Number.isInteger(index) && index >= 0 && index < this.length;
  }
  replaceKnownSizeEntries(entries, estimatedSize = this.estimatedSize) {
    const normalizedEstimate = normalizeSize2(estimatedSize);
    const knownSizes = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      this.assertIndex(entry.index);
      normalizeSize2(entry.size);
      const existing = knownSizes.get(entry.index);
      if (entry.type === "measured") {
        knownSizes.set(entry.index, { kind: SIZE_MEASURED2, size: entry.size });
      } else if ((existing == null ? void 0 : existing.kind) !== SIZE_MEASURED2) {
        knownSizes.set(entry.index, { kind: SIZE_CACHED2, size: entry.size });
      }
    }
    this.estimatedSize = normalizedEstimate;
    this.knownSizes = knownSizes;
    this.rebuildRowsAndTotals();
  }
  invalidateRange(index, count) {
    assertMutationRange2(this.length, index, count, "invalidateRange");
    const end = index + count;
    const changedRows = /* @__PURE__ */ new Set();
    const invalidate = (knownIndex) => {
      const entry = this.knownSizes.get(knownIndex);
      if (entry) {
        this.knownSizes.delete(knownIndex);
        if (entry.kind === SIZE_MEASURED2) {
          this.measuredCount--;
          this.positiveMeasuredCount -= Number(entry.size > 0);
          this.measuredSizeTotal -= entry.size;
        }
        changedRows.add(this.getRowIndex(knownIndex));
      }
    };
    if (count < this.knownSizes.size) {
      for (let knownIndex = index; knownIndex < end; knownIndex++) {
        invalidate(knownIndex);
      }
    } else {
      for (const knownIndex of this.knownSizes.keys()) {
        if (knownIndex >= index && knownIndex < end) {
          invalidate(knownIndex);
        }
      }
    }
    if (this.measuredCount === 0) {
      this.measuredSizeTotal = 0;
    }
    for (const rowIndex of changedRows) {
      this.syncRowHeight(rowIndex);
    }
  }
  move(from, to, count) {
    assertMoveRange2(this.length, from, to, count);
    if (count > 0 && from !== to) {
      const knownSizes = /* @__PURE__ */ new Map();
      for (const [index, entry] of this.knownSizes) {
        knownSizes.set(transformMoveIndex(index, from, to, count), entry);
      }
      this.knownSizes = knownSizes;
      const spans = this.getMutableSpans();
      if (spans) {
        moveSpans(spans, from, to, count);
        this.spanInput = spans;
        this.spanTopology = createSpanTopology(this.length, this.numColumns, spans);
      }
      this.rebuildRowsAndTotals();
    }
  }
  resize(length, spans, numColumns = this.numColumns, topologyInvalidationIndex) {
    const normalizedLength = normalizeLength2(length);
    const normalizedNumColumns = normalizeNumColumns(numColumns);
    const didTopologyChange = topologyInvalidationIndex !== void 0 || normalizedLength !== this.length || normalizedNumColumns !== this.numColumns || spans !== this.spanInput;
    if (didTopologyChange) {
      const topology = this.spanTopology;
      const canUpdateTopologyTail = topologyInvalidationIndex !== void 0 && normalizedLength === this.length && normalizedNumColumns === this.numColumns && spans !== void 0 && topology !== void 0;
      this.lengthValue = normalizedLength;
      this.numColumns = normalizedNumColumns;
      this.spanInput = spans;
      if (canUpdateTopologyTail) {
        if ("rowInBlock" in topology) {
          const boundedIndex = Math.max(0, Math.min(this.length - 1, topologyInvalidationIndex));
          packSpanRows(topology, this.numColumns, spans, Math.max(0, this.getRowIndex(boundedIndex) - 1));
        } else {
          updateSpanTopologyTail(topology, this.length, this.numColumns, spans, topologyInvalidationIndex);
        }
      } else {
        this.spanTopology = spans ? createSpanTopology(this.length, this.numColumns, spans) : void 0;
      }
      this.pruneKnownSizes();
      this.rebuildRowsAndTotals();
    }
  }
  splice(index, deleteCount, insertCount) {
    assertMutationRange2(this.length, index, deleteCount, "splice");
    normalizeLength2(insertCount);
    if (deleteCount > 0 || insertCount > 0) {
      const deletedEnd = index + deleteCount;
      const knownSizes = /* @__PURE__ */ new Map();
      for (const [knownIndex, entry] of this.knownSizes) {
        if (knownIndex < index) {
          knownSizes.set(knownIndex, entry);
        } else if (knownIndex >= deletedEnd) {
          knownSizes.set(knownIndex + insertCount - deleteCount, entry);
        }
      }
      this.knownSizes = knownSizes;
      const spans = this.getMutableSpans();
      if (spans) {
        spliceSpans(spans, index, deleteCount, insertCount, 1);
        this.spanInput = spans;
      }
      this.lengthValue += insertCount - deleteCount;
      this.spanTopology = spans ? createSpanTopology(this.length, this.numColumns, spans) : void 0;
      this.rebuildRowsAndTotals();
    }
  }
  setEstimatedSize(estimatedSize) {
    const normalizedSize = normalizeSize2(estimatedSize);
    if (normalizedSize !== this.estimatedSize) {
      this.estimatedSize = normalizedSize;
      this.rebuildRowsAndTotals();
    }
  }
  setCachedSize(index, size) {
    this.assertIndex(index);
    const normalizedSize = normalizeSize2(size);
    const previous = this.knownSizes.get(index);
    if ((previous == null ? void 0 : previous.kind) === SIZE_MEASURED2 || (previous == null ? void 0 : previous.size) === normalizedSize) return false;
    const rowIndex = this.getRowIndex(index);
    const previousRowHeight = this.rowLayout.getSize(rowIndex);
    this.knownSizes.set(index, { kind: SIZE_CACHED2, size: normalizedSize });
    this.syncRowHeight(rowIndex);
    return previousRowHeight !== this.rowLayout.getSize(rowIndex);
  }
  setMeasuredSize(index, size) {
    this.assertIndex(index);
    const normalizedSize = normalizeSize2(size);
    const previous = this.knownSizes.get(index);
    if ((previous == null ? void 0 : previous.kind) === SIZE_MEASURED2 && previous.size === normalizedSize) return false;
    const rowIndex = this.getRowIndex(index);
    const previousRowHeight = this.rowLayout.getSize(rowIndex);
    if ((previous == null ? void 0 : previous.kind) === SIZE_MEASURED2) {
      this.measuredSizeTotal += normalizedSize - previous.size;
    } else {
      this.measuredCount++;
      this.measuredSizeTotal += normalizedSize;
    }
    this.positiveMeasuredCount += Number(normalizedSize > 0) - Number((previous == null ? void 0 : previous.kind) === SIZE_MEASURED2 && previous.size > 0);
    this.knownSizes.set(index, { kind: SIZE_MEASURED2, size: normalizedSize });
    this.syncRowHeight(rowIndex);
    return previousRowHeight !== this.rowLayout.getSize(rowIndex);
  }
  assertIndex(index) {
    if (!this.hasIndex(index)) {
      throw new RangeError(`RowLayoutStore index ${index} is out of bounds for length ${this.length}`);
    }
  }
  getRowCount() {
    var _a3, _b;
    return (_b = (_a3 = this.spanTopology) == null ? void 0 : _a3.rowStartIndexes.length) != null ? _b : Math.ceil(this.length / this.numColumns);
  }
  getRowEndIndex(rowIndex) {
    var _a3, _b;
    const topology = this.spanTopology;
    if (topology && "rowInBlock" in topology) {
      return ((_a3 = topology.rowStartIndexes[rowIndex + 1]) != null ? _a3 : this.length) - 1;
    }
    return (_b = topology == null ? void 0 : topology.rowEndIndexes[rowIndex]) != null ? _b : Math.min(this.length - 1, (rowIndex + 1) * this.numColumns - 1);
  }
  getRowIndex(index) {
    var _a3;
    const topology = this.spanTopology;
    if (topology && "rowInBlock" in topology) {
      const rowInBlock = topology.rowInBlock[index];
      return rowInBlock === void 0 ? Math.floor(index / this.numColumns) : topology.blockFirstRows[Math.floor(index / ROW_INDEX_BLOCK_SIZE)] + rowInBlock;
    }
    return (_a3 = topology == null ? void 0 : topology.itemRowIndexes[index]) != null ? _a3 : Math.floor(index / this.numColumns);
  }
  getRowStartIndex(rowIndex) {
    var _a3, _b;
    return (_b = (_a3 = this.spanTopology) == null ? void 0 : _a3.rowStartIndexes[rowIndex]) != null ? _b : rowIndex * this.numColumns;
  }
  getMutableSpans() {
    let spans;
    if (this.spanTopology) {
      spans = Array.from({ length: this.length }, (_, index) => {
        var _a3;
        return ((_a3 = this.spanTopology) == null ? void 0 : _a3.spans[index]) || 1;
      });
    }
    return spans;
  }
  pruneKnownSizes() {
    for (const index of this.knownSizes.keys()) {
      if (index >= this.length) {
        this.knownSizes.delete(index);
      }
    }
  }
  rebuildRowsAndTotals() {
    this.measuredCount = 0;
    this.positiveMeasuredCount = 0;
    this.measuredSizeTotal = 0;
    this.rowLayout = new PrefixLayoutStore(this.getRowCount(), this.estimatedSize);
    const knownRows = /* @__PURE__ */ new Set();
    for (const [index, entry] of this.knownSizes) {
      knownRows.add(this.getRowIndex(index));
      if (entry.kind === SIZE_MEASURED2) {
        this.measuredCount++;
        this.positiveMeasuredCount += Number(entry.size > 0);
        this.measuredSizeTotal += entry.size;
      }
    }
    for (const rowIndex of knownRows) {
      this.syncRowHeight(rowIndex);
    }
  }
  syncRowHeight(rowIndex) {
    const start = this.getRowStartIndex(rowIndex);
    const end = this.getRowEndIndex(rowIndex);
    let knownCount = 0;
    let measuredCount = 0;
    let maxKnownSize = 0;
    for (let index = start; index <= end; index++) {
      const entry = this.knownSizes.get(index);
      const knownSize = entry == null ? void 0 : entry.size;
      measuredCount += Number((entry == null ? void 0 : entry.kind) === SIZE_MEASURED2);
      if (knownSize !== void 0) {
        knownCount++;
        maxKnownSize = Math.max(maxKnownSize, knownSize);
      }
    }
    const itemCount = end - start + 1;
    if (measuredCount === itemCount) {
      this.rowLayout.setMeasuredSize(rowIndex, maxKnownSize);
    } else if (knownCount === itemCount || maxKnownSize > this.estimatedSize) {
      this.rowLayout.setCachedSize(rowIndex, maxKnownSize);
    } else {
      this.rowLayout.clearKnownSize(rowIndex);
    }
  }
};
function assertMoveRange2(length, from, to, count) {
  assertMutationRange2(length, from, count, "move");
  if (!Number.isInteger(to) || to < 0 || to > length - count) {
    throw new RangeError(
      `RowLayoutStore move destination ${to} is invalid for length ${length} and count ${count}`
    );
  }
}
function assertMutationRange2(length, index, count, operation) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 0 || count < 0 || index + count > length) {
    throw new RangeError(`RowLayoutStore ${operation} range ${index}:${count} is invalid for length ${length}`);
  }
}
function transformMoveIndex(index, from, to, count) {
  let nextIndex = index;
  if (index >= from && index < from + count) {
    nextIndex = to + index - from;
  } else {
    const indexAfterRemoval = index >= from + count ? index - count : index;
    nextIndex = indexAfterRemoval >= to ? indexAfterRemoval + count : indexAfterRemoval;
  }
  return nextIndex;
}
function createSpanTopology(length, numColumns, inputSpans) {
  if (isPackedGridRowIndexEnabled()) {
    const topology = {
      blockFirstRows: new Uint32Array(Math.ceil(length / ROW_INDEX_BLOCK_SIZE)),
      columns: new Uint16Array(length),
      rowInBlock: new Uint8Array(length),
      rowStartIndexes: [],
      spans: new Uint16Array(length)
    };
    packSpanRows(topology, numColumns, inputSpans, 0);
    return topology;
  }
  const columns = new Uint16Array(length);
  const itemRowIndexes = new Uint32Array(length);
  const rowEndIndexes = [];
  const rowStartIndexes = [];
  const spans = new Uint16Array(length);
  let column = 1;
  let rowIndex = -1;
  for (let index = 0; index < length; index++) {
    const span = normalizeSpan(inputSpans[index], numColumns);
    if (column + span - 1 > numColumns) {
      column = 1;
    }
    if (column === 1) {
      rowIndex++;
      rowStartIndexes[rowIndex] = index;
    }
    columns[index] = column;
    itemRowIndexes[index] = rowIndex;
    rowEndIndexes[rowIndex] = index;
    spans[index] = span;
    column += span;
    if (column > numColumns) {
      column = 1;
    }
  }
  return {
    columns,
    itemRowIndexes,
    rowEndIndexes,
    rowStartIndexes,
    spans
  };
}
function updateSpanTopologyTail(topology, length, numColumns, inputSpans, invalidationIndex) {
  var _a3, _b;
  const boundedIndex = Math.max(0, Math.min(length - 1, invalidationIndex));
  const firstRowIndex = Math.max(0, ((_a3 = topology.itemRowIndexes[boundedIndex]) != null ? _a3 : 0) - 1);
  const startIndex = (_b = topology.rowStartIndexes[firstRowIndex]) != null ? _b : 0;
  topology.rowStartIndexes.length = firstRowIndex;
  topology.rowEndIndexes.length = firstRowIndex;
  let column = 1;
  let rowIndex = firstRowIndex - 1;
  for (let index = startIndex; index < length; index++) {
    const span = normalizeSpan(inputSpans[index], numColumns);
    if (column + span - 1 > numColumns) {
      column = 1;
    }
    if (column === 1) {
      rowIndex++;
      topology.rowStartIndexes[rowIndex] = index;
    }
    topology.columns[index] = column;
    topology.itemRowIndexes[index] = rowIndex;
    topology.rowEndIndexes[rowIndex] = index;
    topology.spans[index] = span;
    column += span;
    if (column > numColumns) {
      column = 1;
    }
  }
}
function packSpanRows(topology, numColumns, inputSpans, firstRow) {
  var _a3;
  const start = (_a3 = topology.rowStartIndexes[firstRow]) != null ? _a3 : 0;
  topology.rowStartIndexes.length = firstRow;
  let column = 1;
  for (let index = start; index < topology.spans.length; index++) {
    const span = normalizeSpan(inputSpans[index], numColumns);
    if (column + span - 1 > numColumns) column = 1;
    if (column === 1) topology.rowStartIndexes.push(index);
    const block = Math.floor(index / ROW_INDEX_BLOCK_SIZE);
    const row = topology.rowStartIndexes.length - 1;
    if (index % ROW_INDEX_BLOCK_SIZE === 0) topology.blockFirstRows[block] = row;
    topology.rowInBlock[index] = row - topology.blockFirstRows[block];
    topology.columns[index] = column;
    topology.spans[index] = span;
    column += span;
    if (column > numColumns) column = 1;
  }
}
function normalizeLength2(length) {
  if (!Number.isInteger(length) || length < 0) {
    throw new RangeError(`RowLayoutStore length must be a non-negative integer. Received ${length}`);
  }
  return length;
}
function normalizeNumColumns(numColumns) {
  if (!Number.isInteger(numColumns) || numColumns < 1) {
    throw new RangeError(`RowLayoutStore numColumns must be a positive integer. Received ${numColumns}`);
  }
  return numColumns;
}
function normalizeSize2(size) {
  if (!Number.isFinite(size) || size < 0) {
    throw new RangeError(`Layout size must be a finite non-negative number. Received ${size}`);
  }
  return size;
}
function normalizeSpan(span, numColumns) {
  let normalizedSpan = 1;
  if (span !== void 0 && Number.isFinite(span)) {
    normalizedSpan = Math.max(1, Math.min(numColumns, Math.round(span)));
  }
  return normalizedSpan;
}

// src/core/structuralSizeEstimates.ts
function cacheStructuralSizeEstimates(ctx, indices) {
  var _a3, _b, _c, _d, _e, _f;
  const state = ctx.state;
  const entries = [];
  const { getItemType, numColumns } = state.props;
  if (!state.didContainersLayout || !getItemType && (Platform.OS !== "web" || state.averageSizes[""] === void 0) || numColumns !== 1 || Platform.OS !== "web" && state.props.maintainVisibleContentPosition.size)
    return entries;
  let budget = Math.max(1, (_a3 = peek$(ctx, "numContainers")) != null ? _a3 : 0);
  for (const index of indices) {
    if (budget-- <= 0) break;
    const key = getId(state, index);
    if (state.sizesKnown.has(key) || state.sizes.has(key)) continue;
    const item = getItemType ? getDataItem(state, index) : void 0;
    if (getItemType && item === void 0) continue;
    const type = getItemType ? (_b = getItemType(item, index)) != null ? _b : "" : "";
    const average = (_c = state.averageSizes[type]) == null ? void 0 : _c.avg;
    if (average === void 0) continue;
    const size = !getItemType && !((_d = state.layoutStoreRuntime) == null ? void 0 : _d.didSealInitialPredictions) ? (_f = (_e = state.layoutStoreRuntime) == null ? void 0 : _e.store.getEstimatedSize()) != null ? _f : roundSize(average) : roundSize(average);
    state.sizes.set(key, size);
    state.indexByKey.set(key, index);
    entries.push({ index, size, type: "cached" });
  }
  return entries;
}
function* getArrayInsertedIndices(ctx) {
  const state = ctx.state;
  const previous = state.previousData;
  const { data, keyExtractor } = state.props;
  if (!previous || data.length <= previous.length) return;
  const sameKey = (before, after) => previous[before] === data[after] || !!keyExtractor && keyExtractor(previous[before], before) === keyExtractor(data[after], after);
  let start = 0;
  while (start < previous.length && sameKey(start, start)) start++;
  let oldEnd = previous.length - 1;
  let newEnd = data.length - 1;
  while (oldEnd >= start && sameKey(oldEnd, newEnd)) {
    oldEnd--;
    newEnd--;
  }
  if (oldEnd < start) {
    yield* getInsertedBoundaryIndices(start, newEnd - start + 1);
  }
}
function* getInsertedBoundaryIndices(start, count) {
  let left = start;
  let right = start + count - 1;
  while (left <= right) {
    yield left++;
    if (left <= right) yield right--;
  }
}

// src/utils/getScrollVelocity.ts
var MAX_SCROLL_VELOCITY_WINDOW_MS = 1e3;
var SCROLL_VELOCITY_HALF_LIFE_MS = 200;
var getScrollVelocity = (state) => {
  const { scrollHistory } = state;
  const newestIndex = scrollHistory.length - 1;
  if (newestIndex < 1) {
    return 0;
  }
  const newest = scrollHistory[newestIndex];
  if (Date.now() - newest.time > MAX_SCROLL_VELOCITY_WINDOW_MS) {
    return 0;
  }
  let direction = 0;
  let weightedVelocity = 0;
  let totalWeight = 0;
  for (let i = newestIndex; i > 0; i--) {
    const current = scrollHistory[i];
    const previous = scrollHistory[i - 1];
    const scrollDiff = current.scroll - previous.scroll;
    const timeDiff = current.time - previous.time;
    const deltaSign = Math.sign(scrollDiff);
    if (deltaSign !== 0) {
      if (direction === 0) {
        direction = deltaSign;
      } else if (deltaSign !== direction) {
        break;
      }
    }
    if (newest.time - previous.time > MAX_SCROLL_VELOCITY_WINDOW_MS) {
      break;
    }
    if (scrollDiff === 0 || timeDiff <= 0) {
      continue;
    }
    const age = newest.time - current.time;
    const weight = Math.exp(-age / SCROLL_VELOCITY_HALF_LIFE_MS);
    weightedVelocity += scrollDiff / timeDiff * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedVelocity / totalWeight : 0;
};

// src/utils/hasActiveMVCPAnchorLock.ts
function hasActiveMVCPAnchorLock(state) {
  const lock = state.mvcpAnchorLock;
  if (!lock) {
    return false;
  }
  if (Date.now() > lock.expiresAt) {
    state.mvcpAnchorLock = void 0;
    return false;
  }
  return true;
}

// src/utils/updateSnapToOffsets.ts
function updateSnapToOffsets(ctx) {
  const state = ctx.state;
  const {
    props: { snapToIndices }
  } = state;
  const contentSize = state.props.horizontal ? getContentSize(ctx, false) : void 0;
  const snapToOffsets = Array(snapToIndices.length);
  for (let i = 0; i < snapToIndices.length; i++) {
    const index = snapToIndices[i];
    getId(state, index);
    const logicalOffset = getLayoutOffset(ctx, index);
    snapToOffsets[i] = logicalOffset === void 0 ? void 0 : toNativeHorizontalOffset(state, logicalOffset, contentSize);
  }
  set$(ctx, "snapToOffsets", snapToOffsets);
}

// src/core/layoutStoreLifecycle.ts
var INITIAL_ESTIMATE_FLUSH_THRESHOLD = 1;
var INITIAL_ESTIMATE_FLUSH_MIN_MEASUREMENTS = 2;
var PERIODIC_ESTIMATE_FLUSH_MIN_NEW_MEASUREMENTS = 4;
var UNOWNED_SCROLL_SETTLE_MS = 250;
var UNOWNED_SCROLL_MAX_VELOCITY = 0.25;
function preserveLayoutStoreOffsetPredictions(ctx) {
  var _a3;
  const store = (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  if (store instanceof PrefixLayoutStore) store.freezePredictionsThrough(store.length - 1, true);
}
function clearLayoutStoreKnownSizes(ctx) {
  var _a3, _b;
  (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.retainedInvalidationHints.clear();
  (_b = ctx.state.layoutStoreRuntime) == null ? void 0 : _b.store.clearKnownSizes();
  resetLayoutStoreRuntimeState(ctx);
}
function getActiveLayoutStore(ctx) {
  var _a3;
  return (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.store;
}
function cacheLeadingLayoutEstimates(ctx, startKey, leadingBuffer) {
  var _a3, _b, _c;
  const state = ctx.state;
  const { maintainVisibleContentPosition, getFixedItemSize, getItemType } = state.props;
  if (Platform.OS === "web" || !state.didContainersLayout || hasActiveInitialScroll(state) || !maintainVisibleContentPosition.data || !maintainVisibleContentPosition.size || maintainVisibleContentPosition.shouldRestorePosition || state.visibleContentAnchor || state.scrollingTo || state.pendingScrollToEnd || state.pendingNativeMVCPAdjust || getItemType || getFixedItemSize || peek$(ctx, "numColumns") !== 1 || !startKey) {
    return;
  }
  const store = getActiveLayoutStore(ctx);
  const start = state.indexByKey.get(startKey);
  const average = (_a3 = state.averageSizes[""]) == null ? void 0 : _a3.avg;
  const hasLeadingInsertion = state.props.dataSource ? ((_b = state.pendingDataSourceBatches) == null ? void 0 : _b.length) && state.pendingDataSourceBatches.every(
    (batch) => batch.operations.length > 0 && batch.operations.every(
      (operation) => operation.type === "splice" && operation.index === 0 && operation.deleteCount === 0 && operation.insertCount > 0
    )
  ) : state.previousData && getDataLength(state) > state.previousData.length && start !== void 0 && start > state.startBuffered;
  if (store && hasLeadingInsertion && start !== void 0 && average !== void 0 && average > 0) {
    const size = roundSize(average);
    if (size <= 0) return;
    const limit = Math.max(1, state.endBuffered - state.startBuffered + 1);
    let remaining = leadingBuffer;
    for (let index = start - 1; index >= Math.max(0, start - limit) && remaining > 0; index--) {
      const id = (_c = state.idCache[index]) != null ? _c : getId(state, index);
      if (!state.sizesKnown.has(id) && !state.sizes.has(id)) {
        store.setCachedSize(index, size);
        state.sizes.set(id, size);
      }
      remaining -= store.getSize(index);
    }
  }
}
function getSparseIdCacheSnapshot(state) {
  const snapshot = /* @__PURE__ */ new Map();
  for (const [key, index] of state.indexByKey) {
    if (state.idCache[index] !== void 0) snapshot.set(index, key);
  }
  for (const key of Object.keys(state.idCache)) {
    const index = Number(key);
    const id = state.idCache[index];
    if (Number.isInteger(index) && id !== void 0 && !snapshot.has(index) && !state.indexByKey.has(id)) {
      snapshot.set(index, id);
    }
  }
  return snapshot;
}
function materializeLayoutStoreRange(ctx, startIndex, endIndex, allowPendingDataChange = false) {
  var _a3, _b, _c, _d;
  const state = ctx.state;
  const runtime = ctx.state.layoutStoreRuntime;
  const store = runtime == null ? void 0 : runtime.store;
  let range;
  if (store) {
    const start = Math.max(0, Math.trunc(startIndex));
    const end = Math.min(store.length - 1, Math.trunc(endIndex));
    if (start <= end) {
      range = { end, start };
      if (state.props.getItemType && (Platform.OS === "web" || !state.props.maintainVisibleContentPosition.size) && (Platform.OS !== "web" || state.didContainersLayout) && !state.scrollingTo && (!((_a3 = state.pendingDataSourceBatches) == null ? void 0 : _a3.length) || allowPendingDataChange) && !state.dataSourceAnchorPositions && !state.pendingNativeMVCPAdjust) {
        let didChange = false;
        for (let index = start; index <= end; index++) {
          const id = (_b = state.idCache[index]) != null ? _b : getId(state, index);
          if (!state.sizesKnown.has(id) && !state.sizes.has(id) && !(store instanceof PrefixLayoutStore && store.hasAssignedSize(index)) && store.findFirstUnmeasuredIndex(index) === index) {
            const item = getDataItem(state, index);
            if (item !== void 0) {
              const type = (_c = state.props.getItemType(item, index)) != null ? _c : "";
              const average = (_d = state.averageSizes[type]) == null ? void 0 : _d.avg;
              if (average !== void 0) {
                const size = roundSize(average);
                didChange = store.setCachedSize(index, size) || didChange;
                state.sizes.set(id, size);
              }
            }
          }
        }
        if (didChange) addTotalSize(ctx, null, store.getTotalSize(), false);
      }
      if (store instanceof PrefixLayoutStore && state.didContainersLayout && state.didFinishInitialScroll && runtime.didFlushInitialEstimate)
        store.freezePredictionsThrough(end);
      store.forEachLayout(start, end, (index, offset) => {
        var _a4;
        const id = (_a4 = state.idCache[index]) != null ? _a4 : getId(state, index);
        if (ctx.positionListeners.has(id)) {
          notifyLayoutStorePosition(ctx, runtime, id, offset);
        }
        state.indexByKey.set(id, index);
      });
    }
  }
  return range;
}
function getMaterializeRange(ctx, fallbackStart, fallbackEnd) {
  var _a3;
  const state = ctx.state;
  if (state.props.dataSource) {
    const scroll = getItemSpaceOffset(ctx, state.scroll);
    const buffer = state.props.drawDistance * 1.5;
    const range = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store.findIndexRangeAtOffsets(
      Math.max(0, scroll) - buffer,
      Math.max(0, scroll) + state.scrollLength + buffer
    );
    if (range) return range;
  }
  const start = typeof state.startBuffered === "number" && state.startBuffered >= 0 ? state.startBuffered : fallbackStart;
  const end = typeof state.endBuffered === "number" && state.endBuffered >= start ? state.endBuffered : fallbackEnd;
  return { end, start };
}
function flushLayoutStoreEstimate(ctx, estimatedSize, anchorIndex, options) {
  const state = ctx.state;
  const store = getActiveLayoutStore(ctx);
  let didFlush = false;
  if (store && store.length > 0 && Math.abs(estimatedSize - store.getEstimatedSize()) > INITIAL_ESTIMATE_FLUSH_THRESHOLD) {
    const canCorrectAnchor = state.didContainersLayout && state.props.maintainVisibleContentPosition.size;
    if (!(options == null ? void 0 : options.requireAnchorCorrection) || anchorIndex === 0 || canCorrectAnchor) {
      const clampedAnchorIndex = Math.min(Math.max(anchorIndex, 0), store.length - 1);
      const oldAnchorTop = store.getOffset(clampedAnchorIndex);
      const oldTotal = store.getTotalSize();
      store.setEstimatedSize(Platform.OS === "web" ? roundSize(estimatedSize) : estimatedSize);
      if (store.getTotalSize() === oldTotal) return false;
      state.scrollForNextCalculateItemsInView = void 0;
      const range = getMaterializeRange(ctx, clampedAnchorIndex, clampedAnchorIndex);
      materializeLayoutStoreRange(ctx, range.start, range.end);
      syncLayoutStoreState(ctx, options == null ? void 0 : options.notifyTotalSize);
      const newAnchorTop = store.getOffset(clampedAnchorIndex);
      const positionDiff = newAnchorTop - oldAnchorTop;
      if (canCorrectAnchor && (options == null ? void 0 : options.correctAnchor) !== false) {
        requestAdjust(ctx, positionDiff, "estimate");
      }
      didFlush = true;
    }
  }
  return didFlush;
}
function maybeFlushInitialLayoutStoreEstimate(ctx, options) {
  var _a3, _b, _c;
  const state = ctx.state;
  const runtime = ctx.state.layoutStoreRuntime;
  const store = runtime == null ? void 0 : runtime.store;
  let didFlush = false;
  const startNoBuffer = state.startNoBuffer;
  const endNoBuffer = state.endNoBuffer;
  if (store && !runtime.didFlushInitialEstimate && !state.scrollingTo && !state.dataSourceAnchorPositions && (!state.pendingNativeMVCPAdjust || !state.props.maintainVisibleContentPosition.size) && typeof startNoBuffer === "number" && typeof endNoBuffer === "number" && startNoBuffer >= 0 && endNoBuffer >= startNoBuffer) {
    let totalMeasuredSize = 0;
    let measuredCount = 0;
    let areAllVisibleSizesKnown = true;
    for (let index = startNoBuffer; index <= endNoBuffer; index++) {
      const id = (_a3 = state.idCache[index]) != null ? _a3 : getId(state, index);
      const size = state.sizesKnown.get(id);
      if (size === void 0) {
        areAllVisibleSizesKnown = false;
        break;
      }
      if (size > 0) {
        totalMeasuredSize += size;
        measuredCount++;
      }
    }
    if (areAllVisibleSizesKnown && measuredCount >= INITIAL_ESTIMATE_FLUSH_MIN_MEASUREMENTS) {
      const preserveInitialPrediction = Platform.OS === "web" && !state.props.getItemType && state.props.numColumns === 1;
      const nextEstimate = preserveInitialPrediction ? roundSize((_b = store.getPositiveMeasuredAverageSize()) != null ? _b : totalMeasuredSize / measuredCount) : totalMeasuredSize / measuredCount;
      const itemScroll = Math.max(0, getItemSpaceOffset(ctx, state.scroll));
      const fullRange = preserveInitialPrediction ? store.findIndexRangeAtOffsets(
        Math.max(0, itemScroll - state.props.drawDistance),
        itemScroll + state.scrollLength + state.props.drawDistance
      ) : void 0;
      let sampledEnd = (_c = fullRange == null ? void 0 : fullRange.end) != null ? _c : -1;
      if (fullRange && store.getOffset(sampledEnd) >= itemScroll + state.scrollLength + state.props.drawDistance)
        sampledEnd--;
      const firstUnknown = fullRange ? store.findFirstUnmeasuredIndex(fullRange.start) : void 0;
      runtime.didFlushInitialEstimate = !preserveInitialPrediction || fullRange !== void 0 && (firstUnknown === void 0 || firstUnknown > sampledEnd);
      runtime.didSealInitialPredictions = preserveInitialPrediction && runtime.didFlushInitialEstimate;
      runtime.pendingEstimateMeasurements = 0;
      didFlush = flushLayoutStoreEstimate(ctx, nextEstimate, startNoBuffer, options);
    }
  }
  return didFlush;
}
function hasEnoughNewMeasurementsForPeriodicFlush(runtime) {
  return runtime.pendingEstimateMeasurements >= PERIODIC_ESTIMATE_FLUSH_MIN_NEW_MEASUREMENTS;
}
function isUserScrollActive(state) {
  return isUserGestureActive(state) || state.scheduledWork.has("endFollowRearm") || !!state.browserScrollActive;
}
function getUnownedScrollSettleMs(state) {
  var _a3;
  const scrollTime = (_a3 = state.unownedScrollTime) != null ? _a3 : 0;
  if (Platform.OS === "web" || scrollTime <= 0) return 0;
  const age = Date.now() - scrollTime;
  if (age < UNOWNED_SCROLL_SETTLE_MS) return UNOWNED_SCROLL_SETTLE_MS - age;
  return scrollTime === state.scrollTime && Math.abs(getScrollVelocity(state)) > UNOWNED_SCROLL_MAX_VELOCITY ? UNOWNED_SCROLL_SETTLE_MS : 0;
}
function isHeldForIdleSample(state, isMeasuringUserJump) {
  var _a3, _b;
  return !state.didContainersLayout || hasActiveInitialScroll(state) || !!((_a3 = state.pendingDataSourceBatches) == null ? void 0 : _a3.length) || !!state.pendingNativeMVCPAdjust || !!state.scrollingTo || !!state.pendingScrollToEnd || // Follow-end owns the scroll until it ends (setFollowEndOwner reports idle).
  !!state.maintainingScrollAtEnd || !!((_b = state.userScrollAnchorReset) == null ? void 0 : _b.keys.size) || hasActiveMVCPAnchorLock(state) || !isMeasuringUserJump && isUserScrollActive(state);
}
function shouldDeferPeriodicEstimateFlush(state, isMeasurementBatch = false) {
  const isMeasuringUserJump = isMeasurementBatch && state.userScrollAnchorReset !== void 0;
  return isHeldForIdleSample(state, isMeasuringUserJump) || !isMeasuringUserJump && getUnownedScrollSettleMs(state) > 0;
}
function getEstimateFlushAnchorIndex(state) {
  const dataLength = getDataLength(state);
  let anchorIndex;
  if (typeof state.firstFullyOnScreenIndex === "number" && state.firstFullyOnScreenIndex >= 0) {
    anchorIndex = state.firstFullyOnScreenIndex;
  } else if (typeof state.startNoBuffer === "number" && state.startNoBuffer >= 0) {
    anchorIndex = state.startNoBuffer;
  } else if (typeof state.startBuffered === "number" && state.startBuffered >= 0) {
    anchorIndex = state.startBuffered;
  }
  return anchorIndex !== void 0 && dataLength > 0 ? Math.min(anchorIndex, dataLength - 1) : void 0;
}
function maybeFlushPeriodicLayoutStoreEstimate(ctx, options) {
  const runtime = ctx.state.layoutStoreRuntime;
  if (Platform.OS === "web" && !ctx.state.props.getItemType && (runtime == null ? void 0 : runtime.didSealInitialPredictions)) return false;
  if (runtime && hasEnoughNewMeasurementsForPeriodicFlush(runtime)) {
    const measuredAverage = runtime.store.getPositiveMeasuredAverageSize();
    const anchorIndex = getEstimateFlushAnchorIndex(ctx.state);
    runtime.pendingEstimateMeasurements = 0;
    cancelIdleEstimateFlush(ctx);
    if (measuredAverage !== void 0 && anchorIndex !== void 0) {
      return flushLayoutStoreEstimate(ctx, measuredAverage, anchorIndex, {
        ...options,
        requireAnchorCorrection: true
      });
    }
  }
  return false;
}
function flushPeriodicLayoutStoreEstimate(ctx, retryInitialEstimate) {
  var _a3, _b;
  const state = ctx.state;
  const runtime = ctx.state.layoutStoreRuntime;
  let didFlush = false;
  if (runtime) {
    if (shouldDeferPeriodicEstimateFlush(state)) {
      requestIdleEstimateFlush(ctx, retryInitialEstimate);
    } else {
      didFlush = maybeFlushInitialLayoutStoreEstimate(ctx);
      const applyMVCP = state.nativeScrollGeometry && (state.visibleContentAnchor || state.idsInView.length > 0) ? prepareMVCP(ctx, false, "item-size") : void 0;
      if (maybeFlushPeriodicLayoutStoreEstimate(ctx, { correctAnchor: !applyMVCP })) {
        applyMVCP == null ? void 0 : applyMVCP(true);
        didFlush = true;
      }
      set$(ctx, "totalSize", state.totalSize);
    }
  }
  if (didFlush) {
    (_a3 = ctx.schedulePreservedEndAnchorCorrection) == null ? void 0 : _a3.call(ctx);
    (_b = state.triggerCalculateItemsInView) == null ? void 0 : _b.call(state);
    checkThresholds(ctx);
  }
  return didFlush;
}
function cancelIdleEstimateFlush(ctx) {
  afterLayout(ctx, (committedCtx) => committedCtx.state.scheduledWork.cancel("layoutStoreEstimateFlush"));
  ctx.state.onScrollIdle = void 0;
}
function requestIdleEstimateFlush(ctx, retryInitialEstimate) {
  const state = ctx.state;
  const runtime = state.layoutStoreRuntime;
  runtime.idleFlushRetryInitial || (runtime.idleFlushRetryInitial = retryInitialEstimate);
  if (isHeldForIdleSample(state, false)) {
    state.onScrollIdle = () => scheduleIdleEstimateFrame(ctx);
    if (state.mvcpAnchorLock) scheduleIdleEstimateFrame(ctx);
  } else {
    const settleMs = getUnownedScrollSettleMs(state);
    if (settleMs > 0) {
      state.onScrollIdle = void 0;
      state.scheduledWork.timeout(() => scheduleIdleEstimateFrame(ctx), settleMs, "layoutStoreEstimateFlush");
    } else {
      scheduleIdleEstimateFrame(ctx);
    }
  }
}
function scheduleIdleEstimateFrame(ctx) {
  const state = ctx.state;
  const runtime = state.layoutStoreRuntime;
  if (!runtime || state.isUnmounted) return;
  const mark = runtime.estimateMeasurementSerial;
  state.scheduledWork.frame(() => {
    if (state.layoutStoreRuntime !== runtime) return;
    if (runtime.estimateMeasurementSerial !== mark) {
      scheduleIdleEstimateFrame(ctx);
      return;
    }
    const retryInitialEstimate = runtime.idleFlushRetryInitial;
    runtime.idleFlushRetryInitial = false;
    state.onScrollIdle = void 0;
    flushPeriodicLayoutStoreEstimate(ctx, retryInitialEstimate);
  }, "layoutStoreEstimateFlush");
}
function schedulePeriodicLayoutStoreEstimateFlush(ctx, retryInitialEstimate = false) {
  const state = ctx.state;
  const runtime = ctx.state.layoutStoreRuntime;
  let didSchedule = false;
  if (runtime && !(Platform.OS === "web" && !state.props.getItemType && runtime.didSealInitialPredictions) && !state.scheduledWork.has("layoutStoreEstimateFlush") && (peek$(ctx, "totalSize") !== state.totalSize || hasEnoughNewMeasurementsForPeriodicFlush(runtime) || !runtime.didFlushInitialEstimate && (runtime.pendingEstimateMeasurements > 0 || retryInitialEstimate && runtime.store.getMeasuredCount() >= INITIAL_ESTIMATE_FLUSH_MIN_MEASUREMENTS))) {
    requestIdleEstimateFlush(ctx, retryInitialEstimate);
    didSchedule = true;
  }
  return didSchedule;
}
function resetLayoutStoreRuntimeState(ctx) {
  var _a3;
  cancelIdleEstimateFlush(ctx);
  (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.resetTransientState();
}
function setLayoutStoreMeasuredSize(ctx, index, size, notifyTotalSize = true) {
  var _a3;
  const runtime = ctx.state.layoutStoreRuntime;
  const store = runtime == null ? void 0 : runtime.store;
  let didSet = false;
  if (runtime && (store == null ? void 0 : store.hasIndex(index))) {
    const previousCount = store.getMeasuredCount();
    const previousSize = store.getSize(index);
    const isCachedDefaultPrediction = Platform.OS !== "web" && !ctx.state.props.getItemType && ctx.state.sizes.get(ctx.state.idCache[index]) === size;
    const didChange = store.setMeasuredSize(index, size);
    if (didChange || store.getMeasuredCount() !== previousCount) runtime.estimateMeasurementSerial++;
    if (previousSize !== size && store.getMeasuredCount() === previousCount) {
      if (runtime.didSealInitialPredictions) runtime.pendingEstimateMeasurements = 0;
      runtime.didSealInitialPredictions = false;
    }
    if (previousSize !== size || store.getMeasuredCount() !== previousCount && (!runtime.didFlushInitialEstimate || (Platform.OS !== "web" && ctx.state.props.maintainVisibleContentPosition.size || !ctx.state.props.getItemType) && !isCachedDefaultPrediction)) {
      runtime.recordEstimateMeasurement(
        (_a3 = ctx.state.idCache[index]) != null ? _a3 : index,
        PERIODIC_ESTIMATE_FLUSH_MIN_NEW_MEASUREMENTS
      );
    }
    if (didChange) {
      if (notifyTotalSize) {
        syncLayoutStoreState(ctx);
      } else {
        addTotalSize(ctx, null, store.getTotalSize(), false);
      }
    }
    didSet = true;
  }
  return didSet;
}
function reconcileLayoutStoreDataChange(ctx, options) {
  var _a3, _b, _c, _d, _e;
  const state = ctx.state;
  const store = getActiveLayoutStore(ctx);
  let didReconcile = false;
  if (store) {
    const previousIdCache = (_a3 = options == null ? void 0 : options.previousIdCache) != null ? _a3 : getSparseIdCacheSnapshot(state);
    const learnedEstimate = ((_b = state.layoutStoreRuntime) == null ? void 0 : _b.didFlushInitialEstimate) ? store.getEstimatedSize() : void 0;
    const hadSealedPredictions = (_d = (_c = state.layoutStoreRuntime) == null ? void 0 : _c.didSealInitialPredictions) != null ? _d : false;
    state.indexByKey.clear();
    state.idCache.length = 0;
    resetLayoutStoreRuntimeState(ctx);
    const seed = getLayoutStoreSeed(ctx, {
      didKeyExtractorChange: options == null ? void 0 : options.didKeyExtractorChange,
      mode: "reconcile",
      previousIdCache
    });
    didReconcile = !seed.hasDuplicateKey;
    if (didReconcile) {
      const keepEstimate = learnedEstimate !== void 0 && seed.sizeEntries.some((entry) => entry.type === "measured");
      state.layoutStoreRuntime.didSealInitialPredictions = keepEstimate && hadSealedPredictions;
      const structuralEntries = state.props.dataSource ? [] : cacheStructuralSizeEstimates(ctx, getArrayInsertedIndices(ctx));
      const entries = [...seed.sizeEntries, ...structuralEntries];
      const estimate = keepEstimate ? learnedEstimate : seed.estimatedSize;
      let retainOffsetPredictions = false;
      if (store instanceof PrefixLayoutStore) {
        const previousLength = (_e = state.previousData) == null ? void 0 : _e.length;
        const added = previousLength === void 0 ? 0 : getDataLength(state) - previousLength;
        let retainPredictions = previousLength !== void 0;
        let prepended = added > 0 && retainPredictions;
        let retainedCount = 0;
        for (const [index, key] of previousIdCache) {
          if (previousLength === void 0 || index >= previousLength) continue;
          retainedCount++;
          const nextIndex = state.indexByKey.get(key);
          retainPredictions && (retainPredictions = nextIndex === index);
          prepended && (prepended = nextIndex === index + added);
        }
        retainPredictions && (retainPredictions = retainedCount > 0);
        prepended && (prepended = retainedCount > 0);
        if (prepended && previousLength) {
          const previousFirst = state.previousData[0];
          const nextFirst = getDataItem(state, added);
          const keyExtractor = state.props.keyExtractor;
          prepended = previousFirst === nextFirst || !!keyExtractor && keyExtractor(previousFirst, 0) === keyExtractor(nextFirst, added);
        }
        if (prepended && previousLength !== void 0) {
          store.resize(previousLength);
          store.splice(0, 0, added);
        }
        retainOffsetPredictions = retainPredictions || prepended;
      }
      replaceKnownSizes(ctx, store, entries, estimate, retainOffsetPredictions);
      state.layoutStoreRuntime.didFlushInitialEstimate = keepEstimate;
      if (state.pendingNativeMVCPAdjust && state.props.maintainVisibleContentPosition.size) {
        afterLayout(ctx, (committedCtx) => schedulePeriodicLayoutStoreEstimateFlush(committedCtx, true));
      }
    }
  }
  return didReconcile;
}
function syncActiveRowLayoutStoreSpans(ctx) {
  const state = ctx.state;
  const runtime = ctx.state.layoutStoreRuntime;
  const store = runtime == null ? void 0 : runtime.store;
  const { numColumns, overrideItemLayout } = state.props;
  const dataLength = getDataLength(state);
  let didSync = false;
  if (runtime && store instanceof RowLayoutStore && overrideItemLayout && numColumns > 1) {
    const extraData = peek$(ctx, "extraData");
    const cacheInput = getRowSpanCacheInput(state, extraData);
    const cachedSpans = runtime.getCachedRowSpans(cacheInput);
    const spanInvalidationIndex = state.dataSourceSpanInvalidationIndex;
    if (!cachedSpans || spanInvalidationIndex !== void 0) {
      const layoutConfig = { span: 1 };
      const readSpan = (index) => {
        layoutConfig.span = 1;
        const item = getDataItem(state, index);
        if (item !== void 0) {
          overrideItemLayout(layoutConfig, item, index, numColumns, extraData);
        }
        return layoutConfig.span;
      };
      const pendingUpdates = runtime.pendingRowSpanUpdates;
      if (cachedSpans && pendingUpdates) {
        let firstChanged;
        for (const index of pendingUpdates) {
          const span = readSpan(index);
          if (normalizeSpan(span, numColumns) !== store.getSpan(index)) {
            firstChanged = Math.min(firstChanged != null ? firstChanged : index, index);
          }
          cachedSpans[index] = span;
        }
        if (firstChanged !== void 0) store.resize(dataLength, cachedSpans, numColumns, firstChanged);
      } else {
        const spans = cachedSpans != null ? cachedSpans : new Array(dataLength);
        const startIndex = cachedSpans ? Math.max(0, Math.min(spanInvalidationIndex != null ? spanInvalidationIndex : 0, dataLength)) : 0;
        for (let index = startIndex; index < dataLength; index++) {
          spans[index] = readSpan(index);
        }
        store.resize(dataLength, spans, numColumns, cachedSpans ? spanInvalidationIndex : void 0);
        runtime.setCachedRowSpans(cacheInput, spans);
      }
      runtime.pendingRowSpanUpdates = void 0;
      state.dataSourceSpanInvalidationIndex = void 0;
      didSync = true;
    }
  } else {
    runtime == null ? void 0 : runtime.clearRowSpanCache();
  }
  return didSync;
}
function syncLayoutStoreStructure(ctx) {
  var _a3, _b;
  const state = ctx.state;
  const estimatedSize = getLayoutStorePropEstimatedSize(ctx);
  const dataLength = getDataLength(state);
  const nextStoreKind = getLayoutStoreKind(state);
  let runtime = state.layoutStoreRuntime;
  if (runtime && getLayoutStoreKindForStore(runtime.store) === nextStoreKind) {
    if (runtime.store instanceof RowLayoutStore) {
      if (!state.dataSourceMutationApplied || state.didColumnsChange) {
        runtime.store.resize(dataLength, getReusableRowSpans(ctx, runtime), state.props.numColumns);
      }
    } else {
      runtime.store.resize(dataLength);
    }
    if (estimatedSize !== runtime.propEstimatedSize) {
      runtime.store.setEstimatedSize(estimatedSize);
    }
  } else {
    const store = nextStoreKind === "row" ? new RowLayoutStore({
      estimatedSize,
      length: dataLength,
      numColumns: state.props.numColumns
    }) : new PrefixLayoutStore(dataLength, estimatedSize);
    runtime = new LayoutStoreRuntime(store, estimatedSize);
    state.layoutStoreRuntime = runtime;
    if (canSeedLayoutStore(state)) {
      const seed = getLayoutStoreSeed(ctx);
      replaceKnownSizes(ctx, runtime.store, seed.sizeEntries, seed.estimatedSize);
    }
  }
  if (((_a3 = state.initialScroll) == null ? void 0 : _a3.kind) === "offset") preserveLayoutStoreOffsetPredictions(ctx);
  runtime.propEstimatedSize = estimatedSize;
  return (_b = state.layoutStoreRuntime) == null ? void 0 : _b.store;
}
function getRowSpanCacheInput(state, extraData) {
  const { dataKey, dataVersion, numColumns, overrideItemLayout } = state.props;
  return {
    data: getIndexedData(state),
    dataKey,
    dataVersion,
    extraData,
    numColumns,
    overrideItemLayout
  };
}
function canSeedLayoutStore(state) {
  return state.sizesKnown.size > 0 || state.sizes.size > 0;
}
function getReusableRowSpans(ctx, runtime) {
  const state = ctx.state;
  const { numColumns, overrideItemLayout } = state.props;
  let spans;
  if (overrideItemLayout && numColumns > 1) {
    spans = runtime.getCachedRowSpans(getRowSpanCacheInput(state, peek$(ctx, "extraData")));
  } else {
    runtime.clearRowSpanCache();
  }
  return spans;
}
function getLayoutStoreKind(state) {
  return state.props.numColumns > 1 ? "row" : "prefix";
}
function getLayoutStoreKindForStore(store) {
  return store instanceof RowLayoutStore ? "row" : "prefix";
}
function replaceKnownSizes(ctx, store, entries, estimate, retainPredictions = false) {
  if (store instanceof PrefixLayoutStore) {
    store.replaceKnownSizeEntries(
      entries,
      estimate,
      retainPredictions,
      ctx.layoutEffects && ((report) => ctx.layoutEffects.push(report))
    );
  } else {
    store.replaceKnownSizeEntries(entries, estimate);
  }
}
function rebuildLayoutStoreExact(ctx, previousIdCache) {
  var _a3, _b;
  const state = ctx.state;
  const previousStore = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  const store = syncLayoutStoreStructure(ctx);
  if (store && store === previousStore) {
    const seed = getLayoutStoreSeed(ctx, { mode: "seed", previousIdCache });
    replaceKnownSizes(ctx, store, seed.sizeEntries, seed.estimatedSize);
  }
  return (_b = state.layoutStoreRuntime) == null ? void 0 : _b.store;
}
function syncLayoutStoreState(ctx, notifyTotalSize = true) {
  const runtime = ctx.state.layoutStoreRuntime;
  let didSync = false;
  if (runtime) {
    const store = runtime.store;
    addTotalSize(ctx, null, store.getTotalSize(), notifyTotalSize);
    if (ctx.state.props.snapToIndices) {
      updateSnapToOffsets(ctx);
    }
    syncLayoutStorePositionListeners(ctx, runtime);
    didSync = true;
  }
  return didSync;
}
function syncLayoutStorePositionListeners(ctx, runtime) {
  const state = ctx.state;
  const store = runtime.store;
  if (ctx.positionListeners.size > 0) {
    for (const [key] of ctx.positionListeners) {
      const index = state.indexByKey.get(key);
      if (store.hasIndex(index)) {
        notifyLayoutStorePosition(ctx, runtime, key, store.getOffset(index));
      }
    }
  }
}
function notifyLayoutStorePosition(ctx, runtime, key, offset) {
  let offsets = runtime.positionListenerOffsets;
  if (!offsets) {
    offsets = /* @__PURE__ */ new Map();
    runtime.positionListenerOffsets = offsets;
  }
  if (offsets.get(key) !== offset) {
    offsets.set(key, offset);
    notifyPosition$(ctx, key, offset);
  }
}
function getLayoutStorePropEstimatedSize(ctx) {
  var _a3;
  const size = ((_a3 = ctx.state.props.estimatedItemSize) != null ? _a3 : 100) + ctx.scrollAxisGap;
  return size > 0 ? size : 100;
}
function getLayoutStoreSeed(ctx, options = { mode: "seed" }) {
  var _a3, _b, _c, _d;
  const state = ctx.state;
  const { data } = state.props;
  const dataLength = getDataLength(state);
  const fallbackSize = getLayoutStorePropEstimatedSize(ctx);
  const sizeEntries = [];
  const canSeedKnownSizes = state.sizesKnown.size > 0;
  const canSeedCachedSizes = state.sizes.size > 0;
  if (options.mode === "seed" && !canSeedKnownSizes && !canSeedCachedSizes) {
    return { estimatedSize: fallbackSize, sizeEntries };
  }
  const previousData = state.previousData;
  const statePendingDataComparison = state.pendingDataComparison;
  const pendingDataComparison = statePendingDataComparison && statePendingDataComparison.previousData === previousData && statePendingDataComparison.nextData === data ? statePendingDataComparison : void 0;
  let hasDuplicateKey = false;
  let measuredCount = 0;
  let measuredTotalSize = 0;
  const dataLengthDelta = previousData ? dataLength - previousData.length : 0;
  let retainedIndicesByKey;
  const materializedIndices = (_b = (_a3 = options.previousIdCache) == null ? void 0 : _a3.keys()) != null ? _b : getSparseIdCacheSnapshot(state).keys();
  for (const index of materializedIndices != null ? materializedIndices : []) {
    const isIndexInRange = index >= 0 && index < dataLength;
    if (!isIndexInRange && (options.mode !== "reconcile" || !state.props.hasReliableKeyExtractor)) {
      continue;
    }
    const previousKey = (_c = options.previousIdCache) == null ? void 0 : _c.get(index);
    const canReusePreviousKey = isIndexInRange && options.mode === "reconcile" && !options.didKeyExtractorChange && previousKey !== void 0 && previousData !== void 0 && (previousData[index] === getDataItem(state, index) || (pendingDataComparison == null ? void 0 : pendingDataComparison.byIndex[index]) !== void 0);
    let shouldSeedKey = isIndexInRange;
    let targetIndex = index;
    let key = canReusePreviousKey ? previousKey : isIndexInRange ? getId(state, index) : previousKey;
    if (options.mode === "reconcile" && !canReusePreviousKey && previousKey !== void 0 && (!isIndexInRange || key !== previousKey)) {
      shouldSeedKey = dataLengthDelta === 0 && isIndexInRange;
      if (dataLengthDelta !== 0) {
        const shiftedIndex = index + dataLengthDelta;
        if (shiftedIndex >= 0 && shiftedIndex < dataLength) {
          const shiftedKey = (_d = state.idCache[shiftedIndex]) != null ? _d : getId(state, shiftedIndex);
          if (shiftedKey === previousKey) {
            shouldSeedKey = true;
            targetIndex = shiftedIndex;
            key = previousKey;
          }
        }
      }
      if (previousData && (key !== previousKey || !shouldSeedKey)) {
        if (!retainedIndicesByKey) {
          const retainedKeys = new Set(options.previousIdCache.values());
          retainedIndicesByKey = /* @__PURE__ */ new Map();
          const indexedData = getIndexedData(state);
          for (let nextIndex = 0; nextIndex < dataLength; nextIndex++) {
            const nextKey = indexedData.getKey(nextIndex);
            if (retainedKeys.has(nextKey)) {
              if (retainedIndicesByKey.has(nextKey)) {
                return { estimatedSize: fallbackSize, hasDuplicateKey: true, sizeEntries };
              }
              retainedIndicesByKey.set(nextKey, nextIndex);
            }
          }
        }
        const retainedIndex = retainedIndicesByKey.get(previousKey);
        if (retainedIndex !== void 0) {
          shouldSeedKey = true;
          targetIndex = retainedIndex;
          key = previousKey;
        } else if (isIndexInRange && key !== void 0 && key !== previousKey && (state.sizesKnown.has(key) || state.sizes.has(key))) {
          shouldSeedKey = true;
        }
      }
    }
    if (!shouldSeedKey || key === void 0) {
      continue;
    }
    if (options.mode === "reconcile") {
      state.idCache[targetIndex] = key;
      if (state.indexByKey.get(key) === targetIndex) {
        continue;
      }
      if (state.indexByKey.has(key)) {
        hasDuplicateKey = true;
        break;
      }
      state.indexByKey.set(key, targetIndex);
    }
    const knownSize = canSeedKnownSizes ? state.sizesKnown.get(key) : void 0;
    if (knownSize !== void 0) {
      if (knownSize > 0) {
        measuredCount++;
        measuredTotalSize += knownSize;
      }
      sizeEntries.push({
        index: targetIndex,
        size: knownSize,
        type: "measured"
      });
    } else {
      const cachedSize = canSeedCachedSizes ? state.sizes.get(key) : void 0;
      if (cachedSize !== void 0) {
        if (options.mode === "reconcile" && previousData && previousKey === key && index === previousData.length - 1 !== (targetIndex === dataLength - 1) && index < previousData.length && (!state.props.keyExtractor || state.props.keyExtractor(previousData[index], index) === key)) {
          state.sizes.delete(key);
          continue;
        }
        sizeEntries.push({
          index: targetIndex,
          size: cachedSize,
          type: "cached"
        });
      }
    }
  }
  return {
    estimatedSize: state.pendingNativeMVCPAdjust && state.props.maintainVisibleContentPosition.size ? state.layoutStoreRuntime.store.getEstimatedSize() : measuredCount >= INITIAL_ESTIMATE_FLUSH_MIN_MEASUREMENTS ? Platform.OS === "web" ? roundSize(measuredTotalSize / measuredCount) : measuredTotalSize / measuredCount : fallbackSize,
    hasDuplicateKey,
    sizeEntries
  };
}

// src/utils/clampScrollIndex.ts
function clampScrollIndex(index, dataLength) {
  if (dataLength <= 0) {
    return -1;
  }
  if (index >= dataLength) {
    return dataLength - 1;
  }
  if (index < 0) {
    return 0;
  }
  return index;
}

// src/core/getCurrentTargetOffset.ts
function isEndAlignedLastItemTarget(ctx, scrollingTo) {
  return (scrollingTo.isScrollToEnd || scrollingTo.index === getDataLength(ctx.state) - 1) && scrollingTo.viewPosition === 1;
}
function getCommittedWebEndOffset(ctx) {
  var _a3, _b, _c;
  (_a3 = ctx.clearTemporaryScrollAdjust) == null ? void 0 : _a3.call(ctx);
  return (_c = (_b = ctx.state.refScroller.current) == null ? void 0 : _b.getMaxScrollOffset) == null ? void 0 : _c.call(_b);
}
function getMaintainedWebEndOffset(ctx, scrollingTo) {
  var _a3;
  if (Platform.OS === "web" && (ctx.state.maintainingScrollAtEnd || scrollingTo.isScrollToEnd && !scrollingTo.animated && !peek$(ctx, "scrollAdjustPending")) && !scrollingTo.isInitialScroll && scrollingTo.clampToContentContainerMinSize && isEndAlignedLastItemTarget(ctx, scrollingTo)) {
    const end = getCommittedWebEndOffset(ctx);
    if (end === void 0 || ctx.state.maintainingScrollAtEnd) return end;
    const trailingOffset = getEndAlignedViewOffset(
      getStylePaddingEnd(ctx.state.props),
      peek$(ctx, "footerSize") || 0
    );
    return Math.max(0, Math.min(end, end - (((_a3 = scrollingTo.viewOffset) != null ? _a3 : 0) - trailingOffset)));
  }
}
function isIOSInstantIndexTarget(ctx, scrollingTo) {
  const index = scrollingTo.index;
  return Platform.OS === "ios" && !scrollingTo.isInitialScroll && !scrollingTo.animated && index !== void 0 && index >= 0 && index < getDataLength(ctx.state);
}
function getDeferredNativeAdjust(ctx, scrollingTo) {
  var _a3;
  return Platform.OS !== "web" && isLaidOutIndexTarget(ctx, scrollingTo) ? (_a3 = peek$(ctx, "scrollAdjustPending")) != null ? _a3 : 0 : 0;
}
function isLaidOutIndexTarget(ctx, scrollingTo) {
  return !scrollingTo.isInitialScroll && scrollingTo.index !== void 0 && getLayoutOffset(ctx, clampScrollIndex(scrollingTo.index, getDataLength(ctx.state))) !== void 0;
}
function getCurrentTargetOffset(ctx, scrollingTo) {
  var _a3;
  if (scrollingTo.kind === "end") {
    const committedEnd2 = Platform.OS === "web" ? getCommittedWebEndOffset(ctx) : void 0;
    return committedEnd2 != null ? committedEnd2 : getScrollRangeEnd(ctx);
  }
  const committedEnd = getMaintainedWebEndOffset(ctx, scrollingTo);
  if (committedEnd !== void 0) return committedEnd;
  const index = scrollingTo.isScrollToEnd ? getDataLength(ctx.state) - 1 : scrollingTo.index === void 0 ? void 0 : clampScrollIndex(scrollingTo.index, getDataLength(ctx.state));
  const isRetargetingWebScroll = Platform.OS === "web" && (!scrollingTo.isInitialScroll || !!ctx.state.initialScroll && ctx.state.initialScroll.kind !== "offset");
  const requestedTargetOffset = index !== void 0 && (isRetargetingWebScroll || isEndAlignedLastItemTarget(ctx, scrollingTo) || isLaidOutIndexTarget(ctx, scrollingTo)) ? calculateOffsetWithOffsetPosition(ctx, calculateOffsetForIndex(ctx, index), { ...scrollingTo, index }) - getDeferredNativeAdjust(ctx, scrollingTo) : isRetargetingWebScroll ? calculateOffsetWithOffsetPosition(ctx, scrollingTo.offset, scrollingTo) : (_a3 = scrollingTo.targetOffset) != null ? _a3 : scrollingTo.offset - (scrollingTo.viewOffset || 0);
  return clampScrollOffset(ctx, requestedTargetOffset, scrollingTo);
}

// src/core/doScrollParams.ts
function getNativeScrollPoint(ctx, offset, horizontal = ctx.state.props.horizontal) {
  var _a3;
  const { state } = ctx;
  const committedMax = horizontal && Platform.OS === "web" && state.maintainingScrollAtEnd ? getCommittedWebEndOffset(ctx) : void 0;
  return horizontal ? {
    x: toNativeHorizontalOffset(
      state,
      offset,
      committedMax !== void 0 ? committedMax + state.scrollLength : Math.max(getContentSize(ctx), (_a3 = state.props.contentContainerMinSize) != null ? _a3 : 0)
    ),
    y: 0
  } : { x: 0, y: offset };
}

// src/platform/flushSync.native.ts
var flushSync = (fn) => {
  fn();
};

// src/utils/isInMVCPActiveMode.native.ts
function isInMVCPActiveMode(state) {
  return state.dataChangeNeedsScrollUpdate;
}

// src/core/updateScroll.ts
function isWebScrollAwayFromEnd(ctx, newScroll, previousComparableScroll, previousNativeScroll) {
  var _a3;
  const { state } = ctx;
  const { scrollingTo } = state;
  return Platform.OS === "web" && newScroll < previousComparableScroll - 1 && !state.pendingNativeMVCPAdjust && (!scrollingTo || (scrollingTo.isInitialScroll || scrollingTo.isScrollToEnd) && newScroll < ((_a3 = scrollingTo.targetOffset) != null ? _a3 : scrollingTo.offset) - 1) && (!hasActiveInitialScroll(state) && !scrollingTo || newScroll < (previousNativeScroll != null ? previousNativeScroll : newScroll) - 1);
}
function updateScroll(ctx, newScroll, forceUpdate, options) {
  var _a3, _b, _c, _d, _e, _f;
  markLayoutChanged(ctx);
  const state = ctx.state;
  const { ignoreScrollFromMVCP, lastScrollAdjustForHistory, scrollAdjustHandler, scrollHistory, scrollingTo } = state;
  const prevScroll = state.scroll;
  const nativeGeometry = Platform.OS !== "web" && peek$(ctx, "isFollowingEnd") ? state.nativeScrollGeometry : void 0;
  const nativeInset = state.nativeContentInset;
  const nativeInsetEnd = nativeGeometry ? nativeInset ? state.props.horizontal ? getHorizontalInsetEnd(state, nativeInset) : nativeInset.bottom : getContentInsetEnd(ctx) : 0;
  const nativeInsetTop = nativeGeometry && Platform.OS === "ios" && !state.props.horizontal ? (_a3 = nativeInset == null ? void 0 : nativeInset.top) != null ? _a3 : getContentInsetTop(ctx) : 0;
  const nativeEnd = nativeGeometry ? Math.max(-nativeInsetTop, nativeGeometry.content + nativeInsetEnd - nativeGeometry.length) : void 0;
  const isNativeEndClamp = nativeEnd !== void 0 && nativeEnd < getContentSize(ctx) - state.scrollLength - EDGE_POSITION_EPSILON && Math.abs(newScroll - nativeEnd) <= EDGE_POSITION_EPSILON;
  if ((options == null ? void 0 : options.markHasScrolled) !== false) {
    state.hasScrolled = true;
  }
  const currentTime = Date.now();
  state.lastBatchingAction = currentTime;
  const adjust = scrollAdjustHandler.getAdjust();
  const adjustChanged = lastScrollAdjustForHistory !== void 0 && Math.abs(adjust - lastScrollAdjustForHistory) > 0.1;
  if (adjustChanged || isNativeEndClamp || (options == null ? void 0 : options.nativeGeometryChanged) && (Platform.OS === "web" || options.previousNativeScroll !== newScroll)) {
    scrollHistory.length = 0;
  }
  if (options == null ? void 0 : options.nativeGeometryChanged) {
    state.scrollForNextCalculateItemsInView = void 0;
  }
  state.lastScrollAdjustForHistory = adjust;
  if ((scrollingTo === void 0 || scrollingTo.ownerPhase === "browser-moving") && !(scrollHistory.length === 0 && newScroll === state.scroll)) {
    if (!adjustChanged && !isNativeEndClamp && !(options == null ? void 0 : options.nativeGeometryChanged)) {
      scrollHistory.push({ scroll: newScroll, time: currentTime });
    }
  }
  if (scrollHistory.length > 5) {
    scrollHistory.shift();
  }
  if (ignoreScrollFromMVCP && !scrollingTo && !state.pendingNativeMVCPAdjust) {
    const { lt, gt } = ignoreScrollFromMVCP;
    if (lt && newScroll < lt || gt && newScroll > gt) {
      state.ignoreScrollFromMVCPIgnored = true;
      return;
    }
    if (options == null ? void 0 : options.fromNativeScrollEvent) {
      state.ignoreScrollFromMVCP = void 0;
      state.ignoreScrollFromMVCPIgnored = false;
      state.scheduledWork.cancel("ignoreScrollFromMVCP");
    }
  }
  state.scroll = newScroll;
  state.scrollTime = currentTime;
  if (!state.isDragging && !state.isMomentumScrolling && !state.scrollingTo && !state.scheduledWork.has("endFollowRearm")) {
    state.unownedScrollTime = currentTime;
  }
  const previousComparableScroll = Platform.OS === "web" && (options == null ? void 0 : options.fromNativeScrollEvent) && newScroll < prevScroll ? Math.min(prevScroll, (_d = (_c = (_b = state.refScroller.current) == null ? void 0 : _b.getMaxScrollOffset) == null ? void 0 : _c.call(_b)) != null ? _d : prevScroll) : prevScroll;
  const scrollDelta = Math.abs(newScroll - prevScroll);
  const isUserScrollEvent = !!(options == null ? void 0 : options.fromNativeScrollEvent) && !isNativeEndClamp && scrollDelta > 0.1 && (Platform.OS !== "web" || !hasActiveInitialScroll(state) && Math.abs(newScroll - previousComparableScroll) > 0.1) && !adjustChanged && scrollingTo === void 0 && !state.pendingNativeMVCPAdjust;
  const drawDistanceHold = state.drawDistanceHold;
  if (drawDistanceHold) {
    if (!isUserScrollEvent) drawDistanceHold.scroll = newScroll;
    else if (Math.abs(newScroll - drawDistanceHold.scroll) > 2) state.drawDistanceHold = void 0;
  }
  if (isUserScrollEvent && !(options == null ? void 0 : options.nativeGeometryChanged)) {
    state.scrollBufferDirection = newScroll > prevScroll ? 1 : -1;
  }
  const didCancelMaintainScrollAtEnd = !!(state.maintainingScrollAtEnd || state.pendingMaintainScrollAtEnd || peek$(ctx, "isFollowingEnd")) && (Platform.OS === "web" ? !!(options == null ? void 0 : options.fromNativeScrollEvent) && isWebScrollAwayFromEnd(ctx, newScroll, previousComparableScroll, options.previousNativeScroll) : isUserScrollEvent && !(options == null ? void 0 : options.nativeGeometryChanged) && !state.maintainingScrollAtEnd && !state.pendingMaintainScrollAtEnd && !state.isDragging && state.userScrollContentSize === void 0 && getContentSize(ctx) - newScroll - state.scrollLength > Math.max(
    EDGE_POSITION_EPSILON,
    ((_e = state.props.maintainScrollAtEndThreshold) != null ? _e : 0) * state.scrollLength
  ));
  if (didCancelMaintainScrollAtEnd) {
    if (Platform.OS === "web") {
      ctx.interruptUserScroll();
    } else {
      interruptMaintainScrollAtEnd(ctx);
    }
  }
  if (isUserScrollEvent) {
    state.visibleContentAnchor = void 0;
    if (!(options == null ? void 0 : options.nativeGeometryChanged)) observeEndFollowUserScroll(ctx, prevScroll);
  }
  const allowedEdge = isUserScrollEvent ? beginReachedEdgeUserScroll(ctx, newScroll - prevScroll) : void 0;
  const scrollLength = state.scrollLength;
  const isLargeScrollJump = scrollLength > 0 && (scrollingTo === void 0 || scrollingTo.ownerPhase === "browser-moving") && scrollDelta > scrollLength;
  const didResolvePendingNativeMVCPAdjust = state.pendingNativeMVCPAdjust ? resolvePendingNativeMVCPAdjust(ctx, newScroll, {
    fromNativeEvent: options == null ? void 0 : options.fromNativeScrollEvent,
    skipSizeCorrection: isLargeScrollJump
  }) : false;
  const isLargeUserScrollJump = isLargeScrollJump && !isNativeEndClamp && !didResolvePendingNativeMVCPAdjust && !state.pendingNativeMVCPAdjust;
  const scrollVelocity = getScrollVelocity(state);
  updateAdaptiveRender(ctx, scrollVelocity, { forceLight: isLargeUserScrollJump });
  const lastCalculated = state.scrollLastCalculate;
  const useAggressiveItemRecalculation = isInMVCPActiveMode(state);
  const shouldUpdate = useAggressiveItemRecalculation || didResolvePendingNativeMVCPAdjust || didCancelMaintainScrollAtEnd || allowedEdge !== void 0 || (options == null ? void 0 : options.nativeGeometryChanged) || forceUpdate || lastCalculated === void 0 || Math.abs(state.scroll - lastCalculated) > 2;
  if (shouldUpdate) {
    state.scrollLastCalculate = state.scroll;
    state.ignoreScrollFromMVCPIgnored = false;
    state.lastScrollDelta = scrollDelta;
    const runCalculateItems = () => {
      var _a4;
      const calculateItemsParams = {
        doMVCP: scrollingTo !== void 0 && scrollingTo.ownerPhase !== "browser-moving",
        scrollVelocity
      };
      if (isLargeUserScrollJump) {
        calculateItemsParams.drawDistanceMode = "visible-first";
      }
      (_a4 = state.triggerCalculateItemsInView) == null ? void 0 : _a4.call(state, calculateItemsParams);
      checkThresholds(ctx, allowedEdge);
    };
    if (isLargeUserScrollJump) {
      state.mvcpAnchorLock = void 0;
      state.pendingNativeMVCPAdjust = void 0;
      state.userScrollAnchorReset = { keys: /* @__PURE__ */ new Set() };
      state.scheduledWork.cancel("mvcpRecalculate");
      if ((options == null ? void 0 : options.fromNativeScrollEvent) && !isWebLayoutMeasurement(ctx)) flushSync(runCalculateItems);
      else runCalculateItems();
      scheduleFullDrawDistancePrewarm(ctx);
    } else {
      runCalculateItems();
    }
    const shouldMaintainScrollAtEndAfterPendingSettle = !!state.pendingMaintainScrollAtEnd || !!((_f = state.props.maintainScrollAtEnd) == null ? void 0 : _f.onDataChange);
    if (didResolvePendingNativeMVCPAdjust && shouldMaintainScrollAtEndAfterPendingSettle) {
      state.pendingMaintainScrollAtEnd = false;
      ctx.doMaintainScrollAtEnd();
    }
    state.dataChangeNeedsScrollUpdate = false;
    state.lastScrollDelta = 0;
  } else {
    checkThresholds(ctx, allowedEdge);
  }
}

// src/core/cancelScroll.ts
function cancelScroll(ctx, stopAnimation = true, commitAdjust = true, inputDelta = 0, cancelledAnimationOffset) {
  var _a3, _b, _c;
  const { state } = ctx;
  const pendingAdjust = peek$(ctx, "scrollAdjustPending");
  const fallback = pendingAdjust ? ((_a3 = state.scrollingTo) == null ? void 0 : _a3.animated) && !state.scrollingTo.isInitialScroll ? state.scroll - pendingAdjust : state.scrollPending : void 0;
  const observed = getObservedScrollOffset(ctx, fallback);
  const wasAnimating = cancelledAnimationOffset !== void 0 || !!((_b = state.scrollingTo) == null ? void 0 : _b.animated) || !!((_c = ctx.scrollRequestTracker) == null ? void 0 : _c.cancel());
  const stopped = wasAnimating && stopAnimation;
  const stopOffset = stopped && inputDelta ? clampScrollOffset(ctx, observed + inputDelta) : observed;
  releaseScrollOwners(ctx, true);
  state.scrollPending = stopOffset;
  updateScroll(ctx, stopOffset, true, { markHasScrolled: false });
  if (stopped) stopScrollAnimation(ctx, observed, inputDelta);
  if (commitAdjust) state.scrollAdjustHandler.commitPendingAdjust();
  else state.scrollAdjustHandler.supersedePendingAdjust();
  return stopped;
}
function stopScrollAnimation(ctx, observed = getObservedScrollOffset(ctx), inputDelta = 0) {
  var _a3, _b;
  const { state } = ctx;
  const scroller = state.refScroller.current;
  const offset = observed + inputDelta;
  const x = !state.props.horizontal ? 0 : inputDelta ? getNativeScrollPoint(ctx, offset).x : (_b = (_a3 = scroller == null ? void 0 : scroller.getCurrentScrollOffset) == null ? void 0 : _a3.call(scroller)) != null ? _b : getNativeScrollPoint(ctx, observed).x;
  recordScrollWrite(state, "stop", "absolute", offset);
  scroller == null ? void 0 : scroller.scrollTo({ animated: false, x, y: state.props.horizontal ? 0 : offset });
}
function releaseScrollOwners(ctx, supersedeInitial) {
  var _a3;
  const { state } = ctx;
  cancelPendingNativeMVCPAdjust(state);
  (_a3 = ctx.scrollRequestTracker) == null ? void 0 : _a3.cancel();
  interruptMaintainScrollAtEnd(ctx);
  cancelImperativeScroll(state);
  state.pendingEndMeasurements = void 0;
  state.visibleContentAnchor = void 0;
  if (supersedeInitial) supersedeInitialScroll(ctx);
  clearPreservedInitialScrollTarget(state);
  syncScrollActive(ctx);
}
function interruptUserScroll(ctx, inputDelta = 0, cancelledAnimationOffset) {
  var _a3;
  ctx.state.mvcpAnchorLock = void 0;
  ctx.state.dataSourceAnchorPositions = void 0;
  if (ctx.state.scrollingTo || ((_a3 = ctx.scrollRequestTracker) == null ? void 0 : _a3.isWaitingToRun()) || ctx.state.initialScroll && !ctx.state.didFinishInitialScroll) {
    return cancelScroll(ctx, Platform.OS === "web", true, inputDelta, cancelledAnimationOffset) && inputDelta !== 0;
  }
  releaseScrollOwners(ctx, false);
  return false;
}

// src/core/scrollRequestTracker.ts
function getScrollRequestTracker(ctx) {
  if (!ctx.scrollRequestTracker) {
    let currentToken = 0;
    let waitingToken;
    let stopToken;
    let explicitStartOffset;
    const start = (resolve, isInternal = false) => {
      var _a3;
      const state = ctx.state;
      const supersedesAnimation = !isInternal && !!((_a3 = state.scrollingTo) == null ? void 0 : _a3.animated);
      if (!isInternal) {
        cancelPendingNativeMVCPAdjust(state);
        if (supersedesAnimation) cancelScroll(ctx, false, false);
        state.scheduledWork.cancel("appScrollRearm");
        state.pendingEndMeasurements = void 0;
        state.visibleContentAnchor = void 0;
        state.userScrollAnchorReset = void 0;
        interruptMaintainScrollAtEnd(ctx);
      }
      explicitStartOffset = isInternal ? void 0 : getObservedScrollOffset(ctx);
      state.scheduledWork.cancel("imperativeScrollReady");
      const token = ++currentToken;
      stopToken = supersedesAnimation || stopToken !== void 0 ? token : void 0;
      settlePendingImperativeScroll(state);
      state.pendingScrollResolve = resolve;
      waitingToken = token;
      set$(ctx, "isScrollActive", true);
      return token;
    };
    const runNow = (token, resolve, run) => {
      const state = ctx.state;
      if (token !== currentToken) {
        return;
      }
      waitingToken = void 0;
      const didStartScroll = run();
      if (stopToken === token) {
        stopToken = void 0;
        if (didStartScroll !== true) {
          stopScrollAnimation(ctx);
          state.scrollAdjustHandler.commitPendingAdjust();
        }
      }
      if (didStartScroll === "unreachable" || !didStartScroll && state.scrollingTo) {
        cancelScroll(ctx);
        return;
      }
      if (!didStartScroll || !state.scrollingTo) {
        explicitStartOffset = void 0;
        if (state.pendingScrollResolve === resolve) {
          state.pendingScrollResolve = void 0;
        }
        syncScrollActive(ctx);
        rearmEndFollowIfSettled(ctx, "request");
        resolve();
      }
    };
    ctx.scrollRequestTracker = {
      cancel: () => {
        const owedStop = stopToken !== void 0;
        currentToken++;
        waitingToken = void 0;
        stopToken = void 0;
        explicitStartOffset = void 0;
        return owedStop;
      },
      finishReachedEdgeScroll: (nativeKeyEdge) => {
        if (waitingToken === currentToken) return void 0;
        const previousOffset = explicitStartOffset;
        explicitStartOffset = void 0;
        if (nativeKeyEdge) {
          return previousOffset !== void 0 && Math.abs(ctx.state.scroll - previousOffset) > 1 ? beginReachedEdgeUserScroll(ctx, nativeKeyEdge === "start" ? -1 : 1) : void 0;
        }
        return previousOffset === void 0 ? void 0 : rearmReachedEdgeAfterScroll(ctx, ctx.state.scroll - previousOffset);
      },
      isCurrent: (token) => token === currentToken,
      isWaitingToRun: () => waitingToken === currentToken && !!ctx.state.pendingScrollResolve,
      runNow,
      runNowIfIdle: (run) => {
        const state = ctx.state;
        if (state.pendingScrollResolve || state.scrollingTo) {
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          const token = start(resolve, true);
          runNow(token, resolve, run);
        });
      },
      start
    };
  }
  return ctx.scrollRequestTracker;
}

// src/core/doMaintainScrollAtEnd.ts
function reissueClampedNativeEndScroll(ctx) {
  var _a3, _b, _c;
  const state = ctx.state;
  const target = state.scrollingTo;
  if ((target == null ? void 0 : target.isScrollToEnd) && !target.animated && !((_a3 = ctx.scrollRequestTracker) == null ? void 0 : _a3.isWaitingToRun())) {
    const targetOffset = getCurrentTargetOffset(ctx, target);
    const distanceToTarget = targetOffset - ((_b = state.lastNativeScroll) != null ? _b : state.scroll);
    if (distanceToTarget > 1 || state.lastNativeScroll === void 0 && distanceToTarget < -1) {
      recordScrollWrite(state, "end-reissue", "absolute", targetOffset);
      (_c = state.refScroller.current) == null ? void 0 : _c.scrollTo({ animated: false, ...getNativeScrollPoint(ctx, targetOffset) });
    }
  }
}
function clampAndroidHorizontalOverscroll(ctx, contentWidth) {
  var _a3;
  const state = ctx.state;
  if (Platform.OS !== "android" || !state.props.horizontal || state.scrollingTo || state.isDragging) return;
  const maxScroll = Math.max(0, contentWidth - state.scrollLength);
  if (state.scrollLength > 0 && state.scroll > maxScroll + 1) {
    recordScrollWrite(state, "clamp", "absolute", maxScroll);
    (_a3 = state.refScroller.current) == null ? void 0 : _a3.scrollTo({ animated: false, ...getNativeScrollPoint(ctx, maxScroll) });
  }
}
function doMaintainScrollAtEnd(ctx, options) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const state = ctx.state;
  if (state.isUnmounted) return false;
  if (Platform.OS === "web" && !((_a3 = state.initialScroll) == null ? void 0 : _a3.bootstrap)) {
    const observed = getObservedScrollOffset(ctx);
    const comparable = Math.min(
      state.scroll,
      (_b = state.lastNativeScroll) != null ? _b : observed,
      (_e = (_d = (_c = state.refScroller.current) == null ? void 0 : _c.getMaxScrollOffset) == null ? void 0 : _d.call(_c)) != null ? _e : state.scroll
    );
    if (isWebScrollAwayFromEnd(ctx, observed, comparable, state.lastNativeScroll)) {
      ctx.interruptUserScroll();
      return false;
    }
  }
  if (state.isDragging || state.userScrollContentSize !== void 0 || ((_g = (_f = state.refScroller.current) == null ? void 0 : _f.isScrollInRange) == null ? void 0 : _g.call(_f)) === false) {
    finishMaintainScrollAtEnd(ctx);
    return false;
  }
  const { didContainersLayout, pendingNativeMVCPAdjust } = state;
  const isReplayingPendingMaintain = !!state.pendingMaintainScrollAtEnd;
  const maintainScrollAtEnd = requestEndFollowMaintenance(ctx);
  if (maintainScrollAtEnd === "deferred") return false;
  if (!maintainScrollAtEnd) {
    if (pendingNativeMVCPAdjust) state.pendingMaintainScrollAtEnd = false;
    else finishMaintainScrollAtEnd(ctx);
    return false;
  }
  const immediate = (options == null ? void 0 : options.immediate) && Platform.OS === "web" && !maintainScrollAtEnd.animated;
  if (!state.scrollingTo || Platform.OS === "web") {
    const scroller = state.refScroller.current;
    const nativeMax = (_h = scroller == null ? void 0 : scroller.getMaxScrollOffset) == null ? void 0 : _h.call(scroller);
    const observed = (_i = scroller == null ? void 0 : scroller.getCurrentScrollOffset) == null ? void 0 : _i.call(scroller);
    if (nativeMax !== void 0 && observed !== void 0 && nativeMax < state.scroll - 1 && Math.abs(observed - nativeMax) <= 1) {
      state.pendingMaintainScrollAtEnd = true;
      state.scrollPending = observed;
      updateScroll(ctx, observed, true, { markHasScrolled: false });
    }
  }
  if (options == null ? void 0 : options.prepareOnly) return true;
  const anchorIndex = (_j = state.props.anchoredEndSpace) == null ? void 0 : _j.anchorIndex;
  const dataLength = getDataLength(state);
  if (!didContainersLayout || // Wait for the anchored tail to be measured.
  anchorIndex !== void 0 && anchorIndex >= 0 && anchorIndex < dataLength && !areKnownOrFixedItemSizesAvailable(ctx, anchorIndex, dataLength - 1) || // Native MVCP must finish its clamp before end following takes ownership.
  pendingNativeMVCPAdjust) {
    state.pendingMaintainScrollAtEnd = true;
    return false;
  }
  if (state.scrollingTo || state.pendingScrollResolve) {
    if ((options == null ? void 0 : options.immediate) && !maintainScrollAtEnd.animated && ((_k = state.scrollingTo) == null ? void 0 : _k.isScrollToEnd) && !state.scrollingTo.animated) {
      state.pendingMaintainScrollAtEnd = false;
      ctx.scrollToEnd({ animated: false });
      return true;
    }
    state.pendingMaintainScrollAtEnd = true;
    return false;
  }
  state.pendingMaintainScrollAtEnd = false;
  const contentSize = getContentSize(ctx);
  if (contentSize < state.scrollLength) {
    state.scroll = clampScrollOffset(ctx, 0);
  }
  if (!state.maintainingScrollAtEnd || immediate && (state.maintainingScrollAtEnd === "pending-instant" || state.maintainingScrollAtEnd === "instant")) {
    const pendingState = maintainScrollAtEnd.animated ? "pending-animated" : "pending-instant";
    const activeState = maintainScrollAtEnd.animated ? "animated" : "instant";
    const scrollAtRequest = state.scroll;
    setFollowEndOwner(state, pendingState);
    const run = () => {
      var _a4, _b2;
      if (state.maintainingScrollAtEnd !== pendingState) return;
      if (state.isDragging || state.userScrollContentSize !== void 0 || ((_b2 = (_a4 = state.refScroller.current) == null ? void 0 : _a4.isScrollInRange) == null ? void 0 : _b2.call(_a4)) === false || // Layout may move the end beyond the threshold. Only web offset changes
      // cancel here; native user input is canceled by its drag handler.
      !isReplayingPendingMaintain && !peek$(ctx, "isWithinMaintainScrollAtEndThreshold") && Platform.OS === "web" && state.scroll !== scrollAtRequest) {
        finishMaintainScrollAtEnd(ctx);
      } else if (state.scrollingTo || state.pendingScrollResolve) {
        state.pendingMaintainScrollAtEnd = true;
        setFollowEndOwner(state, void 0);
      } else {
        setFollowEndOwner(state, activeState);
        const scrollPromise = getScrollRequestTracker(ctx).runNowIfIdle(
          () => ctx.scrollToEnd({ animated: maintainScrollAtEnd.animated })
        );
        void scrollPromise.then(() => {
          if (state.maintainingScrollAtEnd === activeState && !state.scrollingTo && !state.pendingScrollResolve) {
            if (state.pendingMaintainScrollAtEnd) {
              setFollowEndOwner(state, void 0);
              doMaintainScrollAtEnd(ctx);
            } else {
              finishMaintainScrollAtEnd(ctx);
            }
          }
        });
      }
    };
    if (immediate) {
      run();
    } else {
      state.scheduledWork.frame(run, "maintainScrollAtEnd");
    }
  } else if (state.maintainingScrollAtEnd === "animated" || state.maintainingScrollAtEnd === "instant" || // Android clamps an instant command to the extent it has laid out, which can still be the
  // pre-append one; replay the coalesced follow once the first command lands.
  Platform.OS === "android" && state.maintainingScrollAtEnd === "pending-instant") {
    state.pendingMaintainScrollAtEnd = true;
  }
  return true;
}

// src/core/finishScrollTo.ts
function finishScrollTo(ctx) {
  var _a3, _b, _c, _d;
  const state = ctx.state;
  if (state == null ? void 0 : state.scrollingTo) {
    cancelScrollCompletionChecks(state);
    const pendingResolve = ((_a3 = ctx.scrollRequestTracker) == null ? void 0 : _a3.isWaitingToRun()) ? void 0 : state.pendingScrollResolve;
    const resolvePendingScroll = () => {
      if (state.pendingScrollResolve === pendingResolve) state.pendingScrollResolve = void 0;
      syncScrollActive(ctx);
      rearmEndFollowIfSettled(ctx, "request");
      pendingResolve == null ? void 0 : pendingResolve();
    };
    const scrollingTo = state.scrollingTo;
    state.scrollHistory.length = 0;
    setScrollOwnerTarget(state, void 0);
    state.scrollTargetPinnedRange = void 0;
    state.scrollTargetRemeasure = void 0;
    syncScrollActive(ctx);
    if (state.pendingTotalSize !== void 0) {
      addTotalSize(ctx, null, state.pendingTotalSize);
    }
    if (PlatformAdjustBreaksScroll) {
      state.scrollAdjustHandler.commitPendingAdjust(scrollingTo);
    }
    const complete = () => {
      resolvePendingScroll == null ? void 0 : resolvePendingScroll();
      if (state.pendingMaintainScrollAtEnd) {
        setFollowEndOwner(state, void 0);
        doMaintainScrollAtEnd(ctx, { immediate: !!scrollingTo.isInitialScroll });
      }
    };
    if (scrollingTo.isInitialScroll || state.initialScroll) {
      const isOffsetSession = ((_b = state.initialScroll) == null ? void 0 : _b.kind) === "offset";
      const shouldPreserveResizeTarget = !!scrollingTo.isInitialScroll && getDataLength(state) > 0 && ((_c = state.initialScroll) == null ? void 0 : _c.viewPosition) === 1;
      finishInitialScroll(ctx, {
        onFinished: complete,
        preserveTarget: isOffsetSession && getDataLength(state) === 0 || shouldPreserveResizeTarget,
        recalculateItems: true,
        syncObservedOffset: isOffsetSession,
        waitForCompletionFrame: !!scrollingTo.waitForInitialScrollCompletionFrame
      });
      return;
    }
    const allowedEdge = (_d = ctx.scrollRequestTracker) == null ? void 0 : _d.finishReachedEdgeScroll(
      scrollingTo.ownerPhase ? scrollingTo.kind === "end" ? "end" : "start" : void 0
    );
    recalculateSettledScroll(ctx, allowedEdge);
    complete();
  }
}

// src/core/checkFinishedScroll.ts
var INITIAL_SCROLL_MAX_FALLBACK_CHECKS = 20;
var INITIAL_SCROLL_COMPLETION_TARGET_EPSILON = 1;
var INITIAL_SCROLL_ZERO_TARGET_EPSILON = 1;
var SILENT_INITIAL_SCROLL_RETRY_DELAY_MS = 16;
var SILENT_INITIAL_SCROLL_TARGET_EPSILON = 1;
var NATIVE_ANIMATION_END_CHECK_DELAY_MS = 16;
function checkFinishedScroll(ctx, options) {
  const scrollingTo = ctx.state.scrollingTo;
  if (options == null ? void 0 : options.onlyIfAligned) {
    if (!(scrollingTo == null ? void 0 : scrollingTo.isInitialScroll) || scrollingTo.animated) {
      return;
    }
    if (!getResolvedScrollCompletionState(ctx, scrollingTo).isAtResolvedTarget) {
      return;
    }
  }
  ctx.state.scheduledWork.frame(() => checkFinishedScrollFrame(ctx), "checkFinishedScrollFrame");
}
function isSilentInitialDispatch(state, scrollingTo) {
  return !!(scrollingTo == null ? void 0 : scrollingTo.isInitialScroll) && initialScrollCompletion.didDispatchNativeScroll(state) && !state.hasScrolled;
}
function isNativeInitialNonZeroTarget(state) {
  var _a3;
  const targetOffset = (_a3 = initialScrollWatchdog.get(state)) == null ? void 0 : _a3.targetOffset;
  return !state.didFinishInitialScroll && initialScrollWatchdog.hasNonZeroTargetOffset(targetOffset);
}
function shouldFinishInitialScrollWithoutNativeProgress(state, scrollingTo) {
  var _a3;
  if (!scrollingTo.isInitialScroll || scrollingTo.animated || !state.didContainersLayout) {
    return false;
  }
  if (!!state.initialScroll && state.initialScroll.kind !== "offset") {
    return false;
  }
  const targetOffset = (_a3 = scrollingTo.targetOffset) != null ? _a3 : scrollingTo.offset;
  if (initialScrollWatchdog.hasNonZeroTargetOffset(targetOffset) && initialScrollCompletion.didDispatchNativeScroll(state) && !state.hasScrolled) {
    return false;
  }
  if (initialScrollWatchdog.isAtZeroTargetOffset(targetOffset) || Math.abs(state.scroll - targetOffset) > 1 || Math.abs(state.scrollPending - targetOffset) > 1) {
    return false;
  }
  return !!scrollingTo.waitForInitialScrollCompletionFrame || isNativeInitialNonZeroTarget(state);
}
function shouldFinishInitialZeroTargetScroll(ctx) {
  var _a3;
  const { state } = ctx;
  return !!((_a3 = state.scrollingTo) == null ? void 0 : _a3.isInitialScroll) && getDataLength(state) > 0 && getContentSize(ctx) <= state.scrollLength && state.scrollPending <= INITIAL_SCROLL_ZERO_TARGET_EPSILON;
}
function getResolvedScrollCompletionState(ctx, scrollingTo) {
  var _a3;
  const { state } = ctx;
  const isWebInitialScroll = Platform.OS === "web" && scrollingTo.isInitialScroll;
  const isInstantIndex = isIOSInstantIndexTarget(ctx, scrollingTo) && !scrollingTo.isScrollToEnd;
  const isPaintedIndex = isInstantIndex || isEndedNativeIndexAnimation(state, scrollingTo);
  const scroll = isWebInitialScroll ? getObservedScrollOffset(ctx, state.scrollPending) : isInstantIndex ? getObservedScrollOffset(ctx, state.scrollPending) : scrollingTo.animated && !scrollingTo.isInitialScroll ? getObservedScrollOffset(ctx, state.scroll - ((_a3 = peek$(ctx, "scrollAdjustPending")) != null ? _a3 : 0)) : state.scrollPending;
  const adjust = state.scrollAdjustHandler.getAdjust();
  const clampedTargetOffset = getCurrentTargetOffset(ctx, scrollingTo);
  const maxOffset = clampScrollOffset(ctx, scroll, scrollingTo);
  const diff1 = Math.abs(scroll - clampedTargetOffset);
  const adjustedTargetOffset = clampedTargetOffset + adjust;
  const diff2 = Math.abs(scroll - adjustedTargetOffset);
  const canUseAdjustedCompletion = !isWebInitialScroll && !isIOSInstantIndexTarget(ctx, scrollingTo) && !isLaidOutIndexTarget(ctx, scrollingTo) && (!scrollingTo.animated || Platform.OS === "ios");
  const isWaitingForNativeEnd = Platform.OS !== "web" && scrollingTo.isScrollToEnd && !state.maintainingScrollAtEnd && !scrollingTo.isInitialScroll && !scrollingTo.animated && state.lastNativeScroll !== void 0 && state.lastNativeScroll < Math.min(clampedTargetOffset, adjustedTargetOffset) - 1;
  return {
    clampedTargetOffset,
    isAtResolvedTarget: !isWaitingForNativeEnd && Math.abs(scroll - maxOffset) < 1 && (isPaintedIndex ? Math.round(scroll * PixelRatio.get()) === Math.round(clampedTargetOffset * PixelRatio.get()) : diff1 < 1 || canUseAdjustedCompletion && diff2 < 1)
  };
}
function checkFinishedScrollFrame(ctx) {
  var _a3;
  const scrollingTo = ctx.state.scrollingTo;
  if (!scrollingTo) {
    return;
  }
  const { state } = ctx;
  if (Platform.OS === "web" && scrollingTo.ownerPhase && scrollingTo.kind !== "end" && state.scheduledWork.has("platformScrollCompletion"))
    return;
  const completionState = getResolvedScrollCompletionState(ctx, scrollingTo);
  const isPassingTarget = (Platform.OS === "web" || isLaidOutIndexTarget(ctx, scrollingTo) && !isEndAlignedLastItemTarget(ctx, scrollingTo)) && scrollingTo.animated && !scrollingTo.isInitialScroll && Math.abs(completionState.clampedTargetOffset - ((_a3 = scrollingTo.targetOffset) != null ? _a3 : scrollingTo.offset)) > 1;
  if (!isPassingTarget && completionState.isAtResolvedTarget && (!scrollingTo.isInitialScroll || state.hasScrolled || completionState.clampedTargetOffset <= INITIAL_SCROLL_COMPLETION_TARGET_EPSILON)) {
    finishScrollTo(ctx);
  }
}
function scrollToFallbackOffset(ctx, offset, animated = false) {
  var _a3;
  recordScrollWrite(ctx.state, "landing", "absolute", offset);
  (_a3 = ctx.state.refScroller.current) == null ? void 0 : _a3.scrollTo({ animated, ...getNativeScrollPoint(ctx, offset) });
}
function didOwnNativeAnimationEnd(state, scrollingTo) {
  const end = scrollingTo.nativeAnimationEnd;
  return end !== void 0 && state.lastNativeScroll !== void 0 && Math.abs(state.lastNativeScroll - end.offset - (state.scrollAdjustHandler.getAdjust() - end.adjust)) <= 1;
}
function isEndedNativeIndexAnimation(state, scrollingTo) {
  return Platform.OS !== "web" && !!scrollingTo.animated && !scrollingTo.isInitialScroll && !scrollingTo.isScrollToEnd && scrollingTo.index !== void 0 && didOwnNativeAnimationEnd(state, scrollingTo);
}
function noteNativeScrollAnimationEnd(ctx) {
  const state = ctx.state;
  const scrollingTo = state.scrollingTo;
  if (Platform.OS === "web" || !(scrollingTo == null ? void 0 : scrollingTo.animated) || scrollingTo.isInitialScroll || state.isDragging || state.isMomentumScrolling)
    return;
  if (state.lastNativeScroll === void 0) return;
  scrollingTo.nativeAnimationEnd = { adjust: state.scrollAdjustHandler.getAdjust(), offset: state.lastNativeScroll };
  state.scheduledWork.cancel("checkFinishedScrollFallback");
}
function checkFinishedScrollFallback(ctx) {
  const state = ctx.state;
  if (state.scheduledWork.has("checkFinishedScrollFallback")) {
    return;
  }
  const scrollingTo = state.scrollingTo;
  const shouldFinishInitialZeroTarget = shouldFinishInitialZeroTargetScroll(ctx);
  const silentInitialDispatch = isSilentInitialDispatch(state, scrollingTo);
  const canFinishInitialWithoutNativeProgress = scrollingTo !== void 0 ? shouldFinishInitialScrollWithoutNativeProgress(state, scrollingTo) : false;
  const slowTimeout = (scrollingTo == null ? void 0 : scrollingTo.isInitialScroll) && !shouldFinishInitialZeroTarget && !canFinishInitialWithoutNativeProgress || !state.didContainersLayout || // Allow native animations to deliver their first event after an idle period.
  Platform.OS !== "web" && !!(scrollingTo == null ? void 0 : scrollingTo.animated);
  const initialDelay = shouldFinishInitialZeroTarget || canFinishInitialWithoutNativeProgress ? 0 : scrollingTo && didOwnNativeAnimationEnd(state, scrollingTo) ? NATIVE_ANIMATION_END_CHECK_DELAY_MS : silentInitialDispatch ? SILENT_INITIAL_SCROLL_RETRY_DELAY_MS : slowTimeout ? 500 : 100;
  let numChecks = 0;
  let previousScroll = state.scrollPending;
  const scheduleFallbackCheck = (delay) => {
    state.scheduledWork.timeout(checkHasScrolled, delay, "checkFinishedScrollFallback");
  };
  const checkHasScrolled = () => {
    var _a3, _b, _c, _d, _e, _f, _g, _h;
    const isStillScrollingTo = state.scrollingTo;
    if (isStillScrollingTo) {
      if (Platform.OS === "web" && isStillScrollingTo.ownerPhase && isStillScrollingTo.kind !== "end" && state.scheduledWork.has("platformScrollCompletion"))
        return;
      numChecks++;
      const isNativeInitialPending = isNativeInitialNonZeroTarget(state) && !state.hasScrolled;
      const maxChecks = !silentInitialDispatch && isNativeInitialPending ? INITIAL_SCROLL_MAX_FALLBACK_CHECKS : 5;
      const shouldFinishZeroTarget = shouldFinishInitialZeroTargetScroll(ctx);
      const canFinishInitialScrollWithoutNativeProgress = shouldFinishInitialScrollWithoutNativeProgress(
        state,
        isStillScrollingTo
      );
      const completionState = getResolvedScrollCompletionState(ctx, isStillScrollingTo);
      const didTargetOffsetChange = Math.abs(
        completionState.clampedTargetOffset - ((_a3 = isStillScrollingTo.targetOffset) != null ? _a3 : isStillScrollingTo.offset)
      ) > 1;
      const canFinishAfterSilentNativeDispatch = Platform.OS === "android" && silentInitialDispatch && completionState.isAtResolvedTarget;
      const shouldRetrySilentInitialNativeScroll = canFinishAfterSilentNativeDispatch && !initialScrollCompletion.didRetrySilentInitialScroll(state);
      const shouldFinishAfterObservedScroll = state.hasScrolled && (!isStillScrollingTo.isInitialScroll || completionState.isAtResolvedTarget);
      const shouldRetryUnalignedInitialScroll = isStillScrollingTo.isInitialScroll && !completionState.isAtResolvedTarget;
      const shouldRetryUnalignedIndexScroll = Platform.OS !== "web" && !isStillScrollingTo.isInitialScroll && (isEndAlignedLastItemTarget(ctx, isStillScrollingTo) || isIOSInstantIndexTarget(ctx, isStillScrollingTo) || isEndedNativeIndexAnimation(state, isStillScrollingTo) || isStillScrollingTo.index !== void 0 && didTargetOffsetChange) && !completionState.isAtResolvedTarget && numChecks <= maxChecks;
      const isAnimatedMaintain = !!(isStillScrollingTo.animated && isStillScrollingTo.isScrollToEnd && state.maintainingScrollAtEnd === "animated");
      const didMaintainProgress = isAnimatedMaintain && Math.abs(state.scrollPending - previousScroll) > 0.1;
      previousScroll = state.scrollPending;
      const isMovingNativeRequest = Platform.OS !== "web" && !isStillScrollingTo.isInitialScroll && isStillScrollingTo.animated && !didOwnNativeAnimationEnd(state, isStillScrollingTo) && Date.now() - ((_b = state.lastNativeScrollTime) != null ? _b : 0) < USER_MOMENTUM_STALL_TIMEOUT_MS;
      if ((didMaintainProgress || isMovingNativeRequest) && (!completionState.isAtResolvedTarget || didTargetOffsetChange)) {
        numChecks = 0;
        scheduleFallbackCheck(100);
      } else if (shouldRetrySilentInitialNativeScroll) {
        const targetOffset = (_e = (_d = (_c = initialScrollWatchdog.get(state)) == null ? void 0 : _c.targetOffset) != null ? _d : isStillScrollingTo.targetOffset) != null ? _e : 0;
        const jiggleOffset = targetOffset >= SILENT_INITIAL_SCROLL_TARGET_EPSILON ? targetOffset - SILENT_INITIAL_SCROLL_TARGET_EPSILON : targetOffset + SILENT_INITIAL_SCROLL_TARGET_EPSILON;
        initialScrollCompletion.markSilentInitialScrollRetry(state);
        scrollToFallbackOffset(ctx, jiggleOffset);
        state.scheduledWork.frame(
          () => scrollToFallbackOffset(ctx, targetOffset),
          "checkFinishedScrollRetryFrame"
        );
        scheduleFallbackCheck(SILENT_INITIAL_SCROLL_RETRY_DELAY_MS);
      } else if (shouldRetryUnalignedIndexScroll) {
        isStillScrollingTo.targetOffset = completionState.clampedTargetOffset;
        const snap = isStillScrollingTo.animated && didOwnNativeAnimationEnd(state, isStillScrollingTo) && Math.abs(completionState.clampedTargetOffset - getObservedScrollOffset(ctx)) <= SCROLL_LANDING_SNAP_DISTANCE;
        if (snap) isStillScrollingTo.animated = false;
        scrollToFallbackOffset(ctx, completionState.clampedTargetOffset, !!isStillScrollingTo.animated);
        scheduleFallbackCheck(snap ? NATIVE_ANIMATION_END_CHECK_DELAY_MS : 100);
      } else if (shouldFinishZeroTarget || shouldFinishAfterObservedScroll || canFinishInitialScrollWithoutNativeProgress || canFinishAfterSilentNativeDispatch || numChecks > maxChecks) {
        if (Platform.OS !== "web" && !isStillScrollingTo.isInitialScroll && !(isStillScrollingTo.isScrollToEnd && state.maintainingScrollAtEnd) && !((_f = ctx.scrollRequestTracker) == null ? void 0 : _f.isWaitingToRun()) && !completionState.isAtResolvedTarget) {
          cancelScroll(ctx, false);
        } else {
          finishScrollTo(ctx);
        }
      } else {
        if (isNativeInitialPending || shouldRetryUnalignedInitialScroll) {
          const watchdog = initialScrollWatchdog.get(state);
          const targetOffset = Platform.OS === "web" ? completionState.clampedTargetOffset : (_h = (_g = watchdog == null ? void 0 : watchdog.targetOffset) != null ? _g : isStillScrollingTo.targetOffset) != null ? _h : state.scrollPending;
          if (Platform.OS === "web" && watchdog) {
            watchdog.targetOffset = targetOffset;
          }
          scrollToFallbackOffset(ctx, targetOffset);
        }
        scheduleFallbackCheck(silentInitialDispatch ? SILENT_INITIAL_SCROLL_RETRY_DELAY_MS : 100);
      }
    }
  };
  scheduleFallbackCheck(initialDelay);
}

// src/core/doScrollTo.native.ts
function doScrollTo(ctx, params) {
  var _a3, _b;
  const state = ctx.state;
  const { animated, horizontal, isInitialScroll, offset } = params;
  const isAnimated = !!animated;
  const { refScroller } = state;
  const scroller = refScroller.current;
  if (!scroller) {
    return;
  }
  (_b = (_a3 = state.scrollAdjustHandler).clearNativeRemainder) == null ? void 0 : _b.call(_a3);
  if (!params.isAdjustment) {
    state.userScrollContentSize = void 0;
  }
  if (isAnimated) {
    state.scrollOwnerTaskWrite = void 0;
  }
  if (isAnimated || claimInstantAbsoluteWrite(state, params.source, offset, getContentSize(ctx), params.issuedEpoch)) {
    recordScrollWrite(state, params.source, "absolute", offset, params.issuedEpoch);
    scroller.scrollTo({ animated: isAnimated, ...getNativeScrollPoint(ctx, offset, horizontal) });
  }
  if (isInitialScroll) {
    initialScrollCompletion.markInitialScrollNativeDispatch(state);
  }
  if (isAnimated && Math.abs(state.scroll - offset) <= 1) {
    checkFinishedScroll(ctx);
  }
  if (!isAnimated) {
    state.scroll = offset;
  }
  checkFinishedScrollFallback(ctx);
}

// src/core/scrollTo.ts
function syncInitialScrollNativeWatchdog(state, options) {
  const { isInitialScroll, requestedOffset, targetOffset } = options;
  const existingWatchdog = initialScrollWatchdog.get(state);
  const shouldWatchInitialNativeScroll = !state.didFinishInitialScroll && (isInitialScroll || !!existingWatchdog) && initialScrollWatchdog.hasNonZeroTargetOffset(targetOffset);
  const shouldClearInitialNativeScrollWatchdog = !state.didFinishInitialScroll && !!existingWatchdog && initialScrollWatchdog.isAtZeroTargetOffset(requestedOffset);
  if (shouldWatchInitialNativeScroll) {
    state.hasScrolled = false;
    initialScrollWatchdog.set(state, {
      targetOffset
    });
    return;
  }
  if (shouldClearInitialNativeScrollWatchdog) {
    initialScrollWatchdog.clear(state);
  }
}
function getItemBottom(layout, index) {
  const offset = layout.getOffset(index);
  const size = layout.getSize(index);
  return offset !== void 0 && size !== void 0 ? offset + size : void 0;
}
function findVisibleItemIndex(ctx, viewportStart, viewportEnd, layout = getActiveLayoutStore(ctx)) {
  const state = ctx.state;
  if (!layout) return void 0;
  const dataLength = getDataLength(state);
  let low = 0;
  let high = dataLength - 1;
  let match;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const top = layout.getOffset(mid);
    if (top !== void 0 && top <= viewportStart) {
      match = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  let index = match != null ? match : 0;
  while (index > 0 && layout.getOffset(index - 1) === layout.getOffset(index)) index--;
  for (; index < dataLength; index++) {
    const top = layout.getOffset(index);
    if (top === void 0 || top >= viewportEnd) break;
    const bottom = getItemBottom(layout, index) - ctx.scrollAxisGap;
    if (bottom > viewportStart && bottom > top) return index;
  }
  return void 0;
}
function pinScrollTargetRenderRange(ctx, targetOffset) {
  const viewportStart = Math.max(0, getItemSpaceOffset(ctx, targetOffset));
  const viewportEnd = Math.max(viewportStart, getItemSpaceOffset(ctx, targetOffset) + ctx.state.scrollLength);
  const materialized = materializeFixedLayoutStoreRangeAtOffsets(ctx, viewportStart, viewportEnd);
  if (materialized.didChange) {
    syncLayoutStoreState(ctx);
  }
  if (materialized.range) {
    ctx.state.scrollTargetPinnedRange = materialized.range;
    ctx.state.scrollForNextCalculateItemsInView = void 0;
  } else {
    ctx.state.scrollTargetPinnedRange = void 0;
  }
  return materialized.didChange;
}
var RAW_OFFSET_REMEASURE_ROWS = 12;
var RAW_OFFSET_REMEASURE_SCAN = 1e3;
var RAW_OFFSET_REMEASURE_TOLERANCE = 1;
function pinRawOffsetRemeasureRows(ctx) {
  var _a3, _b, _c;
  const state = ctx.state;
  const range = state.scrollTargetPinnedRange;
  state.scrollTargetRemeasure = void 0;
  if (!range) return;
  const { fixedItemSizeKeys, idCache, sizesKnown } = state;
  const typical = (_c = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store.getPositiveMeasuredAverageSize()) != null ? _c : ((_b = state.props.estimatedItemSize) != null ? _b : 0) + ctx.scrollAxisGap;
  const { endBuffered, startBuffered } = state;
  const first = Math.min(range.start, range.end) - 1;
  const last = Math.max(0, first - RAW_OFFSET_REMEASURE_SCAN + 1);
  const selected = [];
  for (let index = first; index >= last; index--) {
    const key = idCache[index];
    if (key === void 0 || (fixedItemSizeKeys == null ? void 0 : fixedItemSizeKeys.has(key))) continue;
    const size = sizesKnown.get(key);
    if (size === void 0 || index >= startBuffered && index <= endBuffered) continue;
    const deviation = Math.abs(size - typical);
    if (deviation <= RAW_OFFSET_REMEASURE_TOLERANCE || selected.length === RAW_OFFSET_REMEASURE_ROWS && deviation <= selected[selected.length - 1].deviation) {
      continue;
    }
    let position = selected.length;
    while (position > 0 && selected[position - 1].deviation < deviation) position--;
    selected.splice(position, 0, { deviation, index, key });
    if (selected.length > RAW_OFFSET_REMEASURE_ROWS) selected.pop();
  }
  const rows = new Map(selected.map(({ index, key }) => [key, index]));
  addStaleRemeasureRows(ctx, first, rows);
  state.scrollTargetRemeasure = rows.size ? rows : void 0;
}
function addStaleRemeasureRows(ctx, first, rows) {
  var _a3, _b;
  const state = ctx.state;
  const stale = state.staleSizeKeys;
  if (!(stale == null ? void 0 : stale.size)) return;
  const { endBuffered, idCache, indexByKey, startBuffered } = state;
  const candidates = [];
  for (const key of stale) {
    const index = indexByKey.get(key);
    if (index === void 0) {
      stale.delete(key);
      continue;
    }
    if (((_a3 = idCache[index]) != null ? _a3 : getId(state, index)) !== key) continue;
    if (index <= first && !(index >= startBuffered && index <= endBuffered) && !rows.has(key)) {
      candidates.push({ index, key });
    }
  }
  const limit = Math.max(RAW_OFFSET_REMEASURE_ROWS, (_b = peek$(ctx, "numContainers")) != null ? _b : 0);
  if (candidates.length > limit) {
    warnDevOnce(
      "clearCachesKeysOverPool",
      `clearCaches({ keys }) marked ${candidates.length} rows before a scrollToOffset target stale; only the ${limit} nearest are measured before it lands.`
    );
    candidates.sort((a, b) => b.index - a.index);
    candidates.length = limit;
  }
  for (const { index, key } of candidates) rows.set(key, index);
}
function isRawOffsetCommand(target) {
  return !target.isInitialScroll && !target.ownerPhase && target.index === void 0 && target.kind !== "end" && !target.isScrollToEnd;
}
function refreshRawOffsetRemeasureRows(ctx) {
  const target = ctx.state.scrollingTo;
  if (target && isRawOffsetCommand(target)) pinRawOffsetRemeasureRows(ctx);
}
function scrollTo(ctx, params) {
  var _a3, _b, _c, _d, _e;
  const state = ctx.state;
  const { noScrollingTo, forceScroll, ...scrollTarget } = params;
  if (!noScrollingTo && !params.ownerPhase && params.offset !== void 0 && (params.index === void 0 || params.isInitialScroll && ((_a3 = state.initialScroll) == null ? void 0 : _a3.kind) === "offset")) {
    preserveLayoutStoreOffsetPredictions(ctx);
  }
  const { animated, isInitialScroll, offset: scrollTargetOffset, precomputedWithViewOffset } = scrollTarget;
  const {
    props: { horizontal }
  } = state;
  cancelScrollCompletionChecks(state);
  const requestedOffset = precomputedWithViewOffset ? scrollTargetOffset : calculateOffsetWithOffsetPosition(ctx, scrollTargetOffset, scrollTarget);
  const shouldPreserveRawInitialOffsetRequest = !!isInitialScroll && ((_b = state.initialScroll) == null ? void 0 : _b.kind) === "offset";
  let targetOffset = (_c = getMaintainedWebEndOffset(ctx, scrollTarget)) != null ? _c : clampScrollOffset(ctx, requestedOffset, scrollTarget);
  let offset = shouldPreserveRawInitialOffsetRequest ? requestedOffset : targetOffset;
  state.scrollHistory.length = 0;
  if (!noScrollingTo) {
    if (isInitialScroll) {
      initialScrollCompletion.resetFlags(state);
    }
    const target = { ...scrollTarget, targetOffset };
    setScrollOwnerTarget(state, target);
    state.scrollTargetRemeasure = void 0;
    if (!isInitialScroll && !scrollTarget.ownerPhase) {
      while (pinScrollTargetRenderRange(ctx, targetOffset) && scrollTarget.index !== void 0 && !precomputedWithViewOffset) {
        const previousTargetOffset = targetOffset;
        target.offset = calculateOffsetForIndex(ctx, scrollTarget.index);
        const resolvedOffset = calculateOffsetWithOffsetPosition(ctx, target.offset, scrollTarget);
        targetOffset = (_d = getMaintainedWebEndOffset(ctx, scrollTarget)) != null ? _d : clampScrollOffset(ctx, resolvedOffset, scrollTarget);
        target.targetOffset = offset = targetOffset;
        if (targetOffset === previousTargetOffset) break;
      }
      if (isRawOffsetCommand(scrollTarget)) {
        pinRawOffsetRemeasureRows(ctx);
      }
    }
  }
  if (!animated || isInitialScroll) {
    state.scrollPending = targetOffset;
  }
  syncInitialScrollNativeWatchdog(state, { isInitialScroll, requestedOffset: offset, targetOffset });
  if (!isInitialScroll && !noScrollingTo && Math.abs(state.scroll - targetOffset) > 1) {
    if (animated) {
      if (state.scrollTargetPinnedRange || state.scrollTargetRemeasure) {
        (_e = state.triggerCalculateItemsInView) == null ? void 0 : _e.call(state);
      }
    } else {
      updateScroll(ctx, targetOffset, true, { markHasScrolled: false });
    }
  }
  if (forceScroll || !isInitialScroll || Platform.OS === "android") {
    doScrollTo(ctx, {
      animated,
      horizontal,
      isInitialScroll,
      offset,
      source: noScrollingTo ? "clamp" : isInitialScroll ? "bootstrap" : "command"
    });
  } else {
    state.scroll = targetOffset;
  }
}

// src/core/initialScroll.ts
function dispatchInitialScroll(ctx, params) {
  const { forceScroll, resolvedOffset, target, waitForCompletionFrame } = params;
  const requestedIndex = target.kind === "offset" ? void 0 : target.index;
  const index = requestedIndex !== void 0 ? clampScrollIndex(requestedIndex, getDataLength(ctx.state)) : void 0;
  const itemSize = getItemSizeAtIndex(ctx, index);
  scrollTo(ctx, {
    animated: false,
    forceScroll,
    index: index !== void 0 && index >= 0 ? index : void 0,
    isInitialScroll: true,
    itemSize,
    kind: target.kind === "end" ? "end" : void 0,
    offset: resolvedOffset,
    precomputedWithViewOffset: true,
    viewOffset: target.viewOffset,
    viewPosition: target.viewPosition,
    viewPositionFallback: target.viewPositionFallback,
    waitForInitialScrollCompletionFrame: waitForCompletionFrame
  });
}
function setInitialScrollTarget(ctx, target, options) {
  const { state } = ctx;
  state.scheduledWork.cancel("initialScrollCompletion");
  clearInitialScrollAnchor(state);
  state.initialScroll = { kind: "index", ...state.initialScroll, ...target };
  if (options == null ? void 0 : options.resetDidFinish) {
    resetInitialRenderState(ctx, { resetInitialScroll: true });
  }
}
function resolveInitialScrollOffset(ctx, initialScroll) {
  var _a3, _b, _c, _d;
  const state = ctx.state;
  if (((_b = initialScroll.kind) != null ? _b : (_a3 = state.initialScroll) == null ? void 0 : _a3.kind) === "offset") {
    return (_c = initialScroll.contentOffset) != null ? _c : 0;
  }
  if (materializeFixedLayoutStoreIndex(ctx, initialScroll.index)) {
    syncLayoutStoreState(ctx);
  }
  if (initialScroll.kind === "end") {
    if (Platform.OS === "web" && !state.props.hasExternalScroll) {
      const node = (_d = state.refScroller.current) == null ? void 0 : _d.getScrollableNode();
      const length = state.props.horizontal ? node == null ? void 0 : node.clientWidth : node == null ? void 0 : node.clientHeight;
      if (length !== void 0 && length > 0) return Math.max(0, getContentSize(ctx) - length);
    }
    return getScrollRangeEnd(ctx);
  }
  const baseOffset = initialScroll.index !== void 0 ? calculateOffsetForIndex(ctx, initialScroll.index) : 0;
  const target = {
    ...initialScroll,
    clampToContentContainerMinSize: isEndOfContentTarget(initialScroll, getDataLength(state))
  };
  const resolvedOffset = calculateOffsetWithOffsetPosition(ctx, baseOffset, target);
  return clampScrollOffset(ctx, resolvedOffset, target);
}
function advanceCurrentInitialScrollSession(ctx, options) {
  var _a3, _b;
  const state = ctx.state;
  const { initialScroll, queuedInitialLayout, scrollingTo } = state;
  const isInitialScrollInProgress = !!(scrollingTo == null ? void 0 : scrollingTo.isInitialScroll);
  const isOffset = (initialScroll == null ? void 0 : initialScroll.kind) === "offset";
  if (!initialScroll || state.hasEstimatedInitialLayout || state.didFinishInitialScroll || scrollingTo && !isInitialScrollInProgress || !isOffset && !queuedInitialLayout && !isInitialScrollInProgress)
    return false;
  const resolvedOffset = resolveInitialScrollOffset(ctx, initialScroll);
  const activeOffset = scrollingTo ? (_a3 = scrollingTo.targetOffset) != null ? _a3 : scrollingTo.offset : void 0;
  const didOffsetChange = initialScroll.contentOffset === void 0 || Math.abs(initialScroll.contentOffset - resolvedOffset) > 1;
  if (!isOffset && !(options == null ? void 0 : options.forceScroll) && !didOffsetChange && isInitialScrollInProgress && Math.abs(activeOffset - resolvedOffset) <= 1)
    return false;
  if ((options == null ? void 0 : options.forceScroll) && (isOffset || isInitialScrollInProgress) && Math.abs(state.scroll - resolvedOffset) <= 1 && Math.abs(state.scrollPending - resolvedOffset) <= 1 && Math.abs(getObservedScrollOffset(ctx) - resolvedOffset) <= 1) {
    if (isOffset && !state.scrollingTo)
      finishInitialScroll(ctx, {
        preserveTarget: getDataLength(state) === 0,
        recalculateItems: true,
        syncObservedOffset: true
      });
    return false;
  }
  if (!isOffset && didOffsetChange) {
    setInitialScrollTarget(ctx, { ...initialScroll, contentOffset: resolvedOffset });
  }
  const forceScroll = (_b = options == null ? void 0 : options.forceScroll) != null ? _b : !!queuedInitialLayout || (isOffset ? !!state.lastLayout && state.scrollLength > 0 : isInitialScrollInProgress && didOffsetChange);
  dispatchInitialScroll(ctx, { forceScroll, resolvedOffset, target: initialScroll });
  return true;
}

// src/core/initialScrollAnchor.ts
function retargetInitialScroll(target, dataLength, footerSize, padding, atEnd) {
  if (target.kind === "end")
    return { ...target, index: Math.max(0, dataLength - 1), viewOffset: -padding - footerSize };
  return {
    ...target,
    contentOffset: void 0,
    index: atEnd ? Math.max(0, dataLength - 1) : target.index,
    preserveForBottomPadding: true,
    viewOffset: -padding - (atEnd || isEndOfContentTarget(target, dataLength) || target.preserveForFooterLayout ? footerSize : 0),
    viewPosition: 1
  };
}
function schedulePreservedEndAnchorCorrection(ctx) {
  const { state } = ctx;
  const anchor = state.initialScrollAnchor;
  if (!anchor || state.isUnmounted || anchor.index !== void 0 && anchor.index >= getDataLength(state) || state.scrollingTo || state.pendingScrollResolve || state.maintainingScrollAtEnd || state.isDragging || getDataLength(state) === 0)
    return false;
  const correct = () => {
    var _a3, _b, _c;
    if (state.initialScrollAnchor !== anchor || state.isUnmounted || anchor.index !== void 0 && anchor.index >= getDataLength(state) || state.scrollingTo || state.pendingScrollResolve || state.maintainingScrollAtEnd || state.isDragging)
      return;
    const observed = Platform.OS !== "web" && typeof state.lastNativeScroll === "number" && Number.isFinite(state.lastNativeScroll) ? state.lastNativeScroll : getObservedScrollOffset(ctx, state.scrollPending);
    const offset = resolveInitialScrollOffset(ctx, anchor);
    const diff = offset - observed;
    if (Math.abs(diff) <= 1) return;
    if (Platform.OS === "web" || anchor.lastRequestTime === void 0 || ((_a3 = state.lastNativeScrollTime) != null ? _a3 : 0) > anchor.lastRequestTime || anchor.contentOffset === void 0 || Math.abs(offset - anchor.contentOffset) > 1) {
      anchor.lastRequestTime = Date.now();
      anchor.lastRequestOffset = observed;
      anchor.contentOffset = offset;
      (_b = ctx.doScrollTo) == null ? void 0 : _b.call(ctx, { animated: false, horizontal: state.props.horizontal, offset, source: "bootstrap" });
      (_c = state.triggerCalculateItemsInView) == null ? void 0 : _c.call(state);
    }
    state.scheduledWork.frame(correct, "initialScrollAlignment");
  };
  if (Platform.OS === "web") state.scheduledWork.microtask(correct, "initialScrollAlignment");
  else state.scheduledWork.frame(correct, "initialScrollAlignment");
  return true;
}
function clearFinishedBootstrapInitialScrollTargetIfMovedAway(ctx, observedOffset) {
  var _a3, _b, _c;
  const { state } = ctx;
  const anchor = state.initialScrollAnchor;
  if (!anchor || state.scrollingTo) return;
  const observed = observedOffset != null ? observedOffset : getObservedScrollOffset(ctx, state.scrollPending);
  const target = (_a3 = anchor.contentOffset) != null ? _a3 : resolveInitialScrollOffset(ctx, anchor);
  if (state.scheduledWork.has("initialScrollAlignment") && (Platform.OS !== "web" || anchor.lastRequestOffset !== void 0 && observed >= Math.min(anchor.lastRequestOffset, target) - 1 && observed <= Math.max(anchor.lastRequestOffset, target) + 1))
    return;
  if (Math.abs(observed - target) <= 1) return;
  if ((anchor.preserveForBottomPadding || anchor.preserveForFooterLayout) && peek$(ctx, "isAtEnd")) {
    const nativeEnd = Platform.OS === "web" ? (_c = (_b = state.refScroller.current) == null ? void 0 : _b.getMaxScrollOffset) == null ? void 0 : _c.call(_b) : void 0;
    if (nativeEnd === void 0 || observed >= nativeEnd - 1) return;
  }
  clearInitialScrollAnchor(state);
}
function updateInitialScrollAnchor(ctx, options) {
  var _a3, _b;
  const { state } = ctx;
  const target = state.initialScrollAnchor;
  if (!target) return;
  const { dataLength, initialScrollAtEnd, stylePaddingEnd, didDataChange, footerSize } = options;
  if (didDataChange && (!initialScrollAtEnd || shouldMaintainScrollAtEndOnDataChange(state))) {
    clearInitialScrollAnchor(state);
    return;
  }
  if (!dataLength || footerSize !== void 0 && target.kind !== "end" && !target.preserveForFooterLayout && !isEndOfContentTarget(target, dataLength))
    return;
  if (!state.scheduledWork.has("initialScrollAlignment") && Math.abs(
    getObservedScrollOffset(ctx, state.scrollPending) - ((_a3 = target.contentOffset) != null ? _a3 : resolveInitialScrollOffset(ctx, target))
  ) > 1) {
    if (target.preserveForFooterLayout) {
      target.preserveForFooterLayout = void 0;
      target.preserveForBottomPadding = true;
    }
    return;
  }
  if (initialScrollAtEnd || target.preserveForBottomPadding) {
    const next = retargetInitialScroll(
      target,
      dataLength,
      (_b = footerSize != null ? footerSize : peek$(ctx, "footerSize")) != null ? _b : 0,
      stylePaddingEnd,
      initialScrollAtEnd
    );
    if (footerSize !== void 0 && next.index === target.index && next.viewOffset === target.viewOffset) {
      next.preserveForFooterLayout = void 0;
    }
    next.contentOffset = target.contentOffset;
    state.initialScrollAnchor = next;
    schedulePreservedEndAnchorCorrection(ctx);
  }
}

// src/utils/checkAllSizesKnown.ts
function checkAllSizesKnown(state, start, end) {
  if (start == null || end == null || start < 0 || end < start) {
    return false;
  }
  let hasMountedIndex = false;
  for (const key of state.containerItemKeys.keys()) {
    const index = state.indexByKey.get(key);
    if (index !== void 0 && index >= start && index <= end) {
      hasMountedIndex = true;
      const id = getId(state, index);
      if (id === void 0 || !state.sizesKnown.has(id)) {
        return false;
      }
    }
  }
  return hasMountedIndex;
}

// src/core/bootstrapInitialScroll.ts
var DEFAULT_BOOTSTRAP_REVEAL_MAX_FRAMES = 8;
var DEFAULT_BOOTSTRAP_REVEAL_MAX_PASSES = 24;
var BOOTSTRAP_REVEAL_ABORT_WARNING = "LegendList bootstrap initial scroll aborted after exceeding convergence bounds.";
function getBootstrapInitialScrollSession(state) {
  var _a3;
  return (_a3 = state.initialScroll) == null ? void 0 : _a3.bootstrap;
}
function isOffsetInitialScrollSession(state) {
  var _a3;
  return ((_a3 = state.initialScroll) == null ? void 0 : _a3.kind) === "offset";
}
function doVisibleIndicesMatch(previous, next) {
  if (!previous || previous.length !== next.length) {
    return false;
  }
  for (let i = 0; i < previous.length; i++) {
    if (previous[i] !== next[i]) {
      return false;
    }
  }
  return true;
}
function getBootstrapRevealVisibleIndices(ctx, offset) {
  var _a3;
  const viewportStart = offset - getStartOffsetAdjustment(ctx) + ((_a3 = peek$(ctx, "scrollAdjustPending")) != null ? _a3 : 0);
  const viewportEnd = viewportStart + ctx.state.scrollLength;
  const { didChange, range } = materializeFixedLayoutStoreRangeAtOffsets(ctx, viewportStart, viewportEnd);
  if (didChange) syncLayoutStoreState(ctx);
  const indices = [];
  if (range) {
    ctx.state.layoutStoreRuntime.store.forEachLayout(range.start, range.end, (index, top, size) => {
      if (top < viewportEnd && top + size > viewportStart) indices.push(index);
    });
  }
  return indices;
}
function abortBootstrapRevealIfNeeded(ctx, bootstrap) {
  if (!bootstrap || bootstrap.mountFrameCount < DEFAULT_BOOTSTRAP_REVEAL_MAX_FRAMES && bootstrap.passCount < DEFAULT_BOOTSTRAP_REVEAL_MAX_PASSES)
    return false;
  if (IS_DEV) {
    console.warn(BOOTSTRAP_REVEAL_ABORT_WARNING);
  }
  abortBootstrapInitialScroll(ctx);
  return true;
}
function clearBootstrapInitialScrollSession(state) {
  state.scheduledWork.cancel("initialScrollFrame");
  if (state.initialScroll) state.initialScroll.bootstrap = void 0;
}
function startBootstrapInitialScrollSession(state, options) {
  var _a3, _b, _c;
  const previousBootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  if (state.initialScroll) {
    state.initialScroll.bootstrap = {
      // Re-arming during the initial mount should spend from the same watchdog budget.
      mountFrameCount: (_a3 = previousBootstrapInitialScroll == null ? void 0 : previousBootstrapInitialScroll.mountFrameCount) != null ? _a3 : 0,
      passCount: 0,
      scroll: options.scroll,
      seedContentOffset: (_c = (_b = options.seedContentOffset) != null ? _b : previousBootstrapInitialScroll == null ? void 0 : previousBootstrapInitialScroll.seedContentOffset) != null ? _c : options.scroll,
      targetIndexSeed: options.targetIndexSeed,
      visibleIndices: void 0
    };
  }
}
function resetBootstrapInitialScrollSession(state, options) {
  var _a3, _b, _c;
  const bootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  if (!bootstrapInitialScroll) {
    if ((options == null ? void 0 : options.scroll) !== void 0) {
      startBootstrapInitialScrollSession(state, {
        scroll: options.scroll,
        seedContentOffset: options.seedContentOffset,
        targetIndexSeed: options.targetIndexSeed
      });
    }
  } else {
    bootstrapInitialScroll.passCount = 0;
    bootstrapInitialScroll.scroll = (_a3 = options == null ? void 0 : options.scroll) != null ? _a3 : bootstrapInitialScroll.scroll;
    bootstrapInitialScroll.seedContentOffset = (_b = options == null ? void 0 : options.seedContentOffset) != null ? _b : bootstrapInitialScroll.seedContentOffset;
    bootstrapInitialScroll.targetIndexSeed = (_c = options == null ? void 0 : options.targetIndexSeed) != null ? _c : bootstrapInitialScroll.targetIndexSeed;
    bootstrapInitialScroll.visibleIndices = void 0;
  }
}
function queueBootstrapInitialScrollReevaluation(ctx) {
  var _a3;
  const bootstrap = (_a3 = ctx.state.initialScroll) == null ? void 0 : _a3.bootstrap;
  if (bootstrap) {
    bootstrap.needsReevaluation = true;
    ensureBootstrapInitialScrollFrameTicker(ctx);
  }
}
function ensureBootstrapInitialScrollFrameTicker(ctx) {
  const state = ctx.state;
  const bootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  if (state.hasEstimatedInitialLayout || !bootstrapInitialScroll || state.scheduledWork.has("initialScrollFrame")) {
    return;
  }
  const tick = () => {
    var _a3;
    const activeBootstrapInitialScroll = getBootstrapInitialScrollSession(state);
    if (!activeBootstrapInitialScroll) {
      return;
    }
    activeBootstrapInitialScroll.mountFrameCount += 1;
    if (abortBootstrapRevealIfNeeded(ctx, activeBootstrapInitialScroll)) {
      return;
    }
    if (activeBootstrapInitialScroll.needsReevaluation) {
      activeBootstrapInitialScroll.needsReevaluation = false;
      (_a3 = state.triggerCalculateItemsInView) == null ? void 0 : _a3.call(state, { forceFullItemPositions: true });
    }
    ensureBootstrapInitialScrollFrameTicker(ctx);
  };
  state.scheduledWork.frame(tick, "initialScrollFrame");
}
function rearmBootstrapInitialScroll(ctx, options) {
  resetBootstrapInitialScrollSession(ctx.state, options);
  queueBootstrapInitialScrollReevaluation(ctx);
}
function startBootstrapInitialScrollOnMount(ctx, options) {
  var _a3, _b, _c;
  const { initialScrollAtEnd, target } = options;
  const state = ctx.state;
  const offset = resolveInitialScrollOffset(ctx, target);
  const shouldFinishAtOrigin = offset === 0 && !initialScrollAtEnd && (isOffsetInitialScrollSession(state) ? Math.abs((_a3 = target.contentOffset) != null ? _a3 : 0) <= 1 : target.index === 0 && ((_b = target.viewPosition) != null ? _b : 0) === 0 && Math.abs((_c = target.viewOffset) != null ? _c : 0) <= 1);
  const shouldFinishWithPreservedTarget = getDataLength(state) === 0 && target.index !== void 0;
  if (shouldFinishAtOrigin) {
    clearBootstrapInitialScrollSession(state);
    finishInitialScroll(ctx, {
      resolvedOffset: offset
    });
  } else if (shouldFinishWithPreservedTarget) {
    clearBootstrapInitialScrollSession(state);
    finishInitialScroll(ctx, {
      preserveTarget: true,
      resolvedOffset: offset
    });
  } else {
    startBootstrapInitialScrollSession(state, {
      scroll: offset,
      seedContentOffset: Platform.OS === "web" ? 0 : offset,
      targetIndexSeed: target.index
    });
    ensureBootstrapInitialScrollFrameTicker(ctx);
  }
}
function handleBootstrapInitialScrollDataChange(ctx, options) {
  const { state } = ctx;
  const { dataLength, didDataChange, initialScrollAtEnd, previousDataLength, stylePaddingEnd } = options;
  const initial = state.initialScroll;
  if (!initial) {
    updateInitialScrollAnchor(ctx, options);
    return;
  }
  if (initial.kind === "offset") return;
  const replay = state.didFinishInitialScroll && previousDataLength === 0 && dataLength > 0;
  const retarget = dataLength > 0 && (initialScrollAtEnd || initial.preserveForBottomPadding);
  if (!didDataChange && !replay && !retarget) return;
  const next = retarget ? retargetInitialScroll(initial, dataLength, peek$(ctx, "footerSize") || 0, stylePaddingEnd, initialScrollAtEnd) : initial;
  const changed = next.index !== initial.index || next.viewOffset !== initial.viewOffset;
  if (changed || initial.bootstrap || replay || previousDataLength === 0 && dataLength > 0) {
    setInitialScrollTarget(ctx, next, { resetDidFinish: !!replay });
    rearmBootstrapInitialScroll(ctx, {
      scroll: resolveInitialScrollOffset(ctx, next),
      seedContentOffset: replay && !initial.bootstrap ? getObservedScrollOffset(ctx, state.scrollPending) : void 0,
      targetIndexSeed: next.index
    });
  }
}
function handleBootstrapInitialScrollFooterLayout(ctx, options) {
  var _a3, _b, _c;
  const { state } = ctx;
  const target = (_a3 = state.initialScroll) != null ? _a3 : state.initialScrollAnchor;
  if (!options.dataLength || !options.initialScrollAtEnd && !isEndOfContentTarget(target, options.dataLength))
    return;
  const initial = state.initialScroll;
  if (!initial) {
    updateInitialScrollAnchor(ctx, options);
  } else if (initial.kind !== "offset" && (initial.bootstrap || initial.preserveForFooterLayout || ((_b = state.scrollingTo) == null ? void 0 : _b.isInitialScroll))) {
    const next = retargetInitialScroll(
      initial,
      options.dataLength,
      options.footerSize,
      options.stylePaddingEnd,
      options.initialScrollAtEnd
    );
    const changed = initial.kind === "end" || next.index !== initial.index || next.viewOffset !== initial.viewOffset;
    if (changed) setInitialScrollTarget(ctx, next);
    else initial.preserveForFooterLayout = void 0;
    if ((_c = state.scrollingTo) == null ? void 0 : _c.isInitialScroll) advanceCurrentInitialScrollSession(ctx, { forceScroll: true });
    else if (changed)
      rearmBootstrapInitialScroll(ctx, {
        scroll: resolveInitialScrollOffset(ctx, next),
        targetIndexSeed: next.index
      });
  }
}
function handleBootstrapInitialScrollLayoutChange(ctx) {
  var _a3, _b;
  const { state } = ctx;
  const initial = state.initialScroll;
  if (!initial) {
    schedulePreservedEndAnchorCorrection(ctx);
  } else if (initial.kind !== "offset" && getDataLength(state) > 0 && (initial.bootstrap || initial.viewPosition === 1)) {
    const offset = resolveInitialScrollOffset(ctx, initial);
    if (initial.bootstrap) {
      rearmBootstrapInitialScroll(ctx, { scroll: offset, targetIndexSeed: initial.index });
    } else if (((_a3 = state.scrollingTo) == null ? void 0 : _a3.isInitialScroll) && Math.abs(offset - ((_b = state.scrollingTo.targetOffset) != null ? _b : state.scrollingTo.offset)) > 1) {
      initial.contentOffset = offset;
      dispatchInitialScroll(ctx, { forceScroll: true, resolvedOffset: offset, target: initial });
    }
  }
}
function evaluateBootstrapInitialScroll(ctx) {
  var _a3;
  const state = ctx.state;
  const bootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  const initialScroll = state.initialScroll;
  if (!bootstrapInitialScroll || !initialScroll || isOffsetInitialScrollSession(state) || ((_a3 = state.scrollingTo) == null ? void 0 : _a3.isInitialScroll)) {
    return;
  }
  bootstrapInitialScroll.passCount += 1;
  if (abortBootstrapRevealIfNeeded(ctx, bootstrapInitialScroll)) {
    return;
  }
  if (initialScroll.index !== void 0 && state.startBuffered >= 0 && state.endBuffered >= 0 && initialScroll.index >= state.startBuffered && initialScroll.index <= state.endBuffered) {
    bootstrapInitialScroll.targetIndexSeed = void 0;
  }
  const resolvedOffset = resolveInitialScrollOffset(ctx, initialScroll);
  const areMountedBufferedIndicesMeasured = checkAllSizesKnown(state, state.startBuffered, state.endBuffered);
  const didResolvedOffsetChange = Math.abs(bootstrapInitialScroll.scroll - resolvedOffset) > 1;
  const visibleIndices = getBootstrapRevealVisibleIndices(ctx, resolvedOffset);
  const areVisibleIndicesMeasured = visibleIndices.length > 0 && visibleIndices.every((index) => {
    var _a4;
    const id = (_a4 = state.idCache[index]) != null ? _a4 : getId(state, index);
    return state.sizesKnown.has(id);
  });
  const previousVisibleIndices = bootstrapInitialScroll.visibleIndices;
  bootstrapInitialScroll.visibleIndices = visibleIndices;
  if (didResolvedOffsetChange) {
    bootstrapInitialScroll.scroll = resolvedOffset;
    queueBootstrapInitialScrollReevaluation(ctx);
    return;
  }
  if (!areMountedBufferedIndicesMeasured || !areVisibleIndicesMeasured) {
    return;
  }
  const didRevealSettle = doVisibleIndicesMatch(previousVisibleIndices, visibleIndices);
  if (!didRevealSettle) {
    queueBootstrapInitialScrollReevaluation(ctx);
    return;
  }
  if (Platform.OS !== "web" && Platform.OS !== "android" && Math.abs(bootstrapInitialScroll.seedContentOffset - resolvedOffset) <= 1 && Math.abs(getObservedScrollOffset(ctx, state.scrollPending) - resolvedOffset) <= 1) {
    finishBootstrapInitialScrollWithoutScroll(ctx, resolvedOffset);
  } else {
    clearBootstrapInitialScrollSession(state);
    dispatchInitialScroll(ctx, {
      forceScroll: true,
      resolvedOffset,
      target: initialScroll,
      waitForCompletionFrame: Platform.OS === "web"
    });
  }
}
function finishBootstrapInitialScrollWithoutScroll(ctx, resolvedOffset) {
  var _a3;
  const state = ctx.state;
  clearBootstrapInitialScrollSession(state);
  const shouldPreserveResizeTarget = getDataLength(state) > 0 && ((_a3 = state.initialScroll) == null ? void 0 : _a3.viewPosition) === 1;
  finishInitialScroll(ctx, {
    preserveTarget: shouldPreserveResizeTarget,
    recalculateItems: true,
    resolvedOffset
  });
}
function abortBootstrapInitialScroll(ctx) {
  var _a3, _b, _c, _d;
  const state = ctx.state;
  const bootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  const initialScroll = state.initialScroll;
  if (bootstrapInitialScroll && initialScroll && !isOffsetInitialScrollSession(state) && state.refScroller.current) {
    clearBootstrapInitialScrollSession(state);
    dispatchInitialScroll(ctx, {
      forceScroll: true,
      resolvedOffset: bootstrapInitialScroll.scroll,
      target: initialScroll,
      waitForCompletionFrame: Platform.OS === "web"
    });
  } else {
    finishBootstrapInitialScrollWithoutScroll(
      ctx,
      (_d = (_c = (_b = (_a3 = getBootstrapInitialScrollSession(state)) == null ? void 0 : _a3.scroll) != null ? _b : state.scrollPending) != null ? _c : state.scroll) != null ? _d : 0
    );
  }
}

// src/core/initialPlacementScroll.ts
function getInitialPlacementScroll(ctx) {
  const { initialScroll, queuedInitialLayout } = ctx.state;
  if (initialScroll && (initialScroll.bootstrap || !queuedInitialLayout && hasActiveInitialScroll(ctx.state))) {
    return resolveInitialScrollOffset(ctx, initialScroll);
  }
}
function getRenderedScroll(ctx) {
  const placement = getInitialPlacementScroll(ctx);
  if (placement === void 0) return ctx.state.scroll;
  if (Platform.OS === "web") return placement;
  const scale = PixelRatio.get();
  return Math.round(placement * scale) / scale;
}

// src/core/initialScrollLifecycle.ts
function retargetActiveInitialScrollAtEnd(ctx) {
  var _a3;
  const state = ctx.state;
  const initialScroll = state.initialScroll;
  if (state.didFinishInitialScroll) {
    return schedulePreservedEndAnchorCorrection(ctx);
  }
  if (!initialScroll || ((_a3 = state.initialScroll) == null ? void 0 : _a3.kind) === "offset" || initialScroll.viewPosition !== 1 || getDataLength(state) === 0) {
    return false;
  }
  return advanceCurrentInitialScrollSession(ctx, { forceScroll: true });
}
function handleInitialScrollLayoutReady(ctx) {
  var _a3;
  if (!ctx.state.initialScroll) {
    return;
  }
  const runScroll = () => advanceCurrentInitialScrollSession(ctx, { forceScroll: true });
  runScroll();
  if (((_a3 = ctx.state.initialScroll) == null ? void 0 : _a3.kind) !== "offset") {
    ctx.state.scheduledWork.frame(runScroll, "initialScrollLayout");
  }
  checkFinishedScroll(ctx, { onlyIfAligned: true });
}
function initializeInitialScrollOnMount(ctx, options) {
  var _a3, _b;
  const {
    alwaysDispatchInitialScroll,
    dataLength,
    hasFooterComponent,
    initialContentOffset,
    initialScrollAtEnd,
    useBootstrapInitialScroll
  } = options;
  const state = ctx.state;
  const initialScroll = state.initialScroll;
  const resolvedInitialContentOffset = initialContentOffset != null ? initialContentOffset : 0;
  const preserveForFooterLayout = useBootstrapInitialScroll && initialScrollAtEnd && hasFooterComponent;
  if (initialScroll && (initialScroll.contentOffset === void 0 || !!initialScroll.preserveForFooterLayout !== preserveForFooterLayout && ((_a3 = state.initialScroll) == null ? void 0 : _a3.kind) !== "offset")) {
    setInitialScrollTarget(ctx, {
      ...initialScroll,
      contentOffset: resolvedInitialContentOffset,
      preserveForFooterLayout
    });
  }
  if (useBootstrapInitialScroll && initialScroll && ((_b = state.initialScroll) == null ? void 0 : _b.kind) !== "offset") {
    startBootstrapInitialScrollOnMount(ctx, {
      initialScrollAtEnd,
      target: state.initialScroll
    });
    return;
  }
  const hasPendingDataDependentInitialScroll = !!initialScroll && dataLength === 0 && !(resolvedInitialContentOffset === 0 && !initialScrollAtEnd);
  if (!alwaysDispatchInitialScroll && !resolvedInitialContentOffset && !hasPendingDataDependentInitialScroll) {
    if (initialScroll && !initialScrollAtEnd) {
      finishInitialScroll(ctx, {
        resolvedOffset: resolvedInitialContentOffset
      });
    } else {
      setInitialRenderState(ctx, { didInitialScroll: true });
    }
  }
}
function handleInitialScrollDataChange(ctx, options) {
  var _a3, _b, _c, _d, _e, _f;
  const {
    dataLength,
    didDataChange,
    didDataKeyChange,
    didStartFreshData,
    firstDataPropsCommit,
    initialScrollAtEnd,
    latestInitialScroll,
    latestInitialScrollSessionKind,
    stylePaddingEnd,
    useBootstrapInitialScroll
  } = options;
  const state = ctx.state;
  const previousInitialScrollDataLength = (_b = (_a3 = state.initialScroll) == null ? void 0 : _a3.previousDataLength) != null ? _b : 0;
  const shouldUseLatestInitialScroll = dataLength > 0 && (!state.hasHadNonEmptyData || didStartFreshData || firstDataPropsCommit);
  const follow = state.props.maintainScrollAtEnd;
  const restoreRefillEnd = !!(didStartFreshData && !didDataKeyChange && ((_c = state.previousData) == null ? void 0 : _c.length) === 0 && !latestInitialScroll && state.didFinishInitialScroll && (follow == null ? void 0 : follow.onDataChange) && !follow.animated && peek$(ctx, "isFollowingEnd") && ((_e = (_d = state.refScroller.current) == null ? void 0 : _d.isScrollInRange) == null ? void 0 : _e.call(_d)) !== false);
  if (didStartFreshData) {
    cancelImperativeScroll(state);
    syncScrollActive(ctx);
    state.userScrollContentSize = void 0;
    state.visibleContentAnchor = void 0;
    state.pendingEndMeasurements = void 0;
    if (!restoreRefillEnd) resetEndFollowIntent(ctx);
    setFollowEndOwner(state, void 0);
    state.pendingMaintainScrollAtEnd = false;
  }
  if (dataLength > 0) {
    state.hasHadNonEmptyData = true;
  }
  if (shouldUseLatestInitialScroll) {
    if (restoreRefillEnd) {
      setInitialScrollTarget(ctx, {
        index: dataLength - 1,
        kind: "end",
        preserveForBottomPadding: true,
        viewPosition: 1
      });
    } else if (latestInitialScroll) {
      setInitialScrollTarget(ctx, {
        ...latestInitialScroll,
        kind: latestInitialScrollSessionKind,
        previousDataLength: previousInitialScrollDataLength
      });
    } else {
      clearPreservedInitialScrollTarget(state);
      setInitialRenderState(ctx, { didInitialScroll: true });
    }
  }
  if (state.initialScroll) {
    state.initialScroll.previousDataLength = dataLength;
  }
  if (useBootstrapInitialScroll || restoreRefillEnd) {
    if (didStartFreshData) {
      resetLayoutStoreRuntimeState(ctx);
      rebuildLayoutStoreExact(ctx);
      syncLayoutStoreState(ctx);
    }
    handleBootstrapInitialScrollDataChange(ctx, {
      dataLength,
      didDataChange,
      initialScrollAtEnd: initialScrollAtEnd || restoreRefillEnd,
      // A new dataset reuses the empty-to-non-empty bootstrap handoff.
      previousDataLength: didStartFreshData ? 0 : previousInitialScrollDataLength,
      stylePaddingEnd
    });
    return;
  }
  const shouldReplayFinishedOffsetInitialScroll = previousInitialScrollDataLength === 0 && dataLength > 0 && !!state.initialScroll && ((_f = ctx.state.initialScroll) == null ? void 0 : _f.kind) === "offset" && !!state.didFinishInitialScroll;
  if (previousInitialScrollDataLength !== 0 || dataLength === 0 || !state.initialScroll || !state.queuedInitialLayout || state.didFinishInitialScroll && !shouldReplayFinishedOffsetInitialScroll) {
    return;
  }
  if (shouldReplayFinishedOffsetInitialScroll) {
    resetInitialRenderState(ctx, { resetInitialScroll: true });
  }
  advanceCurrentInitialScrollSession(ctx);
}

// src/core/resetLayoutCachesForDataChange.ts
function resetLayoutCachesForDataChange(ctx, options) {
  var _a3;
  const state = ctx.state;
  state.indexByKey.clear();
  state.idCache.length = 0;
  if ((options == null ? void 0 : options.includeLayoutStoreMeasurements) !== false) {
    (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store.clearKnownSizes();
    resetLayoutStoreRuntimeState(ctx);
  }
}

// src/core/scheduleContainerLayout.ts
function getContainerLayoutEffectScope(ctx) {
  var _a3;
  const scheduledIds = ctx.pendingContainerIds;
  ctx.pendingContainerIds = void 0;
  if (scheduledIds === void 0) {
    return void 0;
  }
  const state = ctx.state;
  let targetContainerIds = scheduledIds;
  if (targetContainerIds && ((_a3 = state.userScrollAnchorReset) == null ? void 0 : _a3.keys.size)) {
    targetContainerIds = new Set(targetContainerIds);
    for (const itemKey of state.userScrollAnchorReset.keys) {
      const containerId = state.containerItemKeys.get(itemKey);
      if (containerId !== void 0) {
        targetContainerIds.add(containerId);
      }
    }
  }
  return targetContainerIds;
}
function scheduleContainerLayout(ctx, target) {
  var _a3;
  const isAlreadyScheduled = ctx.pendingContainerIds !== void 0;
  const previousIds = ctx.pendingContainerIds;
  if (target === void 0) {
    ctx.pendingContainerIds = null;
  } else if (previousIds !== null) {
    let nextIds = previousIds;
    if (!nextIds) {
      nextIds = typeof target === "number" ? /* @__PURE__ */ new Set([target]) : new Set(target);
    } else if (typeof target === "number") {
      nextIds.add(target);
    } else {
      for (const containerId of target) {
        nextIds.add(containerId);
      }
    }
    ctx.pendingContainerIds = nextIds;
  }
  if (!isAlreadyScheduled) {
    const nextEpoch = ((_a3 = peek$(ctx, "containerLayoutEpoch")) != null ? _a3 : 0) + 1;
    set$(ctx, "containerLayoutEpoch", nextEpoch);
  }
}
function triggerMountedContainerLayouts(ctx) {
  if (IsNewArchitecture) {
    scheduleContainerLayout(ctx);
  } else {
    afterLayout(ctx, (committedCtx) => {
      for (const triggerLayout of committedCtx.containerLayoutTriggers.values()) triggerLayout();
    });
  }
}

// src/components/webScrollUtils.ts
function snapWebScrollOffset(offset) {
  return offset < 0 ? -Math.round(-offset) || 0 : Math.round(offset);
}

// src/core/containerLayoutCommit.ts
function getContainerCoordinate(position) {
  return Platform.OS === "web" ? snapWebScrollOffset(position) : position;
}
function snapshotContainers(ctx) {
  return Array.from({ length: peek$(ctx, "numContainersPooled") || 0 }, (_, id) => {
    const key = peek$(ctx, `containerItemKey${id}`);
    return {
      data: peek$(ctx, `containerItemData${id}`),
      key,
      position: peek$(ctx, `containerPosition${id}`),
      size: key === void 0 ? void 0 : ctx.state.sizesKnown.get(key),
      version: peek$(ctx, `containerDataVersion${id}`)
    };
  });
}
function areContainersCommitted(ctx, committed, getCommittedPosition) {
  var _a3;
  if ((peek$(ctx, "numContainersPooled") || 0) !== committed.length) return false;
  const state = ctx.state;
  const store = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  return committed.every(({ data, key, position, size, version }, id) => {
    var _a4;
    if (key !== peek$(ctx, `containerItemKey${id}`) || data !== peek$(ctx, `containerItemData${id}`) || version !== peek$(ctx, `containerDataVersion${id}`))
      return false;
    if (key === void 0) return true;
    const index = state.indexByKey.get(key);
    if (size === void 0 || size !== state.sizesKnown.get(key) || !(store == null ? void 0 : store.hasIndex(index)) || size !== store.getSize(index))
      return false;
    const logicalPosition = store.getOffset(index) - (peek$(ctx, "scrollAdjustPending") || 0);
    const nextPosition = getContainerCoordinate(
      isHorizontalRTL(state) ? toPhysicalHorizontalItemPosition(state, logicalPosition, size, state.totalSize) : logicalPosition
    );
    const committedPosition = (_a4 = void 0 ) != null ? _a4 : position;
    return committedPosition === peek$(ctx, `containerPosition${id}`) && committedPosition === nextPosition;
  });
}
function adoptCommittedContainerSizes(ctx, containers) {
  for (const [id, container] of containers.entries()) {
    if (container.key === peek$(ctx, `containerItemKey${id}`) && container.data === peek$(ctx, `containerItemData${id}`) && container.version === peek$(ctx, `containerDataVersion${id}`)) {
      container.size = container.key === void 0 ? void 0 : ctx.state.sizesKnown.get(container.key);
    }
  }
}

// src/core/syncMountedContainer.ts
function syncMountedContainer(ctx, containerIndex, itemIndex, options) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const state = ctx.state;
  const {
    props: { itemsAreEqual, keyExtractor }
  } = state;
  const indexedData = getIndexedData(state);
  const data = indexedData.getLegacyData();
  const item = getDataItem(state, itemIndex);
  if (item === void 0 && indexedData.kind === "array") {
    return { didChangePosition: false, didRefreshData: false };
  }
  const itemKey = (_a3 = state.idCache[itemIndex]) != null ? _a3 : getId(state, itemIndex);
  const metadata = updateContainerItemMetadata(state, containerIndex, itemIndex, item);
  const updateLayout = (_b = options == null ? void 0 : options.updateLayout) != null ? _b : true;
  let didChangePosition = false;
  let didRefreshData = false;
  if (updateLayout) {
    const layout = (_d = options == null ? void 0 : options.layout) != null ? _d : (_c = state.layoutStoreRuntime) == null ? void 0 : _c.store;
    const positionValue = getLayoutOffsetForStore(layout, itemIndex);
    if (positionValue === void 0) {
      set$(ctx, `containerPosition${containerIndex}`, POSITION_OUT_OF_VIEW);
      return { didChangePosition: false, didRefreshData: false };
    }
    const logicalPosition = (positionValue || 0) - ((_e = options == null ? void 0 : options.scrollAdjustPending) != null ? _e : 0);
    let position = logicalPosition;
    if (isHorizontalRTL(state)) {
      const itemSize = (_f = getLayoutSizeForStore(layout, itemIndex)) != null ? _f : getItemSize(ctx, itemKey, itemIndex, item, void 0, metadata);
      position = toPhysicalHorizontalItemPosition(state, logicalPosition, itemSize, state.totalSize);
    }
    position = getContainerCoordinate(position);
    const column = getLayoutColumnForStore(layout, itemIndex) || 1;
    const span = getLayoutSpanForStore(layout, itemIndex) || 1;
    const prevPos = peek$(ctx, `containerPosition${containerIndex}`);
    const prevColumn = peek$(ctx, `containerColumn${containerIndex}`);
    const prevSpan = peek$(ctx, `containerSpan${containerIndex}`);
    if (position > POSITION_OUT_OF_VIEW && position !== prevPos) {
      set$(ctx, `containerPosition${containerIndex}`, position);
      didChangePosition = true;
    }
    if (column >= 0 && column !== prevColumn) {
      set$(ctx, `containerColumn${containerIndex}`, column);
    }
    if (span !== prevSpan) {
      set$(ctx, `containerSpan${containerIndex}`, span);
    }
  }
  const prevIndex = peek$(ctx, `containerItemIndex${containerIndex}`);
  if (prevIndex !== itemIndex) {
    set$(ctx, `containerItemIndex${containerIndex}`, itemIndex);
  }
  const prevData = peek$(ctx, `containerItemData${containerIndex}`);
  const updateData = () => {
    set$(ctx, `containerItemData${containerIndex}`, item);
    didRefreshData = true;
  };
  if (prevData !== item) {
    const pendingDataComparison = ((_g = state.pendingDataComparison) == null ? void 0 : _g.previousData) === state.previousData && ((_h = state.pendingDataComparison) == null ? void 0 : _h.nextData) === data ? state.pendingDataComparison : void 0;
    const cachedComparison = (_i = pendingDataComparison == null ? void 0 : pendingDataComparison.byIndex[itemIndex]) != null ? _i : 0;
    if (indexedData.kind === "dataSource" || cachedComparison === 2) {
      updateData();
    } else if (cachedComparison !== 1) {
      const nextItemKey = (_j = peek$(ctx, `containerItemKey${containerIndex}`)) != null ? _j : itemKey;
      const prevKey = keyExtractor == null ? void 0 : keyExtractor(prevData, itemIndex);
      if (prevData === void 0 || !keyExtractor || prevKey !== nextItemKey) {
        updateData();
      } else if (!itemsAreEqual) {
        updateData();
      } else {
        const isEqual = itemsAreEqual(prevData, item, itemIndex, data);
        if (!state.pendingDataComparison || state.pendingDataComparison.previousData !== state.previousData || state.pendingDataComparison.nextData !== data) {
          if (state.previousData) {
            state.pendingDataComparison = {
              byIndex: [],
              nextData: data,
              previousData: state.previousData
            };
          }
        }
        if ((_k = state.pendingDataComparison) == null ? void 0 : _k.byIndex) {
          state.pendingDataComparison.byIndex[itemIndex] = isEqual ? 1 : 2;
        }
        if (!isEqual) {
          updateData();
        }
      }
    }
  }
  return { didChangePosition, didRefreshData };
}

// src/core/viewability.ts
function ensureViewabilityState(ctx, configId) {
  let map = ctx.mapViewabilityConfigStates;
  if (!map) {
    map = /* @__PURE__ */ new Map();
    ctx.mapViewabilityConfigStates = map;
  }
  let state = map.get(configId);
  if (!state) {
    state = {
      end: -1,
      endBuffered: -1,
      previousEnd: -1,
      previousStart: -1,
      start: -1,
      startBuffered: -1,
      viewableItems: []
    };
    map.set(configId, state);
  }
  return state;
}
function setupViewability(props, ctx) {
  const { viewabilityConfig, viewabilityConfigCallbackPairs, onViewableItemsChanged } = props;
  const suppliedIds = /* @__PURE__ */ new Set();
  for (const pair of viewabilityConfigCallbackPairs != null ? viewabilityConfigCallbackPairs : []) {
    const id = pair.viewabilityConfig.id;
    if (suppliedIds.has(id)) {
      warnDevOnce(
        "viewability-duplicate-config-id",
        "Each viewability config must have a unique id when using multiple configs."
      );
    }
    suppliedIds.add(id);
  }
  const pairs = (viewabilityConfigCallbackPairs != null ? viewabilityConfigCallbackPairs : []).map((pair, index) => {
    const normalizedConfig = normalizeViewabilityConfig(pair.viewabilityConfig, `pair-${index}`);
    return normalizedConfig === pair.viewabilityConfig ? pair : { ...pair, viewabilityConfig: normalizedConfig };
  });
  pairs.push({
    onViewableItemsChanged,
    viewabilityConfig: normalizeViewabilityConfig(viewabilityConfig, "")
  });
  if (ctx) {
    const configIds = new Set(pairs.map((pair) => pair.viewabilityConfig.id));
    for (const [id, value] of ctx.mapViewabilityConfigStates) {
      if (!configIds.has(id)) {
        ctx.state.scheduledWork.cancel(`viewability:${id}`);
        ctx.mapViewabilityConfigStates.delete(id);
      } else {
        value.pair = pairs.find((pair) => pair.viewabilityConfig.id === id);
      }
    }
    ctx.state.viewabilityConfigCallbackPairs = pairs;
    if (hasViewabilityConsumers(ctx, pairs) && ctx.state.startNoBuffer != null && ctx.state.endNoBuffer != null) {
      updateViewableItems(
        ctx,
        pairs,
        ctx.state.scrollLength,
        ctx.state.startNoBuffer,
        ctx.state.endNoBuffer,
        ctx.state.startBuffered,
        ctx.state.endBuffered
      );
    }
  }
  return pairs;
}
function normalizeViewabilityConfig(config, defaultId) {
  var _a3;
  const normalized = config != null ? config : {};
  const hasThreshold = normalized.itemVisiblePercentThreshold !== void 0 || normalized.viewAreaCoveragePercentThreshold !== void 0;
  if (normalized.id !== void 0 && hasThreshold) {
    return normalized;
  }
  return {
    ...normalized,
    id: (_a3 = normalized.id) != null ? _a3 : defaultId,
    ...hasThreshold ? void 0 : { viewAreaCoveragePercentThreshold: 0 }
  };
}
function getViewabilityStartOffset(config) {
  var _a3;
  const startOffset = (_a3 = config == null ? void 0 : config.startOffset) != null ? _a3 : 0;
  return Number.isFinite(startOffset) && startOffset > 0 ? startOffset : 0;
}
function hasViewabilityConsumers(ctx, pairs = ((_a3) => (_a3 = ctx.state) == null ? void 0 : _a3.viewabilityConfigCallbackPairs)()) {
  var _a4, _b, _c, _d;
  return !!(pairs == null ? void 0 : pairs.some((pair) => !!pair.onViewableItemsChanged)) || ((_b = (_a4 = ctx.mapViewabilityCallbacks) == null ? void 0 : _a4.size) != null ? _b : 0) > 0 || ((_d = (_c = ctx.mapViewabilityAmountCallbacks) == null ? void 0 : _c.size) != null ? _d : 0) > 0;
}
function requestViewabilityRecalculation(ctx) {
  var _a3;
  const state = ctx.state;
  if (state) {
    state.scrollForNextCalculateItemsInView = void 0;
    (_a3 = state.triggerCalculateItemsInView) == null ? void 0 : _a3.call(state);
  }
}
function recordViewabilityInteraction(ctx) {
  const state = ctx.state;
  if (!state.hasViewabilityInteraction) {
    state.hasViewabilityInteraction = true;
    const pairs = state.viewabilityConfigCallbackPairs;
    if ((pairs == null ? void 0 : pairs.some((pair) => pair.viewabilityConfig.waitForInteraction)) && hasViewabilityConsumers(ctx, pairs) && state.startNoBuffer != null && state.endNoBuffer != null) {
      updateViewableItems(
        ctx,
        pairs,
        state.scrollLength,
        state.startNoBuffer,
        state.endNoBuffer,
        state.startBuffered,
        state.endBuffered
      );
    }
  }
}
function updateViewableItems(ctx, viewabilityConfigCallbackPairs, scrollSize, start, end, startBuffered = start, endBuffered = end, layout) {
  const state = ctx.state;
  const indexedData = getIndexedData(state);
  for (let pairIndex = 0; pairIndex < viewabilityConfigCallbackPairs.length; pairIndex++) {
    const viewabilityConfigCallbackPair = viewabilityConfigCallbackPairs[pairIndex];
    if (viewabilityConfigCallbackPair.viewabilityConfig.waitForInteraction && !state.hasViewabilityInteraction) {
      state.scheduledWork.cancel(`viewability:${viewabilityConfigCallbackPair.viewabilityConfig.id}`);
      const configState = ctx.mapViewabilityConfigStates.get(viewabilityConfigCallbackPair.viewabilityConfig.id);
      if (configState) configState.minimumViewTime = void 0;
      continue;
    }
    const publishAmounts = pairIndex === viewabilityConfigCallbackPairs.length - 1;
    const viewabilityState = ensureViewabilityState(ctx, viewabilityConfigCallbackPair.viewabilityConfig.id);
    viewabilityState.pair = viewabilityConfigCallbackPair;
    viewabilityState.start = start;
    viewabilityState.end = end;
    viewabilityState.startBuffered = startBuffered;
    viewabilityState.endBuffered = endBuffered;
    updateViewableItemsWithConfig(
      indexedData,
      viewabilityConfigCallbackPair,
      state,
      ctx,
      scrollSize,
      layout,
      publishAmounts
    );
  }
}
function updateViewableItemsWithConfig(data, viewabilityConfigCallbackPair, state, ctx, scrollSize, layout, publishAmounts = false) {
  var _a3, _b, _c, _d, _e;
  const { viewabilityConfig, onViewableItemsChanged } = viewabilityConfigCallbackPair;
  const configId = viewabilityConfig.id;
  const viewabilityState = ensureViewabilityState(ctx, configId);
  if (data.kind === "dataSource" && !layout) {
    layout = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
    if (layout) {
      const scroll = getItemSpaceOffset(ctx, state.scroll);
      const range = layout.findIndexRangeAtOffsets(scroll, scroll + scrollSize);
      const buffer = state.props.drawDistance * 1.5;
      const buffered = layout.findIndexRangeAtOffsets(scroll - buffer, scroll + scrollSize + buffer);
      viewabilityState.start = (_b = range == null ? void 0 : range.start) != null ? _b : -1;
      viewabilityState.end = (_c = range == null ? void 0 : range.end) != null ? _c : -1;
      viewabilityState.startBuffered = (_d = buffered == null ? void 0 : buffered.start) != null ? _d : -1;
      viewabilityState.endBuffered = (_e = buffered == null ? void 0 : buffered.end) != null ? _e : -1;
    }
  }
  const { viewableItems: previousViewableItems, start, end, startBuffered, endBuffered } = viewabilityState;
  const minimumViewTime = Math.max(0, Number(viewabilityConfig.minimumViewTime) || 0);
  const timerKey = `viewability:${configId}`;
  let timing = viewabilityState.minimumViewTime;
  if (minimumViewTime > 0) {
    if (!timing || timing.dataSource !== state.props.dataSource || timing.dataKey !== state.props.dataKey) {
      state.scheduledWork.cancel(timerKey);
      timing = viewabilityState.minimumViewTime = {
        config: viewabilityConfig,
        dataKey: state.props.dataKey,
        dataSource: state.props.dataSource,
        since: /* @__PURE__ */ new Map()
      };
    }
    timing.config = viewabilityConfig;
  } else if (timing) {
    state.scheduledWork.cancel(timerKey);
    timing = viewabilityState.minimumViewTime = void 0;
  }
  const now = timing ? performance.now() : 0;
  const visibleKeys = timing ? /* @__PURE__ */ new Set() : void 0;
  let nextDeadline;
  let staleViewabilityAmountIds;
  for (const [containerId, value] of ctx.mapViewabilityAmountValues) {
    const nextValue = computeViewability(
      state,
      ctx,
      layout,
      viewabilityConfig,
      containerId,
      value.key,
      scrollSize,
      value.item,
      value.index,
      publishAmounts
    );
    if (nextValue.sizeVisible < 0) {
      staleViewabilityAmountIds != null ? staleViewabilityAmountIds : staleViewabilityAmountIds = [];
      staleViewabilityAmountIds.push(containerId);
    }
  }
  const changed = [];
  const previousViewableKeys = /* @__PURE__ */ new Set();
  if (previousViewableItems) {
    for (const viewToken of previousViewableItems) {
      previousViewableKeys.add(viewToken.key);
      const currentIndex = state.indexByKey.get(viewToken.key);
      const currentItem = currentIndex !== void 0 ? data.getItem(currentIndex) : void 0;
      const containerId = findContainerId(ctx, viewToken.key);
      let isStillViewable = false;
      if (currentIndex !== void 0 && (currentItem !== void 0 || data.kind === "dataSource")) {
        isStillViewable = checkIsViewable(
          state,
          ctx,
          layout,
          viewabilityConfig,
          containerId,
          viewToken.key,
          scrollSize,
          currentItem,
          currentIndex,
          publishAmounts
        );
      }
      const since = timing == null ? void 0 : timing.since.get(viewToken.key);
      if (timing && (since === void 0 || now - since < minimumViewTime)) {
        isStillViewable = false;
      }
      if (!isStillViewable) {
        changed.push({
          ...viewToken,
          index: currentIndex != null ? currentIndex : viewToken.index,
          isViewable: false,
          item: currentItem != null ? currentItem : viewToken.item
        });
      }
    }
  }
  const viewableItems = [];
  const startIndex = Math.max(0, start);
  const endIndex = Math.min(end, data.getLength() - 1);
  for (let i = startIndex; i <= endIndex; i++) {
    const item = data.getItem(i);
    if (item !== void 0 || data.kind === "dataSource") {
      const key = getId(state, i);
      if (data.kind === "dataSource") state.indexByKey.set(key, i);
      const containerId = findContainerId(ctx, key);
      const amount = computeViewability(
        state,
        ctx,
        layout,
        viewabilityConfig,
        containerId,
        key,
        scrollSize,
        item,
        i,
        publishAmounts && !timing
      );
      if (amount.isViewable) {
        if (timing) {
          visibleKeys.add(key);
          let since = timing.since.get(key);
          if (since === void 0) {
            since = now;
            timing.since.set(key, since);
          }
          const deadline = since + minimumViewTime;
          if (now < deadline) {
            nextDeadline = Math.min(nextDeadline != null ? nextDeadline : deadline, deadline);
            continue;
          }
          if (publishAmounts) publishViewabilityAmount(ctx, amount);
        }
        const viewToken = {
          containerId,
          index: i,
          isViewable: true,
          item,
          key
        };
        viewableItems.push(viewToken);
        if (!previousViewableKeys.has(viewToken.key)) {
          changed.push(viewToken);
        }
      }
    }
  }
  if (timing) {
    for (const key of timing.since.keys()) {
      if (!visibleKeys.has(key)) timing.since.delete(key);
    }
    if (nextDeadline !== timing.deadline || !state.scheduledWork.has(timerKey)) {
      state.scheduledWork.cancel(timerKey);
      timing.deadline = nextDeadline;
      if (nextDeadline !== void 0 && Number.isFinite(nextDeadline)) {
        const scheduledTiming = timing;
        state.scheduledWork.timeout(
          () => {
            var _a4;
            if (viewabilityState.minimumViewTime !== scheduledTiming) return;
            scheduledTiming.deadline = void 0;
            const currentPairs = state.viewabilityConfigCallbackPairs;
            const currentPair = currentPairs ? currentPairs.find((pair) => pair.viewabilityConfig.id === configId) : (_a4 = viewabilityState.pair) != null ? _a4 : viewabilityConfigCallbackPair;
            if (currentPair && hasViewabilityConsumers(ctx, currentPairs != null ? currentPairs : [currentPair])) {
              updateViewableItemsWithConfig(
                getIndexedData(state),
                currentPair,
                state,
                ctx,
                state.scrollLength,
                void 0,
                publishAmounts
              );
            }
          },
          Math.min(Math.max(0, nextDeadline - now), 2147483647),
          timerKey
        );
      }
    }
  }
  Object.assign(viewabilityState, {
    previousEnd: end,
    previousStart: start,
    viewableItems
  });
  if (changed.length > 0) {
    viewabilityState.viewableItems = viewableItems;
    for (let i = 0; i < changed.length; i++) {
      const change = changed[i];
      maybeUpdateViewabilityCallback(ctx, configId, change.containerId, change);
    }
    if (onViewableItemsChanged) {
      onViewableItemsChanged({ changed, end, endBuffered, start, startBuffered, viewableItems });
    }
  }
  if (staleViewabilityAmountIds) {
    for (const containerId of staleViewabilityAmountIds) {
      const value = ctx.mapViewabilityAmountValues.get(containerId);
      if (value && value.sizeVisible < 0) {
        ctx.mapViewabilityAmountValues.delete(containerId);
      }
    }
  }
}
function areViewabilityAmountTokensEqual(prev, next) {
  return !!prev && prev.containerId === next.containerId && prev.index === next.index && prev.isViewable === next.isViewable && prev.item === next.item && prev.key === next.key && prev.percentOfScroller === next.percentOfScroller && prev.percentVisible === next.percentVisible && prev.scrollSize === next.scrollSize && prev.size === next.size && prev.sizeVisible === next.sizeVisible;
}
function computeViewability(state, ctx, layout, viewabilityConfig, containerId, key, scrollSize, item, index, publishAmount) {
  var _a3, _b, _c;
  scrollSize = Math.max(0, scrollSize - ((_a3 = state.viewabilityInsetEnd) != null ? _a3 : 0));
  const { scroll: scrollState } = state;
  const topPad = getStartOffsetAdjustment(ctx);
  const { itemVisiblePercentThreshold, viewAreaCoveragePercentThreshold } = viewabilityConfig;
  const viewAreaMode = viewAreaCoveragePercentThreshold != null;
  const viewablePercentThreshold = viewAreaMode ? viewAreaCoveragePercentThreshold : itemVisiblePercentThreshold;
  const startOffset = getViewabilityStartOffset(viewabilityConfig);
  const effectiveScrollSize = Math.max(0, scrollSize - startOffset);
  const scroll = scrollState - topPad + startOffset;
  const store = layout != null ? layout : (_b = state.layoutStoreRuntime) == null ? void 0 : _b.store;
  const position = getLayoutOffsetForStore(store, index);
  const size = (_c = getLayoutSizeForStore(store, index)) != null ? _c : 0;
  if (position === void 0) {
    const value2 = {
      containerId,
      index,
      isViewable: false,
      item,
      key,
      percentOfScroller: 0,
      percentVisible: 0,
      scrollSize: effectiveScrollSize,
      size,
      sizeVisible: -1
    };
    if (publishAmount) {
      publishViewabilityAmount(ctx, value2);
    }
    return value2;
  }
  const top = position - scroll;
  const bottom = top + size;
  const isEntirelyVisible = top >= 0 && bottom <= effectiveScrollSize && bottom > top;
  const sizeVisible = isEntirelyVisible ? size : Math.min(bottom, effectiveScrollSize) - Math.max(top, 0);
  const percentVisible = size ? isEntirelyVisible ? 100 : 100 * (sizeVisible / size) : 0;
  const percentOfScroller = effectiveScrollSize > 0 ? 100 * (sizeVisible / effectiveScrollSize) : 0;
  const percent = isEntirelyVisible ? 100 : viewAreaMode ? percentOfScroller : percentVisible;
  const isViewable = effectiveScrollSize > 0 && (startOffset === 0 || sizeVisible > 0) && percent >= (viewablePercentThreshold != null ? viewablePercentThreshold : 0);
  const value = {
    containerId,
    index,
    isViewable,
    item,
    key,
    percentOfScroller,
    percentVisible,
    scrollSize: effectiveScrollSize,
    size,
    sizeVisible
  };
  if (publishAmount) {
    publishViewabilityAmount(ctx, value);
  }
  return value;
}
function publishViewabilityAmount(ctx, value) {
  var _a3;
  const prev = ctx.mapViewabilityAmountValues.get(value.containerId);
  if (!areViewabilityAmountTokensEqual(prev, value)) {
    ctx.mapViewabilityAmountValues.set(value.containerId, value);
    (_a3 = ctx.mapViewabilityAmountCallbacks.get(value.containerId)) == null ? void 0 : _a3(value);
  }
}
function checkIsViewable(state, ctx, layout, viewabilityConfig, containerId, key, scrollSize, item, index, publishAmount) {
  const value = computeViewability(
    state,
    ctx,
    layout,
    viewabilityConfig,
    containerId,
    key,
    scrollSize,
    item,
    index,
    publishAmount
  );
  return value.isViewable;
}
function maybeUpdateViewabilityCallback(ctx, configId, containerId, viewToken) {
  const key = containerId + configId;
  ctx.mapViewabilityValues.set(key, viewToken);
  const cb = ctx.mapViewabilityCallbacks.get(key);
  cb == null ? void 0 : cb(viewToken);
}
function areViewabilityConfigsEqual(a, b) {
  return (a == null ? void 0 : a.id) === (b == null ? void 0 : b.id) && (a == null ? void 0 : a.itemVisiblePercentThreshold) === (b == null ? void 0 : b.itemVisiblePercentThreshold) && (a == null ? void 0 : a.minimumViewTime) === (b == null ? void 0 : b.minimumViewTime) && (a == null ? void 0 : a.startOffset) === (b == null ? void 0 : b.startOffset) && (a == null ? void 0 : a.viewAreaCoveragePercentThreshold) === (b == null ? void 0 : b.viewAreaCoveragePercentThreshold) && (a == null ? void 0 : a.waitForInteraction) === (b == null ? void 0 : b.waitForInteraction);
}
function resetViewabilityTimers(ctx) {
  for (const [configId, value] of ctx.mapViewabilityConfigStates) {
    value.minimumViewTime = void 0;
    ctx.state.scheduledWork.cancel(`viewability:${configId}`);
  }
}
var unstableBatchedUpdates = ReactNative.unstable_batchedUpdates;
var batchedUpdates = typeof unstableBatchedUpdates === "function" ? unstableBatchedUpdates : (fn) => fn();

// src/utils/containerPool.ts
var MIN_INITIAL_CONTAINER_POOL_SIZE = 32;
var MAX_INITIAL_SPARE_CONTAINERS = 64;
var AUTOMATIC_INITIAL_POOL_MULTIPLIER = 3;
function getInitialContainerPoolSize(dataLength, numContainers) {
  if (dataLength <= 0 || numContainers <= 0) {
    return 0;
  }
  const ratioPoolSize = Math.ceil(numContainers * AUTOMATIC_INITIAL_POOL_MULTIPLIER);
  const cappedSparePoolSize = numContainers + MAX_INITIAL_SPARE_CONTAINERS;
  const targetPoolSize = Math.max(
    numContainers,
    Math.min(ratioPoolSize, cappedSparePoolSize),
    Math.min(dataLength, MIN_INITIAL_CONTAINER_POOL_SIZE)
  );
  const maxUsefulPoolSize = Math.max(dataLength, numContainers);
  return Math.min(maxUsefulPoolSize, targetPoolSize);
}
function getExpandedContainerPoolSize(dataLength, numContainers) {
  if (dataLength <= 0 || numContainers <= 0) {
    return 0;
  }
  return Math.min(Math.max(dataLength, numContainers), Math.max(numContainers, Math.ceil(numContainers * 1.5)));
}

// src/utils/findAvailableContainers.ts
function findAvailableContainers(ctx, needNewContainers, startBuffered, endBuffered, pendingRemoval, protectedKeys, reverseItemOrder = false) {
  var _a3;
  const numNeeded = needNewContainers.length;
  if (numNeeded === 0) {
    return [];
  }
  const numContainers = peek$(ctx, "numContainers");
  const state = ctx.state;
  const { containerItemMetadata, stickyContainerPool } = state;
  const { getItemType } = state.props;
  const hasItemTypes = !!getItemType;
  const shouldAvoidAssignedContainerReuse = state.props.recycleItems && !!state.props.positionComponentInternal;
  const pendingRemovalSet = pendingRemoval.length > 0 ? new Set(pendingRemoval) : void 0;
  const focusedContainerIndex = Platform.OS === "web" ? getFocusedContainerIndex(ctx) : void 0;
  const requests = new Array(numNeeded);
  const normalRequests = [];
  const stickyRequests = [];
  for (let order = 0; order < numNeeded; order++) {
    const itemIndex = needNewContainers[order];
    const item = hasItemTypes ? getDataItem(state, itemIndex) : void 0;
    const itemType = item !== void 0 ? getItemType == null ? void 0 : getItemType(item, itemIndex) : void 0;
    const request = {
      isBuffered: itemIndex >= startBuffered && itemIndex <= endBuffered,
      isSticky: state.props.stickyHeaderIndicesSet.has(itemIndex),
      itemIndex,
      itemType: hasItemTypes ? itemType !== void 0 ? String(itemType) : "" : void 0,
      order,
      renderPriority: reverseItemOrder ? -itemIndex : itemIndex
    };
    requests[order] = request;
    (request.isSticky ? stickyRequests : normalRequests).push(request);
  }
  const normalCandidates = [];
  const stickyCandidates = [];
  for (let containerIndex = 0; containerIndex < numContainers; containerIndex++) {
    const key = peek$(ctx, `containerItemKey${containerIndex}`);
    const isPendingRemoval = !!(pendingRemovalSet == null ? void 0 : pendingRemovalSet.has(containerIndex));
    const isProtected = !!key && !!(protectedKeys == null ? void 0 : protectedKeys.has(key)) && state.indexByKey.has(key) || containerIndex === focusedContainerIndex && !isPendingRemoval && key !== void 0 && state.indexByKey.has(key);
    if (isProtected) {
      continue;
    }
    if (stickyContainerPool.has(containerIndex)) {
      if (key === void 0 || isPendingRemoval) {
        stickyCandidates.push({ containerIndex, distance: Number.POSITIVE_INFINITY });
      }
    } else if (key === void 0 || isPendingRemoval) {
      normalCandidates.push({
        containerIndex,
        distance: isPendingRemoval || !state.props.recycleItems ? Number.POSITIVE_INFINITY : 0
      });
    } else if (!shouldAvoidAssignedContainerReuse) {
      const index = state.indexByKey.get(key);
      if (index !== void 0 && (index < startBuffered || index > endBuffered)) {
        const distance = index < startBuffered ? startBuffered - index : index - endBuffered;
        normalCandidates.push({ containerIndex, distance });
      }
    }
  }
  normalCandidates.sort(comparatorByDistance);
  const allocations = new Array(numNeeded);
  let nextNewContainerIndex = numContainers;
  let pendingRemovalChanged = false;
  const assign = (request, containerIndex) => {
    allocations[request.order] = {
      containerIndex,
      itemIndex: request.itemIndex,
      itemType: request.itemType
    };
    if (pendingRemovalSet == null ? void 0 : pendingRemovalSet.delete(containerIndex)) {
      pendingRemovalChanged = true;
    }
  };
  const assignMatching = (pendingRequests, candidates, matches) => {
    for (const request of pendingRequests) {
      if (allocations[request.order]) {
        continue;
      }
      const candidateIndex = candidates.findIndex(
        (candidate) => {
          var _a4;
          return matches((_a4 = containerItemMetadata.get(candidate.containerIndex)) == null ? void 0 : _a4.itemType, request.itemType);
        }
      );
      if (candidateIndex !== -1) {
        const [candidate] = candidates.splice(candidateIndex, 1);
        assign(request, candidate.containerIndex);
      }
    }
  };
  const assignFromPool = (pendingRequests, candidates, allowCrossType) => {
    if (hasItemTypes) {
      assignMatching(
        pendingRequests,
        candidates,
        (containerType, requestType) => requestType !== void 0 && containerType === requestType
      );
    }
    assignMatching(pendingRequests, candidates, (containerType) => containerType === void 0);
    if (allowCrossType) {
      assignMatching(pendingRequests, candidates, () => true);
    }
  };
  assignFromPool(normalRequests, normalCandidates, true);
  assignFromPool(stickyRequests, stickyCandidates, false);
  for (const request of requests) {
    if (allocations[request.order]) {
      continue;
    }
    const containerIndex = nextNewContainerIndex++;
    if (request.isSticky) {
      stickyContainerPool.add(containerIndex);
    }
    assign(request, containerIndex);
  }
  if (normalRequests.length > 1 || stickyRequests.length > 1) {
    const containerIndices = [];
    reorderPoolAssignments(normalRequests, allocations, containerIndices, hasItemTypes);
    reorderPoolAssignments(stickyRequests, allocations, containerIndices, hasItemTypes);
  }
  if (pendingRemovalChanged) {
    pendingRemoval.length = 0;
    if (pendingRemovalSet) {
      for (const value of pendingRemovalSet) {
        pendingRemoval.push(value);
      }
    }
  }
  if (IS_DEV) {
    const numContainersPooled = (_a3 = peek$(ctx, "numContainersPooled")) != null ? _a3 : Number.POSITIVE_INFINITY;
    if (nextNewContainerIndex > numContainersPooled) {
      afterLayout(ctx, () => {
        console.warn(
          "[legend-list] No unused container available, so creating one on demand. This can be a minor performance issue and is likely caused by the estimatedItemSize being too large. Consider decreasing estimatedItemSize.",
          {
            debugInfo: {
              numContainers,
              numContainersPooled,
              numNeeded,
              stillNeeded: nextNewContainerIndex - numContainers
            }
          }
        );
      });
    }
  }
  return allocations;
}
function comparatorByDistance(a, b) {
  return b.distance - a.distance;
}
function comparatorByRenderPriority(a, b) {
  return Number(b.isBuffered) - Number(a.isBuffered) || a.renderPriority - b.renderPriority;
}
function comparatorByIndex(a, b) {
  return a - b;
}
function reorderPoolAssignments(requests, allocations, containerIndices, groupByType) {
  if (requests.length >= 2) {
    if (groupByType) {
      const groups = /* @__PURE__ */ new Map();
      for (const request of requests) {
        const group = groups.get(request.itemType);
        if (group) {
          group.push(request);
        } else {
          groups.set(request.itemType, [request]);
        }
      }
      for (const group of groups.values()) {
        reorderPoolAssignments(group, allocations, containerIndices, false);
      }
    } else {
      containerIndices.length = 0;
      let indicesSorted = true;
      for (let i = 0; i < requests.length; i++) {
        const containerIndex = allocations[requests[i].order].containerIndex;
        if (i > 0 && containerIndex < containerIndices[i - 1]) {
          indicesSorted = false;
        }
        containerIndices.push(containerIndex);
      }
      if (!indicesSorted) {
        containerIndices.sort(comparatorByIndex);
      }
      requests.sort(comparatorByRenderPriority);
      for (let i = 0; i < requests.length; i++) {
        allocations[requests[i].order].containerIndex = containerIndices[i];
      }
    }
  }
}
function getFocusedContainerIndex(ctx) {
  var _a3;
  let focused;
  for (const [containerIndex, viewRef] of ctx.viewRefs) {
    const element = viewRef.current;
    if (element) {
      if (focused === void 0) {
        focused = element.getRootNode().activeElement;
        if (!focused || !((_a3 = element.parentNode) == null ? void 0 : _a3.contains(focused))) return void 0;
      }
      if (element.contains(focused)) return containerIndex;
    }
  }
}

// src/utils/setDidLayout.ts
function setDidLayout(ctx) {
  const state = ctx.state;
  state.queuedInitialLayout = true;
  checkThresholds(ctx);
  setInitialRenderState(ctx, { didLayout: true });
  if (state.pendingMaintainScrollAtEnd) {
    doMaintainScrollAtEnd(ctx);
  }
}

// src/core/calculateItemsInView.ts
var RENDER_RANGE_PROJECTION_FULL_VELOCITY = 4;
var RENDER_RANGE_PROJECTION_SETTLE_DELAY = 100;
var EMPTY_INDEX_SET = /* @__PURE__ */ new Set();
function getProjectedBufferAdjustment(scrollVelocity, trailingBuffer) {
  if (trailingBuffer <= 0) {
    return 0;
  }
  const velocityProgress = Math.min(1, Math.abs(scrollVelocity) / RENDER_RANGE_PROJECTION_FULL_VELOCITY);
  return Math.sign(scrollVelocity) * trailingBuffer * velocityProgress;
}
function scheduleRenderRangeProjectionSettle(ctx) {
  const state = ctx.state;
  state.scheduledWork.timeout(
    () => {
      var _a3;
      state.scrollHistory.length = 0;
      (_a3 = state.triggerCalculateItemsInView) == null ? void 0 : _a3.call(state);
    },
    RENDER_RANGE_PROJECTION_SETTLE_DELAY,
    "renderRangeProjection"
  );
}
function findCurrentStickyIndex(layout, stickyArray, scroll) {
  for (let i = stickyArray.length - 1; i >= 0; i--) {
    const stickyIndex = stickyArray[i];
    const stickyPos = getLayoutOffsetForStore(layout, stickyIndex);
    if (stickyPos !== void 0 && scroll >= stickyPos) {
      return i;
    }
  }
  return -1;
}
function isStickyIndexActive(ctx, targetIndex) {
  const state = ctx.state;
  let isActive = false;
  for (const containerIndex of state.stickyContainerPool) {
    const key = peek$(ctx, `containerItemKey${containerIndex}`);
    const itemIndex = key ? state.indexByKey.get(key) : void 0;
    if (itemIndex === targetIndex) {
      isActive = true;
      break;
    }
  }
  return isActive;
}
function handleStickyActivation(ctx, stickyArray, currentStickyIdx, needNewContainers, needNewContainersSet, startBuffered, endBuffered) {
  var _a3;
  const state = ctx.state;
  set$(ctx, "activeStickyIndex", currentStickyIdx >= 0 ? stickyArray[currentStickyIdx] : -1);
  for (let offset = 0; offset <= 1; offset++) {
    const idx = currentStickyIdx - offset;
    if (idx < 0) continue;
    const stickyIndex = stickyArray[idx];
    if (isStickyIndexActive(ctx, stickyIndex)) continue;
    const stickyId = (_a3 = state.idCache[stickyIndex]) != null ? _a3 : getId(state, stickyIndex);
    if (stickyId && !state.containerItemKeys.has(stickyId) && (stickyIndex < startBuffered || stickyIndex > endBuffered) && !needNewContainersSet.has(stickyIndex)) {
      needNewContainersSet.add(stickyIndex);
      needNewContainers.push(stickyIndex);
    }
  }
}
function handleStickyRecycling(ctx, layout, stickyArray, scroll, drawDistance, currentStickyIdx, pendingRemoval, isPinnedRenderIndex) {
  var _a3, _b;
  const state = ctx.state;
  for (const containerIndex of state.stickyContainerPool) {
    const itemKey = peek$(ctx, `containerItemKey${containerIndex}`);
    const itemIndex = itemKey ? state.indexByKey.get(itemKey) : void 0;
    if (itemIndex === void 0) continue;
    if (isPinnedRenderIndex(itemIndex)) continue;
    const arrayIdx = stickyArray.indexOf(itemIndex);
    if (arrayIdx === -1) {
      state.stickyContainerPool.delete(containerIndex);
      if (peek$(ctx, `containerSticky${containerIndex}`)) {
        set$(ctx, `containerSticky${containerIndex}`, false);
      }
      continue;
    }
    const isRecentSticky = arrayIdx >= currentStickyIdx - 1 && arrayIdx <= currentStickyIdx + 1;
    if (isRecentSticky) continue;
    const nextIndex = stickyArray[arrayIdx + 1];
    let shouldRecycle = false;
    if (nextIndex) {
      const nextPos = getLayoutOffsetForStore(layout, nextIndex);
      shouldRecycle = nextPos !== void 0 && scroll > nextPos + drawDistance * 2;
    } else {
      const currentId = (_a3 = state.idCache[itemIndex]) != null ? _a3 : getId(state, itemIndex);
      if (currentId) {
        const currentPos = getLayoutOffsetForStore(layout, itemIndex);
        const currentSize = (_b = getLayoutSizeForStore(layout, itemIndex)) != null ? _b : getItemSize(ctx, currentId, itemIndex, getDataItem(state, itemIndex));
        shouldRecycle = currentPos !== void 0 && scroll > currentPos + currentSize + drawDistance * 3;
      }
    }
    if (shouldRecycle) {
      pendingRemoval.push(containerIndex);
    }
  }
}
function trackVisibleRange(range, i, top, size, scroll, scrollBottom, firstVisibleScroll) {
  let didPassVisibleEnd = false;
  if (range.startNoBuffer === null && top + size > scroll && top <= scrollBottom) {
    range.startNoBuffer = i;
  }
  if (typeof firstVisibleScroll === "number" && range.firstVisibleIndex === null && top + size > firstVisibleScroll) {
    range.firstVisibleIndex = i;
  }
  if (range.firstFullyOnScreenIndex === void 0 && top >= scroll - 10 && top <= scrollBottom) {
    range.firstFullyOnScreenIndex = i;
  }
  if (range.startNoBuffer !== null) {
    if (top <= scrollBottom) {
      range.endNoBuffer = i;
    } else {
      didPassVisibleEnd = true;
    }
  }
  return didPassVisibleEnd;
}
function getIdsInVisibleRange(state, range) {
  var _a3, _b;
  const idsInView = [];
  const firstVisibleAnchorIndex = (_a3 = range.firstFullyOnScreenIndex) != null ? _a3 : range.startNoBuffer;
  if (firstVisibleAnchorIndex !== null && firstVisibleAnchorIndex !== void 0 && range.endNoBuffer !== null) {
    for (let i = firstVisibleAnchorIndex; i <= range.endNoBuffer; i++) {
      const id = (_b = state.idCache[i]) != null ? _b : getId(state, i);
      idsInView.push(id);
    }
  }
  return idsInView;
}
function getVisibleLoopItemSize(ctx, state, layout, index, id, preferKnownOrFixedSize) {
  var _a3, _b;
  if (!state.didContainersLayout && state.props.getFixedItemSize && getDataItem(state, index) !== void 0) {
    preferKnownOrFixedSize = true;
  }
  const size = (_b = (_a3 = preferKnownOrFixedSize ? getKnownOrFixedItemSize(ctx, index) : void 0) != null ? _a3 : getLayoutSizeForStore(layout, index)) != null ? _b : getItemSize(ctx, id, index, getDataItem(state, index));
  const runtime = state.layoutStoreRuntime;
  if (Platform.OS !== "web" && !state.props.getItemType && state.userScrollAnchorReset && !state.sizesKnown.has(id) && (runtime == null ? void 0 : runtime.didFlushInitialEstimate) && runtime.pendingEstimateMeasurements === 0 && runtime.store.getEstimatedSize() !== runtime.store.getPositiveMeasuredAverageSize()) {
    runtime.store.setCachedSize(index, size);
  }
  return size;
}
function hasUnmeasuredIndexAtOffsets(store, startOffset, endOffset) {
  const range = store.findIndexRangeAtOffsets(startOffset, endOffset);
  const first = range && store.findFirstUnmeasuredIndex(range.start);
  return first !== void 0 && first <= range.end;
}
function hasUnmeasuredPinnedIndex(store, options) {
  const isUnmeasured = (start, end = start) => {
    if (start === void 0 || end === void 0) return false;
    const first = store.findFirstUnmeasuredIndex(Math.max(0, Math.min(start, end)));
    return first !== void 0 && first <= Math.max(start, end);
  };
  if (options.alwaysRenderIndices.some((index) => isUnmeasured(index))) return true;
  if (options.hasScrollTargetPinnedRange && isUnmeasured(options.scrollTargetPinnedStart, options.scrollTargetPinnedEnd))
    return true;
  if (options.currentStickyIdx < 0) return false;
  return isUnmeasured(options.stickyHeaderIndices[options.currentStickyIdx]) || isUnmeasured(options.stickyHeaderIndices[options.currentStickyIdx - 1]);
}
function reconcileLayoutStorePinnedIndices(ctx, options) {
  const hasStickyIndex = options.currentStickyIdx >= 0 && options.stickyHeaderIndices.length > 0;
  if (options.alwaysRenderIndices.length === 0 && !options.hasScrollTargetPinnedRange && !hasStickyIndex) {
    return false;
  }
  let didMaterializeFixedSizes = false;
  const materializeRange = (startIndex, endIndex = startIndex) => {
    if (startIndex !== void 0 && endIndex !== void 0 && options.dataLength > 0) {
      const start = Math.max(0, Math.min(startIndex, endIndex));
      const end = Math.min(options.dataLength - 1, Math.max(startIndex, endIndex));
      if (start <= end) {
        didMaterializeFixedSizes = materializeFixedLayoutStoreRange(ctx, start, end) || didMaterializeFixedSizes;
        materializeLayoutStoreRange(ctx, start, end);
      }
    }
  };
  for (const index of options.alwaysRenderIndices) {
    materializeRange(index);
  }
  if (options.hasScrollTargetPinnedRange) {
    materializeRange(options.scrollTargetPinnedStart, options.scrollTargetPinnedEnd);
  }
  for (let offset = 0; offset <= 1; offset++) {
    materializeRange(options.stickyHeaderIndices[options.currentStickyIdx - offset]);
  }
  if (didMaterializeFixedSizes) {
    syncLayoutStoreState(ctx);
  }
  return didMaterializeFixedSizes;
}
function materializeLayoutStoreOffsetRange(ctx, startOffset, endOffset, allowPendingDataChange = false, notifyTotalSize = true) {
  const materialized = materializeFixedLayoutStoreRangeAtOffsets(ctx, startOffset, endOffset, true);
  if (materialized.didChange) {
    syncLayoutStoreState(ctx, notifyTotalSize);
  }
  let range;
  if (materialized.range) {
    range = materializeLayoutStoreRange(
      ctx,
      materialized.range.start,
      materialized.range.end,
      allowPendingDataChange
    );
    if (range && ctx.state.props.getItemType && (Platform.OS === "web" || !ctx.state.props.maintainVisibleContentPosition.size)) {
      let start = range.start;
      let end = range.end;
      for (; ; ) {
        const next = getActiveLayoutStore(ctx).findIndexRangeAtOffsets(startOffset, endOffset);
        if (!next || next.start >= start && next.end <= end) break;
        materializeLayoutStoreRange(ctx, next.start, next.end);
        start = Math.min(start, next.start);
        end = Math.max(end, next.end);
      }
    }
  }
  return range;
}
function clearUnsafeSizeCaches(state) {
  var _a3, _b;
  (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.retainedInvalidationHints.clear();
  (_b = state.measurementAverageSamples) == null ? void 0 : _b.clear();
  state.sizes.clear();
  state.sizesKnown.clear();
  for (const key in state.averageSizes) {
    delete state.averageSizes[key];
  }
}
function maybeEmitFirstVisibleItemChanged(state, index) {
  var _a3;
  const onFirstVisibleItemChanged = state.props.onFirstVisibleItemChanged;
  if (!onFirstVisibleItemChanged || index === null || index < 0 || index >= getDataLength(state)) {
    return;
  }
  const key = (_a3 = state.idCache[index]) != null ? _a3 : getId(state, index);
  const previous = state.lastFirstVisibleItemCallback;
  if ((previous == null ? void 0 : previous.index) === index && previous.key === key) {
    return;
  }
  state.lastFirstVisibleItemCallback = { index, key };
  onFirstVisibleItemChanged({ index, item: getDataItem(state, index), key });
}
function updateVisibleRangeForCachedRange(ctx, layout, viewabilityConfigCallbackPairs, scrollLength, scroll, scrollBottom) {
  var _a3, _b, _c;
  const state = ctx.state;
  const { endBuffered, idCache, startBuffered } = state;
  const dataLength = getDataLength(state);
  if (startBuffered === null || endBuffered === null || startBuffered < 0 || endBuffered < startBuffered) {
    return;
  }
  const visibleRange = {
    endNoBuffer: null,
    firstFullyOnScreenIndex: void 0,
    firstVisibleIndex: null,
    startNoBuffer: null
  };
  const startOffset = getViewabilityStartOffset(state.props.viewabilityConfig);
  const firstVisibleScroll = startOffset >= scrollLength ? null : startOffset > 0 ? scroll + startOffset : void 0;
  for (let i = startBuffered; i <= endBuffered && i < dataLength; i++) {
    const id = (_a3 = idCache[i]) != null ? _a3 : getId(state, i);
    const top = getLayoutOffsetForStore(layout, i);
    if (top !== void 0) {
      const size = getVisibleLoopItemSize(ctx, state, layout, i, id, false);
      const didPassVisibleEnd = trackVisibleRange(
        visibleRange,
        i,
        top,
        size,
        scroll,
        scrollBottom,
        firstVisibleScroll
      );
      if (didPassVisibleEnd) {
        break;
      }
    } else if (visibleRange.startNoBuffer !== null) {
      break;
    }
  }
  Object.assign(state, visibleRange, {
    idsInView: getIdsInVisibleRange(state, visibleRange)
  });
  maybeEmitFirstVisibleItemChanged(
    state,
    firstVisibleScroll === void 0 ? visibleRange.startNoBuffer : visibleRange.firstVisibleIndex
  );
  if (viewabilityConfigCallbackPairs) {
    updateViewableItems(
      ctx,
      viewabilityConfigCallbackPairs,
      scrollLength,
      (_b = visibleRange.startNoBuffer) != null ? _b : -1,
      (_c = visibleRange.endNoBuffer) != null ? _c : -1,
      startBuffered,
      endBuffered,
      layout
    );
  }
}
function reconcileScrollTarget(ctx) {
  var _a3, _b;
  const { state } = ctx;
  const target = state.scrollingTo;
  if (!target) return;
  const indexedData = getIndexedData(state);
  const dataLength = indexedData.getLength();
  const previousIndex = target.index;
  let targetRemoved = false;
  if (target.isScrollToEnd) {
    target.index = dataLength - 1;
    targetRemoved = dataLength === 0;
  } else if (target.key !== void 0) {
    let index = state.indexByKey.get(target.key);
    if (index !== void 0 && (index >= dataLength || indexedData.getKey(index) !== target.key)) index = void 0;
    if (index === void 0 && previousIndex !== void 0 && previousIndex >= 0 && previousIndex < dataLength && indexedData.getKey(previousIndex) === target.key)
      index = previousIndex;
    if (index === void 0 && indexedData.kind === "array") {
      for (let candidate = 0; candidate < dataLength; candidate++) {
        if (indexedData.getKey(candidate) === target.key) {
          index = candidate;
          break;
        }
      }
    }
    targetRemoved = index === void 0;
    if (index !== void 0) {
      target.index = index;
      state.idCache[index] = target.key;
      state.indexByKey.set(target.key, index);
    }
  } else {
    targetRemoved = !target.isInitialScroll && target.index !== void 0 && target.index >= dataLength;
  }
  if (targetRemoved) {
    if ((_a3 = ctx.scrollRequestTracker) == null ? void 0 : _a3.isWaitingToRun()) finishScrollTo(ctx);
    else cancelScroll(ctx);
    return;
  }
  if ((target.isScrollToEnd || target.key !== void 0) && target.index !== void 0 && (target.index !== previousIndex || getLayoutOffsetForStore((_b = state.layoutStoreRuntime) == null ? void 0 : _b.store, target.index) !== target.offset)) {
    state.scheduledWork.microtask(() => {
      var _a4, _b2, _c, _d;
      if (state.scrollingTo !== target) return;
      const index = target.index;
      if (index < 0 || index >= getDataLength(state)) return;
      const nextTarget = {
        ...target,
        itemSize: getItemSizeAtIndex(ctx, index),
        offset: (_b2 = getLayoutOffsetForStore((_a4 = state.layoutStoreRuntime) == null ? void 0 : _a4.store, index)) != null ? _b2 : 0
      };
      const nextOffset = (_c = getMaintainedWebEndOffset(ctx, nextTarget)) != null ? _c : clampScrollOffset(
        ctx,
        calculateOffsetWithOffsetPosition(ctx, nextTarget.offset, nextTarget),
        nextTarget
      );
      const observed = getObservedScrollOffset(ctx, Number.NaN);
      const isReached = isIOSInstantIndexTarget(ctx, nextTarget) && !nextTarget.isScrollToEnd ? Math.round(observed * PixelRatio.get()) === Math.round(nextOffset * PixelRatio.get()) : Math.abs(observed - nextOffset) < EDGE_POSITION_EPSILON;
      if (nextOffset === target.targetOffset || !target.animated && isReached) return;
      (_d = ctx.scrollTo) == null ? void 0 : _d.call(ctx, nextTarget);
    }, "scrollTargetRetarget");
  }
}
function batchLayoutStorePublication(ctx, dataChanged, calculate) {
  const publish = () => {
    try {
      calculate();
    } finally {
      const state = ctx.state;
      const deferTypedExtent = state.props.getItemType && !state.props.getFixedItemSize && !dataChanged && !state.scrollingTo && (state.isDragging || state.isMomentumScrolling || !!state.browserScrollActive);
      if (state.layoutStoreRuntime) {
        if (deferTypedExtent) schedulePeriodicLayoutStoreEstimateFlush(ctx);
        else set$(ctx, "totalSize", state.totalSize);
      }
    }
  };
  if (ctx.layoutEffects) publish();
  else batchedUpdates(publish);
}
function resolveRemeasureRows(state, dataLength) {
  const rows = state.scrollTargetRemeasure;
  if (!rows) return void 0;
  const keyAt = (index) => {
    var _a3;
    return (_a3 = state.idCache[index]) != null ? _a3 : getId(state, index);
  };
  let missing;
  for (const [key, hint] of rows) {
    if (hint < dataLength && keyAt(hint) === key) continue;
    const index = state.indexByKey.get(key);
    if (index !== void 0 && index < dataLength && keyAt(index) === key) {
      rows.set(key, index);
    } else {
      missing != null ? missing : missing = /* @__PURE__ */ new Set();
      missing.add(key);
    }
  }
  if (missing) {
    for (let index = 0; index < dataLength && missing.size > 0; index++) {
      const key = keyAt(index);
      if (missing.delete(key)) rows.set(key, index);
    }
    for (const key of missing) rows.delete(key);
  }
  return rows.size ? rows : void 0;
}
function calculateItemsInView(ctx, params = {}) {
  markLayoutChanged(ctx);
  const state = ctx.state;
  batchLayoutStorePublication(ctx, params.dataChanged, () => {
    var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t;
    const {
      containerItemKeys,
      idCache,
      indexByKey,
      props: { alwaysRenderIndicesArr, alwaysRenderIndicesSet, keyExtractor, onStickyHeaderChange },
      scrollForNextCalculateItemsInView,
      scrollLength,
      startBufferedId: startBufferedIdOrig,
      viewabilityConfigCallbackPairs: configuredViewabilityConfigCallbackPairs
    } = state;
    const viewabilityConfigCallbackPairs = hasViewabilityConsumers(ctx, configuredViewabilityConfigCallbackPairs) ? configuredViewabilityConfigCallbackPairs : void 0;
    const indexedData = getIndexedData(state);
    const legacyData = indexedData.getLegacyData();
    const stickyHeaderIndicesArr = state.props.stickyHeaderIndicesArr || [];
    const stickyHeaderIndicesSet = state.props.stickyHeaderIndicesSet || EMPTY_INDEX_SET;
    const drawDistance = getEffectiveDrawDistance(ctx, params.drawDistanceMode);
    const { didMeasureEstimatedLayout, forceFullItemPositions, mvcpAdjustmentSource, initialLayout } = params;
    const { hasEstimatedInitialLayout } = state;
    const doMVCP = params.doMVCP && !hasEstimatedInitialLayout;
    const didDataChange = !!params.dataChanged;
    const isInitialLayout = !!initialLayout;
    const bootstrapInitialScrollState = (_a3 = state.initialScroll) == null ? void 0 : _a3.bootstrap;
    const suppressInitialScrollSideEffects = !!bootstrapInitialScrollState;
    const prevNumContainers = peek$(ctx, "numContainers");
    if (scrollLength === 0 || !prevNumContainers) {
      return;
    }
    const dataLength = indexedData.getLength();
    let checkMVCP = didDataChange && doMVCP && !suppressInitialScrollSideEffects ? prepareMVCP(ctx, true, mvcpAdjustmentSource) : void 0;
    syncLayoutStoreStructure(ctx);
    const scrollTargetPinnedRange = state.scrollTargetPinnedRange;
    let scrollTargetPinnedStart = 0;
    let scrollTargetPinnedEnd = -1;
    if (scrollTargetPinnedRange) {
      scrollTargetPinnedStart = Math.max(0, Math.min(scrollTargetPinnedRange.start, scrollTargetPinnedRange.end));
      scrollTargetPinnedEnd = Math.min(
        dataLength - 1,
        Math.max(scrollTargetPinnedRange.start, scrollTargetPinnedRange.end)
      );
    }
    const hasScrollTargetPinnedRange = scrollTargetPinnedStart <= scrollTargetPinnedEnd;
    if ((didDataChange || isInitialLayout) && state.isFirst) {
      syncLayoutStoreState(ctx, false);
    }
    if (syncActiveRowLayoutStoreSpans(ctx)) {
      syncLayoutStoreState(ctx, false);
    }
    const includeContentContainerMinSize = Platform.OS === "web" || !isHorizontalRTL(state);
    let totalSize = getContentSize(ctx, includeContentContainerMinSize);
    let changedContainerIds;
    let didChangeStickyLayout = false;
    const topPad = getStartOffsetAdjustment(ctx);
    const numColumns = peek$(ctx, "numColumns");
    const speed = (_b = params.scrollVelocity) != null ? _b : getScrollVelocity(state);
    const scrollExtra = 0;
    const { initialScroll, queuedInitialLayout } = state;
    const scrollState = (_c = getInitialPlacementScroll(ctx)) != null ? _c : state.scroll;
    let scrollAdjustPending = 0;
    let scroll = 0;
    let scrollTopBuffered = 0;
    let scrollBottom = 0;
    let scrollBottomBuffered = 0;
    let nativeScrollState = scrollState;
    const updateScroll2 = (nextScrollState) => {
      var _a4;
      nativeScrollState = nextScrollState;
      scrollAdjustPending = (_a4 = peek$(ctx, "scrollAdjustPending")) != null ? _a4 : 0;
      scroll = getItemSpaceOffset(ctx, nextScrollState + scrollExtra, scrollAdjustPending, topPad);
      if (!state.props.hasExternalScroll && scroll + scrollLength > totalSize) {
        scroll = Math.max(0, totalSize - scrollLength);
      }
    };
    updateScroll2(scrollState);
    if (ENABLE_DEBUG_VIEW) ;
    let layout = getActiveLayoutStore(ctx);
    const previousStickyIndex = peek$(ctx, "activeStickyIndex");
    const resolveStickyState = () => {
      const currentStickyIdx = stickyHeaderIndicesArr.length > 0 ? findCurrentStickyIndex(layout, stickyHeaderIndicesArr, scroll) : -1;
      const nextActiveStickyIndex = currentStickyIdx >= 0 ? stickyHeaderIndicesArr[currentStickyIdx] : -1;
      const stickyIndexDidChange = previousStickyIndex !== nextActiveStickyIndex;
      if (currentStickyIdx >= 0 || previousStickyIndex >= 0) {
        set$(ctx, "activeStickyIndex", nextActiveStickyIndex);
      }
      const shouldNotifyStickyHeaderChange = !!onStickyHeaderChange && stickyHeaderIndicesArr.length > 0 && (stickyIndexDidChange || didMeasureEstimatedLayout);
      return {
        currentStickyIdx,
        finishCalculateItemsInView: shouldNotifyStickyHeaderChange ? () => {
          const item = indexedData.getItem(nextActiveStickyIndex);
          if (item !== void 0) {
            onStickyHeaderChange == null ? void 0 : onStickyHeaderChange({ index: nextActiveStickyIndex, item });
          }
        } : void 0
      };
    };
    let scrollBufferTop = drawDistance;
    let scrollBufferBottom = drawDistance;
    if (speed !== 0) {
      state.scrollBufferDirection = speed > 0 ? 1 : -1;
    }
    const bufferForward = state.scrollBufferDirection === 1 || state.scrollBufferDirection === void 0 && scroll < Math.max(50, drawDistance);
    if (bufferForward) {
      scrollBufferTop = drawDistance * 0.5;
      scrollBufferBottom = drawDistance * 1.5;
    } else {
      scrollBufferTop = drawDistance * 1.5;
      scrollBufferBottom = drawDistance * 0.5;
    }
    const shouldProjectRenderRange = !didDataChange && !forceFullItemPositions && !suppressInitialScrollSideEffects && !hasActiveInitialScroll(state) && !state.scrollingTo && !state.pendingNativeMVCPAdjust && !!peek$(ctx, "readyToRender");
    const projectedBufferAdjustment = shouldProjectRenderRange ? getProjectedBufferAdjustment(speed, Math.min(scrollBufferTop, scrollBufferBottom)) : 0;
    const updateScrollRange = () => {
      const scrollStart = state.props.hasExternalScroll ? scroll : Math.max(0, scroll);
      const overscrollBeforeContent = state.props.hasExternalScroll ? 0 : Math.max(0, -nativeScrollState);
      scrollBottom = Math.max(scrollStart, scroll + scrollLength + overscrollBeforeContent);
      scrollTopBuffered = scrollStart - scrollBufferTop + projectedBufferAdjustment;
      scrollBottomBuffered = scrollBottom + scrollBufferBottom + projectedBufferAdjustment;
    };
    updateScrollRange();
    const firstVisibleItemStartOffset = getViewabilityStartOffset(state.props.viewabilityConfig);
    let firstVisibleScroll = firstVisibleItemStartOffset >= scrollLength ? null : firstVisibleItemStartOffset > 0 ? scroll + firstVisibleItemStartOffset : void 0;
    if (projectedBufferAdjustment !== 0) {
      scheduleRenderRangeProjectionSettle(ctx);
    }
    if (!hasEstimatedInitialLayout && !suppressInitialScrollSideEffects && !didDataChange && !forceFullItemPositions && scrollForNextCalculateItemsInView) {
      const { top, bottom } = scrollForNextCalculateItemsInView;
      if (top === null && bottom === null) {
        state.scrollForNextCalculateItemsInView = void 0;
      } else if ((top === null || scrollTopBuffered > top) && (bottom === null || scrollBottomBuffered < bottom)) {
        if (Platform.OS !== "web" || !isInMVCPActiveMode(state)) {
          updateVisibleRangeForCachedRange(
            ctx,
            layout,
            viewabilityConfigCallbackPairs,
            scrollLength,
            scroll,
            scrollBottom
          );
          (_e = (_d = resolveStickyState()).finishCalculateItemsInView) == null ? void 0 : _e.call(_d);
          return;
        }
      }
    }
    const anchorFixedSizes = Platform.OS !== "web" && !didDataChange && !suppressInitialScrollSideEffects && !!state.props.getFixedItemSize && state.props.maintainVisibleContentPosition.size && state.didContainersLayout;
    const anchorLedgerEnabled = isAnchorLedgerEnabled();
    const fixedRangeAnchor = anchorLedgerEnabled && anchorFixedSizes && !state.props.maintainScrollAtEnd && !state.props.hasExternalScroll && !state.props.horizontal && !state.props.snapToIndices && !state.props.alignItemsAtEndPaddingEnabled && !ctx.positionListeners.size && state.didFinishInitialScroll && !state.scrollingTo && !state.visibleContentAnchor && !state.pendingNativeMVCPAdjust && !state.dataSourceAnchorPositions ? captureFixedRangeAnchor(ctx) : void 0;
    const shouldCheckSizeMVCP = !didDataChange && (doMVCP || shouldPreserveEstimatedEnd(ctx, true)) && !suppressInitialScrollSideEffects;
    const sizeMVCP = fixedRangeAnchor || shouldCheckSizeMVCP ? prepareMVCP(
      ctx,
      false,
      shouldCheckSizeMVCP ? mvcpAdjustmentSource : "item-size",
      fixedRangeAnchor == null ? void 0 : fixedRangeAnchor.anchor
    ) : void 0;
    if (!fixedRangeAnchor && sizeMVCP) checkMVCP = sizeMVCP;
    const hasActiveLayoutStore = !!getActiveLayoutStore(ctx);
    const didApplyDataSourceMutation = !!state.dataSourceMutationApplied && !state.dataSourceNeedsReset;
    const canReconcileLayoutStoreDataChange = !forceFullItemPositions && didDataChange && !state.isFirst && hasActiveLayoutStore && !state.dataSourceNeedsReset && !didApplyDataSourceMutation && // Index-keyed arrays retain measurements at the same index.
    (state.props.hasReliableKeyExtractor || !state.props.dataSource);
    const previousIdCache = didDataChange && !state.dataSourceNeedsReset ? getSparseIdCacheSnapshot(state) : void 0;
    if (didDataChange && !didApplyDataSourceMutation) {
      if (state.dataSourceNeedsReset) {
        clearUnsafeSizeCaches(state);
        triggerMountedContainerLayouts(ctx);
      }
      resetLayoutCachesForDataChange(ctx, {
        includeLayoutStoreMeasurements: !canReconcileLayoutStoreDataChange
      });
    }
    if (didApplyDataSourceMutation) {
      layout = getActiveLayoutStore(ctx);
    }
    const preserveStructuralSizeChanges = Platform.OS === "web" && didDataChange && state.didContainersLayout && state.props.maintainVisibleContentPosition.size && !state.props.maintainVisibleContentPosition.data && !!state.props.getItemType;
    const shouldMaterializeLayoutStoreRange = hasActiveLayoutStore && (!didDataChange || didApplyDataSourceMutation);
    const structuralAnchors = preserveStructuralSizeChanges ? state.dataSourceAnchorPositions : void 0;
    if (preserveStructuralSizeChanges && !didApplyDataSourceMutation) state.dataSourceAnchorPositions = void 0;
    let didAdjustFixedSizes = false;
    const materializeAnchoringFixedSizes = () => {
      var _a4;
      const fixedSizeAnchor = anchorFixedSizes && !checkMVCP && !fixedRangeAnchor ? prepareMVCP(ctx, false, "item-size") : void 0;
      const totalBefore = state.totalSize;
      const store = fixedSizeAnchor && anchorLedgerEnabled ? (_a4 = state.layoutStoreRuntime) == null ? void 0 : _a4.store : void 0;
      const measuredBefore = store == null ? void 0 : store.getMeasuredCount();
      const range = materializeLayoutStoreOffsetRange(
        ctx,
        scrollTopBuffered,
        scrollBottomBuffered,
        false,
        !fixedRangeAnchor
      );
      if (fixedSizeAnchor && (state.totalSize !== totalBefore || (store == null ? void 0 : store.getMeasuredCount()) !== measuredBefore)) {
        const scrollBefore = state.scroll;
        fixedSizeAnchor();
        didAdjustFixedSizes || (didAdjustFixedSizes = state.scroll !== scrollBefore);
      }
      return range;
    };
    let layoutStoreMaterializedRange = shouldMaterializeLayoutStoreRange && !preserveStructuralSizeChanges ? materializeAnchoringFixedSizes() : void 0;
    let didReconcileLayoutStoreDataChange = false;
    if (!layoutStoreMaterializedRange && canReconcileLayoutStoreDataChange) {
      didReconcileLayoutStoreDataChange = reconcileLayoutStoreDataChange(ctx, {
        didKeyExtractorChange: state.dataChangeKeyExtractorChanged,
        previousIdCache
      });
      if (didReconcileLayoutStoreDataChange) {
        layout = getActiveLayoutStore(ctx);
      }
    }
    let structuralSizeAdjustment;
    if (preserveStructuralSizeChanges && (didApplyDataSourceMutation || didReconcileLayoutStoreDataChange)) {
      structuralSizeAdjustment = prepareMVCP(ctx, false, "item-size");
      state.dataSourceAnchorPositions = void 0;
    }
    if (didReconcileLayoutStoreDataChange || preserveStructuralSizeChanges && shouldMaterializeLayoutStoreRange) {
      layoutStoreMaterializedRange = materializeLayoutStoreOffsetRange(
        ctx,
        scrollTopBuffered,
        scrollBottomBuffered,
        didApplyDataSourceMutation
      );
    }
    if (!layoutStoreMaterializedRange && didDataChange && hasActiveLayoutStore && !didApplyDataSourceMutation) {
      const didFailReliableReconcile = canReconcileLayoutStoreDataChange && !didReconcileLayoutStoreDataChange;
      if (didFailReliableReconcile) {
        clearUnsafeSizeCaches(state);
        triggerMountedContainerLayouts(ctx);
      }
      resetLayoutCachesForDataChange(ctx);
      rebuildLayoutStoreExact(ctx, didFailReliableReconcile ? void 0 : previousIdCache);
      layout = getActiveLayoutStore(ctx);
      layoutStoreMaterializedRange = materializeLayoutStoreOffsetRange(
        ctx,
        scrollTopBuffered,
        scrollBottomBuffered
      );
    }
    structuralSizeAdjustment == null ? void 0 : structuralSizeAdjustment();
    if (structuralAnchors) state.dataSourceAnchorPositions = structuralAnchors;
    if (didDataChange && doMVCP && !suppressInitialScrollSideEffects) {
      cacheLeadingLayoutEstimates(ctx, startBufferedIdOrig, scrollBufferTop);
    }
    syncLayoutStoreState(ctx, false);
    if (didDataChange) reconcileScrollTarget(ctx);
    totalSize = getContentSize(ctx, includeContentContainerMinSize);
    const previousComputedScroll = scroll;
    updateScroll2(
      (initialScroll == null ? void 0 : initialScroll.bootstrap) ? resolveInitialScrollOffset(ctx, initialScroll) : structuralSizeAdjustment || didAdjustFixedSizes ? state.scroll : (_f = fixedRangeAnchor == null ? void 0 : fixedRangeAnchor.project()) != null ? _f : nativeScrollState
    );
    updateScrollRange();
    if (scroll !== previousComputedScroll) {
      layoutStoreMaterializedRange = materializeAnchoringFixedSizes();
      totalSize = getContentSize(ctx, includeContentContainerMinSize);
      if (didAdjustFixedSizes) {
        updateScroll2(state.scroll);
        updateScrollRange();
      }
    }
    let protectedContainerKeys;
    if (didDataChange && doMVCP && state.props.maintainVisibleContentPosition.data && state.didContainersLayout && state.idsInView.length > 0) {
      const shouldRestorePosition = state.props.maintainVisibleContentPosition.shouldRestorePosition;
      protectedContainerKeys = /* @__PURE__ */ new Set();
      for (const id of state.idsInView) {
        const index = indexByKey.get(id);
        if (index === void 0) continue;
        if (shouldRestorePosition) {
          const item = indexedData.getItem(index);
          if (item === void 0 || !shouldRestorePosition(item, index, legacyData != null ? legacyData : [])) continue;
        }
        protectedContainerKeys.add(id);
      }
    }
    const scrollBeforeMVCP = state.scroll;
    const scrollAdjustPendingBeforeMVCP = (_g = peek$(ctx, "scrollAdjustPending")) != null ? _g : 0;
    if (fixedRangeAnchor) {
      fixedRangeAnchor.drain(sizeMVCP);
      updateScroll2(state.scroll);
      updateScrollRange();
    }
    checkMVCP == null ? void 0 : checkMVCP();
    const didMVCPAdjustScroll = !!checkMVCP && (state.scroll !== scrollBeforeMVCP || ((_h = peek$(ctx, "scrollAdjustPending")) != null ? _h : 0) !== scrollAdjustPendingBeforeMVCP);
    if (didMVCPAdjustScroll) {
      updateScroll2(state.scroll);
      updateScrollRange();
      const adjustMaterializedSizes = Platform.OS === "web" || layout && state.props.getFixedItemSize && hasUnmeasuredIndexAtOffsets(layout, scrollTopBuffered, scrollBottomBuffered) ? prepareMVCP(ctx, didDataChange, mvcpAdjustmentSource) : void 0;
      layoutStoreMaterializedRange = materializeLayoutStoreOffsetRange(
        ctx,
        scrollTopBuffered,
        scrollBottomBuffered
      );
      if (adjustMaterializedSizes) {
        adjustMaterializedSizes();
        totalSize = getContentSize(ctx, includeContentContainerMinSize);
        updateScroll2(state.scroll);
        updateScrollRange();
      }
    }
    firstVisibleScroll = firstVisibleItemStartOffset >= scrollLength ? null : firstVisibleItemStartOffset > 0 ? scroll + firstVisibleItemStartOffset : void 0;
    let startBuffered = null;
    let startBufferedId = null;
    let endBuffered = null;
    let loopStart = (_j = (_i = layoutStoreMaterializedRange == null ? void 0 : layoutStoreMaterializedRange.start) != null ? _i : suppressInitialScrollSideEffects ? bootstrapInitialScrollState == null ? void 0 : bootstrapInitialScrollState.targetIndexSeed : void 0) != null ? _j : !didDataChange && startBufferedIdOrig ? indexByKey.get(startBufferedIdOrig) || 0 : 0;
    for (let i = loopStart; i >= 0; i--) {
      const id = (_k = idCache[i]) != null ? _k : getId(state, i);
      const top = getLayoutOffsetForStore(layout, i);
      if (top === void 0) {
        break;
      }
      const size = getVisibleLoopItemSize(ctx, state, layout, i, id, hasActiveInitialScroll(state));
      const bottom = top + size;
      if (bottom > scrollTopBuffered) {
        loopStart = i;
      } else {
        break;
      }
    }
    if (numColumns > 1) {
      while (loopStart > 0) {
        const loopColumn = getLayoutColumnForStore(layout, loopStart);
        if (loopColumn === 1 || loopColumn === void 0) {
          break;
        }
        loopStart -= 1;
      }
    }
    let foundEnd = false;
    let didPrewarmBoundary = false;
    let nextTop;
    let nextBottom;
    const runtime = state.layoutStoreRuntime;
    const canPrewarmBoundary = IsNewArchitecture && Platform.OS !== "web" && params.drawDistanceMode === "visible-first" && !!state.userScrollAnchorReset && !state.props.getFixedItemSize && !state.props.getItemType && (runtime == null ? void 0 : runtime.didFlushInitialEstimate) && runtime.store.getEstimatedSize() === runtime.store.getPositiveMeasuredAverageSize();
    const fullScrollBottomBuffered = scrollBottom + state.props.drawDistance * (bufferForward ? 1.5 : 0.5);
    const visibleRange = {
      endNoBuffer: null,
      firstFullyOnScreenIndex: void 0,
      firstVisibleIndex: null,
      startNoBuffer: null
    };
    for (let i = Math.max(0, loopStart); i < dataLength && !foundEnd; i++) {
      const id = (_l = idCache[i]) != null ? _l : getId(state, i);
      const top = getLayoutOffsetForStore(layout, i);
      if (top === void 0 && layoutStoreMaterializedRange) {
        break;
      }
      if (top === void 0) {
        continue;
      }
      const size = getVisibleLoopItemSize(ctx, state, layout, i, id, hasActiveInitialScroll(state));
      if (!foundEnd) {
        trackVisibleRange(visibleRange, i, top, size, scroll, scrollBottom, firstVisibleScroll);
        if (startBuffered === null && top + size > scrollTopBuffered) {
          startBuffered = i;
          startBufferedId = id;
          if (scrollTopBuffered < 0) {
            nextTop = null;
          } else {
            nextTop = top;
          }
        }
        if (startBuffered !== null) {
          const prewarmBoundary = canPrewarmBoundary && !didPrewarmBoundary && top > scrollBottomBuffered && top <= fullScrollBottomBuffered && !state.sizesKnown.has(id);
          if (top <= scrollBottomBuffered || prewarmBoundary) {
            didPrewarmBoundary || (didPrewarmBoundary = !!prewarmBoundary);
            endBuffered = i;
            if (scrollBottomBuffered > totalSize) {
              nextBottom = null;
            } else {
              nextBottom = top + size;
            }
          } else {
            foundEnd = true;
          }
        } else if (top > scrollBottomBuffered) {
          foundEnd = true;
        }
      }
    }
    Object.assign(state, visibleRange, {
      endBuffered,
      idsInView: getIdsInVisibleRange(state, visibleRange),
      startBuffered,
      startBufferedId
    });
    if (nextTop !== void 0 && nextBottom !== void 0) {
      state.scrollForNextCalculateItemsInView = isNullOrUndefined(nextTop) && isNullOrUndefined(nextBottom) ? void 0 : {
        bottom: nextBottom,
        top: nextTop
      };
    } else if (state.props.hasExternalScroll) {
      if (scrollBottomBuffered < 0) {
        state.scrollForNextCalculateItemsInView = { bottom: 0, top: null };
      } else if (scrollTopBuffered > totalSize) {
        state.scrollForNextCalculateItemsInView = { bottom: null, top: totalSize };
      }
    }
    let numContainers = prevNumContainers;
    const pendingRemoval = [];
    if (didDataChange) {
      for (let i = 0; i < numContainers; i++) {
        const itemKey = peek$(ctx, `containerItemKey${i}`);
        if (!keyExtractor || itemKey && indexByKey.get(itemKey) === void 0) {
          pendingRemoval.push(i);
        }
      }
    }
    let stickyState = resolveStickyState();
    if (layout) {
      const canAdjustPinnedSizes = (didDataChange ? doMVCP : state.props.maintainVisibleContentPosition.size && state.didContainersLayout) && !suppressInitialScrollSideEffects && state.props.getFixedItemSize && (alwaysRenderIndicesArr.length || hasScrollTargetPinnedRange || stickyHeaderIndicesArr.length);
      const getPinnedOptions = () => ({
        alwaysRenderIndices: alwaysRenderIndicesArr,
        currentStickyIdx: stickyState.currentStickyIdx,
        dataLength,
        hasScrollTargetPinnedRange,
        scrollTargetPinnedEnd,
        scrollTargetPinnedStart,
        stickyHeaderIndices: stickyHeaderIndicesArr
      });
      for (let pass = 0; pass < 3; pass++) {
        const adjustPinnedSizes = canAdjustPinnedSizes && (pass === 0 || hasUnmeasuredPinnedIndex(layout, getPinnedOptions())) ? prepareMVCP(ctx, false, "item-size") : void 0;
        let previousStickyIdx;
        do {
          previousStickyIdx = stickyState.currentStickyIdx;
          const didMaterializeFixedSizes = reconcileLayoutStorePinnedIndices(ctx, getPinnedOptions());
          if (!didMaterializeFixedSizes) break;
          stickyState = resolveStickyState();
        } while (stickyState.currentStickyIdx !== previousStickyIdx);
        if (!adjustPinnedSizes) break;
        adjustPinnedSizes();
        updateScroll2(state.scroll);
        updateScrollRange();
        stickyState = resolveStickyState();
      }
    }
    const remeasureRows = resolveRemeasureRows(state, dataLength);
    const isPinnedRenderIndex = (index) => {
      var _a4;
      return alwaysRenderIndicesSet.has(index) || hasScrollTargetPinnedRange && index >= scrollTargetPinnedStart && index <= scrollTargetPinnedEnd || !!remeasureRows && remeasureRows.get((_a4 = state.idCache[index]) != null ? _a4 : getId(state, index)) === index;
    };
    if (startBuffered !== null && endBuffered !== null || alwaysRenderIndicesArr.length || hasScrollTargetPinnedRange || remeasureRows) {
      const allocationStart = startBuffered != null ? startBuffered : 0;
      const allocationEnd = endBuffered != null ? endBuffered : -1;
      const needNewContainers = [];
      const needNewContainersSet = /* @__PURE__ */ new Set();
      const addPinnedIndex = (index) => {
        var _a4;
        if (index >= 0 && index < dataLength) {
          const id = (_a4 = idCache[index]) != null ? _a4 : getId(state, index);
          const containerIndex = containerItemKeys.get(id);
          if (containerIndex !== void 0) {
            state.stickyContainerPool.add(containerIndex);
          } else if (!isNullOrUndefined(id) && !needNewContainersSet.has(index)) {
            needNewContainersSet.add(index);
            needNewContainers.push(index);
          }
        }
      };
      for (let i = allocationStart; i <= allocationEnd; i++) {
        const id = (_m = idCache[i]) != null ? _m : getId(state, i);
        if (!containerItemKeys.has(id)) {
          needNewContainersSet.add(i);
          needNewContainers.push(i);
        }
      }
      for (const index of alwaysRenderIndicesArr) {
        addPinnedIndex(index);
      }
      if (hasScrollTargetPinnedRange) {
        for (let index = scrollTargetPinnedStart; index <= scrollTargetPinnedEnd; index++) {
          addPinnedIndex(index);
        }
      }
      if (remeasureRows) {
        for (const index of remeasureRows.values()) {
          addPinnedIndex(index);
        }
      }
      if (stickyHeaderIndicesArr.length > 0) {
        handleStickyActivation(
          ctx,
          stickyHeaderIndicesArr,
          stickyState.currentStickyIdx,
          needNewContainers,
          needNewContainersSet,
          allocationStart,
          allocationEnd
        );
      } else if (previousStickyIndex !== -1) {
        set$(ctx, "activeStickyIndex", -1);
      }
      if (needNewContainers.length > 0) {
        const availableContainerAllocations = findAvailableContainers(
          ctx,
          needNewContainers,
          allocationStart,
          allocationEnd,
          pendingRemoval,
          protectedContainerKeys,
          // Initial end alignment has no scroll velocity yet. Keep its
          // target-side rows first until the initial scroll settles.
          // After a pause velocity can be zero on the first movement;
          // use its displacement without treating initial insets as motion.
          hasActiveInitialScroll(state) ? (initialScroll == null ? void 0 : initialScroll.viewPosition) === 1 : speed < 0 || speed === 0 && state.scrollBufferDirection === -1
        );
        for (const allocation of availableContainerAllocations) {
          const i = allocation.itemIndex;
          const containerIndex = allocation.containerIndex;
          const id = (_n = idCache[i]) != null ? _n : getId(state, i);
          const oldKey = peek$(ctx, `containerItemKey${containerIndex}`);
          const containerSticky = `containerSticky${containerIndex}`;
          const isSticky = stickyHeaderIndicesSet.has(i);
          if (oldKey !== id && (isSticky || peek$(ctx, containerSticky))) {
            didChangeStickyLayout = true;
          }
          if (oldKey && oldKey !== id) {
            containerItemKeys.delete(oldKey);
          }
          state.containerItemMetadata.set(
            containerIndex,
            createContainerItemMetadata(state, i, indexedData.getItem(i), allocation.itemType)
          );
          if (oldKey !== id) {
            changedContainerIds != null ? changedContainerIds : changedContainerIds = /* @__PURE__ */ new Set();
            changedContainerIds.add(containerIndex);
            state.containerItemGenerations[containerIndex] = ((_o = state.containerItemGenerations[containerIndex]) != null ? _o : 0) + 1;
            if (state.props.hideItemsUntilMeasured) {
              const isLayoutReady = state.sizesKnown.has(id) || resolveContainerItemMetadata(state, containerIndex, i, indexedData.getItem(i)).fixedItemSize !== void 0;
              set$(ctx, `containerLayoutReady${containerIndex}`, isLayoutReady);
            }
          }
          indexByKey.set(id, i);
          set$(ctx, `containerItemKey${containerIndex}`, id);
          set$(ctx, `containerItemIndex${containerIndex}`, i);
          set$(ctx, `containerItemData${containerIndex}`, indexedData.getItem(i));
          containerItemKeys.set(id, containerIndex);
          (_p = state.userScrollAnchorReset) == null ? void 0 : _p.keys.add(id);
          const isPinnedRender = isPinnedRenderIndex(i);
          if (isSticky) {
            set$(ctx, containerSticky, true);
            state.stickyContainerPool.add(containerIndex);
          } else {
            if (peek$(ctx, containerSticky)) {
              set$(ctx, containerSticky, false);
            }
            if (isPinnedRender) {
              state.stickyContainerPool.add(containerIndex);
            } else {
              state.stickyContainerPool.delete(containerIndex);
            }
          }
          if (containerIndex >= numContainers) {
            numContainers = containerIndex + 1;
          }
        }
        if (numContainers !== prevNumContainers) {
          set$(ctx, "numContainers", numContainers);
          if (numContainers > peek$(ctx, "numContainersPooled")) {
            set$(ctx, "numContainersPooled", getExpandedContainerPoolSize(dataLength, numContainers));
          }
        }
      }
      if (((_q = state.userScrollAnchorReset) == null ? void 0 : _q.keys.size) === 0) {
        state.userScrollAnchorReset = void 0;
        notifyScrollIdle(state);
      }
    }
    if (state.stickyContainerPool.size > 0) {
      handleStickyRecycling(
        ctx,
        layout,
        stickyHeaderIndicesArr,
        scroll,
        drawDistance,
        stickyState.currentStickyIdx,
        pendingRemoval,
        isPinnedRenderIndex
      );
    }
    const pendingRemovalSet = pendingRemoval.length > 0 ? new Set(pendingRemoval) : void 0;
    let didChangePositions = false;
    let didChangeIndex = false;
    for (let i = 0; i < numContainers; i++) {
      const itemKey = peek$(ctx, `containerItemKey${i}`);
      if (pendingRemovalSet == null ? void 0 : pendingRemovalSet.has(i)) {
        if (itemKey !== void 0) {
          containerItemKeys.delete(itemKey);
          changedContainerIds != null ? changedContainerIds : changedContainerIds = /* @__PURE__ */ new Set();
          changedContainerIds.add(i);
          state.containerItemGenerations[i] = ((_r = state.containerItemGenerations[i]) != null ? _r : 0) + 1;
        }
        state.containerItemMetadata.delete(i);
        if (state.stickyContainerPool.has(i)) {
          if (itemKey !== void 0 && peek$(ctx, `containerSticky${i}`)) {
            didChangeStickyLayout = true;
          }
          set$(ctx, `containerSticky${i}`, false);
          state.stickyContainerPool.delete(i);
        }
        set$(ctx, `containerItemKey${i}`, void 0);
        set$(ctx, `containerItemIndex${i}`, void 0);
        set$(ctx, `containerItemData${i}`, void 0);
        set$(ctx, `containerPosition${i}`, POSITION_OUT_OF_VIEW);
        set$(ctx, `containerColumn${i}`, -1);
        set$(ctx, `containerSpan${i}`, 1);
      } else {
        const itemIndex = indexByKey.get(itemKey);
        if (itemIndex !== void 0) {
          didChangeIndex || (didChangeIndex = peek$(ctx, `containerItemIndex${i}`) !== itemIndex);
          didChangePositions = syncMountedContainer(ctx, i, itemIndex, {
            layout,
            scrollAdjustPending,
            updateLayout: true
          }).didChangePosition || didChangePositions;
        }
      }
    }
    if (didChangeStickyLayout || didChangePositions && stickyHeaderIndicesArr.length > 0) {
      set$(ctx, "stickyLayoutEpoch", ((_s = peek$(ctx, "stickyLayoutEpoch")) != null ? _s : 0) + 1);
    }
    if (changedContainerIds && (IsNewArchitecture || Platform.OS === "web")) {
      scheduleContainerLayout(ctx, changedContainerIds);
    } else if (Platform.OS === "web" && didChangeIndex) {
      set$(ctx, "containerLayoutEpoch", ((_t = peek$(ctx, "containerLayoutEpoch")) != null ? _t : 0) + 1);
    }
    if (Platform.OS === "web" && didChangePositions) {
      set$(ctx, "lastPositionUpdate", Date.now());
    }
    afterLayout(ctx, (committedCtx) => {
      var _a4, _b2, _c2;
      if (hasEstimatedInitialLayout) return;
      const committedState = committedCtx.state;
      if (suppressInitialScrollSideEffects) {
        evaluateBootstrapInitialScroll(committedCtx);
        return;
      }
      maybeEmitFirstVisibleItemChanged(
        committedState,
        firstVisibleScroll === void 0 ? visibleRange.startNoBuffer : visibleRange.firstVisibleIndex
      );
      if (!queuedInitialLayout && !committedState.didContainersLayout) {
        const isInitialLayoutReady = hasActiveInitialScroll(committedState) ? checkAllSizesKnown(committedState, committedState.startBuffered, committedState.endBuffered) : checkAllSizesKnown(committedState, committedState.startNoBuffer, committedState.endNoBuffer) || checkAllSizesKnown(committedState, committedState.startBuffered, committedState.endBuffered);
        if (isInitialLayoutReady) {
          setDidLayout(committedCtx);
          handleInitialScrollLayoutReady(committedCtx);
        }
      }
      if (viewabilityConfigCallbackPairs) {
        updateViewableItems(
          committedCtx,
          viewabilityConfigCallbackPairs,
          scrollLength,
          (_a4 = visibleRange.startNoBuffer) != null ? _a4 : -1,
          (_b2 = visibleRange.endNoBuffer) != null ? _b2 : -1,
          startBuffered != null ? startBuffered : -1,
          endBuffered != null ? endBuffered : -1,
          layout
        );
      }
      (_c2 = stickyState.finishCalculateItemsInView) == null ? void 0 : _c2.call(stickyState);
    });
  });
}

// src/core/updateAnchoredEndSpace.ts
function maybeUpdateAnchoredEndSpace(ctx) {
  var _a3, _b;
  const state = ctx.state;
  const anchoredEndSpace = state.props.anchoredEndSpace;
  const previousSize = peek$(ctx, "anchoredEndSpaceSize");
  const previousReadyAnchorIndex = state.anchoredEndSpaceReadyAnchorIndex;
  const previousReadyAnchorKey = state.anchoredEndSpaceReadyAnchorKey;
  const nextAnchorIndex = anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorIndex;
  let nextAnchorKey;
  let isReady = true;
  let canUpdateSize = true;
  let nextSize = 0;
  if (anchoredEndSpace) {
    const { anchorIndex, anchorMaxSize, anchorOffset = 0 } = anchoredEndSpace;
    const dataLength = getDataLength(state);
    if (anchorIndex >= 0 && anchorIndex < dataLength && state.scrollLength > 0) {
      nextAnchorKey = getId(state, anchorIndex);
      let contentBelowAnchor = 0;
      let hasUnknownTailSize = false;
      for (let index = anchorIndex; index < dataLength; index++) {
        const size = getKnownOrFixedItemSize(ctx, index);
        const effectiveSize = index === anchorIndex && anchorMaxSize !== void 0 ? Math.min(size || 0, Math.max(0, anchorMaxSize)) : size;
        if (size === void 0) {
          hasUnknownTailSize = true;
        }
        if (effectiveSize !== null && effectiveSize !== void 0 && effectiveSize > 0) {
          contentBelowAnchor += effectiveSize;
        }
      }
      contentBelowAnchor = Math.max(0, contentBelowAnchor - ctx.scrollAxisGap);
      contentBelowAnchor += (ctx.values.get("footerSize") || 0) + getStylePaddingEnd(state.props);
      isReady = !hasUnknownTailSize;
      const externalEndInset = Platform.OS !== "web" && state.props.anchoredEndSpaceOwner === "list" && !isHorizontalRTL(state) ? getContentInsetEnd(ctx) - (previousSize || 0) : 0;
      const knownSizeBound = Math.max(
        0,
        state.scrollLength - contentBelowAnchor - anchorOffset - externalEndInset
      );
      nextSize = hasUnknownTailSize ? Math.min(previousSize || 0, knownSizeBound) : knownSizeBound;
    } else if (anchorIndex >= 0) {
      isReady = false;
      canUpdateSize = false;
    }
  }
  const didSizeChange = previousSize !== nextSize && (previousSize !== void 0 || anchoredEndSpace !== void 0);
  const didEffectiveSizeChange = (previousSize || 0) !== nextSize;
  const canApplySizeChange = canUpdateSize && (isReady || previousSize !== void 0);
  const didReadyAnchorChange = previousReadyAnchorIndex !== nextAnchorIndex || previousReadyAnchorKey !== nextAnchorKey;
  const didBecomeReady = isReady && state.anchoredEndSpacePendingReady;
  state.anchoredEndSpacePendingReady = !isReady;
  if (canApplySizeChange && didSizeChange) {
    set$(ctx, "anchoredEndSpaceSize", nextSize);
    (_a3 = anchoredEndSpace == null ? void 0 : anchoredEndSpace.onSizeChanged) == null ? void 0 : _a3.call(anchoredEndSpace, nextSize);
  }
  if (canApplySizeChange && didEffectiveSizeChange) {
    updateContentMetricsState(ctx);
    updateScroll(ctx, state.scroll, true, { markHasScrolled: false });
  }
  if (isReady && (didSizeChange || didReadyAnchorChange || didBecomeReady)) {
    state.anchoredEndSpaceReadyAnchorIndex = nextAnchorIndex;
    state.anchoredEndSpaceReadyAnchorKey = nextAnchorKey;
    (_b = anchoredEndSpace == null ? void 0 : anchoredEndSpace.onReady) == null ? void 0 : _b.call(anchoredEndSpace, { anchorIndex: nextAnchorIndex, anchorKey: nextAnchorKey, size: nextSize });
  }
  return nextSize;
}

// src/core/updateMeasurementAverage.ts
function updateMeasurementAverage(state, key, type, size, previousKnownSize) {
  var _a3, _b, _c;
  const previous = state.props.dataSource ? (_a3 = state.measurementAverageSamples) == null ? void 0 : _a3.get(key) : void 0;
  const previousIsCurrent = previous && state.averageSizes[previous.type] === previous.average && previous.average.num > 0;
  let average = state.averageSizes[type];
  if (!average || average.num === 0) {
    average = state.averageSizes[type] = { avg: size, num: 1 };
  } else {
    const previousSize = previousIsCurrent ? previous.size : previous === void 0 ? previousKnownSize : void 0;
    if (previousSize !== void 0 && previousSize > 0) average.avg += (size - previousSize) / average.num;
    else {
      average.avg = (average.avg * average.num + size) / (average.num + 1);
      average.num++;
    }
  }
  if (state.props.dataSource) {
    (_b = state.measurementAverageSamples) != null ? _b : state.measurementAverageSamples = /* @__PURE__ */ new Map();
    state.measurementAverageSamples.set(key, { average, size, type });
  } else {
    (_c = state.measurementAverageSamples) == null ? void 0 : _c.delete(key);
  }
}

// src/core/updateItemSizes.ts
function runOrScheduleMVCPRecalculate(ctx, isFollowingEnd, doMVCP = true) {
  var _a3;
  const state = ctx.state;
  if (state.userScrollAnchorReset !== void 0) {
    calculateItemsInView(ctx);
    if (((_a3 = state.userScrollAnchorReset) == null ? void 0 : _a3.keys.size) === 0) {
      state.userScrollAnchorReset = void 0;
    }
  } else if (Platform.OS === "web" && state.mvcpAnchorLock && !isFollowingEnd) {
    if (!state.scheduledWork.has("mvcpRecalculate")) {
      state.scheduledWork.frame(
        () => calculateItemsInView(ctx, { doMVCP, mvcpAdjustmentSource: "item-size" }),
        "mvcpRecalculate"
      );
    }
  } else {
    if (Platform.OS === "web") state.scheduledWork.cancel("mvcpRecalculate");
    calculateItemsInView(ctx, { doMVCP, mvcpAdjustmentSource: "item-size" });
  }
}
function updateOtherAxisSizeIfNeeded(ctx, sizeObj, horizontal) {
  const state = ctx.state;
  if (state.needsOtherAxisSize) {
    const otherAxisSize = horizontal ? sizeObj.height : sizeObj.width;
    const currentOtherAxisSize = peek$(ctx, "otherAxisSize");
    if (!currentOtherAxisSize || otherAxisSize > currentOtherAxisSize) {
      set$(ctx, "otherAxisSize", otherAxisSize);
    }
  }
}
var activeItemSizeBatches;
function batchItemSizeUpdates(runUpdates) {
  const isOuterBatch = activeItemSizeBatches === void 0;
  activeItemSizeBatches != null ? activeItemSizeBatches : activeItemSizeBatches = /* @__PURE__ */ new Map();
  try {
    runUpdates();
  } finally {
    if (isOuterBatch) {
      const batches = activeItemSizeBatches;
      activeItemSizeBatches = void 0;
      for (const [ctx, measurements] of batches) {
        updateItemSizesBatch(ctx, measurements);
      }
    }
  }
}
function mergeItemSizeUpdateResult(result, next) {
  result.didChange || (result.didChange = next.didChange);
  result.didResize || (result.didResize = next.didResize);
  result.didMeasureUserScrollAnchorResetItem || (result.didMeasureUserScrollAnchorResetItem = next.didMeasureUserScrollAnchorResetItem);
  result.needsRecalculate || (result.needsRecalculate = next.needsRecalculate);
  result.shouldMaintainScrollAtEnd || (result.shouldMaintainScrollAtEnd = next.shouldMaintainScrollAtEnd);
}
function flushItemSizeUpdates(ctx, result) {
  var _a3, _b;
  const state = ctx.state;
  if (result.didChange) {
    (_a3 = result.applyMVCPAdjustment) == null ? void 0 : _a3.call(result, result.didFlushPeriodicEstimate);
  }
  if (result.shouldMaintainScrollAtEnd && Platform.OS === "web") {
    queueMicrotask(() => doMaintainScrollAtEnd(ctx, { immediate: true }));
  }
  if (result.needsRecalculate) {
    if (result.didChange) {
      schedulePreservedEndAnchorCorrection(ctx);
    }
    state.scrollForNextCalculateItemsInView = void 0;
    runOrScheduleMVCPRecalculate(
      ctx,
      result.shouldMaintainScrollAtEnd && (peek$(ctx, "isFollowingEnd") || peek$(ctx, "isWithinMaintainScrollAtEndThreshold")),
      // Reader anchors can change in item-size callbacks, and fixed sizes can still materialize.
      !!state.visibleContentAnchor || !!state.props.getFixedItemSize
    );
  } else if (result.didMeasureUserScrollAnchorResetItem && ((_b = state.userScrollAnchorReset) == null ? void 0 : _b.keys.size) === 0) {
    state.userScrollAnchorReset = void 0;
  }
  if (result.didChange) {
    maybeUpdateAnchoredEndSpace(ctx);
    checkThresholds(ctx);
  }
  if (result.shouldMaintainScrollAtEnd && Platform.OS !== "web") {
    doMaintainScrollAtEnd(ctx, { immediate: true });
  }
  schedulePeriodicLayoutStoreEstimateFlush(ctx);
}
function updateItemSizes(ctx, measurement) {
  if (activeItemSizeBatches) {
    const measurements = activeItemSizeBatches.get(ctx);
    if (measurements) {
      measurements.push(measurement);
    } else {
      activeItemSizeBatches.set(ctx, [measurement]);
    }
  } else {
    updateItemSizesBatch(ctx, [measurement]);
  }
}
function isContainerItemCurrent(ctx, containerId, itemKey) {
  var _a3;
  if (peek$(ctx, `containerItemKey${containerId}`) !== itemKey) return false;
  const state = ctx.state;
  const index = (_a3 = state.indexByKey.get(itemKey)) != null ? _a3 : peek$(ctx, `containerItemIndex${containerId}`);
  if (index !== void 0 && index < getDataLength(state) && getId(state, index) === itemKey) {
    state.indexByKey.set(itemKey, index);
    return true;
  }
  state.scheduledWork.microtask(
    () => {
      var _a4;
      return (_a4 = ctx.containerLayoutTriggers.get(containerId)) == null ? void 0 : _a4();
    },
    `containerMeasurementRetry${containerId}`
  );
  return false;
}
function updateItemSizesBatch(ctx, measurements, isSynchronousLayout = false) {
  var _a3, _b;
  markLayoutChanged(ctx);
  const state = ctx.state;
  const result = {
    skipAutomaticAnchor: isSynchronousLayout && state.userScrollAnchorReset !== void 0
  };
  const previousTotalSize = state.totalSize;
  try {
    for (const measurement of measurements) {
      if (measurement.containerId !== void 0 && (!Number.isFinite(measurement.size.height) || !Number.isFinite(measurement.size.width))) {
        continue;
      }
      const ownsMeasuredItem = measurement.containerId === void 0 || isContainerItemCurrent(ctx, measurement.containerId, measurement.itemKey) && (measurement.generation === void 0 || ((_a3 = state.containerItemGenerations[measurement.containerId]) != null ? _a3 : 0) === measurement.generation);
      if (ownsMeasuredItem) {
        const index = state.indexByKey.get(measurement.itemKey);
        const itemData = index === void 0 ? void 0 : getDataItem(state, index);
        const metadata = measurement.containerId !== void 0 && index !== void 0 && itemData !== void 0 ? resolveContainerItemMetadata(state, measurement.containerId, index, itemData) : void 0;
        const nextResult = applyItemSize(ctx, measurement.itemKey, measurement.size, metadata, result);
        mergeItemSizeUpdateResult(result, nextResult);
      }
    }
    const estimateOptions = {
      correctAnchor: !result.applyMVCPAdjustment && !result.skipAutomaticAnchor,
      notifyTotalSize: false
    };
    const didFlushInitialEstimate = maybeFlushInitialLayoutStoreEstimate(ctx, estimateOptions);
    result.didFlushPeriodicEstimate = !didFlushInitialEstimate && !!result.didChange && !!((_b = state.layoutStoreRuntime) == null ? void 0 : _b.didFlushInitialEstimate) && !shouldDeferPeriodicEstimateFlush(state, Platform.OS === "web" || result.skipAutomaticAnchor) && !state.dataSourceAnchorPositions && maybeFlushPeriodicLayoutStoreEstimate(ctx, estimateOptions);
    if (didFlushInitialEstimate || result.didFlushPeriodicEstimate) {
      result.didChange = result.needsRecalculate = true;
    }
  } finally {
    if (result.shouldMaintainScrollAtEnd && Platform.OS === "web") {
      doMaintainScrollAtEnd(ctx, { prepareOnly: true });
    }
    try {
      if (result.didChange || state.totalSize !== previousTotalSize) {
        syncLayoutStoreState(ctx, false);
      }
    } finally {
      if (state.totalSize !== previousTotalSize) {
        const publishedTotal = peek$(ctx, "totalSize");
        const canDeferFirstMeasurementExtent = !result.didResize && !!state.props.getItemType && !state.props.getFixedItemSize && !state.props.maintainVisibleContentPosition.size && state.didContainersLayout && state.didFinishInitialScroll && !state.scrollingTo && !state.pendingScrollToEnd && !state.pendingMaintainScrollAtEnd && !peek$(ctx, "isFollowingEnd") && (state.isDragging || state.isMomentumScrolling) && state.scroll + state.scrollLength + state.props.drawDistance < Math.min(publishedTotal, state.totalSize);
        if (canDeferFirstMeasurementExtent) schedulePeriodicLayoutStoreEstimateFlush(ctx);
        else set$(ctx, "totalSize", state.totalSize);
      }
    }
  }
  flushItemSizeUpdates(ctx, result);
}
function applyItemSize(ctx, itemKey, sizeObj, resolvedMeasurementItem, batch) {
  var _a3, _b, _c, _d, _e, _f, _g;
  const state = ctx.state;
  const wasPendingEndMeasurement = !!((_a3 = state.pendingEndMeasurements) == null ? void 0 : _a3.delete(itemKey));
  const userScrollAnchorReset = state.userScrollAnchorReset;
  const didMeasureUserScrollAnchorResetItem = !!(userScrollAnchorReset == null ? void 0 : userScrollAnchorReset.keys.delete(itemKey));
  const {
    didContainersLayout,
    sizesKnown,
    props: { getFixedItemSize, getItemType, horizontal, onItemSizeChanged, maintainScrollAtEnd }
  } = state;
  if (!state.props.dataSource && !state.props.data) return { didMeasureUserScrollAnchorResetItem };
  const index = state.indexByKey.get(itemKey);
  const itemData = index === void 0 ? void 0 : getDataItem(state, index);
  if (getFixedItemSize && itemData !== void 0) {
    if (!(resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.didResolveFixedItemSize)) {
      const type = (_c = resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.itemType) != null ? _c : getItemType ? (_b = getItemType(itemData, index)) != null ? _b : "" : "";
      resolvedMeasurementItem = {
        didResolveFixedItemSize: true,
        fixedItemSize: getFixedItemSize(itemData, index, type),
        itemType: type
      };
    }
    const size2 = resolvedMeasurementItem.fixedItemSize;
    if (size2 !== void 0 && !sizesKnown.has(itemKey) && getLayoutSizeForStore((_d = state.layoutStoreRuntime) == null ? void 0 : _d.store, index) === size2) {
      sizesKnown.set(itemKey, size2);
      (_e = state.fixedItemSizeKeys) != null ? _e : state.fixedItemSizeKeys = /* @__PURE__ */ new Set();
      state.fixedItemSizeKeys.add(itemKey);
      setLayoutStoreMeasuredSize(ctx, index, size2);
    }
    if (size2 !== void 0 && size2 === sizesKnown.get(itemKey)) {
      updateOtherAxisSizeIfNeeded(ctx, sizeObj, horizontal);
      return { didMeasureUserScrollAnchorResetItem };
    }
  }
  let needsRecalculate = !didContainersLayout;
  const prevSizeKnown = state.sizesKnown.get(itemKey);
  const hadPreviousGeometry = prevSizeKnown !== void 0 || !!((_f = state.layoutStoreRuntime) == null ? void 0 : _f.retainedInvalidationHints.has(itemKey)) || !!((_g = state.measurementAverageSamples) == null ? void 0 : _g.has(itemKey));
  const didMeasurePendingEnd = prevSizeKnown === void 0 && !!state.pendingMaintainScrollAtEnd;
  const diff = updateOneItemSize(ctx, itemKey, sizeObj, resolvedMeasurementItem, false, batch);
  const size = state.sizesKnown.get(itemKey);
  if (diff !== 0) {
    const { startBuffered, endBuffered } = state;
    needsRecalculate || (needsRecalculate = index >= startBuffered && index <= endBuffered);
    needsRecalculate || (needsRecalculate = state.containerItemKeys.has(itemKey));
    onItemSizeChanged == null ? void 0 : onItemSizeChanged({
      index,
      itemData: getDataItem(state, index),
      itemKey,
      previous: size - diff,
      size
    });
  }
  updateOtherAxisSizeIfNeeded(ctx, sizeObj, horizontal);
  if (didContainersLayout || checkAllSizesKnown(state, state.startBuffered, state.endBuffered)) {
    const canMaintainScrollAtEnd = (diff !== 0 && prevSizeKnown !== size || didMeasurePendingEnd) && (!!(maintainScrollAtEnd == null ? void 0 : maintainScrollAtEnd.onItemLayout) || wasPendingEndMeasurement || !!state.pendingMaintainScrollAtEnd);
    return {
      didChange: diff !== 0,
      didMeasureUserScrollAnchorResetItem,
      didResize: diff !== 0 && hadPreviousGeometry,
      needsRecalculate,
      shouldMaintainScrollAtEnd: canMaintainScrollAtEnd
    };
  }
  return {
    didChange: diff !== 0,
    didMeasureUserScrollAnchorResetItem,
    didResize: diff !== 0 && hadPreviousGeometry
  };
}
function updateOneItemSize(ctx, itemKey, sizeObj, resolvedMeasurementItem, notifyTotalSize = true, batch) {
  var _a3, _b, _c, _d, _e, _f;
  const state = ctx.state;
  const {
    indexByKey,
    sizesKnown,
    props: { horizontal, getItemType, getFixedItemSize }
  } = state;
  if (!state.props.dataSource && !state.props.data) return 0;
  const index = indexByKey.get(itemKey);
  const layoutStore = getActiveLayoutStore(ctx);
  if (layoutStore && !layoutStore.hasIndex(index)) {
    return 0;
  }
  const itemIndex = index;
  const itemData = getDataItem(state, itemIndex);
  let itemType = resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.itemType;
  let fixedItemSize = resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.fixedItemSize;
  if (itemData !== void 0 && getFixedItemSize && !(resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.didResolveFixedItemSize)) {
    itemType = getItemType ? (_a3 = getItemType(itemData, itemIndex)) != null ? _a3 : "" : "";
    fixedItemSize = getFixedItemSize(itemData, itemIndex, itemType);
  }
  const resolvedItemSize = (resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.didResolveFixedItemSize) || itemType !== void 0 || fixedItemSize !== void 0 ? {
    didResolveFixedItemSize: resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.didResolveFixedItemSize,
    fixedItemSize,
    itemType
  } : void 0;
  const prevSize = layoutStore && index !== void 0 ? layoutStore.getSize(index) : getItemSize(ctx, itemKey, itemIndex, itemData, notifyTotalSize, resolvedItemSize);
  const rawSize = normalizeLayoutSize(horizontal ? sizeObj.width : sizeObj.height);
  if (fixedItemSize === void 0) {
    (_b = state.fixedItemSizeKeys) == null ? void 0 : _b.delete(itemKey);
  } else {
    (_c = state.fixedItemSizeKeys) != null ? _c : state.fixedItemSizeKeys = /* @__PURE__ */ new Set();
    state.fixedItemSizeKeys.add(itemKey);
  }
  const prevSizeKnown = sizesKnown.get(itemKey);
  const wasStale = ((_d = state.staleSizeKeys) == null ? void 0 : _d.delete(itemKey)) === true;
  const isKnownNativeNoise = Platform.OS !== "web" && prevSizeKnown !== void 0 && isNativeLayoutNoise(rawSize - prevSizeKnown);
  const size = isKnownNativeNoise ? prevSizeKnown : Platform.OS === "web" ? Math.round(rawSize) : roundSize(rawSize);
  if (batch && (state.didContainersLayout || state.scrollingTo || state.visibleContentAnchor || state.pendingNativeMVCPAdjust) && (!batch.skipAutomaticAnchor || state.visibleContentAnchor || state.scrollingTo) && (size !== prevSize || !((_e = state.layoutStoreRuntime) == null ? void 0 : _e.didFlushInitialEstimate)) && state.props.maintainVisibleContentPosition.size && !batch.didPrepareMVCP) {
    batch.didPrepareMVCP = true;
    batch.applyMVCPAdjustment = prepareMVCP(ctx, false, wasStale ? "stale-size" : "item-size");
  }
  if (isKnownNativeNoise && prevSize === prevSizeKnown) {
    setLayoutStoreMeasuredSize(ctx, index, prevSizeKnown, notifyTotalSize);
    return 0;
  }
  sizesKnown.set(itemKey, size);
  if (fixedItemSize === void 0 && size > 0) {
    itemType != null ? itemType : itemType = itemData !== void 0 && getItemType ? (_f = getItemType(itemData, itemIndex)) != null ? _f : "" : "";
    updateMeasurementAverage(state, itemKey, itemType, size, prevSizeKnown);
  }
  const didSizeChange = !prevSize || Math.abs(prevSize - size) > 0.1;
  const didSetPrefixLayoutStoreSize = setLayoutStoreMeasuredSize(ctx, index, size, notifyTotalSize);
  if (didSetPrefixLayoutStoreSize && state.sizes.has(itemKey)) state.sizes.set(itemKey, size);
  if (didSizeChange || didSetPrefixLayoutStoreSize) {
    if (!didSetPrefixLayoutStoreSize) {
      setSize(ctx, itemKey, size, notifyTotalSize);
    }
    return didSizeChange ? size - prevSize : 0;
  }
  return 0;
}

// src/core/measureContainersInLayoutEffect.native.ts
function resolveSkippedAnchorReset(ctx, itemKey) {
  const state = ctx.state;
  const anchorReset = state.userScrollAnchorReset;
  if ((anchorReset == null ? void 0 : anchorReset.keys.delete(itemKey)) && anchorReset.keys.size === 0) {
    state.userScrollAnchorReset = void 0;
    notifyScrollIdle(state);
  }
}
function revealMeasuredGeneration(ctx, containerId, itemKey, generation) {
  var _a3;
  if (!ctx.state.props.hideItemsUntilMeasured) {
    return;
  }
  const isCurrentGeneration = ((_a3 = ctx.state.containerItemGenerations[containerId]) != null ? _a3 : 0) === generation;
  const isCurrentAssignment = peek$(ctx, `containerItemKey${containerId}`) === itemKey;
  if (isCurrentGeneration && isCurrentAssignment) {
    set$(ctx, `containerLayoutReady${containerId}`, true);
  }
}
function measureContainersInLayoutEffect(ctx, targetContainerIds = null) {
  var _a3, _b, _c;
  const state = ctx.state;
  const measurements = [];
  const measuredGenerations = state.props.hideItemsUntilMeasured ? [] : void 0;
  let isCollectingSynchronousMeasurements = true;
  const containerIds = targetContainerIds != null ? targetContainerIds : ctx.viewRefs.keys();
  for (const containerId of containerIds) {
    const view = (_a3 = ctx.viewRefs.get(containerId)) == null ? void 0 : _a3.current;
    const itemKey = peek$(ctx, `containerItemKey${containerId}`);
    if (itemKey !== void 0) {
      const generation = ((_b = state.containerItemGenerations[containerId]) != null ? _b : 0) + 1;
      state.containerItemGenerations[containerId] = generation;
      if (!isContainerItemCurrent(ctx, containerId, itemKey)) continue;
      const index = state.indexByKey.get(itemKey);
      const itemData = getDataItem(state, index);
      const fixedItemSize = state.props.getFixedItemSize && itemData !== void 0 ? (_c = resolveContainerItemMetadata(state, containerId, index, itemData)) == null ? void 0 : _c.fixedItemSize : void 0;
      const canSkipMeasurement = !state.needsOtherAxisSize && fixedItemSize !== void 0 && state.sizesKnown.get(itemKey) === fixedItemSize + ctx.scrollAxisGap;
      if (canSkipMeasurement) {
        resolveSkippedAnchorReset(ctx, itemKey);
        if (measuredGenerations) {
          revealMeasuredGeneration(ctx, containerId, itemKey, generation);
        }
      } else if (view == null ? void 0 : view.measure) {
        view.measure((_x, _y, width, height) => {
          var _a4;
          const isCurrentGeneration = ((_a4 = ctx.state.containerItemGenerations[containerId]) != null ? _a4 : 0) === generation;
          if (isCurrentGeneration) {
            const measurement = {
              containerId,
              generation,
              itemKey,
              size: { height, width }
            };
            if (isCollectingSynchronousMeasurements) {
              measurements.push(measurement);
              measuredGenerations == null ? void 0 : measuredGenerations.push({ containerId, generation, itemKey });
            } else {
              updateItemSizes(ctx, measurement);
              if (measuredGenerations) {
                revealMeasuredGeneration(ctx, containerId, itemKey, generation);
              }
            }
          }
        });
      } else if (measuredGenerations) {
        revealMeasuredGeneration(ctx, containerId, itemKey, generation);
      }
    }
  }
  isCollectingSynchronousMeasurements = false;
  if (measurements.length > 0) {
    updateItemSizesBatch(ctx, measurements, true);
    if (measuredGenerations) {
      for (const { containerId, generation, itemKey } of measuredGenerations) {
        revealMeasuredGeneration(ctx, containerId, itemKey, generation);
      }
    }
  }
}
var typedForwardRef = React2.forwardRef;
var typedMemo = React2.memo;

// src/utils/reordering.ts
function sortContainerElements(ctx) {
  let parent = null;
  const indexByElement = /* @__PURE__ */ new Map();
  for (const [containerId, viewRef] of ctx.viewRefs) {
    const element = viewRef.current;
    const index = peek$(ctx, `containerItemIndex${containerId}`);
    if (element && index !== void 0) {
      parent != null ? parent : parent = element.parentElement;
      indexByElement.set(element, index);
    }
  }
  if (parent) {
    sortDOMElements(parent, indexByElement);
  }
}
function sortDOMElements(container, indexByElement) {
  const elements = Array.from(container.children);
  if (elements.length <= 1) return elements;
  const items = elements.map((element) => {
    var _a3;
    return [element, (_a3 = indexByElement.get(element)) != null ? _a3 : null];
  });
  items.sort((a, b) => {
    const aKey = a[1];
    const bKey = b[1];
    if (aKey === null) {
      return 1;
    }
    if (bKey === null) {
      return -1;
    }
    return aKey - bKey;
  });
  const targetPositions = /* @__PURE__ */ new Map();
  items.forEach((item, index) => {
    targetPositions.set(item[0], index);
  });
  const currentPositions = elements.map((el) => targetPositions.get(el));
  const lis = findLIS(currentPositions);
  if (lis.length === elements.length) return;
  const stableElements = new Set(lis.map((index) => elements[index]));
  const focusRoot = container.getRootNode();
  const focused = focusRoot.activeElement;
  if (focused && focused !== container.ownerDocument.body) {
    const focusedIndex = elements.findIndex((element) => element.contains(focused));
    if (focusedIndex >= 0) {
      const focusedTarget = currentPositions[focusedIndex];
      for (const index of lis) {
        if (index < focusedIndex && currentPositions[index] > focusedTarget || index > focusedIndex && currentPositions[index] < focusedTarget) {
          stableElements.delete(elements[index]);
        }
      }
      stableElements.add(elements[focusedIndex]);
    }
  }
  for (let targetPos = 0; targetPos < items.length; targetPos++) {
    const element = items[targetPos][0];
    if (!stableElements.has(element)) {
      let nextStableElement = null;
      for (let i = targetPos + 1; i < items.length; i++) {
        const nextEl = items[i][0];
        if (stableElements.has(nextEl)) {
          nextStableElement = nextEl;
          break;
        }
      }
      if ("moveBefore" in container && typeof container.moveBefore === "function" && container.isConnected) {
        container.moveBefore(element, nextStableElement);
      } else if (nextStableElement) {
        container.insertBefore(element, nextStableElement);
      } else {
        container.appendChild(element);
      }
    }
  }
  if (focused && focused !== focusRoot.activeElement && focused.isConnected) {
    focused.focus({ preventScroll: true });
  }
}
function findLIS(arr) {
  const n = arr.length;
  const tails = [];
  const predecessors = new Array(n).fill(-1);
  const indices = [];
  for (let i = 0; i < n; i++) {
    const num = arr[i];
    let left = 0, right = tails.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (arr[indices[mid]] < num) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    if (left === tails.length) {
      tails.push(num);
      indices.push(i);
    } else {
      tails[left] = num;
      indices[left] = i;
    }
    if (left > 0) {
      predecessors[i] = indices[left - 1];
    }
  }
  const result = [];
  let k = indices[indices.length - 1];
  while (k !== -1) {
    result.unshift(k);
    k = predecessors[k];
  }
  return result;
}

// src/components/ContainerLayoutCoordinator.tsx
var ContainerLayoutCoordinator = typedMemo(function ContainerLayoutCoordinatorComponent({
  children,
  prepareCommit
}) {
  const ctx = useStateContext();
  const [containerLayoutEpoch] = useArr$(["containerLayoutEpoch"]);
  const renderCtx = useRenderStateContext(ctx);
  const commit = prepareCommit == null ? void 0 : prepareCommit(renderCtx);
  React2.useLayoutEffect(() => {
    try {
      commit == null ? void 0 : commit.beforeMeasure();
      if (Platform.OS === "web") {
        sortContainerElements(ctx);
      }
      if (IsNewArchitecture) {
        const targetContainerIds = getContainerLayoutEffectScope(ctx);
        if (targetContainerIds !== void 0) {
          measureContainersInLayoutEffect(ctx, targetContainerIds);
        }
      }
    } finally {
      commit == null ? void 0 : commit.afterMeasure();
    }
  }, [ctx, containerLayoutEpoch, commit]);
  return children;
});

// src/components/stickyPositionUtils.ts
function getStickyPushLimit(ctx, index, itemKey) {
  const state = ctx.state;
  if (!itemKey) {
    return void 0;
  }
  const currentSize = getLayoutSize(ctx, index);
  if (!(currentSize && currentSize > 0)) {
    return void 0;
  }
  const stickyIndexInArray = state.props.stickyHeaderIndicesArr.indexOf(index);
  if (stickyIndexInArray === -1) {
    return void 0;
  }
  const nextStickyIndex = state.props.stickyHeaderIndicesArr[stickyIndexInArray + 1];
  if (nextStickyIndex === void 0) {
    return void 0;
  }
  const nextStickyKey = state.idCache[nextStickyIndex];
  if (nextStickyKey === void 0 || !state.containerItemKeys.has(nextStickyKey)) {
    return void 0;
  }
  const nextStickyPosition = getLayoutOffset(ctx, nextStickyIndex);
  if (nextStickyPosition === void 0) {
    return void 0;
  }
  return nextStickyPosition - currentSize;
}
var useAnimatedValue = (initialValue) => {
  const [animAnimatedValue] = useState(() => new Animated.Value(initialValue));
  return animAnimatedValue;
};

// src/hooks/useValue$.ts
function useValue$(key, params) {
  const { getValue } = params || {};
  const ctx = useStateContext();
  const getNewValue = (source = ctx) => {
    var _a3;
    const value = peek$(source, key);
    return (_a3 = getValue ? getValue(value) : value) != null ? _a3 : 0;
  };
  const renderCtx = useRenderStateContext(ctx);
  const initialValue = getNewValue(renderCtx);
  const animValue = useAnimatedValue(initialValue);
  const lastValue = useRef(initialValue);
  useLayoutEffect(() => {
    const syncCurrentValue = () => {
      const nextValue = getNewValue();
      if (lastValue.current !== nextValue) {
        lastValue.current = nextValue;
        animValue.setValue(nextValue);
      }
    };
    const unsubscribe = listen$(ctx, key, syncCurrentValue);
    syncCurrentValue();
    return unsubscribe;
  }, [animValue, ctx, key]);
  return animValue;
}
var getComponent = (Component) => {
  if (React2.isValidElement(Component)) {
    return Component;
  }
  if (Component) {
    return /* @__PURE__ */ React2.createElement(Component, null);
  }
  return null;
};

// src/components/PositionView.native.tsx
var PositionViewState = typedMemo(function PositionViewState2({
  id,
  horizontal,
  style,
  refView,
  ...rest
}) {
  const [position = POSITION_OUT_OF_VIEW, _itemKey, layoutReady = true] = useArr$([
    `containerPosition${id}`,
    `containerItemKey${id}`,
    `containerLayoutReady${id}`
  ]);
  return /* @__PURE__ */ React2.createElement(
    View$1,
    {
      ref: refView,
      style: [style, horizontal ? { left: position } : { top: position }, !layoutReady && { opacity: 0 }],
      ...rest,
      pointerEvents: layoutReady ? void 0 : "none"
    }
  );
});
var PositionViewAnimated = typedMemo(function PositionViewAnimated2({
  id,
  horizontal,
  style,
  refView,
  ...rest
}) {
  const position$ = useValue$(`containerPosition${id}`, {
    getValue: (v) => v != null ? v : POSITION_OUT_OF_VIEW
  });
  const position = horizontal ? { left: position$ } : { top: position$ };
  return /* @__PURE__ */ React2.createElement(Animated.View, { ref: refView, style: [style, position], ...rest });
});
var PositionViewSticky = typedMemo(function PositionViewSticky2({
  id,
  horizontal,
  style,
  refView,
  animatedScrollY,
  stickyHeaderConfig,
  children,
  ...rest
}) {
  const ctx = useRenderStateContext(useStateContext());
  const [
    position = POSITION_OUT_OF_VIEW,
    alignItemsAtEndPadding = 0,
    headerSize = 0,
    stylePaddingTop = 0,
    itemKey,
    itemIndex,
    _totalSize = 0,
    _stickyLayoutEpoch = 0
  ] = useArr$([
    `containerPosition${id}`,
    "alignItemsAtEndPadding",
    "headerSize",
    "stylePaddingTop",
    `containerItemKey${id}`,
    `containerItemIndex${id}`,
    "totalSize",
    "stickyLayoutEpoch",
    // Re-render when a scroll settles so the commit carries the settled offset.
    "stickySettle"
  ]);
  const pushLimit = React2.useMemo(
    () => getStickyPushLimit(ctx, itemIndex, itemKey),
    [ctx, itemIndex, itemKey, _totalSize, _stickyLayoutEpoch]
  );
  const transform = React2.useMemo(() => {
    var _a3;
    if (animatedScrollY) {
      const stickyConfigOffset = (_a3 = stickyHeaderConfig == null ? void 0 : stickyHeaderConfig.offset) != null ? _a3 : 0;
      const stickyStart = position + headerSize + stylePaddingTop + alignItemsAtEndPadding - stickyConfigOffset;
      let nextStickyPosition;
      if (pushLimit !== void 0) {
        if (pushLimit <= position) {
          nextStickyPosition = pushLimit;
        } else {
          nextStickyPosition = animatedScrollY.interpolate({
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            inputRange: [stickyStart, stickyStart + (pushLimit - position)],
            outputRange: [position, pushLimit]
          });
        }
      } else {
        nextStickyPosition = animatedScrollY.interpolate({
          extrapolateLeft: "clamp",
          extrapolateRight: "extend",
          inputRange: [stickyStart, stickyStart + 5e3],
          outputRange: [position, position + 5e3]
        });
      }
      return horizontal ? [{ translateX: nextStickyPosition }] : [{ translateY: nextStickyPosition }];
    }
  }, [
    alignItemsAtEndPadding,
    animatedScrollY,
    headerSize,
    position,
    pushLimit,
    stylePaddingTop,
    stickyHeaderConfig == null ? void 0 : stickyHeaderConfig.offset
  ]);
  const viewStyle = React2.useMemo(
    () => [style, { zIndex: itemIndex + 1e3 }, { transform }],
    [style, itemIndex, transform]
  );
  const renderStickyHeaderBackdrop = React2.useMemo(() => {
    if (!(stickyHeaderConfig == null ? void 0 : stickyHeaderConfig.backdropComponent)) {
      return null;
    }
    return /* @__PURE__ */ React2.createElement(
      View$1,
      {
        style: {
          inset: 0,
          pointerEvents: "none",
          position: "absolute"
        }
      },
      getComponent(stickyHeaderConfig == null ? void 0 : stickyHeaderConfig.backdropComponent)
    );
  }, [stickyHeaderConfig == null ? void 0 : stickyHeaderConfig.backdropComponent]);
  return (
    // The pinned wrapper overlays rows; only the header's own content takes touches.
    /* @__PURE__ */ React2.createElement(Animated.View, { pointerEvents: "box-none", ref: refView, style: viewStyle, ...rest }, renderStickyHeaderBackdrop, children)
  );
});
var PositionView = IsNewArchitecture ? PositionViewState : PositionViewAnimated;
function useLatestRef(value) {
  const ref = React2.useRef(value);
  ref.current = value;
  return ref;
}
function useCommittedRef(value) {
  const ref = React2.useRef(value);
  React2.useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

// src/state/ContextContainer.ts
var ContextContainer = createContext(null);
var NO_CONTAINER_ID = -1;
function useContextContainer() {
  return useContext(ContextContainer);
}
function useContainerItemSignals(containerContext) {
  var _a3;
  const containerId = (_a3 = containerContext == null ? void 0 : containerContext.containerId) != null ? _a3 : NO_CONTAINER_ID;
  const [itemKey, itemIndex, item] = useArr$([
    `containerItemKey${containerId}`,
    `containerItemIndex${containerId}`,
    `containerItemData${containerId}`
  ]);
  return {
    hasItemInfo: !!containerContext && itemKey !== void 0 && itemIndex !== void 0,
    item,
    itemIndex,
    itemKey
  };
}
function scheduleViewabilityConfigWarning(ctx, hookName, configId) {
  let cancelled = false;
  Promise.resolve().then(() => {
    var _a3;
    const viewabilityConfigCallbackPairs = (_a3 = ctx.state) == null ? void 0 : _a3.viewabilityConfigCallbackPairs;
    if (!cancelled && ctx.state) {
      if (!(viewabilityConfigCallbackPairs == null ? void 0 : viewabilityConfigCallbackPairs.length)) {
        warnDevOnce(
          `${hookName}-missing-viewability-config`,
          `${hookName} requires viewability to be configured on the owning LegendList. Add viewabilityConfig with a visibility threshold.`
        );
      } else if (hookName === "useViewability" && !viewabilityConfigCallbackPairs.some((pair) => pair.viewabilityConfig.id === (configId != null ? configId : ""))) {
        const configDescription = configId ? ` for configId "${configId}"` : "";
        warnDevOnce(
          `${hookName}-missing-viewability-config-${configId != null ? configId : "default"}`,
          `${hookName}${configDescription} requires a matching viewabilityConfig.id on the owning LegendList. Add an id to viewabilityConfig and pass the same id to useViewability.`
        );
      }
    }
  });
  return () => {
    cancelled = true;
  };
}
function useAdaptiveRender() {
  const [mode] = useArr$(["adaptiveRender"]);
  return mode;
}
function useAdaptiveRenderChange(callback) {
  const ctx = useStateContext();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useLayoutEffect(() => {
    let mode = peek$(ctx, "adaptiveRender");
    return listen$(ctx, "adaptiveRender", (nextMode) => {
      if (mode !== nextMode) {
        mode = nextMode;
        callbackRef.current(nextMode);
      }
    });
  }, [ctx]);
}
function useViewability(callback, configId) {
  const ctx = useStateContext();
  const containerContext = useContextContainer();
  const callbackRef = useLatestRef(callback);
  const containerId = containerContext == null ? void 0 : containerContext.containerId;
  useEffect(() => {
    if (containerId === void 0) {
      return;
    }
    const key = containerId + (configId != null ? configId : "");
    const hadConsumers = hasViewabilityConsumers(ctx);
    ctx.mapViewabilityCallbacks.set(key, (nextValue) => callbackRef.current(nextValue));
    const value = ctx.mapViewabilityValues.get(key);
    if (value) callbackRef.current(value);
    const cancelConfigWarning = IS_DEV ? scheduleViewabilityConfigWarning(ctx, "useViewability", configId) : void 0;
    if (!hadConsumers) {
      resetViewabilityTimers(ctx);
      requestViewabilityRecalculation(ctx);
    }
    return () => {
      cancelConfigWarning == null ? void 0 : cancelConfigWarning();
      ctx.mapViewabilityCallbacks.delete(key);
    };
  }, [ctx, callbackRef, configId, containerId]);
}
function useViewabilityAmount(callback) {
  const ctx = useStateContext();
  const containerContext = useContextContainer();
  const callbackRef = useLatestRef(callback);
  const containerId = containerContext == null ? void 0 : containerContext.containerId;
  useEffect(() => {
    if (containerId === void 0) {
      return;
    }
    const hadConsumers = hasViewabilityConsumers(ctx);
    ctx.mapViewabilityAmountCallbacks.set(containerId, (nextValue) => callbackRef.current(nextValue));
    const value = ctx.mapViewabilityAmountValues.get(containerId);
    if (value) callbackRef.current(value);
    const cancelConfigWarning = IS_DEV ? scheduleViewabilityConfigWarning(ctx, "useViewabilityAmount") : void 0;
    if (!hadConsumers) {
      resetViewabilityTimers(ctx);
      requestViewabilityRecalculation(ctx);
    }
    return () => {
      cancelConfigWarning == null ? void 0 : cancelConfigWarning();
      ctx.mapViewabilityAmountCallbacks.delete(containerId);
    };
  }, [ctx, callbackRef, containerId]);
}
function useRecyclingEffect(effect) {
  const containerContext = useContextContainer();
  const { hasItemInfo, item, itemIndex, itemKey } = useContainerItemSignals(containerContext);
  const prevInfo = useRef(void 0);
  useEffect(() => {
    if (!hasItemInfo) {
      return;
    }
    let ret;
    if (prevInfo.current) {
      ret = effect({
        index: itemIndex,
        item,
        prevIndex: prevInfo.current.index,
        prevItem: prevInfo.current.item
      });
    }
    prevInfo.current = {
      index: itemIndex,
      item
    };
    return ret;
  }, [effect, hasItemInfo, itemIndex, item, itemKey]);
}
function useRecyclingState(valueOrFun) {
  const containerContext = useContextContainer();
  const { hasItemInfo, item, itemIndex, itemKey } = useContainerItemSignals(containerContext);
  const computeValue = () => {
    if (isFunction(valueOrFun)) {
      const initializer = valueOrFun;
      return hasItemInfo ? initializer({
        index: itemIndex,
        item,
        prevIndex: void 0,
        prevItem: void 0
      }) : initializer();
    }
    return valueOrFun;
  };
  const [stateValue, setStateValue] = useState(() => {
    return computeValue();
  });
  const prevItemKeyRef = useRef(hasItemInfo ? itemKey : null);
  if (hasItemInfo && prevItemKeyRef.current !== itemKey) {
    prevItemKeyRef.current = itemKey;
    setStateValue(computeValue());
  }
  const triggerLayout = containerContext == null ? void 0 : containerContext.triggerLayout;
  const setState = useCallback(
    (newState) => {
      if (!triggerLayout) {
        return;
      }
      setStateValue((prevValue) => {
        return isFunction(newState) ? newState(prevValue) : newState;
      });
      triggerLayout();
    },
    [triggerLayout]
  );
  return [stateValue, setState];
}
function useIsLastItem() {
  var _a3;
  const containerContext = useContextContainer();
  const containerId = (_a3 = containerContext == null ? void 0 : containerContext.containerId) != null ? _a3 : NO_CONTAINER_ID;
  const [itemKey] = useArr$([`containerItemKey${containerId}`]);
  const isLast = useSelector$("lastItemKeys", (lastItemKeys) => {
    if (containerContext && !isNullOrUndefined(itemKey)) {
      return (lastItemKeys == null ? void 0 : lastItemKeys.includes(itemKey)) || false;
    }
    return false;
  });
  return isLast;
}
function useListScrollSize() {
  const [scrollSize] = useArr$(["scrollSize"]);
  return scrollSize;
}
var noop = () => {
};
function useSyncLayout() {
  const containerContext = useContextContainer();
  return IsNewArchitecture && containerContext ? containerContext.triggerLayout : noop;
}

// src/components/Separator.tsx
function Separator({ ItemSeparatorComponent, leadingItem }) {
  const isLastItem = useIsLastItem();
  return isLastItem ? null : /* @__PURE__ */ React2.createElement(ItemSeparatorComponent, { leadingItem });
}

// src/core/containerLayoutBaseline.ts
function measureContainerLayoutSize(element) {
  const rect = element.getBoundingClientRect();
  if (Math.abs(rect.width - element.offsetWidth) >= 1 || Math.abs(rect.height - element.offsetHeight) >= 1) {
    const style = getComputedStyle(element);
    const height = Number.parseFloat(style.height);
    const width = Number.parseFloat(style.width);
    if (Number.isFinite(height) && Number.isFinite(width)) return { height, width };
  }
  return rect;
}
function useOnLayoutSync({
  ref,
  measureInLayoutEffect = true,
  onLayoutProp,
  onLayoutChange
}, deps = []) {
  const onLayout = useCallback(
    (event) => {
      const { layout } = event.nativeEvent;
      onLayoutChange(layout, false);
      onLayoutProp == null ? void 0 : onLayoutProp(event);
    },
    [onLayoutChange, onLayoutProp]
  );
  if (IsNewArchitecture) {
    useLayoutEffect(() => {
      if (measureInLayoutEffect && ref.current) {
        ref.current.measure((x, y, width, height) => {
          onLayoutChange({ height, width, x, y }, true);
        });
      }
    }, [measureInLayoutEffect, ...deps]);
  }
  return { onLayout };
}

// src/hooks/useContainerMeasurement.tsx
var pendingWebShrinkMeasurements = /* @__PURE__ */ new Map();
var pendingWebShrinkFrame;
function cancelWebShrinkMeasurement(state) {
  pendingWebShrinkMeasurements.delete(state);
}
function scheduleWebShrinkMeasurement(state, confirmMeasurement) {
  pendingWebShrinkMeasurements.set(state, confirmMeasurement);
  if (pendingWebShrinkFrame === void 0) {
    pendingWebShrinkFrame = requestAnimationFrame(() => {
      const callbacks = Array.from(pendingWebShrinkMeasurements.values());
      pendingWebShrinkMeasurements.clear();
      pendingWebShrinkFrame = void 0;
      batchItemSizeUpdates(() => {
        for (const callback of callbacks) {
          callback();
        }
      });
    });
  }
}
function processContainerLayout({ containerId, ctx, rectangle, ref, state }) {
  var _a3, _b, _c;
  const listState = ctx.state;
  const currentItemKey = state.itemKey;
  const generation = (_a3 = listState.containerItemGenerations[containerId]) != null ? _a3 : 0;
  state.didLayout = true;
  let layout = rectangle;
  const axis = state.horizontal ? "width" : "height";
  const size = roundSize(rectangle[axis]);
  const localPreviousSize = state.lastSize ? roundSize(state.lastSize[axis]) : void 0;
  const coreKnownSize = listState.sizesKnown.get(currentItemKey);
  const previousSize = Platform.OS === "web" ? coreKnownSize : localPreviousSize;
  const applyLayout = () => {
    var _a4;
    if (state.itemKey !== currentItemKey || ((_a4 = listState.containerItemGenerations[containerId]) != null ? _a4 : 0) !== generation) {
      return;
    }
    state.lastSize = layout;
    updateItemSizes(ctx, {
      containerId,
      generation,
      itemKey: currentItemKey,
      size: layout
    });
  };
  const shouldDeferWebShrinkLayoutUpdate = Platform.OS === "web" && !isInMVCPActiveMode(listState) && previousSize !== void 0 && size + 1 < previousSize;
  if (shouldDeferWebShrinkLayoutUpdate) {
    scheduleWebShrinkMeasurement(state, () => {
      if (state.itemKey === currentItemKey) {
        const element = ref.current;
        if (element) {
          layout = measureContainerLayoutSize(element);
        }
        applyLayout();
      }
    });
  } else {
    if (Platform.OS === "web") {
      cancelWebShrinkMeasurement(state);
    }
    if (IsNewArchitecture || size > 0) {
      applyLayout();
    } else {
      (_c = (_b = ref.current) == null ? void 0 : _b.measure) == null ? void 0 : _c.call(_b, (_x, _y, width, height) => {
        layout = { height, width };
        applyLayout();
      });
    }
  }
}
function useContainerMeasurement({
  containerId,
  ctx,
  horizontal,
  itemKey,
  ref
}, layoutDependencies) {
  const stateRef = useRef({
    didLayout: false,
    horizontal,
    itemKey
  });
  useLayoutEffect(() => {
    stateRef.current.horizontal = horizontal;
    stateRef.current.itemKey = itemKey;
  }, [horizontal, itemKey]);
  const [layoutRenderCount, forceLayoutRender] = useState(0);
  const onLayoutChange = useCallback(
    (rectangle) => {
      processContainerLayout({ containerId, ctx, rectangle, ref, state: stateRef.current });
    },
    [containerId, ctx, ref]
  );
  const triggerLayout = useCallback(() => {
    if (IsNewArchitecture) {
      scheduleContainerLayout(ctx, containerId);
    } else {
      forceLayoutRender((value) => value + 1);
    }
  }, [containerId, ctx]);
  useLayoutEffect(() => {
    ctx.containerLayoutTriggers.set(containerId, triggerLayout);
    return () => {
      cancelWebShrinkMeasurement(stateRef.current);
      if (ctx.containerLayoutTriggers.get(containerId) === triggerLayout) {
        ctx.containerLayoutTriggers.delete(containerId);
      }
    };
  }, [containerId, ctx, triggerLayout]);
  useLayoutEffect(() => {
    if (IsNewArchitecture) {
      scheduleContainerLayout(ctx, containerId);
    }
  }, layoutDependencies);
  useLayoutEffect(() => {
    if (!IsNewArchitecture && layoutRenderCount > 0) {
      onLayoutChange({ height: 0, width: 0, x: 0, y: 0 });
    }
  }, [layoutRenderCount, onLayoutChange]);
  const { onLayout } = useOnLayoutSync(
    {
      measureInLayoutEffect: !IsNewArchitecture,
      onLayoutChange,
      ref},
    [itemKey, layoutRenderCount]
  );
  useEffect(() => {
    if (!IsNewArchitecture) {
      stateRef.current.didLayout = false;
      const timeout = setTimeout(() => {
        const state = stateRef.current;
        if (!state.didLayout && state.lastSize) {
          updateItemSizes(ctx, {
            containerId,
            itemKey: state.itemKey,
            size: state.lastSize
          });
          state.didLayout = true;
        }
      }, 16);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [containerId, ctx, itemKey]);
  return { onLayout, triggerLayout };
}

// src/components/Container.tsx
function getContainerPositionStyle({
  columnWrapperStyle,
  contentContainerAlignItems,
  horizontal,
  hasItemSeparator,
  isHorizontalRTLList,
  numColumns,
  otherAxisPos,
  otherAxisSize
}) {
  let paddingStyles;
  if (columnWrapperStyle) {
    const { columnGap, rowGap, gap } = columnWrapperStyle;
    if (horizontal) {
      paddingStyles = {
        paddingBottom: numColumns > 1 ? (rowGap || gap || 0) / 2 : void 0,
        paddingRight: columnGap || gap || void 0,
        paddingTop: numColumns > 1 ? (rowGap || gap || 0) / 2 : void 0
      };
    } else {
      paddingStyles = {
        paddingBottom: rowGap || gap || void 0,
        paddingLeft: numColumns > 1 ? (columnGap || gap || 0) / 2 : void 0,
        paddingRight: numColumns > 1 ? (columnGap || gap || 0) / 2 : void 0
      };
    }
  }
  return horizontal ? {
    bottom: contentContainerAlignItems === "flex-end" && numColumns === 1 ? 0 : void 0,
    boxSizing: paddingStyles ? "border-box" : void 0,
    direction: isHorizontalRTLList && Platform.OS === "web" ? "ltr" : void 0,
    flexDirection: hasItemSeparator ? "row" : void 0,
    height: otherAxisSize,
    left: 0,
    position: "absolute",
    top: contentContainerAlignItems === "flex-end" && numColumns === 1 ? void 0 : otherAxisPos,
    ...paddingStyles || {}
  } : {
    boxSizing: paddingStyles ? "border-box" : void 0,
    left: otherAxisPos,
    position: "absolute",
    right: numColumns > 1 ? null : 0,
    top: 0,
    width: otherAxisSize,
    ...paddingStyles || {}
  };
}
var Container = typedMemo(function Container2({
  id,
  itemKey,
  recycleItems,
  horizontal,
  getRenderedItem: getRenderedItem2,
  ItemSeparatorComponent,
  stickyHeaderConfig
}) {
  var _a3;
  const ctx = useStateContext();
  const renderCtx = useRenderStateContext(ctx);
  const { columnWrapperStyle, animatedScrollY } = renderCtx;
  const isHorizontalRTLList = isHorizontalRTL(renderCtx.state);
  const positionComponentInternal = renderCtx.state.props.positionComponentInternal;
  const stickyPositionComponentInternal = renderCtx.state.props.stickyPositionComponentInternal;
  const [column = 0, span = 1, data, dataVersion, numColumns = 1, extraData, isSticky, itemIndex] = useArr$([
    `containerColumn${id}`,
    `containerSpan${id}`,
    `containerItemData${id}`,
    `containerDataVersion${id}`,
    "numColumns",
    "extraData",
    `containerSticky${id}`,
    `containerItemIndex${id}`
  ]);
  const ref = useRef(null);
  React2.useLayoutEffect(() => {
    ctx.viewRefs.set(id, ref);
    return () => {
      if (ctx.viewRefs.get(id) === ref) ctx.viewRefs.delete(id);
    };
  }, [ctx, id]);
  const resolvedColumn = column > 0 ? column : 1;
  const resolvedSpan = Math.min(Math.max(span || 1, 1), numColumns);
  const otherAxisPos = numColumns > 1 ? `${(resolvedColumn - 1) / numColumns * 100}%` : 0;
  const otherAxisSize = numColumns > 1 ? `${resolvedSpan / numColumns * 100}%` : void 0;
  const style = useMemo(
    () => getContainerPositionStyle({
      columnWrapperStyle,
      contentContainerAlignItems: renderCtx.state.props.contentContainerAlignItems,
      hasItemSeparator: !!ItemSeparatorComponent,
      horizontal,
      isHorizontalRTLList,
      numColumns,
      otherAxisPos,
      otherAxisSize
    }),
    [
      horizontal,
      isHorizontalRTLList,
      otherAxisPos,
      otherAxisSize,
      columnWrapperStyle,
      renderCtx.state.props.contentContainerAlignItems,
      numColumns,
      ItemSeparatorComponent
    ]
  );
  const renderCache = useMemo(
    () => ({}),
    [itemKey, data, dataVersion, extraData]
  );
  const cache = renderCache.current;
  const cached = cache == null ? void 0 : cache.value;
  const getItemType = renderCtx.state.props.getItemType;
  let nextCache = cache;
  if (!cache || cached && cached.index !== itemIndex && (cache.readsIndex || !!getItemType && cached.type !== void 0 && itemIndex !== void 0 && ((_a3 = getItemType(cached.item, itemIndex)) != null ? _a3 : "") !== cached.type)) {
    const rendered = { readsIndex: false, value: null };
    if (itemKey !== void 0) {
      const onReadIndex = () => {
        rendered.readsIndex = true;
      };
      rendered.value = renderCtx === ctx ? getRenderedItem2(itemKey, id, onReadIndex) : getRenderedItem2(itemKey, id, onReadIndex, renderCtx);
    }
    nextCache = rendered;
  }
  React2.useLayoutEffect(() => {
    renderCache.current = nextCache;
  }, [renderCache, nextCache]);
  const renderedItemInfo = nextCache == null ? void 0 : nextCache.value;
  const { renderedItem } = renderedItemInfo || {};
  const PositionComponent = isSticky ? stickyPositionComponentInternal ? stickyPositionComponentInternal : PositionViewSticky : positionComponentInternal ? positionComponentInternal : PositionView;
  const { onLayout, triggerLayout } = useContainerMeasurement(
    {
      containerId: id,
      ctx,
      horizontal,
      itemKey,
      ref
    },
    [itemKey, renderedItemInfo, style, isSticky, PositionComponent, stickyHeaderConfig, ItemSeparatorComponent]
  );
  const contextValue = useMemo(() => ({ containerId: id, triggerLayout }), [id, triggerLayout]);
  return /* @__PURE__ */ React2.createElement(
    PositionComponent,
    {
      animatedScrollY: isSticky ? animatedScrollY : void 0,
      horizontal,
      id,
      key: recycleItems ? void 0 : itemKey,
      onLayout,
      refView: ref,
      stickyHeaderConfig,
      style
    },
    /* @__PURE__ */ React2.createElement(ContextContainer.Provider, { value: contextValue }, renderedItem, renderedItemInfo && ItemSeparatorComponent && /* @__PURE__ */ React2.createElement(Separator, { ItemSeparatorComponent, leadingItem: renderedItemInfo.item }))
  );
});

// src/components/ContainerSlot.tsx
function ContainerSlotBase({
  id,
  horizontal,
  recycleItems,
  ItemSeparatorComponent,
  getRenderedItem: getRenderedItem2,
  stickyHeaderConfig,
  ContainerComponent = Container
}) {
  const [itemKey] = useArr$([`containerItemKey${id}`]);
  if (itemKey === void 0) {
    return null;
  }
  return /* @__PURE__ */ React2.createElement(
    ContainerComponent,
    {
      getRenderedItem: getRenderedItem2,
      horizontal,
      ItemSeparatorComponent,
      id,
      itemKey,
      recycleItems,
      stickyHeaderConfig
    }
  );
}
var ContainerSlot = typedMemo(function ContainerSlot2(props) {
  return /* @__PURE__ */ React2.createElement(ContainerSlotBase, { ...props });
});

// src/core/nativeAnchorTiming.ts
function writesAnchorBeforeExtentShrink(state) {
  return IsNewArchitecture && (Platform.OS === "android" && !!state.props.horizontal || Platform.OS === "ios" && isUserGestureActive(state));
}
function useFreshDataTransitionVisibility(readyToRender, transitionEpoch) {
  const [completedTransitionEpoch, setCompletedTransitionEpoch] = useState(transitionEpoch);
  const hasPresentedContent = useRef(false);
  const isTransitionPending = completedTransitionEpoch !== transitionEpoch;
  useLayoutEffect(() => {
    if (readyToRender) hasPresentedContent.current = true;
    if (Platform.OS !== "web" && completedTransitionEpoch !== transitionEpoch) {
      setCompletedTransitionEpoch(transitionEpoch);
    }
  }, [completedTransitionEpoch, readyToRender, transitionEpoch]);
  return Platform.OS === "web" ? readyToRender || hasPresentedContent.current : readyToRender && !isTransitionPending;
}

// src/components/Containers.native.tsx
var isFabric = IsNewArchitecture;
var ContentView = isFabric ? View$1 : Animated.View;
var useContentSize = IsNewArchitecture ? (ctx) => peek$(ctx, "totalSize") : () => useValue$("totalSize");
var ContentExtent = typedMemo(function ContentExtentView({
  children,
  horizontal,
  isVisible,
  style
}) {
  const ctx = useStateContext();
  const renderCtx = useRenderStateContext(ctx);
  const size = useContentSize(renderCtx);
  const minSize = IsNewArchitecture ? size : void 0;
  const ref = React2.useRef(null);
  const committedSize = React2.useRef(peek$(ctx, "totalSize"));
  const committedContainers = React2.useRef([]);
  const isCommitting = React2.useRef(false);
  const acknowledgeSize = React2.useRef(void 0);
  const commitSize = React2.useCallback(
    (nextSize) => {
      var _a3;
      if (committedSize.current !== nextSize) {
        committedSize.current = nextSize;
        const latestSize = peek$(ctx, "totalSize");
        (_a3 = ref.current) == null ? void 0 : _a3.setNativeProps({
          style: horizontal ? { minWidth: nextSize, width: latestSize } : { height: latestSize, minHeight: nextSize }
        });
      }
    },
    [ctx, horizontal]
  );
  const prepareCommit = React2.useCallback(
    (snapshot) => {
      const containers = snapshotContainers(snapshot);
      const nextSize = peek$(snapshot, "totalSize");
      return {
        afterMeasure: () => {
          var _a3;
          try {
            adoptCommittedContainerSizes(ctx, containers);
          } finally {
            isCommitting.current = false;
          }
          (_a3 = acknowledgeSize.current) == null ? void 0 : _a3.call(acknowledgeSize);
        },
        beforeMeasure: () => {
          isCommitting.current = true;
          committedContainers.current = containers;
          commitSize(nextSize);
        }
      };
    },
    [commitSize, ctx]
  );
  React2.useLayoutEffect(() => {
    if (IsNewArchitecture) {
      let disposed = false;
      let deferred = false;
      let isAcknowledgePending = false;
      const applySize = (nextSize) => {
        var _a3;
        (_a3 = ref.current) == null ? void 0 : _a3.setNativeProps({ style: horizontal ? { width: nextSize } : { height: nextSize } });
        if (isCommitting.current) {
          isAcknowledgePending = true;
        } else if (areContainersCommitted(ctx, committedContainers.current)) {
          commitSize(nextSize);
        } else if (nextSize !== committedSize.current) {
          scheduleContainerLayout(ctx, /* @__PURE__ */ new Set());
        }
      };
      const updateSize = (nextSize) => {
        if (nextSize < committedSize.current && writesAnchorBeforeExtentShrink(ctx.state)) {
          if (!deferred) {
            deferred = true;
            queueMicrotask(() => {
              deferred = false;
              if (!disposed) applySize(peek$(ctx, "totalSize"));
            });
          }
        } else {
          applySize(nextSize);
        }
      };
      acknowledgeSize.current = () => {
        if (isAcknowledgePending) {
          isAcknowledgePending = false;
          applySize(peek$(ctx, "totalSize"));
        }
      };
      const unsubscribe = listen$(ctx, "totalSize", updateSize, true);
      updateSize(peek$(ctx, "totalSize"));
      return () => {
        disposed = true;
        acknowledgeSize.current = void 0;
        unsubscribe();
      };
    }
  }, [commitSize, ctx, horizontal]);
  return React2.useMemo(() => {
    const sizeStyle = horizontal ? { minWidth: minSize, width: size } : { height: size, minHeight: minSize };
    return /* @__PURE__ */ React2.createElement(
      ContentView,
      {
        collapsable: false,
        pointerEvents: isVisible ? void 0 : "none",
        ref,
        style: { ...style, ...sizeStyle }
      },
      /* @__PURE__ */ React2.createElement(ContainerLayoutCoordinator, { prepareCommit: IsNewArchitecture ? prepareCommit : void 0 }, children)
    );
  }, [children, horizontal, isVisible, minSize, prepareCommit, size, style]);
});
var ContainersLayer = typedMemo(function ContainersLayer2({
  children,
  contentRowGap,
  footer,
  freshDataTransitionEpoch,
  horizontal,
  renderRows
}) {
  const ctx = useStateContext();
  const columnWrapperStyle = useRenderStateContext(ctx).columnWrapperStyle;
  const [readyToRender, numColumns, otherAxisSize = 0] = useArr$(["readyToRender", "numColumns", "otherAxisSize"]);
  const showEstimatedItems = !!ctx.state.hasEstimatedInitialLayout && !hasActiveInitialScroll(ctx.state);
  const isVisible = useFreshDataTransitionVisibility(!!readyToRender || showEstimatedItems, freshDataTransitionEpoch);
  const style = horizontal ? {
    height: otherAxisSize || "100%",
    minHeight: otherAxisSize,
    opacity: isVisible ? 1 : 0
  } : { minWidth: otherAxisSize, opacity: isVisible ? 1 : 0 };
  const gapY = (columnWrapperStyle == null ? void 0 : columnWrapperStyle.rowGap) || (columnWrapperStyle == null ? void 0 : columnWrapperStyle.gap) || 0;
  if (columnWrapperStyle) {
    const gapX = columnWrapperStyle.columnGap || columnWrapperStyle.gap || 0;
    if (horizontal) {
      if (gapY && numColumns > 1) {
        style.marginVertical = -gapY / 2;
      }
      if (gapX) {
        style.marginRight = -gapX;
      }
    } else {
      if (gapX && numColumns > 1) {
        style.marginHorizontal = -gapX;
      }
      if (gapY) {
        style.marginBottom = -gapY;
      }
    }
  }
  const layer = renderRows && /* @__PURE__ */ React2.createElement(ContentExtent, { horizontal, isVisible, style }, children);
  const ExtentWrapper = isFabric && !horizontal ? ctx.state.props.contentExtentComponentInternal : void 0;
  return ExtentWrapper ? /* @__PURE__ */ React2.createElement(
    WrappedContentExtent,
    {
      contentRowGap,
      ExtentWrapper,
      footer,
      gapY,
      renderRows
    },
    layer
  ) : layer;
});
function WrappedContentExtent({
  children,
  contentRowGap,
  ExtentWrapper,
  footer,
  gapY,
  renderRows
}) {
  const ctx = useStateContext();
  const [totalSize = 0, footerSize = 0] = useArr$(["totalSize", "footerSize"]);
  const rowsExtent = renderRows ? Math.max(0, totalSize - gapY) : 0;
  const footerExtent = footer ? footerSize + (renderRows ? contentRowGap != null ? contentRowGap : 0 : 0) : 0;
  return /* @__PURE__ */ React2.createElement(
    ExtentWrapper,
    {
      committedSize: rowsExtent + footerExtent,
      contentAlignItems: ctx.state.props.contentContainerAlignItems,
      contentRowGap,
      footer
    },
    children
  );
}
var Containers = typedMemo(function Containers2({
  contentRowGap,
  footer,
  freshDataTransitionEpoch,
  horizontal,
  recycleItems,
  renderRows = true,
  ItemSeparatorComponent,
  stickyHeaderConfig,
  getRenderedItem: getRenderedItem2
}) {
  const [numContainersPooled] = useArr$(["numContainersPooled"]);
  const containers = [];
  for (let i = 0; renderRows && i < numContainersPooled; i++) {
    containers.push(
      /* @__PURE__ */ React2.createElement(
        ContainerSlot,
        {
          getRenderedItem: getRenderedItem2,
          horizontal,
          ItemSeparatorComponent,
          id: i,
          key: i,
          recycleItems,
          stickyHeaderConfig
        }
      )
    );
  }
  return /* @__PURE__ */ React2.createElement(
    ContainersLayer,
    {
      contentRowGap,
      footer,
      freshDataTransitionEpoch,
      horizontal,
      renderRows
    },
    containers
  );
});
var ListComponentScrollView = Animated.ScrollView;

// src/components/listComponentStyles.ts
function getAutoOtherAxisStyle({
  horizontal,
  needsOtherAxisSize,
  otherAxisSize
}) {
  if (!needsOtherAxisSize || !otherAxisSize || otherAxisSize <= 0) {
    return void 0;
  }
  return horizontal ? { height: otherAxisSize } : { width: otherAxisSize };
}

// src/core/nativeAnchorOffset.ts
var SCROLL_ADJUST_BIAS = 1e7;
function getNativeAnchorTop(adjust) {
  const scale = PixelRatio.get();
  return Math.round(Math.fround(SCROLL_ADJUST_BIAS + adjust) * scale) / scale - SCROLL_ADJUST_BIAS;
}

// src/components/ScrollAdjust.native.tsx
function getAnchorOffset(scrollAdjust, scrollAdjustUserOffset) {
  return (scrollAdjust || 0) + (scrollAdjustUserOffset || 0) + SCROLL_ADJUST_BIAS;
}
function ScrollAdjust() {
  var _a3;
  const ctx = useStateContext();
  const ref = React2.useRef(null);
  const [scrollAdjust, scrollAdjustUserOffset] = useArr$(["scrollAdjust", "scrollAdjustUserOffset"]);
  const scrollOffset = getAnchorOffset(scrollAdjust, scrollAdjustUserOffset);
  const horizontal = !!((_a3 = ctx.state) == null ? void 0 : _a3.props.horizontal);
  React2.useLayoutEffect(() => {
    const write = () => {
      var _a4;
      if (writesAnchorBeforeExtentShrink(ctx.state)) {
        const offset = getAnchorOffset(peek$(ctx, "scrollAdjust"), peek$(ctx, "scrollAdjustUserOffset"));
        (_a4 = ref.current) == null ? void 0 : _a4.setNativeProps({ style: horizontal ? { left: offset } : { top: offset } });
      }
    };
    const unsubscribeAdjust = listen$(ctx, "scrollAdjust", write);
    const unsubscribeUserOffset = listen$(ctx, "scrollAdjustUserOffset", write);
    return () => {
      unsubscribeAdjust();
      unsubscribeUserOffset();
    };
  }, [ctx, horizontal]);
  return /* @__PURE__ */ React2.createElement(
    View$1,
    {
      collapsable: false,
      ref,
      style: {
        height: 0,
        left: horizontal ? scrollOffset : 0,
        position: "absolute",
        top: horizontal ? 0 : scrollOffset,
        width: 0
      }
    }
  );
}
var SnapWrapper = React2.forwardRef(function SnapWrapperInner({ ScrollComponent, ...props }, ref) {
  const [snapToOffsets] = useArr$(["snapToOffsets"]);
  return /* @__PURE__ */ React2.createElement(ScrollComponent, { ...props, ref, snapToOffsets });
});
var enabled = false;
var subscribers = 0;
var subscription;
var isScreenReaderEnabled = () => enabled;
function subscribeScreenReader() {
  if (subscribers++ === 0) {
    let changed = false;
    const current = AccessibilityInfo.addEventListener("screenReaderChanged", (value) => {
      changed = true;
      enabled = value;
    });
    subscription = current;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (subscription === current && !changed) enabled = value;
    });
  }
  return () => {
    if (--subscribers === 0) {
      subscription == null ? void 0 : subscription.remove();
      subscription = void 0;
      enabled = false;
    }
  };
}

// src/core/onScroll.ts
function trackInitialScrollNativeProgress(state, newScroll) {
  const initialNativeScrollWatchdog = initialScrollWatchdog.get(state);
  const didInitialScrollReachTarget = !!initialNativeScrollWatchdog && initialScrollWatchdog.didReachTarget(newScroll, initialNativeScrollWatchdog);
  if (didInitialScrollReachTarget) {
    initialScrollWatchdog.clear(state);
    return;
  }
  if (initialNativeScrollWatchdog) {
    state.hasScrolled = false;
  }
}
function shouldDeferPublicOnScroll(state) {
  return Platform.OS === "web" && !!state.initialScroll && state.initialScroll.kind !== "offset" && !state.didFinishInitialScroll;
}
function cloneScrollEvent(event) {
  return {
    ...event,
    nativeEvent: {
      ...event.nativeEvent
    }
  };
}
function onScroll(ctx, event, notify = true) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
  const state = ctx.state;
  const { scrollProcessingEnabled } = state;
  if (scrollProcessingEnabled === false) {
    return;
  }
  if (((_b = (_a3 = event.nativeEvent) == null ? void 0 : _a3.contentSize) == null ? void 0 : _b.height) === 0 && ((_c = event.nativeEvent.contentSize) == null ? void 0 : _c.width) === 0) {
    return;
  }
  let insetChanged = false;
  if ((_d = event.nativeEvent) == null ? void 0 : _d.contentInset) {
    const { contentInset } = event.nativeEvent;
    const prevInset = state.nativeContentInset;
    if (!prevInset || prevInset.top !== contentInset.top || prevInset.bottom !== contentInset.bottom || prevInset.left !== contentInset.left || prevInset.right !== contentInset.right) {
      state.nativeContentInset = contentInset;
      insetChanged = true;
      if (Platform.OS !== "web" && state.props.anchoredEndSpaceOwner === "list") {
        maybeUpdateAnchoredEndSpace(ctx);
      }
    }
  }
  let newScroll = event.nativeEvent.contentOffset[state.props.horizontal ? "x" : "y"];
  if (state.props.horizontal) {
    newScroll = toLogicalHorizontalOffset(state, newScroll, (_e = event.nativeEvent.contentSize) == null ? void 0 : _e.width);
  }
  const isFinishedEndInitialScroll = state.didFinishInitialScroll && ((_f = state.initialScrollAnchor) == null ? void 0 : _f.viewPosition) === 1 && state.scroll > state.scrollLength;
  const shouldIgnoreNegativeInsetChange = Platform.OS !== "web" && insetChanged && newScroll < 0 && isFinishedEndInitialScroll;
  if (shouldIgnoreNegativeInsetChange) {
    return;
  }
  let nativeGeometryChanged = insetChanged;
  const nativeScreenReaderEnabled = Platform.OS !== "web" && isScreenReaderEnabled();
  if (Platform.OS !== "web") {
    const axis = state.props.horizontal ? "width" : "height";
    const content = (_g = event.nativeEvent.contentSize) == null ? void 0 : _g[axis];
    const length = (_h = event.nativeEvent.layoutMeasurement) == null ? void 0 : _h[axis];
    if (content !== void 0 && length !== void 0) {
      const previousGeometry = state.nativeScrollGeometry;
      if (!previousGeometry || content !== previousGeometry.content || length !== previousGeometry.length) {
        const previousScroll = (_i = state.lastNativeScroll) != null ? _i : state.scroll;
        const min = -getContentInsetTop(ctx);
        const max = Math.min(content, (_j = previousGeometry == null ? void 0 : previousGeometry.content) != null ? _j : content) + getContentInsetEnd(ctx) - length;
        const isInteriorUserMotion = !!previousGeometry && length === previousGeometry.length && !insetChanged && !state.pendingNativeMVCPAdjust && !state.scrollingTo && (state.isDragging || state.isMomentumScrolling) && previousScroll > min && newScroll > min && previousScroll < max && newScroll < max;
        nativeGeometryChanged || (nativeGeometryChanged = !!previousGeometry && !isInteriorUserMotion);
        state.nativeScrollGeometry = { content, length };
      }
      if (nativeScreenReaderEnabled) {
        const adjust = state.scrollAdjustHandler.getAdjust();
        const previous = state.accessibilityScrollEvent;
        const time = Date.now();
        const blocked = !!(state.scrollingTo || state.pendingScrollResolve || state.pendingScrollToEnd || state.maintainingScrollAtEnd || state.pendingMaintainScrollAtEnd || ((_k = state.pendingEndMeasurements) == null ? void 0 : _k.size) || hasActiveInitialScroll(state) || state.scheduledWork.has("appScrollRearm") || state.isDragging || state.isMomentumScrolling || state.userScrollContentSize !== void 0 || state.pendingNativeMVCPAdjust || peek$(ctx, "scrollAdjustPending") || state.ignoreScrollFromMVCP || insetChanged);
        const direction = previous ? Math.sign(newScroll - previous.scroll) : 0;
        const accepted = previous && !blocked && !previous.blocked && content === previous.content && length === previous.length && adjust === previous.adjust && Math.abs(newScroll - previous.scroll) > 1;
        if (accepted) {
          if (direction < 0) interruptUserScroll(ctx);
          if (previous.time === void 0 || time - previous.time > 250 || direction !== previous.direction) {
            (_m = (_l = state.props).onUserScroll) == null ? void 0 : _m.call(_l);
          }
        }
        state.accessibilityScrollEvent = {
          adjust,
          blocked,
          content,
          direction: accepted ? direction : (_n = previous == null ? void 0 : previous.direction) != null ? _n : 0,
          length,
          scroll: newScroll,
          time: accepted ? time : previous == null ? void 0 : previous.time
        };
      }
    }
  }
  if (!nativeScreenReaderEnabled && state.accessibilityScrollEvent) {
    state.accessibilityScrollEvent = void 0;
  }
  const previousNativeScroll = state.lastNativeScroll;
  state.lastNativeScroll = newScroll;
  state.lastNativeScrollTime = Date.now();
  if (state.scheduledWork.has("appScrollRearm")) armAppScrollRearm(ctx);
  if (!state.props.hasExternalScroll && state.scrollingTo && !state.scrollingTo.animated && state.scrollingTo.offset >= newScroll) {
    const webEnd = Platform.OS === "web" && state.scrollingTo.isScrollToEnd ? (_p = (_o = state.refScroller.current) == null ? void 0 : _o.getMaxScrollOffset) == null ? void 0 : _p.call(_o) : void 0;
    const maxOffset = webEnd === void 0 ? clampScrollOffset(ctx, newScroll, state.scrollingTo) : Math.min(newScroll, webEnd);
    if (newScroll !== maxOffset && Math.abs(newScroll - maxOffset) > 1) {
      if (state.scrollingTo.isInitialScroll || Math.abs(state.scroll - maxOffset) > 1) {
        scrollTo(ctx, {
          forceScroll: true,
          isInitialScroll: true,
          noScrollingTo: true,
          offset: maxOffset
        });
      }
      return;
    }
  }
  if (Platform.OS === "web") {
    const axis = state.props.horizontal ? "width" : "height";
    const content = (_q = event.nativeEvent.contentSize) == null ? void 0 : _q[axis];
    const length = (_r = event.nativeEvent.layoutMeasurement) == null ? void 0 : _r[axis];
    const rangeEnd = (_u = (_t = (_s = state.refScroller.current) == null ? void 0 : _s.getMaxScrollOffset) == null ? void 0 : _t.call(_s)) != null ? _u : content !== void 0 && length !== void 0 ? Math.max(0, content - length) : void 0;
    (_w = (_v = state.scrollAdjustHandler).observeNativeScroll) == null ? void 0 : _w.call(_v, newScroll, rangeEnd);
  }
  const didInteract = newScroll !== state.scroll && state.didFinishInitialScroll && (!state.scrollingTo || state.scrollingTo.ownerPhase === "browser-moving") && !state.ignoreScrollFromMVCP;
  state.scrollPending = newScroll;
  const modelScroll = state.scroll;
  clearFinishedBootstrapInitialScrollTargetIfMovedAway(ctx, newScroll);
  updateScroll(ctx, newScroll, insetChanged, {
    fromNativeScrollEvent: true,
    nativeGeometryChanged,
    previousNativeScroll
  });
  if (didInteract) recordViewabilityInteraction(ctx);
  trackInitialScrollNativeProgress(state, newScroll);
  (_y = (_x = state.scrollAdjustHandler).settleNativeRemainder) == null ? void 0 : _y.call(_x, newScroll, modelScroll);
  if (state.scrollingTo) {
    checkFinishedScroll(ctx);
  }
  if (notify && state.props.onScroll) {
    if (shouldDeferPublicOnScroll(state)) {
      state.deferredPublicOnScrollEvent = cloneScrollEvent(event);
    } else {
      state.props.onScroll(event);
    }
  }
}

// src/core/updateContentMetrics.ts
var SCROLL_ADJUST_EPSILON = 0.1;
function setContentLengthSignal(ctx, signalName, size) {
  const didChange = peek$(ctx, signalName) !== size;
  if (didChange) {
    set$(ctx, signalName, size);
    updateContentMetricsState(ctx);
  }
  return didChange;
}
function shouldAdjustForHeaderSizeChange(ctx, previousHeaderSize, nextHeaderSize) {
  const { didContainersLayout, didFinishInitialScroll, props, scroll, scrollingTo } = ctx.state;
  const sizeDiff = nextHeaderSize - previousHeaderSize;
  const leadingPadding = props.horizontal ? props.stylePaddingLeft : props.stylePaddingTop;
  const previousHeaderEnd = (leadingPadding || 0) + previousHeaderSize;
  return Platform.OS === "web" && props.maintainVisibleContentPosition.size && didContainersLayout && didFinishInitialScroll && !scrollingTo && scroll >= previousHeaderEnd - SCROLL_ADJUST_EPSILON && Math.abs(sizeDiff) > SCROLL_ADJUST_EPSILON;
}
function setHeaderSize(ctx, size) {
  const { state } = ctx;
  const previousHeaderSize = peek$(ctx, "headerSize") || 0;
  const didChange = previousHeaderSize !== size;
  const hasMeasuredOrEstimatedHeaderBaseline = state.didMeasureHeader || previousHeaderSize > SCROLL_ADJUST_EPSILON;
  if (didChange) {
    set$(ctx, "headerSize", size);
    updateContentMetricsState(ctx);
    if (hasMeasuredOrEstimatedHeaderBaseline && shouldAdjustForHeaderSizeChange(ctx, previousHeaderSize, size)) {
      requestAdjust(ctx, size - previousHeaderSize, "header");
    }
  }
  state.didMeasureHeader = true;
  if (didChange) checkThresholds(ctx);
}
function setFooterSize(ctx, size) {
  const didChange = setContentLengthSignal(ctx, "footerSize", size);
  if (didChange) {
    maybeUpdateAnchoredEndSpace(ctx);
    checkThresholds(ctx);
  }
  return didChange;
}
function areInsetsEqual(left, right) {
  var _a3, _b, _c, _d, _e, _f, _g, _h;
  return ((_a3 = left == null ? void 0 : left.top) != null ? _a3 : 0) === ((_b = right == null ? void 0 : right.top) != null ? _b : 0) && ((_c = left == null ? void 0 : left.bottom) != null ? _c : 0) === ((_d = right == null ? void 0 : right.bottom) != null ? _d : 0) && ((_e = left == null ? void 0 : left.left) != null ? _e : 0) === ((_f = right == null ? void 0 : right.left) != null ? _f : 0) && ((_g = left == null ? void 0 : left.right) != null ? _g : 0) === ((_h = right == null ? void 0 : right.right) != null ? _h : 0);
}
function setContentInsetOverride(ctx, inset) {
  const { state } = ctx;
  const previousInset = state.contentInsetOverride;
  const nextInset = inset != null ? inset : void 0;
  const didChange = !areInsetsEqual(previousInset, nextInset);
  state.contentInsetOverride = nextInset;
  if (didChange) {
    if (Platform.OS !== "web" && state.props.anchoredEndSpaceOwner === "list") {
      maybeUpdateAnchoredEndSpace(ctx);
    }
    updateContentMetricsState(ctx);
  }
  return didChange;
}
function useStableRenderComponent(renderComponent, mapProps) {
  const renderComponentRef = useLatestRef(renderComponent);
  const mapPropsRef = useLatestRef(mapProps);
  return React2.useMemo(
    () => React2.forwardRef(
      (props, ref) => {
        var _a3, _b;
        return (_b = (_a3 = renderComponentRef.current) == null ? void 0 : _a3.call(renderComponentRef, mapPropsRef.current(props, ref))) != null ? _b : null;
      }
    ),
    [mapPropsRef, renderComponentRef]
  );
}
var LayoutView = ({ onLayoutChange, refView, ...rest }) => {
  const localRef = useRef(null);
  const ref = refView != null ? refView : localRef;
  const { onLayout } = useOnLayoutSync({ onLayoutChange, ref });
  return /* @__PURE__ */ React2.createElement(View$1, { ...rest, onLayout, ref });
};

// src/components/ListComponent.tsx
var AlignItemsAtEndSpacer = typedMemo(function AlignItemsAtEndSpacer2({ horizontal }) {
  const [alignItemsAtEndPadding = 0] = useArr$(["alignItemsAtEndPadding"]);
  if (alignItemsAtEndPadding <= 0) {
    return null;
  }
  return /* @__PURE__ */ React2.createElement(
    View,
    {
      style: horizontal ? { flexShrink: 0, width: alignItemsAtEndPadding } : { flexShrink: 0, height: alignItemsAtEndPadding }
    },
    null
  );
});
var ListComponent = typedMemo(function ListComponent2({
  autoscrollToTopThreshold,
  canRender,
  freshDataTransitionEpoch,
  style,
  contentContainerStyle,
  horizontal,
  initialContentOffset,
  recycleItems,
  ItemSeparatorComponent,
  alignItemsAtEnd: _alignItemsAtEnd,
  onScroll: onScroll2,
  onScrollToTop,
  onLayout,
  ListHeaderComponent,
  ListHeaderComponentStyle,
  ListFooterComponent,
  ListFooterComponentStyle,
  ListEmptyComponent,
  getRenderedItem: getRenderedItem2,
  refScrollView,
  renderScrollComponent,
  onLayoutFooter,
  onInternalScrollBeginDrag,
  onInternalScrollEndDrag,
  onInternalScrollEnd,
  scrollAdjustHandler,
  snapToIndices,
  stickyHeaderConfig,
  stickyHeaderIndices,
  useWindowScroll = false,
  scrollElement,
  ...rest
}) {
  var _a3;
  const ctx = useStateContext();
  const renderState = useRenderStateContext(ctx).state;
  const maintainVisibleContentPosition = renderState.props.maintainVisibleContentPosition;
  const [anchoredEndSpaceSize = 0, otherAxisSize = 0] = useArr$(["anchoredEndSpaceSize", "otherAxisSize"]);
  const shouldRenderAlignItemsAtEndSpacer = renderState.props.alignItemsAtEndPaddingEnabled;
  const shouldMaterializeAnchoredEndSpace = !!renderState.props.anchoredEndSpace && renderState.props.anchoredEndSpaceOwner === "list" && anchoredEndSpaceSize > 0;
  let anchoredEndSpaceStyle;
  if (shouldMaterializeAnchoredEndSpace) {
    const paddingEnd = horizontal ? isHorizontalRTL(renderState) ? "Left" : "Right" : "Bottom";
    anchoredEndSpaceStyle = {
      [`padding${paddingEnd}`]: extractPadding({}, contentContainerStyle, paddingEnd) + anchoredEndSpaceSize
    };
  }
  const autoOtherAxisStyle = getAutoOtherAxisStyle({
    horizontal,
    needsOtherAxisSize: renderState.needsOtherAxisSize,
    otherAxisSize
  });
  const CustomScrollComponent = useStableRenderComponent(
    renderScrollComponent,
    (props, ref) => ({ ...props, ref })
  );
  const ScrollComponent = renderScrollComponent ? CustomScrollComponent : ListComponentScrollView;
  const SnapOrScroll = snapToIndices ? SnapWrapper : ScrollComponent;
  const updateFooterSize = useCallback(
    (size, afterSizeUpdate) => {
      var _a4;
      const didFooterSizeChange = setFooterSize(ctx, size);
      afterSizeUpdate == null ? void 0 : afterSizeUpdate();
      if (didFooterSizeChange && ((_a4 = ctx.state.props.maintainScrollAtEnd) == null ? void 0 : _a4.onFooterLayout)) {
        doMaintainScrollAtEnd(ctx);
      }
    },
    [ctx]
  );
  useLayoutEffect(() => {
    if (!ListHeaderComponent) {
      setHeaderSize(ctx, 0);
    }
    if (!ListFooterComponent) {
      updateFooterSize(0);
    }
  }, [ListHeaderComponent, ListFooterComponent, ctx, updateFooterSize]);
  const onScrollToTopInternal = useCallback(
    (event) => {
      var _a4, _b;
      const previousStart = ctx.state.startReachedSnapshot;
      interruptUserScroll(ctx);
      onScroll(ctx, event, false);
      if ((previousStart == null ? void 0 : previousStart.didLeaveHysteresis) && ctx.state.startReachedSnapshot === previousStart) {
        ctx.state.isStartReached = false;
        ctx.state.startReachedSnapshot = void 0;
      }
      checkAtTop(ctx, ctx.state.startReachedSnapshot ? void 0 : "start");
      const accessibility = ctx.state.accessibilityScrollEvent;
      const alreadyReported = isScreenReaderEnabled() && (accessibility == null ? void 0 : accessibility.time) !== void 0 && !accessibility.blocked && accessibility.direction === -1 && accessibility.scroll <= 1;
      if (accessibility) accessibility.time = void 0;
      if (!alreadyReported) (_b = (_a4 = ctx.state.props).onUserScroll) == null ? void 0 : _b.call(_a4);
      onScrollToTop == null ? void 0 : onScrollToTop(event);
    },
    [ctx, onScrollToTop]
  );
  const { onContentSizeChange } = rest;
  const onContentSizeChangeInternal = useCallback(
    (width, height) => {
      reissueClampedNativeEndScroll(ctx);
      clampAndroidHorizontalOverscroll(ctx, width);
      onContentSizeChange == null ? void 0 : onContentSizeChange(width, height);
    },
    [ctx, onContentSizeChange]
  );
  const onLayoutHeader = useCallback(
    (rect) => {
      const size = rect[horizontal ? "width" : "height"];
      setHeaderSize(ctx, size);
    },
    [ctx, horizontal]
  );
  const onLayoutFooterInternal = useCallback(
    (rect, fromLayoutEffect) => {
      const size = rect[horizontal ? "width" : "height"];
      updateFooterSize(size, () => {
        onLayoutFooter == null ? void 0 : onLayoutFooter(rect, fromLayoutEffect);
      });
    },
    [horizontal, onLayoutFooter, updateFooterSize]
  );
  const footer = ListFooterComponent && /* @__PURE__ */ React2.createElement(LayoutView, { onLayoutChange: onLayoutFooterInternal, style: ListFooterComponentStyle }, getComponent(ListFooterComponent));
  const renderRows = canRender && !ListEmptyComponent;
  const extentFooter = IsNewArchitecture && Platform.OS !== "web" && !horizontal && renderState.props.contentExtentComponentInternal ? footer : void 0;
  const rowGap = extentFooter && ((_a3 = contentContainerStyle.rowGap) != null ? _a3 : contentContainerStyle.gap);
  return /* @__PURE__ */ React2.createElement(
    SnapOrScroll,
    {
      ...rest,
      ...Platform.OS === "web" ? ScrollComponent === ListComponentScrollView ? { onInternalScrollEnd, scrollElement, useWindowScroll } : {} : {
        onContentSizeChange: onContentSizeChangeInternal,
        onScrollBeginDrag: onInternalScrollBeginDrag,
        onScrollEndDrag: onInternalScrollEndDrag,
        onScrollToTop: onScrollToTopInternal
      },
      contentContainerStyle: [
        horizontal ? { height: "100%" } : {},
        contentContainerStyle,
        anchoredEndSpaceStyle,
        Platform.OS === "web" ? { boxSizing: "border-box" } : void 0
      ],
      contentOffset: initialContentOffset !== void 0 ? horizontal ? { x: initialContentOffset, y: 0 } : { x: 0, y: initialContentOffset } : void 0,
      horizontal,
      maintainVisibleContentPosition: maintainVisibleContentPosition.size || maintainVisibleContentPosition.data ? Platform.OS !== "web" && autoscrollToTopThreshold !== void 0 ? { autoscrollToTopThreshold, minIndexForVisible: 0 } : { minIndexForVisible: 0 } : void 0,
      onLayout,
      onScroll: onScroll2,
      ref: refScrollView,
      ScrollComponent: snapToIndices ? ScrollComponent : void 0,
      style: autoOtherAxisStyle ? [autoOtherAxisStyle, style] : style
    },
    Platform.OS !== "web" && /* @__PURE__ */ React2.createElement(ScrollAdjust, null),
    ListHeaderComponent && /* @__PURE__ */ React2.createElement(LayoutView, { onLayoutChange: onLayoutHeader, style: ListHeaderComponentStyle }, getComponent(ListHeaderComponent)),
    ListEmptyComponent && getComponent(ListEmptyComponent),
    shouldRenderAlignItemsAtEndSpacer && /* @__PURE__ */ React2.createElement(AlignItemsAtEndSpacer, { horizontal }),
    (renderRows || extentFooter) && /* @__PURE__ */ React2.createElement(
      Containers,
      {
        contentRowGap: typeof rowGap === "number" ? Math.max(0, rowGap) : void 0,
        footer: extentFooter,
        freshDataTransitionEpoch,
        getRenderedItem: getRenderedItem2,
        horizontal,
        ItemSeparatorComponent,
        recycleItems,
        renderRows,
        stickyHeaderConfig
      }
    ),
    !extentFooter && footer,
    Platform.OS === "web" && /* @__PURE__ */ React2.createElement(ScrollAdjust, null),
    IS_DEV && ENABLE_DEVMODE
  );
});
var WEB_UNBOUNDED_HEIGHT_MIN_DATA_LENGTH = 100;
var WEB_UNBOUNDED_HEIGHT_CONTAINER_RATIO = 0.9;
var WEB_UNBOUNDED_HEIGHT_VIEWPORT_RATIO = 0.9;
function useDevChecksImpl(props, renderState) {
  const ctx = useStateContext();
  const {
    anchoredEndSpace,
    childrenMode,
    keyExtractor,
    numColumns,
    renderScrollComponent,
    scrollElement,
    useWindowScroll
  } = props;
  const hasAnchoredEndSpace = !!anchoredEndSpace;
  const shouldWarnAboutIndexKeys = !keyExtractor && !renderState.props.dataSource && !renderState.isFirst && renderState.didDataChange && !childrenMode;
  useEffect(() => {
    var _a3;
    return (_a3 = globalThis.__LEGEND_LIST_DEV_HOOK__) == null ? void 0 : _a3.call(globalThis, ctx);
  }, [ctx]);
  useEffect(() => {
    if (hasAnchoredEndSpace && (numColumns != null ? numColumns : 1) > 1) {
      warnDevOnce(
        "anchoredEndSpaceNumColumns",
        "anchoredEndSpace is only supported when numColumns is 1. Using it with multiple columns may produce incorrect anchored spacing."
      );
    }
  }, [hasAnchoredEndSpace, numColumns]);
  useEffect(() => {
    if ((useWindowScroll || scrollElement !== void 0) && renderScrollComponent) {
      warnDevOnce(
        "useWindowScrollRenderScrollComponent",
        "useWindowScroll and scrollElement are not supported when renderScrollComponent is provided."
      );
    }
  }, [renderScrollComponent, scrollElement, useWindowScroll]);
  useEffect(() => {
    if (shouldWarnAboutIndexKeys) {
      warnDevOnce(
        "keyExtractor",
        "Without a keyExtractor, measured sizes stay with their index. Appends keep layout, but inserts, removals, and reorders move content to rows with the wrong size. Pass a keyExtractor that returns a stable unique id."
      );
    }
  }, [shouldWarnAboutIndexKeys]);
  useEffect(() => {
    const state = ctx.state;
    const dataLength = getDataLength(state);
    const usesExternalScroll = state.props.hasExternalScroll;
    if (Platform.OS !== "web" || usesExternalScroll || dataLength < WEB_UNBOUNDED_HEIGHT_MIN_DATA_LENGTH) {
      return;
    }
    const warnIfUnboundedOuterSize = () => {
      const readyToRender = peek$(ctx, "readyToRender");
      const numContainers = peek$(ctx, "numContainers") || 0;
      const totalSize = peek$(ctx, "totalSize") || 0;
      const scrollLength = ctx.state.scrollLength || 0;
      if (!readyToRender || totalSize <= 0 || scrollLength <= 0) {
        return;
      }
      const rendersAlmostEverything = numContainers >= Math.ceil(dataLength * WEB_UNBOUNDED_HEIGHT_CONTAINER_RATIO);
      const viewportMatchesContent = scrollLength >= totalSize * WEB_UNBOUNDED_HEIGHT_VIEWPORT_RATIO;
      if (rendersAlmostEverything && viewportMatchesContent) {
        warnDevOnce(
          "webUnboundedOuterSize",
          "LegendList appears to have an unbounded outer height on web, so virtualization is effectively disabled. Set a bounded height or flex: 1 on the list container, or use useWindowScroll."
        );
      }
    };
    warnIfUnboundedOuterSize();
    const unsubscribe = [
      listen$(ctx, "numContainers", warnIfUnboundedOuterSize),
      listen$(ctx, "readyToRender", warnIfUnboundedOuterSize),
      listen$(ctx, "totalSize", warnIfUnboundedOuterSize)
    ];
    return () => {
      for (const unsub of unsubscribe) {
        unsub();
      }
    };
  }, [ctx]);
}
function useDevChecksNoop(_props, _renderState) {
}
var useDevChecks = IS_DEV ? useDevChecksImpl : useDevChecksNoop;
function createArrayLayout(ctx) {
  var _a3;
  const { state } = ctx;
  const pendingAdjust = state.pendingNativeMVCPAdjust;
  const userScrollAnchorReset = state.userScrollAnchorReset;
  const copies = {
    averageSizes: { ...state.averageSizes },
    containerItemGenerations: state.containerItemGenerations.slice(),
    containerItemKeys: new Map(state.containerItemKeys),
    containerItemMetadata: new Map(
      Array.from(state.containerItemMetadata, ([id, metadata]) => [id, { ...metadata }])
    ),
    dataSourceAnchorPositions: state.dataSourceAnchorPositions && new Map(state.dataSourceAnchorPositions),
    fixedItemSizeKeys: state.fixedItemSizeKeys && new Set(state.fixedItemSizeKeys),
    idCache: Object.assign([], state.idCache),
    ignoreScrollFromMVCP: state.ignoreScrollFromMVCP && { ...state.ignoreScrollFromMVCP },
    indexByKey: new Map(state.indexByKey),
    layoutStoreRuntime: (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.fork(),
    measurementAverageSamples: state.measurementAverageSamples && new Map(state.measurementAverageSamples),
    pendingNativeMVCPAdjust: pendingAdjust && {
      ...pendingAdjust,
      anchor: pendingAdjust.anchor && { ...pendingAdjust.anchor },
      previousNativeEnds: new Set(pendingAdjust.previousNativeEnds)
    },
    scrollTargetRemeasure: state.scrollTargetRemeasure && new Map(state.scrollTargetRemeasure),
    sizes: new Map(state.sizes),
    sizesKnown: new Map(state.sizesKnown),
    stickyContainerPool: new Set(state.stickyContainerPool),
    userScrollAnchorReset: userScrollAnchorReset && { keys: new Set(userScrollAnchorReset.keys) }
  };
  const snapshot = {
    ...ctx,
    layoutEffects: [],
    listeners: /* @__PURE__ */ new Map(),
    pendingContainerIds: ctx.pendingContainerIds && new Set(ctx.pendingContainerIds),
    state: { ...state, ...copies },
    values: new Map(ctx.values)
  };
  return { ctx, snapshot };
}
var ignoreLayoutChanges = () => () => {
};
function useArrayLayout(ctx, hasNewData) {
  var _a3;
  const layout = hasNewData ? createArrayLayout(ctx) : void 0;
  const revision = layout ? (_a3 = ctx.layoutRevision) != null ? _a3 : 0 : 0;
  const getSnapshot = () => {
    var _a4;
    return (layout == null ? void 0 : layout.snapshot) ? (_a4 = ctx.layoutRevision) != null ? _a4 : 0 : revision;
  };
  useSyncExternalStore(ignoreLayoutChanges, getSnapshot, getSnapshot);
  return layout;
}
var CommitArrayLayout = React2.memo(function CommitArrayLayoutEffect({
  layout
}) {
  React2.useLayoutEffect(() => {
    var _a3;
    const snapshot = layout == null ? void 0 : layout.snapshot;
    if (!snapshot) return;
    const { ctx } = layout;
    (_a3 = layout.beforeCommit) == null ? void 0 : _a3.call(layout);
    layout.beforeCommit = void 0;
    const previousValues = ctx.values;
    const previousRuntime = ctx.state.layoutStoreRuntime;
    const nextRuntime = snapshot.state.layoutStoreRuntime;
    if (previousRuntime && nextRuntime && Object.getPrototypeOf(previousRuntime.store) === Object.getPrototypeOf(nextRuntime.store)) {
      const store = Object.assign(previousRuntime.store, nextRuntime.store);
      snapshot.state.layoutStoreRuntime = Object.assign(previousRuntime, nextRuntime, { store });
    }
    Object.assign(ctx.state, snapshot.state);
    ctx.columnWrapperStyle = snapshot.columnWrapperStyle;
    ctx.pendingContainerIds = snapshot.pendingContainerIds;
    ctx.scrollAxisGap = snapshot.scrollAxisGap;
    ctx.values = snapshot.values;
    if (snapshot.plannedScrollAdjust !== void 0) {
      ctx.state.scrollAdjustHandler.requestAdjust(snapshot.plannedScrollAdjust);
    }
    markLayoutChanged(ctx);
    layout.snapshot = void 0;
    ctx.committedLayout = layout;
    notifyLayoutSignals(ctx, previousValues);
    const { layoutEffects } = snapshot;
    snapshot.layoutEffects = void 0;
    for (const effect of layoutEffects) effect(ctx);
  }, [layout]);
  return null;
});

// src/core/checkResetContainers.ts
function checkResetContainers(ctx, dataProp, { didColumnsChange = false, previousDataLength, placementAlreadyApplied } = {}) {
  var _a3, _b, _c, _d, _e;
  const state = ctx.state;
  const { previousData } = state;
  const { maintainScrollAtEnd } = state.props;
  if (!placementAlreadyApplied) placeDataChange(ctx, didColumnsChange);
  const dataLength = state.props.dataSource ? getDataLength(state) : dataProp.length;
  if ((_a3 = state.pendingEndMeasurements) == null ? void 0 : _a3.size) {
    if (state.props.dataSource) {
      for (const key of state.pendingEndMeasurements) {
        const index = state.indexByKey.get(key);
        if (index === void 0 || index >= dataLength || getDataKey(state, index) !== key)
          state.pendingEndMeasurements.delete(key);
      }
    } else {
      const removedMeasurements = new Set(state.pendingEndMeasurements);
      for (let index = 0; index < dataProp.length && removedMeasurements.size; index++) {
        removedMeasurements.delete(getId(state, index));
      }
      for (const key of removedMeasurements) {
        state.pendingEndMeasurements.delete(key);
      }
    }
  }
  const shouldMaintainScrollAtEnd = shouldMaintainScrollAtEndOnDataChange(state, didColumnsChange);
  const previousLength = state.props.dataSource ? (_d = previousDataLength != null ? previousDataLength : state.dataSourcePreviousLength) != null ? _d : (_c = (_b = state.pendingDataSourceBatches) == null ? void 0 : _b[0]) == null ? void 0 : _c.previousLength : previousData == null ? void 0 : previousData.length;
  if (shouldMaintainScrollAtEnd && !(maintainScrollAtEnd == null ? void 0 : maintainScrollAtEnd.onItemLayout) && previousLength !== void 0 && dataLength > previousLength) {
    (_e = state.pendingEndMeasurements) != null ? _e : state.pendingEndMeasurements = /* @__PURE__ */ new Set();
    if (state.props.dataSource) {
      for (const [key, index] of state.indexByKey) {
        if (index >= previousLength && index < dataLength && !state.sizesKnown.has(key))
          state.pendingEndMeasurements.add(key);
      }
      const endIndex = dataLength - 1;
      const endKey = getId(state, endIndex);
      state.indexByKey.set(endKey, endIndex);
      if (!state.sizesKnown.has(endKey)) state.pendingEndMeasurements.add(endKey);
    } else {
      for (let index = previousLength; index < dataProp.length; index++) {
        const key = getId(state, index);
        if (!state.sizesKnown.has(key)) state.pendingEndMeasurements.add(key);
      }
    }
  }
  const didMaintainScrollAtEnd = shouldMaintainScrollAtEnd && doMaintainScrollAtEnd(ctx);
  if (!didMaintainScrollAtEnd && !state.pendingMaintainScrollAtEnd) {
    state.pendingEndMeasurements = void 0;
  }
  if (!didMaintainScrollAtEnd) {
    checkThresholds(ctx);
  }
  delete state.previousData;
}
function placeDataChange(ctx, didColumnsChange) {
  var _a3;
  if (didColumnsChange) {
    const state = ctx.state;
    (_a3 = state.measurementAverageSamples) == null ? void 0 : _a3.clear();
    state.sizes.clear();
    state.sizesKnown.clear();
    invalidateFixedItemSizes(state);
    for (const key in state.averageSizes) {
      delete state.averageSizes[key];
    }
    clearLayoutStoreKnownSizes(ctx);
    state.scrollForNextCalculateItemsInView = void 0;
  }
  calculateItemsInView(ctx, { dataChanged: true, doMVCP: true });
}

// src/core/checkStructuralDataChange.ts
function getMaterializedIdCacheIndices(idCache) {
  const indices = [];
  for (const key of Object.keys(idCache)) {
    const index = Number(key);
    if (Number.isInteger(index)) {
      indices.push(index);
    }
  }
  return indices;
}
function checkStructuralDataChange(state, dataProp, previousData) {
  var _a3;
  state.pendingDataComparison = void 0;
  if (!previousData || !dataProp || dataProp.length !== previousData.length) {
    return true;
  }
  const {
    idCache,
    props: { itemsAreEqual, keyExtractor }
  } = state;
  let byIndex;
  const materializedIndices = getMaterializedIdCacheIndices(idCache);
  if (materializedIndices.length === 0) {
    return true;
  }
  for (const i of materializedIndices) {
    if (i >= dataProp.length) {
      continue;
    }
    if (dataProp[i] === previousData[i]) {
      continue;
    }
    if (!keyExtractor) {
      if (byIndex) {
        state.pendingDataComparison = { byIndex, nextData: dataProp, previousData };
      }
      return true;
    }
    const previousKey = (_a3 = idCache[i]) != null ? _a3 : keyExtractor(previousData[i], i);
    const nextKey = keyExtractor(dataProp[i], i);
    if (previousKey !== nextKey) {
      if (byIndex) {
        state.pendingDataComparison = { byIndex, nextData: dataProp, previousData };
      }
      return true;
    }
    if (!itemsAreEqual) {
      if (byIndex) {
        state.pendingDataComparison = { byIndex, nextData: dataProp, previousData };
      }
      return true;
    }
    const isEqual = itemsAreEqual(previousData[i], dataProp[i], i, dataProp);
    byIndex != null ? byIndex : byIndex = [];
    byIndex[i] = isEqual ? 1 : 2;
    if (!isEqual) {
      state.pendingDataComparison = { byIndex, nextData: dataProp, previousData };
      return true;
    }
  }
  return false;
}

// src/core/containerLayoutReady.ts
var CONTAINER_LAYOUT_READY_PREFIX = "containerLayoutReady";
function resetContainerLayoutReady(ctx) {
  for (const signalName of ctx.values.keys()) {
    if (signalName.startsWith(CONTAINER_LAYOUT_READY_PREFIX)) {
      set$(ctx, signalName, void 0);
    }
  }
}

// src/core/DataSourceMutationCoordinator.ts
function transformMoveIndex2(index, from, to, count) {
  let nextIndex = index;
  if (count > 0 && from !== to) {
    if (index >= from && index < from + count) {
      nextIndex = to + index - from;
    } else {
      const indexAfterRemoval = index >= from + count ? index - count : index;
      nextIndex = indexAfterRemoval >= to ? indexAfterRemoval + count : indexAfterRemoval;
    }
  }
  return nextIndex;
}
function transformDataSourceIndex(index, operations) {
  let nextIndex = index;
  for (const operation of operations) {
    if (operation.type === "splice") {
      const deletedEnd = operation.index + operation.deleteCount;
      if (nextIndex >= deletedEnd) {
        nextIndex += operation.insertCount - operation.deleteCount;
      } else if (nextIndex >= operation.index) {
        const insertedOffset = Math.min(nextIndex - operation.index, Math.max(0, operation.insertCount - 1));
        nextIndex = operation.index + insertedOffset;
      }
    } else if (operation.type === "move") {
      nextIndex = transformMoveIndex2(nextIndex, operation.from, operation.to, operation.count);
    }
  }
  return nextIndex;
}
function collectMaterializedEntries(ctx) {
  const { idCache, indexByKey } = ctx.state;
  const byIndex = /* @__PURE__ */ new Map();
  for (const key of Object.keys(idCache)) {
    const index = Number(key);
    const itemKey = idCache[index];
    if (Number.isInteger(index) && itemKey !== void 0) {
      byIndex.set(index, { index, key: itemKey });
    }
  }
  for (const [itemKey, index] of indexByKey) {
    if (Number.isInteger(index) && !byIndex.has(index)) {
      byIndex.set(index, { index, key: itemKey });
    }
  }
  return byIndex;
}
function collectUpdatedEntries(ctx, operations) {
  let count = 0;
  for (const operation of operations) {
    if (operation.type !== "update") return void 0;
    count += operation.count;
  }
  if (count > ctx.state.indexByKey.size) return void 0;
  const entries = /* @__PURE__ */ new Map();
  for (const operation of operations) {
    if (operation.type !== "update") return void 0;
    for (let index = operation.index; index < operation.index + operation.count; index++) {
      const key = ctx.state.idCache[index];
      if (key === void 0 || ctx.state.indexByKey.get(key) !== index) return void 0;
      const previous = entries.get(index);
      entries.set(index, {
        index,
        invalidateLayout: (previous == null ? void 0 : previous.invalidateLayout) === true || operation.layout === "invalidate",
        key
      });
    }
  }
  return entries;
}
function snapshotMVCPAnchorPositions(ctx) {
  var _a3, _b, _c, _d, _e;
  const state = ctx.state;
  const pendingAnchor = (_a3 = state.pendingNativeMVCPAdjust) == null ? void 0 : _a3.anchor;
  const visibleKeys = (_b = pendingAnchor == null ? void 0 : pendingAnchor.fallbackKeys) != null ? _b : state.idsInView;
  const anchorKeys = new Map(visibleKeys.map((key) => [key, true]));
  if (pendingAnchor && !anchorKeys.has(pendingAnchor.id)) anchorKeys.set(pendingAnchor.id, false);
  if (state.mvcpAnchorLock && !anchorKeys.has(state.mvcpAnchorLock.id)) {
    anchorKeys.set(state.mvcpAnchorLock.id, false);
  }
  if (((_c = state.scrollingTo) == null ? void 0 : _c.index) !== void 0) {
    const scrollTargetKey = (_e = state.idCache[state.scrollingTo.index]) != null ? _e : (_d = Array.from(state.indexByKey).find((entry) => {
      var _a4;
      return entry[1] === ((_a4 = state.scrollingTo) == null ? void 0 : _a4.index);
    })) == null ? void 0 : _d[0];
    if (scrollTargetKey !== void 0 && !anchorKeys.has(scrollTargetKey)) {
      anchorKeys.set(scrollTargetKey, false);
    }
  }
  const positions = /* @__PURE__ */ new Map();
  for (const [key, isVisible] of anchorKeys) {
    const index = state.indexByKey.get(key);
    const offset = getLayoutOffset(ctx, index);
    if (offset !== void 0) {
      positions.set(key, { isVisible, position: offset });
    }
  }
  return positions;
}
function applyOperationToEntries(entries, operation, invalidatedKeys, rerenderKeys, updatedKeys, removedKeys) {
  const nextEntries = /* @__PURE__ */ new Map();
  for (const entry of entries.values()) {
    let nextIndex = entry.index;
    let isRemoved = false;
    if (operation.type === "splice") {
      const deletedEnd = operation.index + operation.deleteCount;
      if (entry.index >= operation.index && entry.index < deletedEnd) {
        isRemoved = true;
      } else if (entry.index >= deletedEnd) {
        nextIndex += operation.insertCount - operation.deleteCount;
      }
    } else if (operation.type === "move") {
      nextIndex = transformMoveIndex2(entry.index, operation.from, operation.to, operation.count);
    } else if (operation.type === "update" && entry.index >= operation.index && entry.index < operation.index + operation.count) {
      rerenderKeys.add(entry.key);
      updatedKeys.add(entry.key);
      if (operation.layout === "invalidate") {
        invalidatedKeys.add(entry.key);
      }
    }
    if (isRemoved) {
      removedKeys.add(entry.key);
    } else {
      if (nextIndex !== entry.index) {
        rerenderKeys.add(entry.key);
      }
      entry.index = nextIndex;
      nextEntries.set(nextIndex, entry);
    }
  }
  return nextEntries;
}
function updateViewabilityState(ctx, source, nextIndexByKey, operations) {
  var _a3, _b, _c, _d, _e, _f, _g;
  const sourceLength = source.getLength();
  const transformViewabilityIndex = (index) => index < 0 || sourceLength === 0 ? -1 : Math.min(sourceLength - 1, Math.max(0, transformDataSourceIndex(index, operations)));
  for (const [configId, viewabilityState] of ctx.mapViewabilityConfigStates) {
    for (const key of (_b = (_a3 = viewabilityState.minimumViewTime) == null ? void 0 : _a3.since.keys()) != null ? _b : []) {
      if (!nextIndexByKey.has(key)) viewabilityState.minimumViewTime.since.delete(key);
    }
    const changed = [];
    const viewableItems = [];
    for (const token of viewabilityState.viewableItems) {
      const index = nextIndexByKey.get(token.key);
      if (index === void 0) {
        const removedToken = { ...token, isViewable: false };
        changed.push(removedToken);
        const callbackKey = token.containerId + configId;
        ctx.mapViewabilityValues.set(callbackKey, removedToken);
        (_c = ctx.mapViewabilityCallbacks.get(callbackKey)) == null ? void 0 : _c(removedToken);
      } else {
        const item = source.getItem(index);
        const nextToken = { ...token, index, item };
        viewableItems.push(nextToken);
        if (index !== token.index || item !== token.item) {
          const callbackKey = token.containerId + configId;
          ctx.mapViewabilityValues.set(callbackKey, nextToken);
          (_d = ctx.mapViewabilityCallbacks.get(callbackKey)) == null ? void 0 : _d(nextToken);
        }
      }
    }
    if (changed.length > 0) {
      const pair = (_e = ctx.state.viewabilityConfigCallbackPairs) == null ? void 0 : _e.find(
        (candidate) => candidate.viewabilityConfig.id === configId
      );
      (_f = pair == null ? void 0 : pair.onViewableItemsChanged) == null ? void 0 : _f.call(pair, {
        changed,
        end: viewabilityState.end,
        endBuffered: viewabilityState.endBuffered,
        start: viewabilityState.start,
        startBuffered: viewabilityState.startBuffered,
        viewableItems
      });
    }
    viewabilityState.viewableItems = viewableItems;
    viewabilityState.start = transformViewabilityIndex(viewabilityState.start);
    viewabilityState.end = transformViewabilityIndex(viewabilityState.end);
    viewabilityState.startBuffered = transformViewabilityIndex(viewabilityState.startBuffered);
    viewabilityState.endBuffered = transformViewabilityIndex(viewabilityState.endBuffered);
  }
  for (const [containerId, token] of ctx.mapViewabilityAmountValues) {
    const index = nextIndexByKey.get(token.key);
    if (index === void 0) {
      const removedToken = { ...token, isViewable: false, sizeVisible: -1 };
      ctx.mapViewabilityAmountValues.set(containerId, removedToken);
      (_g = ctx.mapViewabilityAmountCallbacks.get(containerId)) == null ? void 0 : _g(removedToken);
    } else if (index !== token.index || source.getItem(index) !== token.item) {
      ctx.mapViewabilityAmountValues.delete(containerId);
    }
  }
}
function applyDataSourceMutationBatches(ctx, source, batches) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w;
  const state = ctx.state;
  const operations = batches.flatMap((batch) => batch.operations);
  const explicitReset = operations.some((operation) => operation.type === "reset");
  if (explicitReset) {
    return { applied: false, materializedCount: 0, resetReason: "the data source requested a reset" };
  }
  const updatedEntries = collectUpdatedEntries(ctx, operations);
  const isUpdateOnly = updatedEntries !== void 0;
  let entries = updatedEntries != null ? updatedEntries : collectMaterializedEntries(ctx);
  const anchorPositions = (_a3 = state.dataSourceAnchorPositions) != null ? _a3 : snapshotMVCPAnchorPositions(ctx);
  const invalidatedKeys = /* @__PURE__ */ new Set();
  const removedKeys = /* @__PURE__ */ new Set();
  const rerenderKeys = /* @__PURE__ */ new Set();
  const updatedKeys = /* @__PURE__ */ new Set();
  if (updatedEntries) {
    for (const entry of updatedEntries.values()) {
      rerenderKeys.add(entry.key);
      updatedKeys.add(entry.key);
      if (entry.invalidateLayout) invalidatedKeys.add(entry.key);
    }
  } else {
    for (const operation of operations) {
      entries = applyOperationToEntries(
        entries,
        operation,
        invalidatedKeys,
        rerenderKeys,
        updatedKeys,
        removedKeys
      );
    }
  }
  let resetReason;
  const nextIndexByKey = isUpdateOnly ? state.indexByKey : /* @__PURE__ */ new Map();
  try {
    for (const entry of entries.values()) {
      const finalKey = source.getKey(entry.index);
      if (finalKey !== entry.key) {
        resetReason = `materialized key ${entry.key} changed at index ${entry.index}`;
        break;
      }
      if (!isUpdateOnly && nextIndexByKey.has(entry.key)) {
        resetReason = `materialized key ${entry.key} is duplicated`;
        break;
      }
      if (!isUpdateOnly) nextIndexByKey.set(entry.key, entry.index);
    }
  } catch (error) {
    resetReason = `reading a materialized key failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (resetReason) {
    return { applied: false, materializedCount: entries.size, resetReason };
  }
  const layoutStore = (_b = state.layoutStoreRuntime) == null ? void 0 : _b.store;
  const retainedInvalidationSizes = /* @__PURE__ */ new Map();
  for (const key of invalidatedKeys) {
    const runtime = state.layoutStoreRuntime;
    const cachedSize = state.sizes.get(key);
    const knownSize = state.sizesKnown.get(key);
    const index = state.indexByKey.get(key);
    const consumed = layoutStore instanceof PrefixLayoutStore && layoutStore.hasIndex(index) && layoutStore.isSizePredictionConsumed(index);
    const retainCached = cachedSize !== void 0 && (!state.didFinishInitialScroll || !(runtime == null ? void 0 : runtime.didFlushInitialEstimate) || runtime.retainedInvalidationHints.get(key) === cachedSize || ((_d = (_c = state.measurementAverageSamples) == null ? void 0 : _c.get(key)) == null ? void 0 : _d.size) === cachedSize || ((_e = state.fixedItemSizeKeys) == null ? void 0 : _e.has(key)) || consumed);
    const previousSize = knownSize != null ? knownSize : retainCached ? cachedSize : void 0;
    if (previousSize !== void 0) {
      retainedInvalidationSizes.set(key, previousSize);
      runtime == null ? void 0 : runtime.retainedInvalidationHints.set(key, previousSize);
    }
  }
  if (layoutStore) {
    for (const operation of operations) {
      if (operation.type === "splice") {
        layoutStore.splice(operation.index, operation.deleteCount, operation.insertCount);
      } else if (operation.type === "move") {
        layoutStore.move(operation.from, operation.to, operation.count);
      } else if (operation.type === "update" && operation.layout === "invalidate") {
        layoutStore.invalidateRange(operation.index, operation.count);
      }
    }
  }
  if (operations.some(({ type }) => type === "splice") && ((_f = state.layoutStoreRuntime) == null ? void 0 : _f.didFlushInitialEstimate)) {
    state.layoutStoreRuntime.pendingEstimateMeasurements = 0;
    state.scheduledWork.cancel("layoutStoreEstimateFlush");
  }
  if (state.props.overrideItemLayout && state.props.numColumns > 1) {
    const runtime = state.layoutStoreRuntime;
    let spanInvalidationIndex = state.dataSourceSpanInvalidationIndex;
    let pendingUpdates = runtime == null ? void 0 : runtime.pendingRowSpanUpdates;
    let canBoundUpdates = isBoundedSourceSpanUpdateEnabled() && (spanInvalidationIndex === void 0 || !!pendingUpdates);
    for (const operation of operations) {
      let operationIndex;
      if (operation.type === "splice") {
        operationIndex = operation.index;
        canBoundUpdates = false;
      } else if (operation.type === "move") {
        operationIndex = Math.min(operation.from, operation.to);
        canBoundUpdates = false;
      } else if (operation.type === "update" && operation.layout === "invalidate") {
        operationIndex = operation.index;
        if (canBoundUpdates) {
          pendingUpdates != null ? pendingUpdates : pendingUpdates = /* @__PURE__ */ new Set();
          for (let index = operation.index; index < operation.index + operation.count; index++) {
            pendingUpdates.add(index);
          }
        }
      }
      if (operationIndex !== void 0) {
        spanInvalidationIndex = Math.min(spanInvalidationIndex != null ? spanInvalidationIndex : operationIndex, operationIndex);
      }
    }
    state.dataSourceSpanInvalidationIndex = spanInvalidationIndex;
    if (runtime) {
      runtime.pendingRowSpanUpdates = canBoundUpdates ? pendingUpdates : void 0;
      runtime.transformCachedRowSpans(operations);
    }
  }
  (_g = state.dataSourceAnchorPositions) != null ? _g : state.dataSourceAnchorPositions = anchorPositions;
  if (!isUpdateOnly) {
    state.idCache.length = 0;
    state.indexByKey.clear();
    for (const entry of entries.values()) {
      state.idCache[entry.index] = entry.key;
      state.indexByKey.set(entry.key, entry.index);
    }
  }
  for (const key of removedKeys) {
    (_h = state.measurementAverageSamples) == null ? void 0 : _h.delete(key);
    (_i = state.layoutStoreRuntime) == null ? void 0 : _i.retainedInvalidationHints.delete(key);
    state.sizes.delete(key);
    state.sizesKnown.delete(key);
    const containerId = state.containerItemKeys.get(key);
    if (containerId !== void 0) {
      state.containerItemGenerations[containerId] = ((_j = state.containerItemGenerations[containerId]) != null ? _j : 0) + 1;
      (_k = ctx.containerLayoutTriggers.get(containerId)) == null ? void 0 : _k();
    }
    (_l = state.userScrollAnchorReset) == null ? void 0 : _l.keys.delete(key);
    (_n = (_m = state.layoutStoreRuntime) == null ? void 0 : _m.positionListenerOffsets) == null ? void 0 : _n.delete(key);
    notifyPosition$(ctx, key, void 0);
  }
  if (layoutStore) {
    function* insertedIndices() {
      var _a4;
      let remaining = Math.max(1, (_a4 = peek$(ctx, "numContainers")) != null ? _a4 : 0);
      for (let operationIndex = 0; operationIndex < operations.length; operationIndex++) {
        const operation = operations[operationIndex];
        if (operation.type !== "splice") continue;
        const subsequent = operations.slice(operationIndex + 1);
        for (const index of getInsertedBoundaryIndices(operation.index, operation.insertCount)) {
          if (remaining-- <= 0) return;
          let current = index;
          let removed = false;
          for (const next of subsequent) {
            if (next.type === "splice" && current >= next.index && current < next.index + next.deleteCount) {
              removed = true;
              break;
            }
            current = transformDataSourceIndex(current, [next]);
          }
          if (!removed) yield current;
        }
      }
    }
    for (const entry of cacheStructuralSizeEstimates(ctx, insertedIndices())) {
      layoutStore.setCachedSize(entry.index, entry.size);
    }
  }
  for (const key of invalidatedKeys) {
    const runtime = state.layoutStoreRuntime;
    if ((runtime == null ? void 0 : runtime.didSealInitialPredictions) && state.sizesKnown.has(key)) {
      runtime.didSealInitialPredictions = false;
      runtime.pendingEstimateMeasurements = 0;
    }
    const previousSize = retainedInvalidationSizes.get(key);
    const index = nextIndexByKey.get(key);
    if (previousSize !== void 0 && index !== void 0 && (layoutStore == null ? void 0 : layoutStore.hasIndex(index))) {
      state.sizes.set(key, previousSize);
      layoutStore.setCachedSize(index, previousSize);
    } else {
      state.sizes.delete(key);
    }
    state.sizesKnown.delete(key);
    if (index !== void 0) {
      (_o = state.staleSizeKeys) != null ? _o : state.staleSizeKeys = /* @__PURE__ */ new Set();
      state.staleSizeKeys.add(key);
    }
  }
  for (const key of rerenderKeys) {
    const containerId = state.containerItemKeys.get(key);
    const index = nextIndexByKey.get(key);
    if (containerId !== void 0 && index !== void 0) {
      const item = source.getItem(index);
      const invalidate = invalidatedKeys.has(key);
      if (invalidate) {
        state.containerItemGenerations[containerId] = ((_p = state.containerItemGenerations[containerId]) != null ? _p : 0) + 1;
        state.containerItemMetadata.delete(containerId);
      }
      updateContainerItemMetadata(state, containerId, index, item);
      (_q = state.pendingDataSourceRerenders) != null ? _q : state.pendingDataSourceRerenders = /* @__PURE__ */ new Map();
      const change = invalidate ? 2 : updatedKeys.has(key) ? 1 : 0;
      const previous = (_r = state.pendingDataSourceRerenders.get(key)) != null ? _r : 0;
      state.pendingDataSourceRerenders.set(key, change > previous ? change : previous);
    }
  }
  updateViewabilityState(ctx, source, nextIndexByKey, operations);
  state.idsInView = state.idsInView.filter((key) => nextIndexByKey.has(key));
  if (state.lastFirstVisibleItemCallback) {
    const index = nextIndexByKey.get(state.lastFirstVisibleItemCallback.key);
    state.lastFirstVisibleItemCallback = index === void 0 ? void 0 : { ...state.lastFirstVisibleItemCallback, index };
  }
  const finalLength = (_t = (_s = batches.at(-1)) == null ? void 0 : _s.length) != null ? _t : source.getLength();
  const transformClampedIndex = (index) => finalLength > 0 ? Math.min(finalLength - 1, Math.max(0, transformDataSourceIndex(index, operations))) : 0;
  const activeStickyIndex = peek$(ctx, "activeStickyIndex");
  if (activeStickyIndex >= 0) {
    set$(ctx, "activeStickyIndex", finalLength > 0 ? transformClampedIndex(activeStickyIndex) : -1);
  }
  if (((_u = state.scrollingTo) == null ? void 0 : _u.index) !== void 0) {
    state.scrollingTo.index = transformClampedIndex(state.scrollingTo.index);
  }
  if (state.scrollTargetPinnedRange && operations.some(({ type }) => type === "move" || type === "splice")) {
    state.scrollTargetPinnedRange = void 0;
    const target = state.scrollingTo;
    if (target && layoutStore && finalLength > 0) {
      const index = target.isScrollToEnd ? finalLength - 1 : target.index;
      const offset = index === void 0 ? target.offset : calculateOffsetWithOffsetPosition(ctx, layoutStore.getOffset(index), { ...target, index });
      const start = Math.max(0, getItemSpaceOffset(ctx, offset));
      state.scrollTargetPinnedRange = layoutStore.findIndexRangeAtOffsets(start, start + state.scrollLength);
    }
  }
  if (((_v = state.initialScroll) == null ? void 0 : _v.index) !== void 0) {
    state.initialScroll.index = transformClampedIndex(state.initialScroll.index);
  }
  const bootstrap = (_w = state.initialScroll) == null ? void 0 : _w.bootstrap;
  if ((bootstrap == null ? void 0 : bootstrap.targetIndexSeed) !== void 0) {
    bootstrap.targetIndexSeed = transformClampedIndex(bootstrap.targetIndexSeed);
  }
  if (bootstrap == null ? void 0 : bootstrap.visibleIndices) {
    bootstrap.visibleIndices = bootstrap.visibleIndices.map(transformClampedIndex);
  }
  state.startBuffered = finalLength > 0 ? transformClampedIndex(state.startBuffered) : -1;
  state.endBuffered = finalLength > 0 ? transformClampedIndex(state.endBuffered) : -1;
  state.startNoBuffer = state.startNoBuffer === null || finalLength === 0 ? null : transformClampedIndex(state.startNoBuffer);
  state.endNoBuffer = state.endNoBuffer === null || finalLength === 0 ? null : transformClampedIndex(state.endNoBuffer);
  state.firstFullyOnScreenIndex = state.firstFullyOnScreenIndex === void 0 ? void 0 : transformClampedIndex(state.firstFullyOnScreenIndex);
  state.scrollForNextCalculateItemsInView = void 0;
  return { applied: true, materializedCount: isUpdateOnly ? state.indexByKey.size : entries.size };
}
function flushDataSourceRerenders(ctx) {
  var _a3, _b;
  const state = ctx.state;
  const pending = state.pendingDataSourceRerenders;
  const source = state.props.dataSource;
  if (!pending) return;
  state.pendingDataSourceRerenders = void 0;
  if (!source) return;
  for (const [key, change] of pending) {
    const containerId = state.containerItemKeys.get(key);
    const index = state.indexByKey.get(key);
    if (containerId === void 0 || index === void 0) continue;
    set$(ctx, `containerItemIndex${containerId}`, index);
    if (change === 0) continue;
    set$(ctx, `containerItemData${containerId}`, source.getItem(index));
    const versionKey = `containerDataVersion${containerId}`;
    set$(ctx, versionKey, ((_a3 = peek$(ctx, versionKey)) != null ? _a3 : 0) + 1);
    if (change === 2) {
      (_b = ctx.containerLayoutTriggers.get(containerId)) == null ? void 0 : _b();
    }
  }
}

// src/core/DataSourceObserver.ts
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}
function validateOperation(operation, length) {
  let reason;
  if (operation.type === "splice") {
    if (!isNonNegativeInteger(operation.index) || !isNonNegativeInteger(operation.deleteCount) || !isNonNegativeInteger(operation.insertCount) || operation.index > length || operation.index + operation.deleteCount > length) {
      reason = "splice range is invalid";
    }
  } else if (operation.type === "move") {
    if (!isNonNegativeInteger(operation.from) || !isNonNegativeInteger(operation.to) || !isNonNegativeInteger(operation.count) || operation.from + operation.count > length || operation.to > length - operation.count) {
      reason = "move range is invalid";
    }
  } else if (operation.type === "update") {
    if (!isNonNegativeInteger(operation.index) || !isNonNegativeInteger(operation.count) || operation.index + operation.count > length) {
      reason = "update range is invalid";
    }
  }
  return reason;
}
function validateDataSourceMutationBatch(source, batch, expectedRevision, expectedLength) {
  let reason;
  let nextLength = expectedLength;
  if (batch.previousRevision !== expectedRevision || batch.revision <= batch.previousRevision) {
    reason = "revision sequence is invalid";
  } else if (batch.previousLength !== expectedLength) {
    reason = "previous length does not match the observed source";
  } else if (!isNonNegativeInteger(batch.length)) {
    reason = "next length is invalid";
  } else if (source.getRevision() !== batch.revision || source.getLength() !== batch.length) {
    reason = "batch does not match the readable source state";
  } else {
    const hasReset = batch.operations.some((operation) => operation.type === "reset");
    if (hasReset) {
      if (batch.operations.length !== 1) {
        reason = "reset must be the only operation in a batch";
      } else {
        nextLength = batch.length;
      }
    } else {
      for (const operation of batch.operations) {
        reason = validateOperation(operation, nextLength);
        if (reason) break;
        if (operation.type === "splice") {
          nextLength = nextLength - operation.deleteCount + operation.insertCount;
        }
      }
      if (!reason && nextLength !== batch.length) {
        reason = "operation lengths do not produce the declared next length";
      }
    }
  }
  return reason;
}
var DataSourceObserver = class {
  constructor(source, callbacks, snapshot) {
    this.source = source;
    this.callbacks = callbacks;
    var _a3, _b;
    this.length = (_a3 = snapshot == null ? void 0 : snapshot.length) != null ? _a3 : source.getLength();
    this.revision = (_b = snapshot == null ? void 0 : snapshot.revision) != null ? _b : source.getRevision();
  }
  start() {
    if (!this.unsubscribe) {
      this.unsubscribe = this.source.subscribe((batch) => {
        const reason = validateDataSourceMutationBatch(this.source, batch, this.revision, this.length);
        this.length = this.source.getLength();
        this.revision = this.source.getRevision();
        if (reason) {
          this.callbacks.onReset({ batch, reason });
        } else {
          this.callbacks.onBatch(batch);
        }
      });
      const currentLength = this.source.getLength();
      const currentRevision = this.source.getRevision();
      if (currentLength !== this.length || currentRevision !== this.revision) {
        const batch = {
          length: currentLength,
          operations: [{ type: "reset" }],
          previousLength: this.length,
          previousRevision: this.revision,
          revision: currentRevision
        };
        this.length = currentLength;
        this.revision = currentRevision;
        this.callbacks.onReset({
          batch,
          reason: "source changed before its subscription became active"
        });
      }
    }
    return () => this.stop();
  }
  stop() {
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = void 0;
    unsubscribe == null ? void 0 : unsubscribe();
  }
};

// src/core/doInitialAllocateContainers.ts
function doInitialAllocateContainers(ctx) {
  var _a3;
  const state = ctx.state;
  const {
    scrollLength,
    props: { getFixedItemSize, numColumns, estimatedItemSize }
  } = state;
  const dataLength = getDataLength(state);
  const drawDistance = getEffectiveDrawDistance(ctx);
  const hasContainers = peek$(ctx, "numContainers");
  if (scrollLength > 0 && dataLength > 0 && !hasContainers) {
    let averageItemSize;
    if (getFixedItemSize) {
      let totalSize = 0;
      const num = Math.min(20, dataLength);
      for (let i = 0; i < num; i++) {
        const item = getDataItem(state, i);
        totalSize += (_a3 = item !== void 0 ? getFixedItemLayoutSize(ctx, i, item) : void 0) != null ? _a3 : estimatedItemSize + ctx.scrollAxisGap;
      }
      averageItemSize = totalSize / num;
    } else {
      averageItemSize = estimatedItemSize + ctx.scrollAxisGap;
    }
    if (!(averageItemSize > 0)) {
      averageItemSize = (estimatedItemSize > 0 ? estimatedItemSize : 100) + ctx.scrollAxisGap;
    }
    const numContainers = Math.max(
      1,
      Math.ceil((scrollLength + drawDistance * 2) / averageItemSize * numColumns)
    );
    for (let i = 0; i < numContainers; i++) {
      set$(ctx, `containerPosition${i}`, POSITION_OUT_OF_VIEW);
      set$(ctx, `containerColumn${i}`, -1);
      set$(ctx, `containerSpan${i}`, 1);
    }
    set$(ctx, "numContainers", numContainers);
    set$(ctx, "numContainersPooled", getInitialContainerPoolSize(dataLength, numContainers));
    if (!IsNewArchitecture || state.lastLayout || state.hasEstimatedInitialLayout) {
      if (state.initialScroll && !state.hasEstimatedInitialLayout) {
        requestAnimationFrame(() => {
          calculateItemsInView(ctx, { initialLayout: true });
        });
      } else {
        calculateItemsInView(ctx, {
          ...(state.didDataChange || state.didColumnsChange) && { dataChanged: true },
          initialLayout: true
        });
      }
    }
    return true;
  }
}

// src/core/scrollToIndex.ts
function scrollToIndex(ctx, {
  index,
  key,
  viewOffset = 0,
  animated = true,
  forceScroll,
  isInitialScroll,
  clampToContentContainerMinSize,
  viewPosition,
  viewPositionFallback
}) {
  var _a3;
  const state = ctx.state;
  const dataLength = getDataLength(state);
  index = clampScrollIndex(index, dataLength);
  const store = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  if (Platform.OS === "web" && state.didContainersLayout && state.didFinishInitialScroll && state.props.getItemType && !state.props.getFixedItemSize && (store == null ? void 0 : store.hasIndex(index))) {
    const offset = store.getOffset(index);
    const buffer = state.props.drawDistance * 1.5;
    const range = store.findIndexRangeAtOffsets(offset - buffer, offset + state.scrollLength + buffer);
    const budget = Math.max(1, peek$(ctx, "numContainers") || 0);
    if (range) {
      materializeLayoutStoreRange(
        ctx,
        Math.max(0, range.start - 1, index - budget),
        Math.min(store.length - 1, range.end, index + budget)
      );
    }
  }
  const itemSize = getItemSizeAtIndex(ctx, index);
  if (materializeFixedLayoutStoreIndex(ctx, index)) {
    syncLayoutStoreState(ctx);
  }
  const firstIndexOffset = calculateOffsetForIndex(ctx, index);
  const isLast = index === dataLength - 1;
  if (isLast && viewPosition === void 0) {
    viewPosition = 1;
  }
  state.scrollForNextCalculateItemsInView = void 0;
  scrollTo(ctx, {
    animated,
    clampToContentContainerMinSize,
    forceScroll,
    index,
    isInitialScroll,
    itemSize,
    key,
    offset: firstIndexOffset,
    viewOffset,
    viewPosition: viewPosition != null ? viewPosition : 0,
    viewPositionFallback
  });
}
function getWindowSize() {
  const screenSize = Dimensions.get("window");
  return {
    height: screenSize.height,
    width: screenSize.width
  };
}

// src/core/handleLayout.ts
function handleLayout(ctx, layoutParam, setCanRender) {
  markLayoutChanged(ctx);
  const state = ctx.state;
  invalidateHorizontalRTLScrollType(state);
  const { maintainScrollAtEnd, useWindowScroll } = state.props;
  const scrollAxis = state.props.horizontal ? "width" : "height";
  const otherAxis = state.props.horizontal ? "height" : "width";
  let layout = layoutParam;
  if (useWindowScroll) {
    const windowScrollAxisLength = getWindowSize()[scrollAxis];
    layout = windowScrollAxisLength > 0 ? { ...layoutParam, [scrollAxis]: windowScrollAxisLength } : layoutParam;
  }
  const measuredLength = layout[scrollAxis];
  const hadEstimatedInitialLayout = state.hasEstimatedInitialLayout;
  if (hadEstimatedInitialLayout && !(measuredLength > 0)) {
    return;
  }
  const previousLength = state.scrollLength;
  const scrollLength = measuredLength > 0 ? measuredLength : previousLength;
  const otherAxisSize = layout[otherAxis];
  const needsCalculate = !state.lastLayout || scrollLength > state.scrollLength || state.lastLayout.x !== layout.x || state.lastLayout.y !== layout.y;
  state.lastLayout = layout;
  if (hadEstimatedInitialLayout) state.hasEstimatedInitialLayout = false;
  const prevOtherAxisSize = state.otherAxisSize;
  const didChange = scrollLength !== state.scrollLength || otherAxisSize !== prevOtherAxisSize;
  if (didChange || hadEstimatedInitialLayout) {
    state.scrollLength = scrollLength;
    state.otherAxisSize = otherAxisSize;
    updateContentMetricsState(ctx);
    state.lastBatchingAction = Date.now();
    state.scrollForNextCalculateItemsInView = void 0;
    const didAllocate = scrollLength > 0 && doInitialAllocateContainers(ctx);
    if (needsCalculate && (!didAllocate || state.initialScroll)) {
      calculateItemsInView(ctx, {
        didMeasureEstimatedLayout: hadEstimatedInitialLayout,
        doMVCP: true,
        mvcpAdjustmentSource: "layout"
      });
    }
    const scrollTarget = state.scrollingTo;
    if (scrollLength !== previousLength && (scrollTarget == null ? void 0 : scrollTarget.viewPositionFallback) && !scrollTarget.isInitialScroll && scrollTarget.index !== void 0) {
      scrollToIndex(ctx, { ...scrollTarget, forceScroll: true, index: scrollTarget.index });
    }
    if (didChange || otherAxisSize !== prevOtherAxisSize) {
      set$(ctx, "scrollSize", { height: layout.height, width: layout.width });
    }
    if (maintainScrollAtEnd == null ? void 0 : maintainScrollAtEnd.onLayout) {
      doMaintainScrollAtEnd(ctx, { immediate: true });
    }
    checkThresholds(ctx);
    if (state) {
      const crossAxisPadding = state.props.horizontal ? (state.props.stylePaddingTop || 0) + (state.props.stylePaddingBottom || 0) : (state.props.stylePaddingLeft || 0) + (state.props.stylePaddingRight || 0);
      state.needsOtherAxisSize = otherAxisSize - crossAxisPadding < 10;
    }
    if (IS_DEV && measuredLength === 0) {
      warnDevOnce(
        "height0",
        `List ${state.props.horizontal ? "width" : "height"} is 0. You may need to set a style or \`flex: \` for the list, because children are absolutely positioned.`
      );
    }
  }
  setCanRender(true);
}

// src/core/itemSizeCache.ts
var MAX_CACHED_ITEM_SIZES = 1e3;
var itemSizesByOwner = /* @__PURE__ */ new WeakMap();
var itemSizesByContext = /* @__PURE__ */ new WeakMap();
function getInputs(ctx) {
  const { props } = ctx.state;
  return [
    props.dataKey,
    props.dataVersion,
    props.horizontal,
    props.numColumns,
    props.overrideItemLayout,
    ctx.scrollAxisGap,
    props.stylePaddingTop,
    props.stylePaddingBottom,
    props.stylePaddingLeft,
    props.stylePaddingRight
  ];
}
function restoreItemSizeEstimates(ctx, crossAxisSize, owner, cacheContext = ctx) {
  var _a3, _b, _c;
  if (owner === void 0 || ctx.state.props.numColumns > 1) return;
  const sourceOwner = (_a3 = ctx.state.props.dataSource) != null ? _a3 : ctx.state.props.data;
  const cached = (_c = (_b = itemSizesByOwner.get(owner)) != null ? _b : itemSizesByOwner.get(sourceOwner)) != null ? _c : itemSizesByContext.get(cacheContext);
  if (!cached) return;
  afterLayout(ctx, (committedCtx) => {
    itemSizesByContext.set(committedCtx, cached);
    itemSizesByOwner.set(sourceOwner, cached);
  });
  if (crossAxisSize === void 0) return;
  const inputs = getInputs(ctx);
  const { state } = ctx;
  let shiftedIndices;
  for (const [key, entry] of cached) {
    if (entry.crossAxisSize === crossAxisSize && inputs.every((input, i) => Object.is(input, entry.inputs[i]))) {
      let index = entry.index < getDataLength(state) && getDataKey(state, entry.index) === key ? entry.index : void 0;
      if (index === void 0 && !state.props.dataSource) {
        if (!shiftedIndices) {
          shiftedIndices = /* @__PURE__ */ new Map();
          for (let candidate = 0; candidate < getDataLength(state); candidate++) {
            const candidateKey = getDataKey(state, candidate);
            if (cached.has(candidateKey)) shiftedIndices.set(candidateKey, candidate);
          }
        }
        index = shiftedIndices.get(key);
      }
      if (index !== void 0 && (!!state.props.dataSource || state.props.hasReliableKeyExtractor || state.props.data[index] === entry.item) && entry.isLast === (index === getDataLength(state) - 1)) {
        if (!state.sizesKnown.has(key)) state.sizes.set(key, entry.size);
        const previousKey = state.idCache[index];
        const isMeasuredSlot = previousKey !== void 0 && state.sizesKnown.has(previousKey);
        if (!state.indexByKey.has(key) && !isMeasuredSlot) {
          state.idCache[index] = key;
          state.indexByKey.set(key, index);
        }
      }
    }
  }
}
function clearItemSizeEstimates(ctx) {
  var _a3, _b, _c;
  (_c = (_b = itemSizesByContext.get(ctx)) != null ? _b : itemSizesByOwner.get((_a3 = ctx.state.props.dataSource) != null ? _a3 : ctx.state.props.data)) == null ? void 0 : _c.clear();
}
function saveItemSizeEstimates(ctx, owner) {
  var _a3, _b, _c, _d;
  const { state } = ctx;
  if (owner === void 0 || state.props.numColumns > 1 || !state.sizesKnown.size) return;
  const sourceOwner = (_a3 = state.props.dataSource) != null ? _a3 : state.props.data;
  let cached = (_b = itemSizesByOwner.get(owner)) != null ? _b : itemSizesByOwner.get(sourceOwner);
  if (!cached) {
    cached = /* @__PURE__ */ new Map();
  }
  itemSizesByOwner.set(owner, cached);
  itemSizesByOwner.set(sourceOwner, cached);
  itemSizesByContext.set(ctx, cached);
  const crossAxisSize = (_c = state.lastLayout) == null ? void 0 : _c[state.props.horizontal ? "height" : "width"];
  const inputs = getInputs(ctx);
  for (const [key, size] of state.sizesKnown) {
    const index = state.indexByKey.get(key);
    if (index !== void 0 && !((_d = state.fixedItemSizeKeys) == null ? void 0 : _d.has(key)) && index < getDataLength(state) && getDataKey(state, index) === key) {
      cached.delete(key);
      cached.set(key, {
        crossAxisSize,
        index,
        inputs,
        isLast: index === getDataLength(state) - 1,
        item: state.props.dataSource ? void 0 : state.props.data[index],
        size
      });
    }
  }
  while (cached.size > MAX_CACHED_ITEM_SIZES) cached.delete(cached.keys().next().value);
}

// src/core/ScheduledWork.ts
var ScheduledWork = class {
  constructor() {
    this.work = /* @__PURE__ */ new Map();
  }
  microtask(callback, key) {
    const pendingWork = this.work.get(key);
    if (pendingWork == null ? void 0 : pendingWork.callback) {
      pendingWork.callback = callback;
    } else {
      this.cancel(key);
      const work = { callback, cancel: () => {
      } };
      this.work.set(key, work);
      queueMicrotask(() => {
        var _a3;
        if (this.work.get(key) === work) {
          this.work.delete(key);
          (_a3 = work.callback) == null ? void 0 : _a3.call(work);
        }
      });
    }
  }
  timeout(callback, delay, key) {
    if (key) {
      this.cancel(key);
    }
    const work = { cancel: () => clearTimeout(handle) };
    const handle = setTimeout(() => {
      const workKey = key != null ? key : handle;
      if (this.work.get(workKey) === work) {
        this.work.delete(workKey);
        callback();
      }
    }, delay);
    this.work.set(key != null ? key : handle, work);
  }
  frame(callback, key) {
    this.cancel(key);
    const work = { cancel: () => cancelAnimationFrame(handle) };
    this.work.set(key, work);
    const handle = requestAnimationFrame(() => {
      if (this.work.get(key) === work) {
        this.work.delete(key);
        callback();
      }
    });
  }
  register(key, cancel) {
    this.cancel(key);
    this.work.set(key, { cancel });
  }
  cancel(key) {
    const work = this.work.get(key);
    if (work) {
      this.work.delete(key);
      work.cancel();
    }
  }
  has(key) {
    return this.work.has(key);
  }
  dispose() {
    for (const work of this.work.values()) {
      work.cancel();
    }
    this.work.clear();
  }
};

// src/core/WebScrollAdjustments.ts
var NATIVE_SCROLL_IDLE_MS = 80;
var WebScrollAdjustments = class {
  constructor(ctx, apply) {
    this.ctx = ctx;
    this.apply = apply;
  }
  begin(observedEnd, input, destination) {
    var _a3, _b, _c, _d, _e;
    if (this.interval) {
      if (input && this.interval.input !== input && getObservedScrollOffset(this.ctx) === 0)
        this.interval.credit = 0;
      if (input || ((_a3 = this.ctx.state.scrollingTo) == null ? void 0 : _a3.ownerPhase)) {
        this.interval.input = input;
        this.interval.destination = destination;
      }
      return;
    }
    const { state } = this.ctx;
    const scroller = state.refScroller.current;
    if (((_b = scroller == null ? void 0 : scroller.isScrollInRange) == null ? void 0 : _b.call(scroller)) === false) return;
    const target = (_e = (_c = scroller == null ? void 0 : scroller.getScrollEventTarget) == null ? void 0 : _c.call(scroller)) != null ? _e : (_d = scroller == null ? void 0 : scroller.getScrollableNode) == null ? void 0 : _d.call(scroller);
    if (!target || !("addEventListener" in target)) return;
    let idle;
    let frame;
    const interval = {
      cancel: () => {
        clearTimeout(idle);
        if (frame !== void 0) cancelAnimationFrame(frame);
        target == null ? void 0 : target.removeEventListener("scroll", onScroll2);
        target == null ? void 0 : target.removeEventListener("scrollend", onScrollEnd);
        if (this.interval === interval) {
          this.interval = void 0;
        }
      },
      credit: 0,
      destination,
      endOffset: observedEnd,
      input,
      revision: 0
    };
    const resolve = () => {
      var _a4, _b2;
      const offset = getObservedScrollOffset(this.ctx);
      const credit = interval.credit;
      state.scheduledWork.cancel("nativeScrollAdjustment");
      const owner = state.scrollingTo;
      if (!owner && !state.pendingScrollResolve) state.scroll = offset;
      if (!owner && !state.pendingScrollResolve && offset > 0) {
        const max = (_b2 = (_a4 = state.refScroller.current) == null ? void 0 : _a4.getMaxScrollOffset) == null ? void 0 : _b2.call(_a4);
        if (max === void 0 || offset < max) {
          this.apply(
            credit !== 0 && offset === interval.endOffset && max !== void 0 ? max - offset : credit
          );
        }
      }
    };
    const settle = () => {
      if (frame !== void 0) cancelAnimationFrame(frame);
      const offset = getObservedScrollOffset(this.ctx);
      const epoch = state.layoutAdjustmentEpoch;
      const revision = interval.revision;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (offset !== getObservedScrollOffset(this.ctx) || epoch !== state.layoutAdjustmentEpoch || revision !== interval.revision) {
            settle();
            return;
          }
          resolve();
        });
      });
    };
    const onScroll2 = () => {
      clearTimeout(idle);
      if (frame !== void 0) cancelAnimationFrame(frame);
      idle = setTimeout(settle, NATIVE_SCROLL_IDLE_MS);
    };
    const onScrollEnd = () => {
      const isWheelArrival = interval.input === "wheel" && interval.destination !== void 0 && Math.abs(getObservedScrollOffset(this.ctx) - interval.destination) <= EDGE_POSITION_EPSILON;
      if (isWheelArrival) resolve();
      else {
        onScroll2();
        settle();
      }
    };
    this.interval = interval;
    target == null ? void 0 : target.addEventListener("scroll", onScroll2);
    target == null ? void 0 : target.addEventListener("scrollend", onScrollEnd);
    state.scheduledWork.register("nativeScrollAdjustment", interval.cancel);
    onScroll2();
  }
  beginWheel(delta) {
    var _a3, _b, _c, _d, _e;
    const observed = getObservedScrollOffset(this.ctx);
    const from = ((_a3 = this.interval) == null ? void 0 : _a3.input) === "wheel" ? (_b = this.interval.destination) != null ? _b : observed : observed;
    const max = (_e = (_d = (_c = this.ctx.state.refScroller.current) == null ? void 0 : _c.getMaxScrollOffset) == null ? void 0 : _d.call(_c)) != null ? _e : Number.POSITIVE_INFINITY;
    const destination = Math.max(0, Math.min(from + delta, max));
    if (destination !== observed || this.interval) this.begin(void 0, "wheel", destination);
  }
  cancel() {
    this.ctx.state.scheduledWork.cancel("nativeScrollAdjustment");
  }
  observeEnd(offset, rangeEnd) {
    const interval = this.interval;
    if (interval && offset === rangeEnd) interval.endOffset = offset;
    else if ((interval == null ? void 0 : interval.endOffset) !== void 0 && offset !== interval.endOffset) {
      interval.endOffset = offset === rangeEnd ? offset : void 0;
    }
  }
  observe(offset, rangeEnd) {
    var _a3, _b;
    this.observeEnd(offset, rangeEnd);
    const { state } = this.ctx;
    if (state.scrollingTo && !state.scrollingTo.ownerPhase || ((_b = (_a3 = state.refScroller.current) == null ? void 0 : _a3.isScrollInRange) == null ? void 0 : _b.call(_a3)) === false) {
      this.cancel();
    } else if (state.didFinishInitialScroll && offset > 0 && offset < (rangeEnd != null ? rangeEnd : Number.POSITIVE_INFINITY) && offset !== Math.max(0, Math.min(state.scroll, rangeEnd != null ? rangeEnd : Number.POSITIVE_INFINITY))) {
      this.begin(offset === rangeEnd ? offset : void 0);
    }
  }
  defer(credit) {
    var _a3, _b, _c, _d, _e;
    const { state } = this.ctx;
    if (((_b = (_a3 = state.refScroller.current) == null ? void 0 : _a3.isScrollInRange) == null ? void 0 : _b.call(_a3)) === false) {
      this.cancel();
      return false;
    }
    if ((_c = state.scrollingTo) == null ? void 0 : _c.ownerPhase) this.begin();
    else if (state.scrollingTo) state.scheduledWork.cancel("nativeScrollAdjustment");
    if (!this.interval) return false;
    const observed = getObservedScrollOffset(this.ctx);
    this.observeEnd(observed, (_e = (_d = state.refScroller.current) == null ? void 0 : _d.getMaxScrollOffset) == null ? void 0 : _e.call(_d));
    this.interval.credit += credit;
    this.interval.revision++;
    state.scrollForNextCalculateItemsInView = void 0;
    return true;
  }
};

// src/core/ScrollAdjustHandler.ts
var NATIVE_REMAINDER_ECHO_EPSILON = 0.01;
function doesPlatformAdjustBreakScroll() {
  return PlatformAdjustBreaksScroll || Platform.OS === "macos";
}
var ScrollAdjustHandler = class {
  constructor(ctx) {
    this.appliedAdjust = 0;
    /** Model shift native has not made: its anchor moves only by quantized steps (getNativeAnchorTop). */
    this.nativeRemainder = 0;
    this.pendingAdjust = 0;
    this.supersededAdjust = 0;
    this.ctx = ctx;
  }
  getWebScroll() {
    if (!this.webScroll) {
      this.webScroll = new WebScrollAdjustments(
        this.ctx,
        (credit) => requestAdjust(this.ctx, credit, "web-credit")
      );
    }
    return this.webScroll;
  }
  beginNativeWheel(delta) {
    if (Platform.OS === "web") this.getWebScroll().beginWheel(delta);
  }
  beginNativeScroll() {
    this.webAdjustment = void 0;
    if (Platform.OS === "web") this.getWebScroll().begin();
  }
  cancelNativeScroll() {
    var _a3;
    this.webAdjustment = void 0;
    (_a3 = this.webScroll) == null ? void 0 : _a3.cancel();
  }
  observeNativeScroll(offset, rangeEnd) {
    var _a3;
    if (offset === ((_a3 = this.webAdjustment) == null ? void 0 : _a3.observed)) return;
    this.webAdjustment = void 0;
    if (Platform.OS === "web") this.getWebScroll().observe(offset, rangeEnd);
  }
  deferNativeAdjust(add) {
    return Platform.OS === "web" && this.getWebScroll().defer(add);
  }
  getWebAdjustRemainder(observed) {
    var _a3;
    return ((_a3 = this.webAdjustment) == null ? void 0 : _a3.observed) === observed ? this.webAdjustment.expected - observed : 0;
  }
  recordWebAdjust(expected, observed) {
    this.webAdjustment = { expected: Math.abs(expected - observed) < 1 ? expected : observed, observed };
  }
  isRelativeWebAdjust(signal) {
    return signal === this.webAdjustSignal;
  }
  /** Whether a relative adjust now is held as pending credit until the active animation finishes. */
  willDeferAdjust() {
    const scrollingTo = this.ctx.state.scrollingTo;
    return doesPlatformAdjustBreakScroll() && !!scrollingTo && scrollingTo.ownerPhase !== "browser-moving" && !scrollingTo.isInitialScroll && (!!scrollingTo.animated || Platform.OS === "macos");
  }
  requestAdjust(add) {
    if (this.willDeferAdjust()) {
      this.pendingAdjust += add;
      set$(this.ctx, "scrollAdjustPending", this.pendingAdjust);
    } else {
      this.applyAdjust(add);
      if (Platform.OS === "web") this.webAdjustSignal = this.appliedAdjust;
      set$(this.ctx, "scrollAdjust", this.appliedAdjust);
    }
    if (this.ctx.state.scrollingTo) {
      checkFinishedScroll(this.ctx);
    }
  }
  getAdjust() {
    return this.appliedAdjust;
  }
  applyAdjust(add) {
    if (Platform.OS !== "web") {
      const user = peek$(this.ctx, "scrollAdjustUserOffset") || 0;
      const before = getNativeAnchorTop(this.appliedAdjust + user);
      this.nativeRemainder += add - (getNativeAnchorTop(this.appliedAdjust + add + user) - before);
    }
    this.appliedAdjust += add;
  }
  /** An absolute native write puts native and the model at the same offset. */
  clearNativeRemainder() {
    this.nativeRemainder = 0;
  }
  /**
   * Native reported `observed` while the model was at `modelScroll`; the model now follows native,
   * so the remainder of earlier shifts is consumed. When `observed` is the quantized echo of our
   * anchor shifts (native short by exactly the remainder) and nothing else owns the scroll, write
   * the model offset on the pixel grid so the anchor paints where MVCP put it.
   */
  settleNativeRemainder(observed, modelScroll) {
    var _a3, _b;
    const remainder = this.nativeRemainder;
    this.nativeRemainder = 0;
    if (Platform.OS === "web" || remainder === 0) return;
    const state = this.ctx.state;
    if (state.scrollingTo || state.pendingNativeMVCPAdjust || state.isDragging || state.isMomentumScrolling || Math.abs(observed + remainder - modelScroll) > NATIVE_REMAINDER_ECHO_EPSILON) {
      return;
    }
    const scale = PixelRatio.get();
    const target = Math.round(modelScroll * scale) / scale;
    if (Math.round(observed * scale) === Math.round(target * scale)) return;
    (_b = (_a3 = this.ctx).doScrollTo) == null ? void 0 : _b.call(_a3, {
      animated: false,
      horizontal: state.props.horizontal,
      isAdjustment: true,
      offset: target,
      source: "anchor"
    });
  }
  /** Pending adjust the active animation's destination did not already account for. */
  getUnsupersededPendingAdjust() {
    return this.pendingAdjust - this.supersededAdjust;
  }
  /** Keeps the pending adjust of a superseded animation out of its replacement's offset target. */
  supersedePendingAdjust() {
    this.supersededAdjust = this.pendingAdjust;
  }
  commitPendingAdjust(scrollTarget) {
    if (doesPlatformAdjustBreakScroll()) {
      const state = this.ctx.state;
      const pending = this.pendingAdjust;
      const superseded = scrollTarget ? this.supersededAdjust : 0;
      this.pendingAdjust = 0;
      this.supersededAdjust = 0;
      if (pending !== 0) {
        let targetScroll;
        const maintainedEnd = scrollTarget && getMaintainedWebEndOffset(this.ctx, scrollTarget);
        if (maintainedEnd !== void 0) {
          targetScroll = maintainedEnd;
        } else if ((scrollTarget == null ? void 0 : scrollTarget.index) !== void 0) {
          const currentOffset = calculateOffsetForIndex(this.ctx, scrollTarget.index);
          targetScroll = calculateOffsetWithOffsetPosition(this.ctx, currentOffset, scrollTarget);
          targetScroll = clampScrollOffset(this.ctx, targetScroll, scrollTarget);
        } else if (Platform.OS === "web" && scrollTarget) {
          targetScroll = getCurrentTargetOffset(this.ctx, scrollTarget);
        } else {
          targetScroll = clampScrollOffset(this.ctx, state.scroll + pending - superseded, {
            clampToContentContainerMinSize: !scrollTarget || scrollTarget.clampToContentContainerMinSize
          });
        }
        const adjustment = targetScroll - getObservedScrollOffset(this.ctx);
        if (Math.abs(adjustment) > 0.1 || Math.abs(pending) > 0.1) {
          recordScrollWrite(state, "credit", "relative", adjustment);
          this.applyAdjust(adjustment);
          if (Platform.OS === "web") this.webAdjustSignal = this.appliedAdjust;
          state.scroll = targetScroll;
          state.scrollForNextCalculateItemsInView = void 0;
          set$(this.ctx, "scrollAdjust", this.appliedAdjust);
        }
        set$(this.ctx, "scrollAdjustPending", 0);
        calculateItemsInView(this.ctx);
      }
    }
  }
};

// src/core/scrollToEnd.ts
function scrollToEnd(ctx, options) {
  const state = ctx.state;
  const index = getDataLength(state) - 1;
  if (index === -1) {
    return false;
  }
  const paddingBottom = getStylePaddingEnd(state.props);
  const footerSize = peek$(ctx, "footerSize") || 0;
  scrollToIndex(ctx, {
    ...options,
    clampToContentContainerMinSize: true,
    index,
    viewOffset: getEndAlignedViewOffset(paddingBottom, footerSize) + ((options == null ? void 0 : options.viewOffset) || 0),
    viewPosition: 1
  });
  if (state.scrollingTo) {
    state.scrollingTo.isScrollToEnd = true;
  }
  return true;
}

// src/core/updateContentInsetEndAdjustment.ts
function updateContentInsetEndAdjustment(ctx, previousContentInsetEndAdjustment) {
  const state = ctx.state;
  const previousContentInsetEnd = getContentInsetEnd(ctx, previousContentInsetEndAdjustment);
  const nextContentInsetEnd = getContentInsetEnd(ctx);
  const insetDiff = nextContentInsetEnd - previousContentInsetEnd;
  if (insetDiff !== 0) {
    const wasWithinEndThreshold = !!peek$(ctx, "isWithinMaintainScrollAtEndThreshold");
    updateScroll(ctx, state.scroll, true, { markHasScrolled: false });
    const didRetargetInitialScroll = retargetActiveInitialScrollAtEnd(ctx);
    if (!didRetargetInitialScroll && wasWithinEndThreshold && (Platform.OS !== "web" || insetDiff > 0)) {
      requestAdjust(ctx, insetDiff, "inset");
    }
  }
}

// src/core/userMomentum.ts
function armUserScrollSettle(ctx) {
  ctx.state.scheduledWork.timeout(
    () => {
      var _a3;
      const state = ctx.state;
      const quiet = state.isMomentumScrolling ? USER_MOMENTUM_STALL_TIMEOUT_MS : USER_MOMENTUM_WAIT_TIMEOUT_MS;
      if (Date.now() - ((_a3 = state.lastNativeScrollTime) != null ? _a3 : 0) < quiet) armUserScrollSettle(ctx);
      else settleUserScroll(ctx);
    },
    USER_MOMENTUM_WAIT_TIMEOUT_MS,
    "endFollowRearm"
  );
}
function settleUserScroll(ctx) {
  const state = ctx.state;
  if (state.isDragging) return;
  state.scheduledWork.cancel("endFollowRearm");
  state.isMomentumScrolling = false;
  syncScrollActive(ctx);
  notifyScrollIdle(state);
  const baseline = state.userScrollContentSize;
  state.userScrollContentSize = void 0;
  if (settleEndFollowUserScroll(ctx, baseline)) doMaintainScrollAtEnd(ctx);
}
function useWrapIfItem(fn) {
  return useMemo(
    () => fn ? (arg1, arg2, arg3) => arg1 !== void 0 && arg2 !== void 0 ? fn(arg1, arg2, arg3) : void 0 : void 0,
    [fn]
  );
}
var useCombinedRef = (...refs) => {
  const callback = useCallback((element) => {
    for (const ref of refs) {
      if (!ref) {
        continue;
      }
      if (isFunction(ref)) {
        ref(element);
      } else {
        ref.current = element;
      }
    }
  }, refs);
  return callback;
};
function useInit(cb) {
  useState(() => cb());
}
var StyleSheet = StyleSheet$1;
var nativeAnimated = Animated;
function copyOffsetToJs(value, offset) {
  const jsValue = value;
  if (jsValue.__onAnimatedValueUpdateReceived) {
    jsValue.__onAnimatedValueUpdateReceived(offset);
  } else {
    value.setValue(offset);
  }
}
function useStickyScrollHandler(stickyHeaderIndices, horizontal, ctx, onScroll2, refScrollView, renderState = ctx.state) {
  const viewRef = useRef(null);
  const attachmentRef = useRef(void 0);
  const targetRef = useRef(void 0);
  const generationRef = useRef(0);
  const lastOffsetRef = useRef(void 0);
  const dataLength = getDataLength(renderState);
  const hasStickyItems = stickyHeaderIndices == null ? void 0 : stickyHeaderIndices.some((index) => index >= 0 && index < dataLength);
  const shouldUseRnAnimatedEngine = !renderState.props.stickyPositionComponentInternal;
  const isNativeSticky = hasStickyItems && shouldUseRnAnimatedEngine;
  const detach = useCallback(() => {
    var _a3;
    generationRef.current++;
    (_a3 = attachmentRef.current) == null ? void 0 : _a3.detach();
    attachmentRef.current = void 0;
    targetRef.current = void 0;
  }, []);
  const attachRef = useCommittedRef((target) => {
    var _a3;
    detach();
    const nativeTarget = isNativeSticky ? target != null ? target : (_a3 = viewRef.current) == null ? void 0 : _a3.getScrollableNode() : void 0;
    if (nativeTarget != null) {
      attachmentRef.current = nativeAnimated.attachNativeEvent(nativeTarget, "onScroll", [
        {
          nativeEvent: {
            contentOffset: { [horizontal ? "x" : "y"]: ctx.animatedScrollY }
          }
        }
      ]);
      targetRef.current = nativeTarget;
    }
  });
  const onRef = useCallback(
    (view) => {
      detach();
      viewRef.current = view;
      if (view) {
        const generation = generationRef.current;
        queueMicrotask(() => {
          if (generation === generationRef.current) {
            attachRef.current();
          }
        });
      }
    },
    [attachRef, detach]
  );
  const ref = useCombinedRef(onRef, refScrollView);
  const scrollRef = useCommittedRef((event) => {
    var _a3;
    if (isNativeSticky) {
      const offset = event.nativeEvent.contentOffset[horizontal ? "x" : "y"];
      lastOffsetRef.current = offset;
      const target = (_a3 = viewRef.current) == null ? void 0 : _a3.getScrollableNode();
      if (target != null && target !== targetRef.current) {
        attachRef.current(target);
        ctx.animatedScrollY.setValue(offset);
      }
    }
    onScroll2(event);
  });
  const onStickyScroll = useCallback(
    (event) => scrollRef.current(event),
    [scrollRef]
  );
  useEffect(() => {
    attachRef.current();
    return detach;
  });
  useEffect(() => {
    if (!isNativeSticky) return;
    const { scheduledWork } = ctx.state;
    const settle = () => {
      var _a3;
      const offset = lastOffsetRef.current;
      if (offset === void 0) return;
      lastOffsetRef.current = void 0;
      copyOffsetToJs(ctx.animatedScrollY, offset);
      set$(ctx, "stickySettle", ((_a3 = peek$(ctx, "stickySettle")) != null ? _a3 : 0) + 1);
    };
    const unlisten = listen$(ctx, "isScrollActive", (active) => {
      if (active) scheduledWork.cancel("stickySettle");
      else scheduledWork.timeout(settle, USER_MOMENTUM_WAIT_TIMEOUT_MS, "stickySettle");
    });
    return () => {
      unlisten();
      scheduledWork.cancel("stickySettle");
      lastOffsetRef.current = void 0;
    };
  }, [ctx, horizontal, isNativeSticky]);
  return { onScroll: isNativeSticky ? onStickyScroll : onScroll2, refScrollView: ref };
}

// src/utils/createColumnWrapperStyle.ts
function createColumnWrapperStyle(contentContainerStyle) {
  const { gap, columnGap, rowGap } = contentContainerStyle;
  if (gap || columnGap || rowGap) {
    contentContainerStyle.gap = void 0;
    contentContainerStyle.columnGap = void 0;
    contentContainerStyle.rowGap = void 0;
    return {
      columnGap,
      gap,
      rowGap
    };
  }
}

// src/utils/createImperativeHandle.ts
var DEFAULT_AVERAGE_ITEM_SIZE_TYPE = "default";
function getAverageItemSizes(state) {
  const averageItemSizes = {};
  for (const itemType in state.averageSizes) {
    const averageSize = state.averageSizes[itemType];
    if (averageSize) {
      averageItemSizes[itemType || DEFAULT_AVERAGE_ITEM_SIZE_TYPE] = {
        average: averageSize.avg,
        count: averageSize.num
      };
    }
  }
  return averageItemSizes;
}
function createImperativeHandle(ctx, scheduleImperativeScrollCommit, scheduleScroll = (run) => run()) {
  const state = ctx.state;
  const scrollRequestTracker = getScrollRequestTracker(ctx);
  const IMPERATIVE_SCROLL_SETTLE_MAX_WAIT_MS = 800;
  const IMPERATIVE_SCROLL_SETTLE_STABLE_FRAMES = 2;
  const isSettlingAfterDataChange = () => !!state.didDataChange || !!state.didColumnsChange || state.scheduledWork.has("mvcpRecalculate") || state.scheduledWork.has("ignoreScrollFromMVCP") || state.ignoreScrollFromMVCP !== void 0;
  const isScrollToIndexReady = (targetIndex, allowEmpty = false) => {
    var _a3;
    const props = state.props;
    const dataLength = getDataLength(state);
    const anchorIndex = (_a3 = props.anchoredEndSpace) == null ? void 0 : _a3.anchorIndex;
    if (targetIndex < 0) {
      return allowEmpty;
    }
    if (targetIndex >= dataLength) {
      return false;
    }
    if (anchorIndex === void 0 || anchorIndex < 0 || anchorIndex >= dataLength || targetIndex < anchorIndex) {
      return true;
    }
    return areKnownOrFixedItemSizesAvailable(ctx, anchorIndex, dataLength - 1);
  };
  const getIndexForKey = (key) => {
    const data = getIndexedData(state);
    const cached = state.indexByKey.get(key);
    if (cached !== void 0 && cached < data.getLength() && String(data.getKey(cached)) === key) return cached;
    for (let index = 0; index < data.getLength(); index++) {
      const itemKey = data.getKey(index);
      if (String(itemKey) === key) {
        state.idCache[index] = itemKey;
        state.indexByKey.set(itemKey, index);
        return index;
      }
    }
    return void 0;
  };
  const runScrollRequest = (token, resolve, run, isReady) => {
    const runNow = () => scrollRequestTracker.runNow(token, resolve, run);
    if (!isSettlingAfterDataChange() && isReady()) {
      runNow();
      return;
    }
    const startedAt = Date.now();
    let stableFrames = 0;
    const check = () => {
      if (!scrollRequestTracker.isCurrent(token)) {
        return;
      }
      if (isSettlingAfterDataChange() || !isReady()) {
        stableFrames = 0;
      } else {
        stableFrames += 1;
      }
      const timedOut = Date.now() - startedAt >= IMPERATIVE_SCROLL_SETTLE_MAX_WAIT_MS;
      if (stableFrames >= IMPERATIVE_SCROLL_SETTLE_STABLE_FRAMES || timedOut) {
        runNow();
        return;
      }
      state.scheduledWork.frame(check, "imperativeScrollReady");
    };
    state.scheduledWork.frame(check, "imperativeScrollReady");
  };
  const createScrollPromise = (start) => new Promise((resolve) => {
    if (state.isUnmounted) {
      resolve();
      return;
    }
    scheduleScroll(() => {
      if (state.isUnmounted) {
        resolve();
        return;
      }
      start(resolve);
    }, resolve);
  });
  const runScrollWithPromise = (run, isReady = () => true) => createScrollPromise((resolve) => {
    const token = scrollRequestTracker.start(resolve);
    state.drawDistanceHold = void 0;
    supersedeInitialScroll(ctx);
    runScrollRequest(token, resolve, run, isReady);
  });
  state.runPendingScrollToEnd = () => {
    const pendingScroll = state.pendingScrollToEnd;
    if (pendingScroll) {
      state.pendingScrollToEnd = void 0;
      if (scrollRequestTracker.isCurrent(pendingScroll.token)) {
        runScrollRequest(
          pendingScroll.token,
          state.pendingScrollResolve,
          () => {
            supersedeInitialScroll(ctx);
            return getDataLength(state) === 0 ? "unreachable" : scrollToEnd(ctx, pendingScroll.options);
          },
          () => isScrollToIndexReady(getDataLength(state) - 1, true)
        );
      }
    }
  };
  const scrollIndexIntoView = (options) => {
    var _a3, _b, _c, _d, _e, _f, _g;
    const { index, itemOffset, itemLength, viewportMargin, ...rest } = options;
    if (index < 0 || index >= getDataLength(state)) return "unreachable";
    const hasRegion = itemOffset !== void 0 || itemLength !== void 0;
    const observed = getObservedScrollOffset(ctx);
    const position = calculateOffsetForIndex(ctx, index) + getStartOffsetAdjustment(ctx) + (itemOffset != null ? itemOffset : 0);
    const size = hasRegion ? itemLength != null ? itemLength : 0 : ((_a3 = getItemSizeAtIndex(ctx, index)) != null ? _a3 : 0) - ctx.scrollAxisGap;
    const insetTop = getContentInsetTop(ctx);
    const viewportLength = state.scrollLength - insetTop - getContentInsetEnd(ctx);
    const viewportStart = observed + insetTop + ((_b = viewportMargin == null ? void 0 : viewportMargin.start) != null ? _b : 0);
    const viewportEnd = observed + insetTop + viewportLength - ((_c = viewportMargin == null ? void 0 : viewportMargin.end) != null ? _c : 0);
    if (!hasRegion && position <= viewportStart && position + size >= viewportEnd) return false;
    const above = position < viewportStart;
    const below = position + size > viewportEnd;
    if (above || below) {
      const alignStart = above || size > viewportEnd - viewportStart;
      scrollToIndex(ctx, {
        ...rest,
        index,
        viewOffset: hasRegion ? (alignStart ? (_d = viewportMargin == null ? void 0 : viewportMargin.start) != null ? _d : 0 : viewportLength - ((_e = viewportMargin == null ? void 0 : viewportMargin.end) != null ? _e : 0) - size) - (itemOffset != null ? itemOffset : 0) : alignStart ? (_f = viewportMargin == null ? void 0 : viewportMargin.start) != null ? _f : 0 : -((_g = viewportMargin == null ? void 0 : viewportMargin.end) != null ? _g : 0),
        viewPosition: hasRegion || alignStart ? 0 : 1,
        viewPositionFallback: "start"
      });
      return true;
    }
    return false;
  };
  const refScroller = state.refScroller;
  const anchorVisibleContentForSizeReset = () => {
    if (state.didContainersLayout && !peek$(ctx, "isFollowingEnd") && !state.scrollingTo && !scrollRequestTracker.isWaitingToRun()) {
      const viewportStart = state.scroll - getStartOffsetAdjustment(ctx);
      const index = findVisibleItemIndex(ctx, viewportStart, viewportStart + state.scrollLength);
      if (index !== void 0) {
        state.visibleContentAnchor = {
          key: getId(state, index),
          offset: state.scroll - getLayoutOffset(ctx, index),
          sizeOnly: true
        };
      }
    }
  };
  const clearKeyedCaches = (keys, mode) => {
    var _a3, _b, _c, _d, _e, _f;
    const store = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
    let didClear = false;
    let didChangeLayout = false;
    for (const key of keys) {
      if (((_b = state.fixedItemSizeKeys) == null ? void 0 : _b.has(key)) || !state.sizesKnown.has(key) && !state.sizes.has(key)) continue;
      const index = getIndexForKey(key);
      if (index === void 0) continue;
      if (!didClear && mode === "full") anchorVisibleContentForSizeReset();
      didClear = true;
      (_c = state.staleSizeKeys) != null ? _c : state.staleSizeKeys = /* @__PURE__ */ new Set();
      state.staleSizeKeys.add(key);
      if (mode === "full") {
        state.sizesKnown.delete(key);
        state.sizes.delete(key);
        (_d = state.layoutStoreRuntime) == null ? void 0 : _d.retainedInvalidationHints.delete(key);
        if (store == null ? void 0 : store.hasIndex(index)) {
          store.invalidateRange(index, 1);
          didChangeLayout = true;
        }
      }
      const containerId = state.containerItemKeys.get(key);
      if (containerId !== void 0) (_e = ctx.containerLayoutTriggers.get(containerId)) == null ? void 0 : _e();
    }
    if (!didClear) return;
    if (didChangeLayout) syncLayoutStoreState(ctx);
    refreshRawOffsetRemeasureRows(ctx);
    (_f = state.triggerCalculateItemsInView) == null ? void 0 : _f.call(state, {
      doMVCP: true,
      forceFullItemPositions: didChangeLayout,
      mvcpAdjustmentSource: "invalidate"
    });
  };
  const clearCaches = (options) => {
    var _a3, _b, _c;
    const mode = (_a3 = options == null ? void 0 : options.mode) != null ? _a3 : "sizes";
    if (options == null ? void 0 : options.keys) {
      clearKeyedCaches(options.keys, mode);
      return;
    }
    const shouldRebuildPrefixLayoutStore = state.props.getFixedItemSize !== void 0 || mode === "sizes" && !!state.layoutStoreRuntime;
    if (mode === "sizes") anchorVisibleContentForSizeReset();
    state.staleSizeKeys = void 0;
    clearItemSizeEstimates(ctx);
    if (mode === "sizes" && state.layoutStoreRuntime) {
      for (const key of state.indexByKey.keys()) {
        const size = state.sizesKnown.get(key);
        if (size !== void 0) state.sizes.set(key, size);
      }
    }
    state.sizesKnown.clear();
    (_b = state.measurementAverageSamples) == null ? void 0 : _b.clear();
    invalidateFixedItemSizes(state);
    for (const key in state.averageSizes) {
      delete state.averageSizes[key];
    }
    clearLayoutStoreKnownSizes(ctx);
    state.scrollForNextCalculateItemsInView = void 0;
    state.pendingTotalSize = void 0;
    if (mode === "full") {
      state.visibleContentAnchor = void 0;
      state.sizes.clear();
      state.totalSize = 0;
      set$(ctx, "totalSize", 0);
      state.indexByKey.clear();
      state.idCache.length = 0;
    }
    if (shouldRebuildPrefixLayoutStore) {
      rebuildLayoutStoreExact(ctx);
      syncLayoutStoreState(ctx);
    }
    triggerMountedContainerLayouts(ctx);
    (_c = state.triggerCalculateItemsInView) == null ? void 0 : _c.call(state, { doMVCP: mode === "sizes", forceFullItemPositions: true });
  };
  const reportContentInset = (inset, follow = true) => {
    const didChange = setContentInsetOverride(ctx, inset);
    updateScroll(ctx, state.scroll, true, { markHasScrolled: false });
    if (didChange && follow) {
      const didRetargetInitial = retargetActiveInitialScrollAtEnd(ctx);
      if (!didRetargetInitial) doMaintainScrollAtEnd(ctx);
    }
  };
  return {
    anchorVisibleContent: ({ key, hold = true } = {}) => {
      if (!state.didFinishInitialScroll || state.freshDataTransitionEpoch !== state.handledFreshDataTransitionEpoch)
        return void 0;
      const observed = getObservedScrollOffset(ctx);
      const viewportStart = observed - getStartOffsetAdjustment(ctx);
      const index = key === void 0 ? findVisibleItemIndex(ctx, viewportStart, viewportStart + state.scrollLength) : getIndexForKey(key);
      if (index === void 0 || getLayoutOffset(ctx, index) === void 0) return void 0;
      const id = getId(state, index);
      const offset = viewportStart - getLayoutOffset(ctx, index);
      if (hold && !(peek$(ctx, "isFollowingEnd") && peek$(ctx, "isAtEnd"))) {
        updateScroll(ctx, observed, true, { markHasScrolled: false });
        interruptMaintainScrollAtEnd(ctx);
        state.visibleContentAnchor = { key: id, offset: state.scroll - getLayoutOffset(ctx, index) };
      }
      return { key: String(id), offset };
    },
    cancelScroll: () => {
      armAppScrollRearm(ctx);
      cancelScroll(ctx);
      rearmEndFollowIfSettled(ctx, "request");
    },
    clearCaches,
    flashScrollIndicators: () => refScroller.current.flashScrollIndicators(),
    getAnimatableRef: () => {
      var _a3, _b, _c;
      return (_c = (_b = (_a3 = refScroller.current).getNativeScrollRef) == null ? void 0 : _b.call(_a3)) != null ? _c : refScroller.current;
    },
    getNativeScrollRef: () => refScroller.current,
    getScrollableNode: () => refScroller.current.getScrollableNode(),
    getScrollResponder: () => refScroller.current.getScrollResponder(),
    getState: () => {
      var _a3;
      const placement = getInitialPlacementScroll(ctx);
      const scroll = getRenderedScroll(ctx);
      const distanceFromEnd = Math.max(
        0,
        getContentSize(ctx) - (placement === void 0 ? getObservedScrollOffset(ctx) : scroll) - state.scrollLength
      );
      return {
        activeStickyIndex: peek$(ctx, "activeStickyIndex"),
        contentLength: getContentSize(ctx),
        data: (_a3 = getIndexedData(state).getLegacyData()) != null ? _a3 : [],
        dataKey: state.props.dataKey,
        distanceFromEnd,
        elementAtIndex: (index) => {
          var _a4;
          return (_a4 = ctx.viewRefs.get(findContainerId(ctx, getId(state, index)))) == null ? void 0 : _a4.current;
        },
        end: state.endNoBuffer,
        endBuffered: state.endBuffered,
        getAverageItemSizes: () => getAverageItemSizes(state),
        indexByKey: (key) => state.indexByKey.get(key),
        isAtEnd: placement === void 0 ? peek$(ctx, "isAtEnd") : distanceFromEnd <= EDGE_POSITION_EPSILON,
        isAtStart: peek$(ctx, "isAtStart"),
        isEndReached: state.isEndReached,
        isFollowingEnd: !!peek$(ctx, "isFollowingEnd"),
        isNearEnd: peek$(ctx, "isNearEnd"),
        isNearStart: peek$(ctx, "isNearStart"),
        isStartReached: state.isStartReached,
        isWithinMaintainScrollAtEndThreshold: peek$(ctx, "isWithinMaintainScrollAtEndThreshold"),
        listen: (signalName, cb) => listen$(ctx, signalName, cb),
        listenToPosition: (key, cb) => listenPosition$(ctx, key, cb),
        positionAtIndex: (index) => getLayoutOffset(ctx, index),
        positionByKey: (key) => {
          const index = state.indexByKey.get(key);
          return getLayoutOffset(ctx, index);
        },
        scroll,
        scrollLength: state.scrollLength,
        scrollVelocity: getScrollVelocity(state),
        sizeAtIndex: (index) => state.sizesKnown.get(getId(state, index)),
        sizes: state.sizesKnown,
        start: state.startNoBuffer,
        startBuffered: state.startBuffered
      };
    },
    recordInteraction: () => recordViewabilityInteraction(ctx),
    reportContentInset,
    reportContentInsetForScrollInternal: (inset) => reportContentInset(inset, false),
    reportViewabilityInsetEndInternal: (inset) => {
      var _a3;
      const next = Number.isFinite(inset) ? Math.max(0, inset) : 0;
      if (next === ((_a3 = state.viewabilityInsetEnd) != null ? _a3 : 0)) {
        return;
      }
      state.viewabilityInsetEnd = next;
      if (isScreenReaderEnabled()) armAppScrollRearm(ctx);
      if (state.viewabilityConfigCallbackPairs && state.startNoBuffer != null && state.endNoBuffer != null) {
        updateViewableItems(
          ctx,
          state.viewabilityConfigCallbackPairs,
          state.scrollLength,
          state.startNoBuffer,
          state.endNoBuffer,
          state.startBuffered,
          state.endBuffered
        );
      }
    },
    scrollIndexIntoView: (options) => runScrollWithPromise(() => scrollIndexIntoView(options)),
    scrollItemIntoView: ({ item, ...props }) => runScrollWithPromise(() => {
      const data = getIndexedData(state);
      let index = -1;
      for (let itemIndex = 0; itemIndex < data.getLength(); itemIndex++) {
        if (data.getItem(itemIndex) === item) {
          index = itemIndex;
          break;
        }
      }
      if (index !== -1) {
        const result = scrollIndexIntoView({ index, ...props });
        if (result === true && state.scrollingTo && state.props.keyExtractor)
          state.scrollingTo.key = getId(state, index);
        return result;
      }
      return "unreachable";
    }),
    scrollToEnd: (options) => createScrollPromise((resolve) => {
      var _a3, _b;
      const token = scrollRequestTracker.start(resolve);
      requestEndFollow(ctx, "explicit-end");
      state.pendingScrollToEnd = {
        options,
        token
      };
      const preservesBootstrapEnd = (options == null ? void 0 : options.animated) === false && !options.viewOffset && ((_a3 = state.initialScroll) == null ? void 0 : _a3.bootstrap) && isEndOfContentTarget(state.initialScroll, getDataLength(state));
      scheduleImperativeScrollCommit == null ? void 0 : scheduleImperativeScrollCommit();
      if (!preservesBootstrapEnd) supersedeInitialScroll(ctx);
      if (!scheduleImperativeScrollCommit) {
        (_b = state.runPendingScrollToEnd) == null ? void 0 : _b.call(state);
      }
    }),
    scrollToIndex: (params) => runScrollWithPromise(
      () => {
        if (getDataLength(state) === 0) return "unreachable";
        scrollToIndex(ctx, params);
        return true;
      },
      params.index >= 0 ? () => isScrollToIndexReady(params.index) : void 0
    ),
    scrollToItem: ({ item, ...props }) => runScrollWithPromise(() => {
      const data = getIndexedData(state);
      let index = -1;
      for (let itemIndex = 0; itemIndex < data.getLength(); itemIndex++) {
        if (data.getItem(itemIndex) === item) {
          index = itemIndex;
          break;
        }
      }
      if (index !== -1) {
        scrollToIndex(ctx, { index, ...props });
        if (state.scrollingTo && state.props.keyExtractor) state.scrollingTo.key = getId(state, index);
        return true;
      }
      return "unreachable";
    }),
    scrollToKey: ({ key, ...params }) => runScrollWithPromise(
      () => {
        const index = getIndexForKey(key);
        if (index === void 0) return "unreachable";
        scrollToIndex(ctx, { ...params, index });
        if (state.scrollingTo) state.scrollingTo.key = getId(state, index);
        return true;
      },
      () => {
        const index = getIndexForKey(key);
        return index !== void 0 && isScrollToIndexReady(index);
      }
    ),
    scrollToOffset: (params) => runScrollWithPromise(() => {
      scrollTo(ctx, { ...params, clampToContentContainerMinSize: true });
      return true;
    }),
    setItemSize: (itemKey, size) => {
      getIndexForKey(itemKey);
      updateItemSizes(ctx, { itemKey, size });
    },
    setScrollProcessingEnabled: (enabled2) => {
      state.scrollProcessingEnabled = enabled2;
    },
    setVisibleContentAnchorOffset: (value) => {
      const previous = peek$(ctx, "scrollAdjustUserOffset") || 0;
      const val = isFunction(value) ? value(previous) : value;
      recordScrollWrite(state, "app-anchor-offset", "relative", val - previous);
      set$(ctx, "scrollAdjustUserOffset", val);
    }
  };
}

// src/utils/getAlwaysRenderIndices.ts
var sortAsc = (a, b) => a - b;
var toCount = (value) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
var addIndex = (result, dataLength, index) => {
  if (index >= 0 && index < dataLength) {
    result.add(index);
  }
};
function getAlwaysRenderIndices(config, data, keyExtractor, anchoredEndSpaceAnchorIndex) {
  var _a3, _b;
  const indexedData = Array.isArray(data) ? new ArrayDataAdapter(data, keyExtractor) : data;
  const dataLength = indexedData.getLength();
  if (dataLength === 0) {
    return [];
  }
  const result = /* @__PURE__ */ new Set();
  const topCount = toCount(config == null ? void 0 : config.top);
  if (topCount > 0) {
    for (let i = 0; i < Math.min(topCount, dataLength); i++) {
      addIndex(result, dataLength, i);
    }
  }
  const bottomCount = toCount(config == null ? void 0 : config.bottom);
  if (bottomCount > 0) {
    for (let i = Math.max(0, dataLength - bottomCount); i < dataLength; i++) {
      addIndex(result, dataLength, i);
    }
  }
  if ((_a3 = config == null ? void 0 : config.indices) == null ? void 0 : _a3.length) {
    for (const index of config.indices) {
      if (!Number.isFinite(index)) continue;
      addIndex(result, dataLength, Math.floor(index));
    }
  }
  if ((_b = config == null ? void 0 : config.keys) == null ? void 0 : _b.length) {
    const keys = new Set(config.keys);
    for (let i = 0; i < dataLength && keys.size > 0; i++) {
      const key = indexedData.getKey(i);
      if (keys.has(key)) {
        addIndex(result, dataLength, i);
        keys.delete(key);
      }
    }
  }
  if (anchoredEndSpaceAnchorIndex !== void 0 && Number.isFinite(anchoredEndSpaceAnchorIndex)) {
    const anchorIndex = Math.floor(anchoredEndSpaceAnchorIndex);
    for (let i = anchorIndex >= 0 ? anchorIndex : dataLength; i < dataLength; i++) {
      addIndex(result, dataLength, i);
    }
  }
  const indices = Array.from(result);
  indices.sort(sortAsc);
  return indices;
}

// src/utils/getRenderedItem.ts
function getRenderedItem(ctx, key, containerId, onReadIndex, renderCtx = ctx) {
  var _a3, _b, _c;
  const state = renderCtx.state;
  if (!state) {
    return null;
  }
  if (!state.props.dataSource && !state.props.data) {
    throw new TypeError("LegendList data is unavailable");
  }
  const metadata = state.containerItemMetadata.get(containerId);
  const useAssignedGeneration = metadata && metadata.dataChangeEpoch !== state.dataChangeEpoch;
  const {
    indexByKey,
    props: { data: currentData, dataSource: currentDataSource, getItemType, renderItem }
  } = state;
  const data = useAssignedGeneration ? metadata.data : currentData;
  const index = (_a3 = metadata == null ? void 0 : metadata.itemIndex) != null ? _a3 : indexByKey.get(key);
  if (index === void 0) {
    return null;
  }
  let renderedItem = null;
  const extraData = peek$(renderCtx, "extraData");
  const dataSource = useAssignedGeneration ? metadata.dataSource : currentDataSource;
  const item = useAssignedGeneration ? metadata.itemData : getDataItem(state, index);
  if (renderItem && (!!dataSource || !isNullOrUndefined(item))) {
    let type = "";
    if (useAssignedGeneration) {
      type = (_b = metadata.itemType) != null ? _b : "";
    } else if (getItemType && item !== void 0) {
      type = (_c = getItemType(item, index)) != null ? _c : "";
    }
    let isRendering = true;
    const sharedItemProps = {
      extraData,
      // Reads after render, such as in event handlers, see the item's current index.
      get index() {
        var _a4;
        onReadIndex == null ? void 0 : onReadIndex();
        return isRendering ? index : (_a4 = ctx.state.indexByKey.get(key)) != null ? _a4 : index;
      },
      item,
      type
    };
    const itemProps = Object.assign(sharedItemProps, dataSource ? { dataSource } : { data });
    renderedItem = renderItem(itemProps);
    isRendering = false;
    return { index, item, renderedItem, type };
  }
  return { index, item, renderedItem };
}

// src/utils/normalizeMaintainScrollAtEnd.ts
function normalizeMaintainScrollAtEnd(value) {
  var _a3, _b, _c, _d;
  if (!value) {
    return void 0;
  }
  const options = value === true ? void 0 : value;
  const on = options == null ? void 0 : options.on;
  const hasExplicitOn = !!options && "on" in options;
  return {
    animated: (_a3 = options == null ? void 0 : options.animated) != null ? _a3 : false,
    onDataChange: hasExplicitOn ? (on == null ? void 0 : on.dataChange) || ((on == null ? void 0 : on.dataAppend) ? "append" : false) : true,
    onFooterLayout: hasExplicitOn ? (_b = on == null ? void 0 : on.footerLayout) != null ? _b : false : true,
    onItemLayout: hasExplicitOn ? (_c = on == null ? void 0 : on.itemLayout) != null ? _c : false : true,
    onLayout: hasExplicitOn ? (_d = on == null ? void 0 : on.layout) != null ? _d : false : true
  };
}

// src/utils/normalizeMaintainVisibleContentPosition.ts
function normalizeMaintainVisibleContentPosition(value) {
  var _a3, _b;
  if (value === true) {
    return { data: true, size: true };
  }
  if (value && typeof value === "object") {
    return {
      autoscrollToTopThreshold: value.autoscrollToTopThreshold,
      data: (_a3 = value.data) != null ? _a3 : false,
      shouldRestorePosition: value.shouldRestorePosition,
      size: (_b = value.size) != null ? _b : true
    };
  }
  if (value === false) {
    return { data: false, size: false };
  }
  return { data: false, size: true };
}

// src/utils/setPaddingTop.ts
function setPaddingTop(ctx, { stylePaddingTop }) {
  const state = ctx.state;
  if (stylePaddingTop !== void 0) {
    const prevStylePaddingTop = peek$(ctx, "stylePaddingTop") || 0;
    if (stylePaddingTop < prevStylePaddingTop) {
      let prevTotalSize = peek$(ctx, "totalSize") || 0;
      set$(ctx, "totalSize", prevTotalSize + prevStylePaddingTop);
      state.timeoutSetPaddingTop = setTimeout(() => {
        prevTotalSize = peek$(ctx, "totalSize") || 0;
        set$(ctx, "totalSize", prevTotalSize - prevStylePaddingTop);
      }, 16);
    }
    set$(ctx, "stylePaddingTop", stylePaddingTop);
  }
}
function useThrottleDebounce(mode) {
  const timeoutRef = useRef(null);
  const lastCallTimeRef = useRef(0);
  const lastArgsRef = useRef(null);
  const clearTimeoutRef = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };
  const execute = useCallback(
    (callback, delay, ...args) => {
      {
        const now = Date.now();
        lastArgsRef.current = args;
        if (now - lastCallTimeRef.current >= delay) {
          lastCallTimeRef.current = now;
          callback(...args);
          clearTimeoutRef();
        } else {
          clearTimeoutRef();
          timeoutRef.current = setTimeout(
            () => {
              if (lastArgsRef.current) {
                lastCallTimeRef.current = Date.now();
                callback(...lastArgsRef.current);
                timeoutRef.current = null;
                lastArgsRef.current = null;
              }
            },
            delay - (now - lastCallTimeRef.current)
          );
        }
      }
    },
    [mode]
  );
  return execute;
}

// src/utils/throttledOnScroll.ts
function useThrottledOnScroll(originalHandler, scrollEventThrottle) {
  const throttle = useThrottleDebounce("throttle");
  return (event) => throttle(originalHandler, scrollEventThrottle, { nativeEvent: event.nativeEvent });
}

// src/components/LegendList.tsx
var LegendList = typedMemo(
  // biome-ignore lint/nursery/noShadow: const function name shadowing is intentional
  typedForwardRef(function LegendList2(props, forwardedRef) {
    const { children, data: dataProp, dataSource, renderItem: renderItemProp, ...restProps } = props;
    const isChildrenMode = children !== void 0 && dataProp === void 0 && dataSource === void 0;
    const processedProps = isChildrenMode ? {
      ...restProps,
      childrenMode: true,
      data: (isArray(children) ? children : React2.Children.toArray(children)).flat(1),
      dataSource: void 0,
      renderItem: ({ item }) => item
    } : {
      ...restProps,
      data: dataProp || [],
      dataSource,
      renderItem: renderItemProp
    };
    return /* @__PURE__ */ React2.createElement(StateProvider, null, /* @__PURE__ */ React2.createElement(LegendListInner, { ...processedProps, propsCommitToken: processedProps, ref: forwardedRef }));
  })
);
function areViewabilityConfigPairsEqual(a, b) {
  return (a == null ? void 0 : a.length) === (b == null ? void 0 : b.length) && (a === b || (a == null ? void 0 : a.every((pair, index) => areViewabilityConfigsEqual(pair.viewabilityConfig, b == null ? void 0 : b[index].viewabilityConfig))));
}
function shouldIgnoreTransientMacOSScrollMeasurement({
  horizontal,
  layout,
  usesBootstrapInitialScroll
}) {
  if (Platform.OS !== "macos" || !usesBootstrapInitialScroll) {
    return false;
  }
  const scrollAxis = horizontal ? "width" : "height";
  const otherAxis = horizontal ? "height" : "width";
  const measuredLength = layout[scrollAxis];
  const measuredOtherAxisLength = layout[otherAxis];
  const windowLength = getWindowSize()[scrollAxis];
  return Number.isFinite(measuredOtherAxisLength) && measuredOtherAxisLength <= 0 || Number.isFinite(measuredLength) && Number.isFinite(windowLength) && windowLength > 0 && measuredLength > windowLength + 1;
}
var LegendListInner = typedForwardRef(function LegendListInner2(props, forwardedRef) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
  useEffect(subscribeScreenReader, []);
  const noopOnScroll = useCallback((_event) => {
  }, []);
  if (props.recycleItems === void 0) {
    warnDevOnce(
      "recycleItems-omitted",
      "recycleItems was not provided, so it defaults to false. Set recycleItems explicitly to true for better performance with recycling-aware rows, or false to preserve remount-on-reuse behavior."
    );
  }
  const {
    alignItemsAtEnd = false,
    anchoredEndSpace,
    alwaysRender,
    columnWrapperStyle,
    contentContainerStyle: contentContainerStyleProp,
    contentInset,
    data: dataProp = [],
    dataSource,
    dataKey,
    dataVersion,
    drawDistance = 250,
    contentInsetEndAdjustment,
    estimatedItemSize: estimatedItemSizeProp = 100,
    estimatedListSize,
    extraData,
    getFixedItemSize,
    getItemType,
    horizontal,
    rtl,
    estimatedHeaderSize,
    initialScrollAtEnd = false,
    initialScrollIndex: initialScrollIndexProp,
    initialScrollOffset: initialScrollOffsetProp,
    experimental_adaptiveRender,
    experimental_hideItemsUntilMeasured,
    itemsAreEqual,
    keyExtractor: keyExtractorProp,
    ListEmptyComponent,
    ListFooterComponent,
    ListFooterComponentStyle,
    ListHeaderComponent,
    maintainScrollAtEnd = false,
    maintainScrollAtEndThreshold = 0.1,
    maintainVisibleContentPosition: maintainVisibleContentPositionProp,
    numColumns: numColumnsPropRaw = 1,
    overrideItemLayout,
    onEndReached,
    onEndReachedThreshold = 0.5,
    onItemSizeChanged,
    onMetricsChange,
    onUserScroll,
    onLayout: onLayoutProp,
    onLoad,
    onReady,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    onRefresh,
    onScroll: onScrollProp,
    onScrollBeginDrag,
    onScrollEndDrag,
    onStartReached,
    onStartReachedThreshold = 0.5,
    onStickyHeaderChange,
    onFirstVisibleItemChanged,
    onViewableItemsChanged,
    progressViewOffset,
    recycleItems = false,
    refreshControl,
    refreshing,
    showImmediately = false,
    refScrollView,
    renderScrollComponent,
    renderItem,
    scrollEventThrottle,
    snapToIndices,
    stickyHeaderIndices: stickyHeaderIndicesProp,
    style: styleProp,
    useWindowScroll = false,
    scrollElement,
    viewabilityConfig,
    viewabilityConfigCallbackPairs,
    ...rest
  } = props;
  const numColumnsProp = normalizeNumColumnsProp(numColumnsPropRaw);
  const estimatedItemSize = normalizeLayoutSize(estimatedItemSizeProp, 100);
  const keyExtractor = useMemo(
    () => dataSource ? (_item, index) => dataSource.getKey(index) : keyExtractorProp != null ? keyExtractorProp : ((_item, index) => index.toString()),
    [dataSource, keyExtractorProp]
  );
  const wrappedKeyExtractor = useWrapIfItem(keyExtractor);
  const ctx = useStateContext();
  const indexedData = resolveIndexedData(
    (_a3 = ctx.state) == null ? void 0 : _a3.indexedData,
    dataProp,
    dataSource,
    wrappedKeyExtractor
  );
  const dataLength = indexedData.getLength();
  const dataSourceRevision = dataSource == null ? void 0 : dataSource.getRevision();
  const animatedPropsInternal = props.animatedPropsInternal;
  const {
    propsCommitToken: _propsCommitToken,
    anchoredEndSpaceOwnerInternal,
    contentExtentComponentInternal,
    positionComponentInternal,
    stickyPositionComponentInternal,
    ...restProps
  } = rest;
  const anchoredEndSpaceOwner = anchoredEndSpaceOwnerInternal != null ? anchoredEndSpaceOwnerInternal : "list";
  const contentContainerStyleBase = StyleSheet.flatten(contentContainerStyleProp);
  const useAlignItemsAtEndPadding = alignItemsAtEnd && !horizontal && (contentContainerStyleBase == null ? void 0 : contentContainerStyleBase.minHeight) == null && dataLength > 0;
  const shouldFlexGrow = alignItemsAtEnd && !useAlignItemsAtEndPadding && (horizontal ? (contentContainerStyleBase == null ? void 0 : contentContainerStyleBase.minWidth) == null : (contentContainerStyleBase == null ? void 0 : contentContainerStyleBase.minHeight) == null);
  const contentContainerMinSizeStyle = horizontal ? contentContainerStyleBase == null ? void 0 : contentContainerStyleBase.minWidth : contentContainerStyleBase == null ? void 0 : contentContainerStyleBase.minHeight;
  const contentContainerMinSize = typeof contentContainerMinSizeStyle === "number" && Number.isFinite(contentContainerMinSizeStyle) ? contentContainerMinSizeStyle : void 0;
  const contentContainerStyle = {
    ...contentContainerStyleBase,
    ...alignItemsAtEnd && !useAlignItemsAtEndPadding ? {
      display: "flex",
      flexDirection: horizontal ? "row" : "column",
      ...shouldFlexGrow ? { flexGrow: 1 } : {},
      justifyContent: "flex-end"
    } : {}
  };
  const style = { ...StyleSheet.flatten(styleProp) };
  const stylePaddingTopState = extractPadding(style, contentContainerStyle, "Top");
  const stylePaddingBottomState = extractPadding(style, contentContainerStyle, "Bottom");
  const stylePaddingLeftState = extractPadding(style, contentContainerStyle, "Left");
  const stylePaddingRightState = extractPadding(style, contentContainerStyle, "Right");
  const stylePaddingEndState = getStylePaddingEnd({
    horizontal,
    rtl,
    stylePaddingBottom: stylePaddingBottomState,
    stylePaddingLeft: stylePaddingLeftState,
    stylePaddingRight: stylePaddingRightState
  });
  const maintainScrollAtEndConfig = normalizeMaintainScrollAtEnd(maintainScrollAtEnd);
  const maintainVisibleContentPositionConfig = normalizeMaintainVisibleContentPosition(
    maintainVisibleContentPositionProp
  );
  const hasInitialScrollIndex = initialScrollIndexProp !== void 0 && initialScrollIndexProp !== null;
  const hasInitialScrollOffset = initialScrollOffsetProp !== void 0 && initialScrollOffsetProp !== null;
  const shouldInitializeHorizontalRTL = !initialScrollAtEnd && !hasInitialScrollIndex && !hasInitialScrollOffset && isHorizontalRTLProps({ horizontal, rtl });
  const initialInsetTop = Platform.OS === "ios" && !horizontal ? Math.max(0, (_b = contentInset == null ? void 0 : contentInset.top) != null ? _b : 0) : 0;
  const initialScrollUsesOffsetOnly = !initialScrollAtEnd && !hasInitialScrollIndex && (hasInitialScrollOffset || shouldInitializeHorizontalRTL || initialInsetTop > 0);
  const usesBootstrapInitialScroll = initialScrollAtEnd || hasInitialScrollIndex;
  const shouldBottomAlignNumericInitialScrollIndex = typeof initialScrollIndexProp === "number" && !hasInitialScrollOffset && dataLength > 1 && initialScrollIndexProp >= dataLength - 1;
  const initialScrollProp = initialScrollAtEnd ? {
    index: Math.max(0, dataLength - 1),
    kind: "end",
    preserveForBottomPadding: true,
    viewOffset: getEndAlignedViewOffset(stylePaddingEndState),
    viewPosition: 1
  } : hasInitialScrollIndex ? typeof initialScrollIndexProp === "object" ? {
    index: (_c = initialScrollIndexProp.index) != null ? _c : 0,
    preserveForBottomPadding: initialScrollIndexProp.viewOffset === void 0 && initialScrollIndexProp.viewPosition === 1 && initialScrollIndexProp.viewPositionFallback === void 0 ? true : void 0,
    viewOffset: (_d = initialScrollIndexProp.viewOffset) != null ? _d : initialScrollIndexProp.viewPosition === 1 && initialScrollIndexProp.viewPositionFallback === void 0 ? getEndAlignedViewOffset(stylePaddingEndState) : 0,
    viewPosition: (_e = initialScrollIndexProp.viewPosition) != null ? _e : 0,
    viewPositionFallback: initialScrollIndexProp.viewPositionFallback
  } : {
    index: initialScrollIndexProp != null ? initialScrollIndexProp : 0,
    preserveForBottomPadding: shouldBottomAlignNumericInitialScrollIndex ? true : void 0,
    viewOffset: initialScrollOffsetProp != null ? initialScrollOffsetProp : shouldBottomAlignNumericInitialScrollIndex ? getEndAlignedViewOffset(stylePaddingEndState) : 0,
    viewPosition: shouldBottomAlignNumericInitialScrollIndex ? 1 : void 0
  } : initialScrollUsesOffsetOnly ? {
    contentOffset: initialScrollOffsetProp != null ? initialScrollOffsetProp : -initialInsetTop,
    index: 0,
    viewOffset: 0
  } : void 0;
  const [, scheduleImperativeScrollCommit] = React2.useReducer((value) => value + 1, 0);
  const commitDataSourceRef = useRef(void 0);
  const [, scheduleDataSourceCommit] = React2.useReducer((value) => value + 1, 0);
  const nextColumnWrapperStyle = columnWrapperStyle || (contentContainerStyle ? createColumnWrapperStyle(contentContainerStyle) : void 0);
  const scrollAxisGap = horizontal ? (_f = nextColumnWrapperStyle == null ? void 0 : nextColumnWrapperStyle.columnGap) != null ? _f : nextColumnWrapperStyle == null ? void 0 : nextColumnWrapperStyle.gap : (_g = nextColumnWrapperStyle == null ? void 0 : nextColumnWrapperStyle.rowGap) != null ? _g : nextColumnWrapperStyle == null ? void 0 : nextColumnWrapperStyle.gap;
  const nextScrollAxisGap = typeof scrollAxisGap === "number" && Number.isFinite(scrollAxisGap) ? scrollAxisGap : 0;
  const refScroller = useRef(null);
  const combinedRef = useCombinedRef(refScroller, refScrollView);
  const stickyHeaderIndices = stickyHeaderIndicesProp;
  const contentInsetEndAdjustmentResolved = Platform.OS === "web" ? contentInsetEndAdjustment : void 0;
  const previousContentInsetEndAdjustmentRef = useRef(contentInsetEndAdjustmentResolved);
  const alwaysRenderIndices = useMemo(() => {
    const indices = getAlwaysRenderIndices(alwaysRender, indexedData, keyExtractor, anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorIndex);
    return { arr: indices, set: new Set(indices) };
  }, [
    anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorIndex,
    alwaysRender == null ? void 0 : alwaysRender.top,
    alwaysRender == null ? void 0 : alwaysRender.bottom,
    (_h = alwaysRender == null ? void 0 : alwaysRender.indices) == null ? void 0 : _h.join(","),
    (_i = alwaysRender == null ? void 0 : alwaysRender.keys) == null ? void 0 : _i.join(","),
    dataProp,
    indexedData,
    dataLength,
    dataSourceRevision,
    dataKey,
    dataVersion,
    keyExtractor
  ]);
  const scrollElementResolved = Platform.OS === "web" && !renderScrollComponent ? scrollElement : void 0;
  const useWindowScrollResolved = Platform.OS === "web" && !!useWindowScroll && scrollElementResolved === void 0 && !renderScrollComponent;
  const hasExternalScroll = useWindowScrollResolved || scrollElementResolved !== void 0;
  const refState = useRef(void 0);
  const sizeCacheOwner = props.ItemSeparatorComponent ? void 0 : (_j = dataSource != null ? dataSource : keyExtractorProp) != null ? _j : dataProp;
  const sizeCacheOwnerRef = useCommittedRef(sizeCacheOwner);
  const hasOverrideItemLayout = !!overrideItemLayout;
  const prevHasOverrideItemLayout = useRef(hasOverrideItemLayout);
  if (!refState.current) {
    if (!ctx.state) {
      const shouldEstimateInitialLayout = IsNewArchitecture && showImmediately;
      const initialScrollLength = (estimatedListSize != null ? estimatedListSize : IsNewArchitecture && !shouldEstimateInitialLayout ? { height: 0, width: 0 } : getWindowSize())[horizontal ? "width" : "height"];
      const hasEstimatedInitialLayout = shouldEstimateInitialLayout && Number.isFinite(initialScrollLength) && initialScrollLength > 0;
      ctx.values.set("adaptiveRender", (_k = experimental_adaptiveRender == null ? void 0 : experimental_adaptiveRender.initialMode) != null ? _k : "normal");
      ctx.state = {
        averageSizes: {},
        containerItemGenerations: [],
        containerItemKeys: /* @__PURE__ */ new Map(),
        containerItemMetadata: /* @__PURE__ */ new Map(),
        contentInsetOverride: void 0,
        dataChangeEpoch: 0,
        dataChangeKeyExtractorChanged: false,
        dataChangeNeedsScrollUpdate: false,
        didColumnsChange: false,
        didDataChange: false,
        didLoad: false,
        endBuffered: -1,
        endNoBuffer: -1,
        endReachedSnapshot: void 0,
        firstFullyOnScreenIndex: -1,
        freshDataTransitionEpoch: 0,
        handledDataChangeEpoch: 0,
        handledFreshDataTransitionEpoch: 0,
        hasEstimatedInitialLayout,
        hasHadNonEmptyData: dataLength > 0,
        idCache: [],
        idsInView: [],
        indexByKey: /* @__PURE__ */ new Map(),
        indexedData,
        initialScroll: initialScrollProp ? {
          ...initialScrollProp,
          kind: initialScrollAtEnd ? "end" : initialScrollUsesOffsetOnly ? "offset" : "index",
          previousDataLength: dataLength
        } : void 0,
        isEndReached: null,
        isFirst: true,
        isStartReached: null,
        lastBatchingAction: Date.now(),
        lastLayout: void 0,
        lastScrollDelta: 0,
        loadStartTime: Date.now(),
        nativeContentInset: void 0,
        nativeMarginTop: 0,
        pendingDataComparison: void 0,
        pendingNativeMVCPAdjust: void 0,
        props: {},
        queuedCalculateItemsInView: 0,
        refScroller: { current: null },
        scheduledWork: new ScheduledWork(),
        scroll: 0,
        scrollAdjustHandler: new ScrollAdjustHandler(ctx),
        scrollForNextCalculateItemsInView: void 0,
        scrollHistory: [],
        scrollLength: shouldEstimateInitialLayout && !hasEstimatedInitialLayout ? 0 : initialScrollLength,
        scrollPending: 0,
        scrollProcessingEnabled: true,
        scrollTime: 0,
        sizes: /* @__PURE__ */ new Map(),
        sizesKnown: /* @__PURE__ */ new Map(),
        startBuffered: -1,
        startNoBuffer: -1,
        startReachedSnapshot: void 0,
        stickyContainerPool: /* @__PURE__ */ new Set(),
        totalSize: 0,
        viewabilityConfigCallbackPairs: void 0
      };
      const internalState = ctx.state;
      ctx.doMaintainScrollAtEnd = () => doMaintainScrollAtEnd(ctx);
      ctx.doScrollTo = (params) => doScrollTo(ctx, params);
      ctx.schedulePreservedEndAnchorCorrection = () => schedulePreservedEndAnchorCorrection(ctx);
      ctx.interruptUserScroll = () => interruptUserScroll(ctx);
      ctx.scrollTo = (params) => scrollTo(ctx, params);
      ctx.scrollToEnd = (options) => scrollToEnd(ctx, options);
      internalState.triggerCalculateItemsInView = (params) => calculateItemsInView(ctx, params);
      internalState.reprocessCurrentScroll = () => updateScroll(ctx, internalState.scroll, true);
      set$(ctx, "maintainVisibleContentPosition", maintainVisibleContentPositionConfig);
      set$(ctx, "extraData", extraData);
      if (estimatedHeaderSize !== void 0) {
        set$(ctx, "headerSize", estimatedHeaderSize);
      }
    }
    refState.current = ctx.state;
  }
  const state = refState.current;
  const [canRender, setCanRender] = React2.useState(!IsNewArchitecture || !!state.hasEstimatedInitialLayout);
  const previousProps = state.props;
  const isFirstLocal = state.isFirst;
  const didDataSourceChangeLocal = previousProps.dataSource !== dataSource;
  const didDataReferenceChangeLocal = previousProps.data !== dataProp;
  const didDataKeyChangeLocal = previousProps.dataKey !== dataKey;
  const didDataVersionChangeLocal = previousProps.dataVersion !== dataVersion;
  const arrayLayout = useArrayLayout(
    ctx,
    !isFirstLocal && !dataSource && !previousProps.dataSource && (didDataReferenceChangeLocal || didDataKeyChangeLocal || didDataVersionChangeLocal)
  );
  const firstDataInMeasuredViewport = !state.hasHadNonEmptyData && !!state.lastLayout && !initialScrollProp && dataLength > 0;
  const canPlanPlacement = !!arrayLayout && !didDataKeyChangeLocal && !didDataVersionChangeLocal && (firstDataInMeasuredViewport || previousProps.data.length > 0 && state.didContainersLayout && peek$(ctx, "readyToRender")) && !state.initialScroll && !state.scrollingTo && !state.pendingScrollResolve && !state.pendingScrollToEnd && !state.timeoutSetPaddingTop && !state.scheduledWork.has("nativeScrollAdjustment") && !maintainVisibleContentPositionConfig.shouldRestorePosition && !anchoredEndSpace && !previousProps.anchoredEndSpace && contentInsetEndAdjustmentResolved === previousProps.contentInsetEndAdjustment && stylePaddingTopState === previousProps.stylePaddingTop && stylePaddingBottomState === previousProps.stylePaddingBottom && stylePaddingLeftState === previousProps.stylePaddingLeft && stylePaddingRightState === previousProps.stylePaddingRight && previousProps.horizontal === !!horizontal && previousProps.rtl === rtl && previousProps.snapToIndices === snapToIndices && previousProps.hasExternalScroll === hasExternalScroll && previousProps.maintainScrollAtEndThreshold === maintainScrollAtEndThreshold && !!previousProps.maintainScrollAtEnd === !!maintainScrollAtEndConfig && !!getFixedItemSize === !!previousProps.getFixedItemSize && (peek$(ctx, "extraData") === extraData || !getFixedItemSize && !overrideItemLayout);
  const renderCtx = (_l = arrayLayout == null ? void 0 : arrayLayout.snapshot) != null ? _l : ctx;
  const renderState = renderCtx.state;
  renderCtx.columnWrapperStyle = nextColumnWrapperStyle;
  const previousViewabilityConfigRef = useRef(viewabilityConfig);
  const previousViewabilityConfigPairsRef = useRef(viewabilityConfigCallbackPairs);
  if (didDataSourceChangeLocal) {
    invalidateContainerMeasurements(renderState);
    resetViewabilityTimers(renderCtx);
    resetDataSourceMutation(renderState);
    renderState.dataSourceSpanInvalidationIndex = void 0;
    notifyScrollIdle(renderState);
  }
  const previousDataLength = isFirstLocal ? 0 : (_m = renderState.dataSourcePreviousLength) != null ? _m : getDataLength(renderState);
  renderState.indexedData = indexedData;
  const previousAdaptiveRender = previousProps.adaptiveRender;
  const previousHideItemsUntilMeasured = previousProps.hideItemsUntilMeasured;
  const didScrollAxisChange = !isFirstLocal && previousProps.horizontal !== !!horizontal;
  const committedNumColumns = peek$(ctx, "numColumns");
  const didScrollAxisGapChange = !isFirstLocal && renderCtx.scrollAxisGap !== nextScrollAxisGap;
  const wrappedGetFixedItemSize = useWrapIfItem(getFixedItemSize);
  const wrappedGetItemType = useWrapIfItem(getItemType);
  renderCtx.scrollAxisGap = nextScrollAxisGap;
  renderState.didColumnsChange = numColumnsProp !== committedNumColumns || didScrollAxisChange || didScrollAxisGapChange;
  const didDataSourceMutationLocal = !!((_n = renderState.pendingDataSourceBatches) == null ? void 0 : _n.length) || !!renderState.dataSourceNeedsReset;
  if (!isFirstLocal && (didDataKeyChangeLocal || didDataSourceChangeLocal || !dataSource && didDataVersionChangeLocal)) {
    const owner = (_o = previousProps.dataSource) != null ? _o : previousProps.data;
    if (arrayLayout) arrayLayout.beforeCommit = () => saveItemSizeEstimates(ctx, owner);
    else saveItemSizeEstimates(ctx, owner);
  }
  const didKeyExtractorChange = previousProps.hasReliableKeyExtractor !== (!!dataSource || !!keyExtractorProp) || !dataSource && !!keyExtractorProp && previousProps.keyExtractor !== wrappedKeyExtractor;
  const didDataChangeLocal = didDataKeyChangeLocal || didDataSourceChangeLocal || didDataSourceMutationLocal || didDataVersionChangeLocal || didDataReferenceChangeLocal && checkStructuralDataChange(renderState, dataProp, previousProps.data);
  if (IS_DEV && didKeyExtractorChange && !didDataChangeLocal && !!previousProps.hasReliableKeyExtractor) {
    afterLayout(renderCtx, () => {
      warnDevOnce(
        "keyExtractor-identity-changed",
        "keyExtractor changed identity without a data change. Pass a stable keyExtractor because item identity is only recomputed during data changes."
      );
    });
  }
  const shouldResetFreshDataLayout = !isFirstLocal && didDataChangeLocal && renderState.hasHadNonEmptyData && (didDataKeyChangeLocal || previousDataLength === 0) && dataLength > 0;
  if (didDataChangeLocal && !initialScrollAtEnd && renderState.didFinishInitialScroll && ((_p = renderState.initialScrollAnchor) == null ? void 0 : _p.viewPosition) === 1 && previousDataLength > 0) {
    renderState.initialScroll = void 0;
    renderState.initialScrollAnchor = void 0;
    afterLayout(renderCtx, (committedCtx) => clearPreservedInitialScrollTarget(committedCtx.state));
  }
  if (didDataChangeLocal) {
    renderState.dataChangeEpoch += 1;
    renderState.dataChangeKeyExtractorChanged = didKeyExtractorChange;
    renderState.dataChangeNeedsScrollUpdate = true;
    renderState.didDataChange = true;
    renderState.previousData = dataSource ? void 0 : previousProps.data;
  }
  if (shouldResetFreshDataLayout) {
    renderState.freshDataTransitionEpoch += 1;
  }
  const dataChangeEpoch = renderState.dataChangeEpoch;
  const freshDataTransitionEpoch = renderState.freshDataTransitionEpoch;
  const throttledOnScroll = useThrottledOnScroll(onScrollProp != null ? onScrollProp : noopOnScroll, scrollEventThrottle != null ? scrollEventThrottle : 0);
  const throttleScrollFn = scrollEventThrottle && onScrollProp ? throttledOnScroll : onScrollProp;
  const didAnchoredEndSpaceAnchorIndexChange = !isFirstLocal && !didDataChangeLocal && ((_q = previousProps.anchoredEndSpace) == null ? void 0 : _q.anchorIndex) !== (anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorIndex);
  const shouldExactSyncLayoutStore = !isFirstLocal && !didDataChangeLocal && (previousProps.estimatedItemSize !== estimatedItemSize || !!previousProps.hasReliableKeyExtractor !== (!!dataSource || !!keyExtractorProp) || didScrollAxisChange || didScrollAxisGapChange);
  if (!isFirstLocal && didDataChangeLocal && !dataSource && !previousProps.dataSource && renderState.didContainersLayout && maintainVisibleContentPositionConfig.data) {
    (_r = renderState.dataSourceAnchorPositions) != null ? _r : renderState.dataSourceAnchorPositions = snapshotMVCPAnchorPositions(renderCtx);
  }
  const stickyHeaderIndicesSet = useMemo(() => new Set(stickyHeaderIndices != null ? stickyHeaderIndices : []), [stickyHeaderIndices == null ? void 0 : stickyHeaderIndices.join(",")]);
  const previousDrawDistance = (_s = renderState.props) == null ? void 0 : _s.drawDistance;
  renderState.props = {
    adaptiveRender: experimental_adaptiveRender,
    alignItemsAtEnd,
    alignItemsAtEndPaddingEnabled: useAlignItemsAtEndPadding,
    alwaysRender,
    alwaysRenderIndicesArr: alwaysRenderIndices.arr,
    alwaysRenderIndicesSet: alwaysRenderIndices.set,
    anchoredEndSpace,
    anchoredEndSpaceOwner,
    animatedProps: animatedPropsInternal,
    contentContainerAlignItems: contentContainerStyle.alignItems,
    contentContainerMinSize,
    contentExtentComponentInternal,
    contentInset,
    contentInsetEndAdjustment: contentInsetEndAdjustmentResolved,
    data: dataProp,
    dataKey,
    dataSource,
    dataVersion,
    drawDistance,
    estimatedItemSize,
    getFixedItemSize: wrappedGetFixedItemSize,
    getItemType: wrappedGetItemType,
    hasExternalScroll,
    hasReliableKeyExtractor: !!dataSource || !!keyExtractorProp,
    hideItemsUntilMeasured: experimental_hideItemsUntilMeasured,
    horizontal: !!horizontal,
    itemsAreEqual,
    keyExtractor: wrappedKeyExtractor,
    maintainScrollAtEnd: maintainScrollAtEndConfig,
    maintainScrollAtEndThreshold,
    maintainVisibleContentPosition: maintainVisibleContentPositionConfig,
    numColumns: numColumnsProp,
    onEndReached,
    onEndReachedThreshold,
    onFirstVisibleItemChanged,
    onItemSizeChanged,
    onLoad,
    onMetricsChange,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    onReady,
    onScroll: throttleScrollFn,
    onScrollBeginDrag,
    onScrollEndDrag,
    onStartReached,
    onStartReachedThreshold,
    onStickyHeaderChange,
    onUserScroll,
    overrideItemLayout,
    positionComponentInternal,
    recycleItems: !!recycleItems,
    renderItem,
    rtl,
    snapToIndices,
    stickyHeaderIndicesArr: stickyHeaderIndices != null ? stickyHeaderIndices : [],
    stickyHeaderIndicesSet,
    stickyPositionComponentInternal,
    stylePaddingBottom: stylePaddingBottomState,
    stylePaddingLeft: stylePaddingLeftState,
    stylePaddingRight: stylePaddingRightState,
    stylePaddingTop: stylePaddingTopState,
    useWindowScroll: useWindowScrollResolved,
    viewabilityConfig
  };
  holdRaisedDrawDistance(renderCtx, previousDrawDistance);
  if (arrayLayout && stickyHeaderIndicesSet !== previousProps.stickyHeaderIndicesSet) {
    set$(renderCtx, "stickyLayoutEpoch", ((_t = peek$(renderCtx, "stickyLayoutEpoch")) != null ? _t : 0) + 1);
  }
  useLayoutEffect(() => {
    var _a4;
    if (!arrayLayout && !isFirstLocal) {
      set$(ctx, "stickyLayoutEpoch", ((_a4 = peek$(ctx, "stickyLayoutEpoch")) != null ? _a4 : 0) + 1);
    }
  }, [stickyHeaderIndicesSet]);
  useLayoutEffect(() => {
    if (!dataSource || dataSourceRevision === void 0) {
      return;
    }
    const observer = new DataSourceObserver(
      dataSource,
      {
        onBatch: (batch) => {
          var _a4, _b2, _c2;
          (_a4 = state.pendingDataSourceBatches) != null ? _a4 : state.pendingDataSourceBatches = [];
          state.pendingDataSourceBatches.push(batch);
          (_b2 = state.dataSourcePreviousLength) != null ? _b2 : state.dataSourcePreviousLength = batch.previousLength;
          if (!state.dataSourceNeedsReset) {
            const result = applyDataSourceMutationBatches(ctx, dataSource, [batch]);
            state.dataSourceMutationApplied = state.dataSourceMutationApplied || result.applied;
            if (result.applied) {
              if (!state.layoutStoreRuntime) {
                syncLayoutStoreStructure(ctx);
              }
              if (state.dataSourceSpanInvalidationIndex === void 0) {
                syncLayoutStoreState(ctx);
              }
            }
            if (result.resetReason) {
              invalidateContainerMeasurements(state);
              resetViewabilityTimers(ctx);
              state.dataSourceNeedsReset = true;
              state.dataSourceResetReason = result.resetReason;
              state.dataSourceSpanInvalidationIndex = 0;
              (_c2 = state.layoutStoreRuntime) == null ? void 0 : _c2.clearRowSpanCache();
              if (result.resetReason !== "the data source requested a reset") {
                warnDevOnce(
                  "data-source-key-reset",
                  `Resetting data-source state because ${result.resetReason}.`
                );
              }
            }
          }
          commitDataSourceRef.current();
        },
        onReset: ({ batch, reason }) => {
          var _a4, _b2, _c2;
          invalidateContainerMeasurements(state);
          resetViewabilityTimers(ctx);
          (_a4 = state.pendingDataSourceBatches) != null ? _a4 : state.pendingDataSourceBatches = [];
          state.pendingDataSourceBatches.push(batch);
          (_b2 = state.dataSourcePreviousLength) != null ? _b2 : state.dataSourcePreviousLength = batch.previousLength;
          state.dataSourceNeedsReset = true;
          state.dataSourceResetReason = reason;
          state.dataSourceSpanInvalidationIndex = 0;
          (_c2 = state.layoutStoreRuntime) == null ? void 0 : _c2.clearRowSpanCache();
          warnDevOnce("data-source-safe-reset", `Resetting data-source state because ${reason}.`);
          commitDataSourceRef.current();
        }
      },
      { length: dataLength, revision: dataSourceRevision }
    );
    return observer.start();
  }, [dataSource]);
  if (shouldExactSyncLayoutStore) {
    rebuildLayoutStoreExact(renderCtx);
    syncLayoutStoreState(renderCtx);
  } else {
    syncLayoutStoreStructure(renderCtx);
  }
  renderState.refScroller = refScroller;
  if (!isFirstLocal && previousAdaptiveRender && !experimental_adaptiveRender) {
    resetAdaptiveRender(renderCtx);
  }
  if (!isFirstLocal && previousHideItemsUntilMeasured && !experimental_hideItemsUntilMeasured) {
    resetContainerLayoutReady(renderCtx);
  }
  const memoizedLastItemKeys = useMemo(() => {
    if (!dataLength) return [];
    return Array.from(
      { length: Math.min(numColumnsProp, dataLength) },
      (_, i) => getId(renderState, dataLength - 1 - i)
    );
  }, [dataLength, dataProp, dataKey, dataSource, dataSourceRevision, dataVersion, numColumnsProp]);
  if (arrayLayout) {
    for (const [i, key] of memoizedLastItemKeys.entries()) {
      renderState.idCache[dataLength - 1 - i] = key;
    }
  }
  const initializeStateVars = (layoutCtx, shouldAdjustPadding) => {
    const layoutState = layoutCtx.state;
    const length = getDataLength(layoutState);
    const lastKeys = dataSource ? Array.from({ length: Math.min(numColumnsProp, length) }, (_, i) => getId(layoutState, length - 1 - i)) : memoizedLastItemKeys;
    const previousLastKeys = peek$(layoutCtx, "lastItemKeys");
    if ((previousLastKeys == null ? void 0 : previousLastKeys.length) !== lastKeys.length || lastKeys.some((key, i) => key !== previousLastKeys[i])) {
      set$(layoutCtx, "lastItemKeys", lastKeys);
    }
    set$(layoutCtx, "numColumns", numColumnsProp);
    const prevPaddingTop = peek$(layoutCtx, "stylePaddingTop");
    setPaddingTop(layoutCtx, { stylePaddingTop: stylePaddingTopState });
    updateContentMetricsState(layoutCtx);
    let paddingDiff = stylePaddingTopState - prevPaddingTop;
    if (shouldAdjustPadding && maintainVisibleContentPositionConfig.size && paddingDiff && prevPaddingTop !== void 0 && Platform.OS === "ios") {
      const distanceFromStart = layoutState.scroll + getContentInsetTop(layoutCtx);
      if (distanceFromStart < 0) {
        paddingDiff += distanceFromStart;
      }
      requestAdjust(layoutCtx, paddingDiff, "padding");
    }
  };
  if (isFirstLocal) {
    initializeStateVars(ctx, false);
    resetLayoutCachesForDataChange(ctx);
    restoreItemSizeEstimates(ctx, estimatedListSize == null ? void 0 : estimatedListSize[horizontal ? "height" : "width"], sizeCacheOwner);
    if (state.sizes.size || (snapToIndices == null ? void 0 : snapToIndices.length)) {
      rebuildLayoutStoreExact(ctx);
    }
    syncLayoutStoreState(ctx);
    const targetIndex = (_u = state.initialScroll) == null ? void 0 : _u.index;
    if (state.hasEstimatedInitialLayout && getFixedItemSize && targetIndex) {
      for (let index = 0; index <= targetIndex; index++) getId(state, index);
      if (materializeFixedLayoutStoreRange(ctx, 0, targetIndex)) {
        syncLayoutStoreState(ctx);
      }
    }
  }
  const initialContentOffset = useMemo(() => {
    var _a4;
    const initialScroll = renderState.initialScroll;
    if (!initialScroll) {
      return void 0;
    }
    const resolvedOffset = (_a4 = initialScroll.contentOffset) != null ? _a4 : resolveInitialScrollOffset(renderCtx, initialScroll);
    return usesBootstrapInitialScroll && !!renderState.initialScroll && renderState.initialScroll.kind !== "offset" && Platform.OS === "web" ? void 0 : resolvedOffset;
  }, [usesBootstrapInitialScroll]);
  useLayoutEffect(() => {
    state.isUnmounted = false;
    if (state.initialScrollAnchor) schedulePreservedEndAnchorCorrection(ctx);
    if (state.userScrollContentSize !== void 0 || state.isMomentumScrolling) armUserScrollSettle(ctx);
    return () => {
      saveItemSizeEstimates(ctx, sizeCacheOwnerRef.current);
      state.isUnmounted = true;
      setFollowEndOwner(state, void 0);
      state.pendingMaintainScrollAtEnd = false;
      cancelImperativeScroll(state);
      syncScrollActive(ctx);
      state.scheduledWork.cancel("initialScrollFrame");
      resetViewabilityTimers(ctx);
      state.scheduledWork.dispose();
    };
  }, [ctx, state]);
  useLayoutEffect(() => {
    initializeInitialScrollOnMount(ctx, {
      alwaysDispatchInitialScroll: shouldInitializeHorizontalRTL,
      dataLength,
      hasFooterComponent: !!ListFooterComponent,
      initialContentOffset,
      initialScrollAtEnd,
      useBootstrapInitialScroll: usesBootstrapInitialScroll
    });
  }, []);
  if (isFirstLocal || didDataChangeLocal || state.didColumnsChange) {
    renderState.lastBatchingAction = Date.now();
    if (!dataSource && !keyExtractorProp && !isFirstLocal && didDataChangeLocal) {
      renderState.sizes.clear();
    }
  }
  const didPlanPlacement = canPlanPlacement && didDataChangeLocal;
  if (didPlanPlacement) {
    restoreItemSizeEstimates(
      renderCtx,
      (_w = (_v = renderState.lastLayout) == null ? void 0 : _v[horizontal ? "height" : "width"]) != null ? _w : estimatedListSize == null ? void 0 : estimatedListSize[horizontal ? "height" : "width"],
      sizeCacheOwner,
      ctx
    );
    initializeStateVars(renderCtx, false);
    if (!firstDataInMeasuredViewport || !doInitialAllocateContainers(renderCtx)) {
      placeDataChange(renderCtx, renderState.didColumnsChange);
    }
    set$(renderCtx, "extraData", extraData);
  }
  if (IS_DEV) {
    useDevChecks(props, renderState);
  }
  const pendingInitialSourceProps = useRef(void 0);
  const handleDataChange = (isPropsCommit = false) => {
    var _a4, _b2;
    const firstDataPropsCommit = isPropsCommit && pendingInitialSourceProps.current !== void 0 && pendingInitialSourceProps.current !== props.propsCommitToken;
    if (firstDataPropsCommit) pendingInitialSourceProps.current = void 0;
    const didDataChange = state.handledDataChangeEpoch !== state.dataChangeEpoch;
    const didStartFreshData = state.handledFreshDataTransitionEpoch !== state.freshDataTransitionEpoch;
    state.handledDataChangeEpoch = state.dataChangeEpoch;
    state.handledFreshDataTransitionEpoch = state.freshDataTransitionEpoch;
    if (didStartFreshData) {
      resetInitialRenderState(ctx, {
        resetInitialScroll: !!initialScrollProp,
        resetLayout: true
      });
    }
    if (didDataChange && !didPlanPlacement) {
      restoreItemSizeEstimates(
        ctx,
        (_b2 = (_a4 = state.lastLayout) == null ? void 0 : _a4[horizontal ? "height" : "width"]) != null ? _b2 : estimatedListSize == null ? void 0 : estimatedListSize[horizontal ? "height" : "width"],
        sizeCacheOwnerRef.current
      );
    }
    handleInitialScrollDataChange(ctx, {
      dataLength: getDataLength(state),
      didDataChange,
      didDataKeyChange: didDataKeyChangeLocal,
      didStartFreshData,
      firstDataPropsCommit,
      initialScrollAtEnd,
      latestInitialScroll: initialScrollAtEnd && initialScrollProp ? { ...initialScrollProp, index: Math.max(0, getDataLength(state) - 1) } : initialScrollProp,
      latestInitialScrollSessionKind: initialScrollAtEnd ? "end" : initialScrollUsesOffsetOnly ? "offset" : "index",
      stylePaddingEnd: stylePaddingEndState,
      useBootstrapInitialScroll: usesBootstrapInitialScroll
    });
  };
  useLayoutEffect(
    () => handleDataChange(true),
    [
      dataLength,
      dataKey,
      dataChangeEpoch,
      freshDataTransitionEpoch,
      initialScrollAtEnd,
      stylePaddingEndState,
      usesBootstrapInitialScroll
    ]
  );
  useLayoutEffect(() => {
    var _a4;
    if (didAnchoredEndSpaceAnchorIndexChange) {
      state.scrollForNextCalculateItemsInView = void 0;
      (_a4 = state.triggerCalculateItemsInView) == null ? void 0 : _a4.call(state);
    }
    maybeUpdateAnchoredEndSpace(ctx);
  }, [
    ctx,
    dataProp,
    dataVersion,
    anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorIndex,
    anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorMaxSize,
    anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorOffset,
    anchoredEndSpaceOwner,
    contentInset == null ? void 0 : contentInset.bottom,
    contentInset == null ? void 0 : contentInset.left,
    contentInset == null ? void 0 : contentInset.right,
    didAnchoredEndSpaceAnchorIndexChange,
    horizontal,
    numColumnsProp,
    rtl,
    stylePaddingBottomState,
    stylePaddingLeftState,
    stylePaddingRightState
  ]);
  useLayoutEffect(() => {
    const previousContentInsetEndAdjustment = previousContentInsetEndAdjustmentRef.current;
    previousContentInsetEndAdjustmentRef.current = contentInsetEndAdjustmentResolved;
    updateContentInsetEndAdjustment(ctx, previousContentInsetEndAdjustment);
  }, [ctx, contentInsetEndAdjustmentResolved]);
  const onLayoutFooter = useCallback(
    (layout) => {
      if (!usesBootstrapInitialScroll) {
        return;
      }
      handleBootstrapInitialScrollFooterLayout(ctx, {
        dataLength: getDataLength(state),
        footerSize: layout[horizontal ? "width" : "height"],
        initialScrollAtEnd,
        stylePaddingEnd: stylePaddingEndState
      });
    },
    [dataLength, initialScrollAtEnd, horizontal, stylePaddingEndState, usesBootstrapInitialScroll]
  );
  const onLayoutChange = useCallback(
    (layout, fromLayoutEffect) => {
      if (shouldIgnoreTransientMacOSScrollMeasurement({
        horizontal,
        layout,
        usesBootstrapInitialScroll: usesBootstrapInitialScroll && !state.didFinishInitialScroll
      })) {
        return;
      }
      const previousScrollLength = state.scrollLength;
      const previousOtherAxisSize = state.otherAxisSize;
      const hadEstimatedInitialLayout = state.hasEstimatedInitialLayout;
      handleLayout(ctx, layout, setCanRender);
      maybeUpdateAnchoredEndSpace(ctx);
      const didLayoutAffectBootstrapTarget = previousScrollLength !== state.scrollLength || previousOtherAxisSize !== state.otherAxisSize;
      if (usesBootstrapInitialScroll && (hadEstimatedInitialLayout && !state.hasEstimatedInitialLayout || !fromLayoutEffect && didLayoutAffectBootstrapTarget)) {
        handleBootstrapInitialScrollLayoutChange(ctx);
      }
      if (usesBootstrapInitialScroll) {
        return;
      }
      advanceCurrentInitialScrollSession(ctx);
    },
    [dataLength, horizontal, initialScrollAtEnd, stylePaddingEndState, usesBootstrapInitialScroll]
  );
  const { onLayout } = useOnLayoutSync({
    onLayoutChange,
    onLayoutProp,
    ref: refScroller});
  useLayoutEffect(() => {
    if (snapToIndices) {
      updateSnapToOffsets(ctx);
    }
  }, [snapToIndices]);
  useLayoutEffect(() => {
    if (!didPlanPlacement) initializeStateVars(ctx, true);
  }, [
    contentInset == null ? void 0 : contentInset.bottom,
    contentInset == null ? void 0 : contentInset.top,
    dataKey,
    dataVersion,
    horizontal,
    memoizedLastItemKeys,
    numColumnsProp,
    nextScrollAxisGap,
    stylePaddingBottomState,
    stylePaddingTopState,
    useAlignItemsAtEndPadding
  ]);
  const previousContentInsetTop = useRef(contentInset == null ? void 0 : contentInset.top);
  useLayoutEffect(() => {
    var _a4, _b2;
    const prevTop = Math.max(0, (_a4 = previousContentInsetTop.current) != null ? _a4 : 0);
    const didChange = previousContentInsetTop.current !== (contentInset == null ? void 0 : contentInset.top);
    previousContentInsetTop.current = contentInset == null ? void 0 : contentInset.top;
    if (didChange && Platform.OS === "ios" && !horizontal && !state.contentInsetOverride && !state.isDragging && !state.isMomentumScrolling) {
      const offset = -getContentInsetTop(ctx);
      if (!state.didFinishInitialScroll && !initialScrollAtEnd && !hasInitialScrollIndex && !hasInitialScrollOffset && ((_b2 = state.initialScroll) == null ? void 0 : _b2.kind) === "offset" && state.initialScroll && (!state.scrollingTo || state.scrollingTo.isInitialScroll)) {
        state.initialScroll.contentOffset = offset;
        advanceCurrentInitialScrollSession(ctx, { forceScroll: true });
      } else if (state.didFinishInitialScroll && !state.scrollingTo && Math.abs(state.scroll + prevTop) < 1) {
        scrollTo(ctx, { animated: false, offset });
      }
    }
  }, [contentInset == null ? void 0 : contentInset.top]);
  useLayoutEffect(() => {
    checkThresholds(ctx);
    rearmEndFollowIfSettled(ctx, "policy");
  }, [maintainScrollAtEndThreshold]);
  useLayoutEffect(() => {
    if (!maintainScrollAtEndConfig) {
      finishMaintainScrollAtEnd(ctx);
    } else if (peek$(ctx, "isFollowingEnd")) {
      doMaintainScrollAtEnd(ctx);
    }
  }, [!!maintainScrollAtEndConfig]);
  const previousAlwaysRenderIndices = useRef(alwaysRenderIndices);
  const updateContainers = (indices = alwaysRenderIndices) => {
    const previousPins = previousAlwaysRenderIndices.current;
    const didPinsChange = previousPins.set.size !== indices.set.size || previousPins.arr.some((index) => !indices.set.has(index));
    previousAlwaysRenderIndices.current = indices;
    const {
      didColumnsChange,
      didDataChange,
      isFirst,
      props: { data }
    } = state;
    const didAllocateContainers = getDataLength(state) > 0 && doInitialAllocateContainers(ctx);
    if (didAllocateContainers && state.lastLayout && state.initialScroll) {
      calculateItemsInView(ctx, { doMVCP: true });
    }
    if (!didAllocateContainers && !(didPlanPlacement && firstDataInMeasuredViewport) && !isFirst && (didDataChange || didColumnsChange)) {
      checkResetContainers(ctx, data, {
        didColumnsChange,
        placementAlreadyApplied: didPlanPlacement,
        previousDataLength: state.dataSourcePreviousLength
      });
    }
    if (didPinsChange && !didDataChange && !didColumnsChange && !isFirst) {
      const adjust = prepareMVCP(ctx, false, "item-size");
      state.scrollForNextCalculateItemsInView = void 0;
      calculateItemsInView(ctx);
      adjust == null ? void 0 : adjust();
    }
    if (didDataChange) {
      flushDataSourceRerenders(ctx);
      state.dataChangeKeyExtractorChanged = false;
      resetDataSourceMutation(state);
      state.pendingDataComparison = void 0;
      notifyScrollIdle(state);
    }
    if (isFirst && initialScrollUsesOffsetOnly) preserveLayoutStoreOffsetPredictions(ctx);
    state.didColumnsChange = false;
    state.didDataChange = false;
    state.isFirst = false;
  };
  useLayoutEffect(
    () => updateContainers(),
    [
      dataProp,
      dataKey,
      dataSource,
      dataSourceRevision,
      dataVersion,
      horizontal,
      numColumnsProp,
      nextScrollAxisGap,
      alwaysRenderIndices.arr.join(",")
    ]
  );
  if (dataSource)
    commitDataSourceRef.current = () => {
      var _a4, _b2;
      if (state.isFirst || state.props.stickyHeaderIndicesArr.length > 0 || state.props.maintainVisibleContentPosition.shouldRestorePosition) {
        scheduleDataSourceCommit();
        return;
      }
      const length = getDataLength(state);
      const previousLength = (_a4 = state.dataSourcePreviousLength) != null ? _a4 : length;
      if (length > 0 && previousLength === 0 && !state.hasHadNonEmptyData && !initialScrollProp) {
        pendingInitialSourceProps.current = props.propsCommitToken;
      }
      if (!initialScrollAtEnd && state.didFinishInitialScroll && ((_b2 = state.initialScrollAnchor) == null ? void 0 : _b2.viewPosition) === 1 && previousLength > 0) {
        clearPreservedInitialScrollTarget(state);
      }
      if (state.hasHadNonEmptyData && previousLength === 0 && length > 0) {
        state.freshDataTransitionEpoch++;
      }
      state.dataChangeEpoch++;
      state.dataChangeNeedsScrollUpdate = true;
      state.didDataChange = true;
      state.lastBatchingAction = Date.now();
      state.props.alignItemsAtEndPaddingEnabled = !!(alignItemsAtEnd && !horizontal && (contentContainerStyleBase == null ? void 0 : contentContainerStyleBase.minHeight) == null && length > 0);
      const arr = getAlwaysRenderIndices(alwaysRender, indexedData, keyExtractor, anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorIndex);
      const indices = { arr, set: new Set(arr) };
      state.props.alwaysRenderIndicesArr = arr;
      state.props.alwaysRenderIndicesSet = indices.set;
      syncLayoutStoreStructure(ctx);
      handleDataChange();
      initializeStateVars(ctx, true);
      maybeUpdateAnchoredEndSpace(ctx);
      updateContainers(indices);
      if (canRender && previousLength === 0 !== (length === 0)) {
        scheduleDataSourceCommit();
      }
    };
  const previousGetFixedItemSize = useRef(getFixedItemSize);
  useLayoutEffect(() => {
    var _a4, _b2;
    const hadFixedItemSize = !!previousGetFixedItemSize.current;
    previousGetFixedItemSize.current = getFixedItemSize;
    if (!isFirstLocal && (getFixedItemSize || hadFixedItemSize)) {
      const adjust = prepareMVCP(ctx, false, "item-size");
      invalidateFixedItemSizes(state);
      rebuildLayoutStoreExact(ctx);
      if (!state.props.dataSource) materializeFixedLayoutStoreRange(ctx, 0, getDataLength(state) - 1);
      syncLayoutStoreState(ctx);
      adjust == null ? void 0 : adjust();
      state.scrollForNextCalculateItemsInView = void 0;
      (_a4 = state.triggerCalculateItemsInView) == null ? void 0 : _a4.call(state, { doMVCP: true, forceFullItemPositions: true });
      if ((_b2 = state.props.maintainScrollAtEnd) == null ? void 0 : _b2.onItemLayout) doMaintainScrollAtEnd(ctx);
    }
  }, [!!getFixedItemSize, extraData]);
  useLayoutEffect(() => {
    var _a4;
    set$(ctx, "extraData", extraData);
    const didToggleOverride = prevHasOverrideItemLayout.current !== hasOverrideItemLayout;
    prevHasOverrideItemLayout.current = hasOverrideItemLayout;
    if ((hasOverrideItemLayout || didToggleOverride) && numColumnsProp > 1) {
      (_a4 = state.triggerCalculateItemsInView) == null ? void 0 : _a4.call(state, { forceFullItemPositions: true });
    }
  }, [extraData, hasOverrideItemLayout, numColumnsProp]);
  useEffect(() => {
    if (!onMetricsChange) {
      return;
    }
    let lastMetrics;
    const emitMetrics = () => {
      var _a4, _b2;
      const metrics = {
        footerSize: peek$(ctx, "footerSize") || 0,
        headerSize: peek$(ctx, "headerSize") || 0
      };
      if (!lastMetrics || metrics.headerSize !== lastMetrics.headerSize || metrics.footerSize !== lastMetrics.footerSize) {
        lastMetrics = metrics;
        (_b2 = (_a4 = state.props).onMetricsChange) == null ? void 0 : _b2.call(_a4, metrics);
      }
    };
    emitMetrics();
    const unsubscribe = [listen$(ctx, "headerSize", emitMetrics), listen$(ctx, "footerSize", emitMetrics)];
    return () => {
      for (const unsub of unsubscribe) {
        unsub();
      }
    };
  }, [ctx, !!onMetricsChange]);
  useEffect(() => {
    const hadViewabilityConsumers = hasViewabilityConsumers(ctx);
    const didViewabilityConfigChange = !areViewabilityConfigsEqual(previousViewabilityConfigRef.current, viewabilityConfig) || !areViewabilityConfigPairsEqual(previousViewabilityConfigPairsRef.current, viewabilityConfigCallbackPairs);
    previousViewabilityConfigRef.current = viewabilityConfig;
    previousViewabilityConfigPairsRef.current = viewabilityConfigCallbackPairs;
    const viewability = setupViewability(
      {
        onViewableItemsChanged,
        viewabilityConfig,
        viewabilityConfigCallbackPairs
      },
      ctx
    );
    state.viewabilityConfigCallbackPairs = viewability;
    state.scrollForNextCalculateItemsInView = void 0;
    const hasViewabilityConsumersNow = hasViewabilityConsumers(ctx, viewability);
    if (!hadViewabilityConsumers && hasViewabilityConsumersNow || didViewabilityConfigChange && (onFirstVisibleItemChanged || hasViewabilityConsumersNow)) {
      requestViewabilityRecalculation(ctx);
    }
  }, [viewabilityConfig, viewabilityConfigCallbackPairs, onViewableItemsChanged]);
  useInit(() => {
    if (!IsNewArchitecture || state.hasEstimatedInitialLayout) {
      doInitialAllocateContainers(ctx);
    }
  });
  const pendingScrollCommands = useRef([]);
  const flushScrollCommands = () => {
    const commands = pendingScrollCommands.current;
    if (commands.length) {
      pendingScrollCommands.current = [];
      state.scheduledWork.cancel("imperativeScrollCommit");
      for (const command of commands) command.run();
    }
  };
  useLayoutEffect(() => {
    markLayoutChanged(ctx);
    flushScrollCommands();
  });
  const flushCommittedScrollCommands = () => {
    var _a4, _b2;
    flushScrollCommands();
    if (!state.didDataChange && !state.didColumnsChange && !((_a4 = state.pendingDataSourceBatches) == null ? void 0 : _a4.length)) {
      (_b2 = state.runPendingScrollToEnd) == null ? void 0 : _b2.call(state);
    }
  };
  useEffect(flushCommittedScrollCommands);
  useImperativeHandle(
    forwardedRef,
    () => createImperativeHandle(ctx, scheduleImperativeScrollCommit, (run, cancel) => {
      if (!pendingScrollCommands.current.length) {
        state.scheduledWork.register("imperativeScrollCommit", () => {
          const commands = pendingScrollCommands.current;
          pendingScrollCommands.current = [];
          for (const command of commands) command.cancel();
        });
        queueMicrotask(flushScrollCommands);
      }
      pendingScrollCommands.current.push({ cancel, run });
    }),
    []
  );
  useEffect(() => {
    if (hasViewabilityConsumers(ctx)) {
      requestViewabilityRecalculation(ctx);
    }
  }, [ctx, state]);
  useLayoutEffect(() => {
    var _a4;
    (_a4 = state.runPendingScrollToEnd) == null ? void 0 : _a4.call(state);
  });
  useEffect(() => {
    if (Platform.OS !== "web" || usesBootstrapInitialScroll) {
      return;
    }
    advanceCurrentInitialScrollSession(ctx);
  }, [ctx, usesBootstrapInitialScroll]);
  const fns = useMemo(
    () => ({
      getRenderedItem: (key, containerId, onReadIndex, snapshot) => getRenderedItem(ctx, key, containerId, onReadIndex, snapshot),
      onMomentumScrollBegin: (event) => {
        var _a4, _b2;
        state.isMomentumScrolling = true;
        set$(ctx, "isScrollActive", true);
        armUserScrollSettle(ctx);
        (_b2 = (_a4 = state.props).onMomentumScrollBegin) == null ? void 0 : _b2.call(_a4, event);
      },
      onMomentumScrollEnd: (event) => {
        var _a4, _b2;
        onScroll(ctx, event, false);
        noteNativeScrollAnimationEnd(ctx);
        settleUserScroll(ctx);
        checkFinishedScrollFallback(ctx);
        (_b2 = (_a4 = state.props).onMomentumScrollEnd) == null ? void 0 : _b2.call(_a4, event);
      },
      onScroll: (event) => onScroll(ctx, event),
      onScrollBeginDrag: (event) => {
        var _a4, _b2, _c2, _d2;
        state.isMomentumScrolling = false;
        state.userScrollContentSize = void 0;
        state.scheduledWork.cancel("endFollowRearm");
        state.isDragging = true;
        if (state.initialScrollAnchor) clearInitialScrollAnchor(state);
        recordViewabilityInteraction(ctx);
        interruptUserScroll(ctx);
        (_b2 = (_a4 = state.props).onUserScroll) == null ? void 0 : _b2.call(_a4);
        prepareReachedEdgeForNextUserScroll(ctx);
        (_d2 = (_c2 = state.props).onScrollBeginDrag) == null ? void 0 : _d2.call(_c2, event);
      },
      onScrollEnd: () => prepareReachedEdgeForNextUserScroll(ctx),
      onScrollEndDrag: (event) => {
        var _a4, _b2;
        onScroll(ctx, event, false);
        state.isDragging = false;
        syncScrollActive(ctx);
        state.userScrollContentSize = getContentSize(ctx);
        armUserScrollSettle(ctx);
        (_b2 = (_a4 = state.props).onScrollEndDrag) == null ? void 0 : _b2.call(_a4, event);
      }
    }),
    []
  );
  const scrollHandler = useStickyScrollHandler(
    stickyHeaderIndices,
    horizontal,
    ctx,
    fns.onScroll,
    combinedRef,
    renderState
  );
  const refreshControlElement = refreshControl;
  return /* @__PURE__ */ React2.createElement(RenderLayoutContext.Provider, { value: arrayLayout != null ? arrayLayout : ctx.committedLayout }, /* @__PURE__ */ React2.createElement(CommitArrayLayout, { layout: arrayLayout }), /* @__PURE__ */ React2.createElement(
    ListComponent,
    {
      ...restProps,
      alignItemsAtEnd,
      autoscrollToTopThreshold: typeof maintainVisibleContentPositionProp === "object" ? maintainVisibleContentPositionProp == null ? void 0 : maintainVisibleContentPositionProp.autoscrollToTopThreshold : void 0,
      canRender,
      contentContainerStyle,
      contentInset,
      freshDataTransitionEpoch: renderState.freshDataTransitionEpoch,
      getRenderedItem: fns.getRenderedItem,
      horizontal,
      initialContentOffset,
      ListEmptyComponent: dataLength === 0 ? ListEmptyComponent : void 0,
      ListFooterComponent,
      ListFooterComponentStyle,
      ListHeaderComponent,
      onInternalScrollBeginDrag: fns.onScrollBeginDrag,
      onInternalScrollEnd: fns.onScrollEnd,
      onInternalScrollEndDrag: fns.onScrollEndDrag,
      onLayout,
      onLayoutFooter,
      onMomentumScrollBegin: fns.onMomentumScrollBegin,
      onMomentumScrollEnd: fns.onMomentumScrollEnd,
      onScroll: scrollHandler.onScroll,
      recycleItems,
      refreshControl: refreshControlElement ? stylePaddingTopState > 0 ? React2.cloneElement(refreshControlElement, {
        progressViewOffset: ((_x = refreshControlElement.props.progressViewOffset) != null ? _x : 0) + stylePaddingTopState
      }) : refreshControlElement : onRefresh && /* @__PURE__ */ React2.createElement(
        RefreshControl,
        {
          onRefresh,
          progressViewOffset: (progressViewOffset || 0) + stylePaddingTopState,
          refreshing: !!refreshing
        }
      ),
      refScrollView: scrollHandler.refScrollView,
      renderScrollComponent,
      scrollAdjustHandler: (_y = refState.current) == null ? void 0 : _y.scrollAdjustHandler,
      scrollElement: scrollElementResolved,
      scrollEventThrottle: 0,
      snapToIndices,
      stickyHeaderIndices,
      style,
      useWindowScroll: useWindowScrollResolved
    }
  ), IS_DEV && ENABLE_DEBUG_VIEW);
});
function resetDataSourceMutation(state) {
  state.dataSourceNeedsReset = false;
  state.dataSourceAnchorPositions = void 0;
  state.dataSourceMutationApplied = false;
  state.dataSourcePreviousLength = void 0;
  state.dataSourceResetReason = void 0;
  state.pendingDataSourceBatches = void 0;
}
function normalizeNumColumnsProp(numColumns) {
  let normalizedNumColumns = numColumns != null ? numColumns : 1;
  if (!Number.isInteger(normalizedNumColumns) || normalizedNumColumns < 1) {
    warnDevOnce(
      "invalid-numColumns",
      `numColumns must be a positive integer. Received ${numColumns}; using 1 instead.`
    );
    normalizedNumColumns = 1;
  }
  return normalizedNumColumns;
}

// src/entrypoints/shared.ts
var LegendListRuntime = LegendList;
var internal = {
  getComponent,
  getStickyPushLimit,
  IsNewArchitecture,
  POSITION_OUT_OF_VIEW,
  peek$,
  typedForwardRef,
  typedMemo,
  useArr$,
  useCombinedRef,
  useLatestRef,
  useRenderStateContext,
  useStableRenderComponent,
  useStateContext
};

// src/react-native.ts
var LegendList3 = LegendListRuntime;
var internal2 = internal;

export { LegendList3 as LegendList, internal2 as internal, useAdaptiveRender, useAdaptiveRenderChange, useIsLastItem, useListScrollSize, useRecyclingEffect, useRecyclingState, useSyncLayout, useViewability, useViewabilityAmount };
