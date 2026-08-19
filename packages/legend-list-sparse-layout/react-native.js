'use strict';

var React2 = require('react');
var ReactNative = require('react-native');
var shim = require('use-sync-external-store/shim');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var React2__namespace = /*#__PURE__*/_interopNamespace(React2);
var ReactNative__namespace = /*#__PURE__*/_interopNamespace(ReactNative);

// src/components/LegendList.tsx
ReactNative.Animated.View;
var View = ReactNative.View;
var Text = ReactNative.Text;
var Platform = ReactNative.Platform;
var PlatformAdjustBreaksScroll = Platform.OS === "android" || Platform.OS === "macos";

// src/utils/rtl.ts
function clampHorizontalOffset(offset, maxOffset) {
  if (maxOffset === void 0) {
    return offset;
  }
  return Math.max(0, Math.min(maxOffset, offset));
}
function getHorizontalMaxOffset(state, contentWidth) {
  if (contentWidth === void 0 || !Number.isFinite(contentWidth) || !Number.isFinite(state.scrollLength) || contentWidth <= state.scrollLength) {
    return contentWidth !== void 0 && Number.isFinite(contentWidth) && Number.isFinite(state.scrollLength) ? 0 : void 0;
  }
  return Math.max(0, contentWidth - state.scrollLength);
}
function getDefaultHorizontalRTLScrollType() {
  return Platform.OS === "web" ? "normal" : "inverted";
}
function getNativeHorizontalRTLScrollType(state) {
  var _a3;
  return (_a3 = state == null ? void 0 : state.horizontalRTLScrollType) != null ? _a3 : getDefaultHorizontalRTLScrollType();
}
function isRTLProps(props) {
  var _a3;
  return (_a3 = props == null ? void 0 : props.rtl) != null ? _a3 : !!ReactNative.I18nManager.isRTL;
}
function isHorizontalRTL(state) {
  return isHorizontalRTLProps(state == null ? void 0 : state.props);
}
function isHorizontalRTLProps(props) {
  return !!(props == null ? void 0 : props.horizontal) && isRTLProps(props);
}
function getStylePaddingEnd(props) {
  if (!(props == null ? void 0 : props.horizontal)) {
    return (props == null ? void 0 : props.stylePaddingBottom) || 0;
  }
  return (isHorizontalRTLProps(props) ? props.stylePaddingLeft : props.stylePaddingRight) || 0;
}
function getLogicalHorizontalMaxOffset(state, contentWidth) {
  var _a3;
  return (_a3 = getHorizontalMaxOffset(state, contentWidth)) != null ? _a3 : 0;
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
function toLogicalHorizontalOffset(state, rawOffset, contentWidth) {
  if (!isHorizontalRTL(state)) {
    state.horizontalRTLScrollType = void 0;
    return rawOffset;
  }
  const maxOffset = getHorizontalMaxOffset(state, contentWidth);
  if (rawOffset < 0) {
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
    const defaultMode = getDefaultHorizontalRTLScrollType();
    state.horizontalRTLScrollType = defaultMode;
    return clampHorizontalOffset(defaultMode === "inverted" ? invertedOffset : normalOffset, maxOffset);
  }
  const referenceScroll = state.scroll;
  const distanceNormal = Math.abs(normalOffset - referenceScroll);
  const distanceInverted = Math.abs(invertedOffset - referenceScroll);
  const useInverted = distanceInverted + 0.5 < distanceNormal;
  state.horizontalRTLScrollType = useInverted ? "inverted" : "normal";
  return clampHorizontalOffset(useInverted ? invertedOffset : normalOffset, maxOffset);
}
var createAnimatedValue = (value) => new ReactNative.Animated.Value(value);

// src/state/state.tsx
var ContextState = React2__namespace.createContext(null);
var SIGNAL_NAMES_SEPARATOR = "\0";
var contextNum = 0;
function StateProvider({ children }) {
  const [value] = React2__namespace.useState(() => ({
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
  return /* @__PURE__ */ React2__namespace.createElement(ContextState.Provider, { value }, children);
}
function useStateContext() {
  return React2__namespace.useContext(ContextState);
}
function createSelectorFunctionsArr(ctx, signalNames) {
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
      const currentValues = [];
      let hasChanged = false;
      for (let i = 0; i < signalNames.length; i++) {
        const value = peek$(ctx, signalNames[i]);
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
        listeners.push(listen$(ctx, signalName, cb));
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
function listen$(ctx, signalName, cb) {
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
    for (const listener of setListeners) {
      listener(value);
    }
  }
}
function useArr$(signalNames) {
  const ctx = React2__namespace.useContext(ContextState);
  const signalNamesKey = getSignalNamesKey(signalNames);
  const { subscribe, get } = React2__namespace.useMemo(
    () => createSelectorFunctionsArr(ctx, getSignalNamesFromKey(signalNamesKey)),
    [ctx, signalNamesKey]
  );
  const value = shim.useSyncExternalStore(subscribe, get, get);
  return value;
}
function useSelector$(signalName, selector) {
  const ctx = React2__namespace.useContext(ContextState);
  const { subscribe, get } = React2__namespace.useMemo(() => createSelectorFunctionsArr(ctx, [signalName]), [ctx, signalName]);
  const getSelectedValue = React2__namespace.useCallback(() => selector(get()[0]), [get, selector]);
  const value = shim.useSyncExternalStore(subscribe, getSelectedValue, getSelectedValue);
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
  const contentInset = props.contentInset;
  const baseInset = contentInset != null ? contentInset : state.nativeContentInset;
  const baseEndInset = (horizontal ? getHorizontalInsetEnd(state, baseInset) : baseInset == null ? void 0 : baseInset.bottom) || 0;
  const contentInsetEndAdjustment = getContentInsetEndAdjustmentEnd(
    contentInsetEndAdjustmentOverride != null ? contentInsetEndAdjustmentOverride : props.contentInsetEndAdjustment
  );
  const anchoredEndSpaceSize = peek$(ctx, "anchoredEndSpaceSize");
  const anchoredEndInset = props.anchoredEndSpace && anchoredEndSpaceSize ? anchoredEndSpaceSize : 0;
  const overrideInset = (_a3 = state.contentInsetOverride) != null ? _a3 : void 0;
  const adjustedBaseEndInset = baseEndInset + contentInsetEndAdjustment;
  if (overrideInset) {
    const mergedInset = { bottom: 0, left: 0, right: 0, ...baseInset, ...overrideInset };
    return Math.max(
      ((horizontal ? getHorizontalInsetEnd(state, mergedInset) : mergedInset.bottom) || 0) + contentInsetEndAdjustment,
      anchoredEndInset
    );
  }
  return Math.max(adjustedBaseEndInset, anchoredEndInset);
}

// src/state/getContentSize.ts
function getContentSize(ctx) {
  var _a3, _b;
  const { values, state } = ctx;
  const stylePaddingStart = state.props.horizontal ? state.props.stylePaddingLeft || 0 : values.get("stylePaddingTop") || 0;
  const stylePaddingEnd = state.props.horizontal ? state.props.stylePaddingRight || 0 : state.props.stylePaddingBottom || 0;
  const alignItemsAtEndPadding = values.get("alignItemsAtEndPadding") || 0;
  const headerSize = values.get("headerSize") || 0;
  const footerSize = values.get("footerSize") || 0;
  const contentInsetEnd = getContentInsetEnd(ctx);
  const totalSize = (_b = (_a3 = state.pendingTotalSize) != null ? _a3 : state.totalSize) != null ? _b : values.get("totalSize");
  const layoutSize = Math.max(0, totalSize - (state.props.data.length > 0 ? ctx.scrollAxisGap : 0));
  return headerSize + footerSize + layoutSize + stylePaddingStart + alignItemsAtEndPadding + stylePaddingEnd + (contentInsetEnd || 0);
}

// src/components/DebugView.tsx
var DebugRow = ({ children }) => {
  return /* @__PURE__ */ React2__namespace.createElement(View, { style: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" } }, children);
};
React2__namespace.memo(function DebugView2() {
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
  const [, forceUpdate] = React2.useReducer((x) => x + 1, 0);
  useInterval(() => {
    forceUpdate();
  }, 100);
  return /* @__PURE__ */ React2__namespace.createElement(
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
    /* @__PURE__ */ React2__namespace.createElement(DebugRow, null, /* @__PURE__ */ React2__namespace.createElement(Text, null, "TotalSize:"), /* @__PURE__ */ React2__namespace.createElement(Text, null, totalSize.toFixed(2))),
    /* @__PURE__ */ React2__namespace.createElement(DebugRow, null, /* @__PURE__ */ React2__namespace.createElement(Text, null, "ContentSize:"), /* @__PURE__ */ React2__namespace.createElement(Text, null, contentSize.toFixed(2))),
    /* @__PURE__ */ React2__namespace.createElement(DebugRow, null, /* @__PURE__ */ React2__namespace.createElement(Text, null, "At end:"), /* @__PURE__ */ React2__namespace.createElement(Text, null, String(isAtEnd))),
    /* @__PURE__ */ React2__namespace.createElement(DebugRow, null, /* @__PURE__ */ React2__namespace.createElement(Text, null, "ScrollAdjust:"), /* @__PURE__ */ React2__namespace.createElement(Text, null, scrollAdjust.toFixed(2))),
    /* @__PURE__ */ React2__namespace.createElement(DebugRow, null, /* @__PURE__ */ React2__namespace.createElement(Text, null, "RawScroll: "), /* @__PURE__ */ React2__namespace.createElement(Text, null, rawScroll.toFixed(2))),
    /* @__PURE__ */ React2__namespace.createElement(DebugRow, null, /* @__PURE__ */ React2__namespace.createElement(Text, null, "ComputedScroll: "), /* @__PURE__ */ React2__namespace.createElement(Text, null, scroll.toFixed(2)))
  );
});
function useInterval(callback, delay) {
  React2.useEffect(() => {
    const interval = setInterval(callback, delay);
    return () => clearInterval(interval);
  }, [delay]);
}

// src/constants-platform.native.ts
var f = global.nativeFabricUIManager;
var IsNewArchitecture = f !== void 0 && f != null;

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
  const resolvedItemType = getItemType ? (_a3 = getItemType(itemData, itemIndex)) != null ? _a3 : "" : void 0;
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
  if (getFixedItemSize && !metadata.didResolveFixedItemSize) {
    metadata.fixedItemSize = getFixedItemSize(itemData, itemIndex, (_a3 = metadata.itemType) != null ? _a3 : "");
    metadata.didResolveFixedItemSize = true;
  }
  return metadata;
}
function invalidateContainerFixedItemSizes(state) {
  for (const metadata of state.containerItemMetadata.values()) {
    metadata.didResolveFixedItemSize = false;
    metadata.fixedItemSize = void 0;
  }
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
var ENABLE_DEVMODE = IS_DEV && false;
var ENABLE_DEBUG_VIEW = IS_DEV && false;

// src/core/cancelImperativeScroll.ts
function cancelScrollCompletionChecks({ scheduledWork }) {
  scheduledWork.cancel("checkFinishedScrollFrame");
  scheduledWork.cancel("checkFinishedScrollRetryFrame");
  scheduledWork.cancel("checkFinishedScrollFallback");
  scheduledWork.cancel("platformScrollCompletion");
}
function settlePendingImperativeScroll(state) {
  var _a3, _b;
  const resolvePendingScroll = (_b = state.pendingScrollResolve) != null ? _b : (_a3 = state.pendingScrollToEnd) == null ? void 0 : _a3.resolve;
  state.pendingScrollResolve = void 0;
  state.pendingScrollToEnd = void 0;
  resolvePendingScroll == null ? void 0 : resolvePendingScroll();
}
function cancelImperativeScroll(state) {
  cancelScrollCompletionChecks(state);
  state.scheduledWork.cancel("imperativeScrollReady");
  state.scrollingTo = void 0;
  state.scrollTargetPinnedRange = void 0;
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

// src/core/initialScrollSession.ts
var INITIAL_SCROLL_MIN_TARGET_OFFSET = 1;
function hasInitialScrollSessionCompletion(completion) {
  return !!((completion == null ? void 0 : completion.didDispatchNativeScroll) || (completion == null ? void 0 : completion.didRetrySilentInitialScroll) || (completion == null ? void 0 : completion.watchdog));
}
function clearInitialScrollSession(state) {
  state.initialScrollSession = void 0;
  return void 0;
}
function createInitialScrollSession(options) {
  const { bootstrap, completion, kind, previousDataLength } = options;
  return kind === "offset" ? {
    completion,
    kind,
    previousDataLength
  } : {
    bootstrap,
    completion,
    kind,
    previousDataLength
  };
}
function ensureInitialScrollSessionCompletion(state, kind = ((_b) => (_b = ((_a3) => (_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind)()) != null ? _b : "bootstrap")()) {
  var _a4, _b2;
  if (!state.initialScrollSession) {
    state.initialScrollSession = createInitialScrollSession({
      completion: {},
      kind,
      previousDataLength: 0
    });
  } else if (state.initialScrollSession.kind !== kind) {
    state.initialScrollSession = createInitialScrollSession({
      bootstrap: state.initialScrollSession.kind === "bootstrap" ? state.initialScrollSession.bootstrap : void 0,
      completion: state.initialScrollSession.completion,
      kind,
      previousDataLength: state.initialScrollSession.previousDataLength
    });
  }
  (_b2 = (_a4 = state.initialScrollSession).completion) != null ? _b2 : _a4.completion = {};
  return state.initialScrollSession.completion;
}
var initialScrollCompletion = {
  didDispatchNativeScroll(state) {
    var _a3, _b;
    return !!((_b = (_a3 = state.initialScrollSession) == null ? void 0 : _a3.completion) == null ? void 0 : _b.didDispatchNativeScroll);
  },
  didRetrySilentInitialScroll(state) {
    var _a3, _b;
    return !!((_b = (_a3 = state.initialScrollSession) == null ? void 0 : _a3.completion) == null ? void 0 : _b.didRetrySilentInitialScroll);
  },
  markInitialScrollNativeDispatch(state) {
    ensureInitialScrollSessionCompletion(state).didDispatchNativeScroll = true;
  },
  markSilentInitialScrollRetry(state) {
    ensureInitialScrollSessionCompletion(state).didRetrySilentInitialScroll = true;
  },
  resetFlags(state) {
    if (!state.initialScrollSession) {
      return;
    }
    const completion = ensureInitialScrollSessionCompletion(state, state.initialScrollSession.kind);
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
    return (_b = (_a3 = state.initialScrollSession) == null ? void 0 : _a3.completion) == null ? void 0 : _b.watchdog;
  },
  hasNonZeroTargetOffset(targetOffset) {
    return targetOffset !== void 0 && targetOffset > INITIAL_SCROLL_MIN_TARGET_OFFSET;
  },
  isAtZeroTargetOffset(targetOffset) {
    return targetOffset <= INITIAL_SCROLL_MIN_TARGET_OFFSET;
  },
  set(state, watchdog) {
    var _a3, _b;
    if (!watchdog && !((_b = (_a3 = state.initialScrollSession) == null ? void 0 : _a3.completion) == null ? void 0 : _b.watchdog)) {
      return;
    }
    const completion = ensureInitialScrollSessionCompletion(state);
    completion.watchdog = watchdog ? {
      startScroll: watchdog.startScroll,
      targetOffset: watchdog.targetOffset
    } : void 0;
  }
};
function setInitialScrollSession(state, options = {}) {
  var _a3, _b, _c, _d;
  const existingSession = state.initialScrollSession;
  const kind = (_a3 = options.kind) != null ? _a3 : existingSession == null ? void 0 : existingSession.kind;
  const completion = existingSession == null ? void 0 : existingSession.completion;
  const existingBootstrap = (existingSession == null ? void 0 : existingSession.kind) === "bootstrap" ? existingSession.bootstrap : void 0;
  const bootstrap = kind === "bootstrap" ? options.bootstrap === null ? void 0 : (_b = options.bootstrap) != null ? _b : existingBootstrap : void 0;
  if (!kind) {
    return clearInitialScrollSession(state);
  }
  if (!state.initialScroll && !bootstrap && !hasInitialScrollSessionCompletion(completion)) {
    return clearInitialScrollSession(state);
  }
  const previousDataLength = (_d = (_c = options.previousDataLength) != null ? _c : existingSession == null ? void 0 : existingSession.previousDataLength) != null ? _d : 0;
  state.initialScrollSession = createInitialScrollSession({
    bootstrap,
    completion,
    kind,
    previousDataLength
  });
  return state.initialScrollSession;
}

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
function getIndexedData(state) {
  const { data, dataSource, keyExtractor } = state.props;
  let indexedData = state.indexedData;
  if (indexedData && data === void 0 && dataSource === void 0) {
    return indexedData;
  }
  if (dataSource) {
    if (!(indexedData instanceof DataSourceAdapter) || indexedData.source !== dataSource) {
      indexedData = new DataSourceAdapter(dataSource);
    }
  } else if (!(indexedData instanceof ArrayDataAdapter) || !indexedData.matches(data != null ? data : [], keyExtractor)) {
    indexedData = new ArrayDataAdapter(data != null ? data : [], keyExtractor);
  }
  state.indexedData = indexedData;
  return indexedData;
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

// src/utils/checkThreshold.ts
var HYSTERESIS_MULTIPLIER = 1.3;
function isOutsideThresholdHysteresis(distance, atThreshold, threshold) {
  const absDistance = Math.abs(distance);
  return !atThreshold && threshold > 0 && absDistance >= threshold * HYSTERESIS_MULTIPLIER || !atThreshold && threshold <= 0 && absDistance > 0;
}
var checkThreshold = (distance, atThreshold, threshold, wasReached, snapshot, context, onReached, setSnapshot) => {
  const absDistance = Math.abs(distance);
  const within = atThreshold || threshold > 0 && absDistance <= threshold;
  const updateSnapshot = () => {
    setSnapshot({
      atThreshold,
      contentSize: context.contentSize,
      dataLength: context.dataLength,
      scrollPosition: context.scrollPosition
    });
  };
  if (!wasReached) {
    if (!within) {
      return false;
    }
    onReached(distance);
    updateSnapshot();
    return true;
  }
  const reset = isOutsideThresholdHysteresis(distance, atThreshold, threshold);
  if (reset) {
    setSnapshot(void 0);
    return false;
  }
  if (within) {
    const changed = !snapshot || snapshot.atThreshold !== atThreshold || snapshot.contentSize !== context.contentSize || snapshot.dataLength !== context.dataLength;
    if (changed) {
      updateSnapshot();
    }
  }
  return true;
};

// src/utils/edgeReachedGate.ts
function resetEdgeLatch(ctx, edge) {
  const state = ctx.state;
  if (edge === "start") {
    state.isStartReached = false;
    state.startReachedSnapshot = void 0;
  } else {
    state.isEndReached = false;
    state.endReachedSnapshot = void 0;
  }
}
function resetSharedEdgeGateIfOutsideHysteresis(ctx) {
  const state = ctx.state;
  if (!state.edgeReachedGate) {
    return;
  }
  const contentSize = getContentSize(ctx);
  const endDistance = contentSize - state.scroll - state.scrollLength - getContentInsetEnd(ctx);
  const isContentLess = contentSize < state.scrollLength;
  const startThreshold = state.props.onStartReachedThreshold * state.scrollLength;
  const endThreshold = state.props.onEndReachedThreshold * state.scrollLength;
  const isOutsideStart = isOutsideThresholdHysteresis(state.scroll, false, startThreshold);
  const isOutsideEnd = isOutsideThresholdHysteresis(endDistance, isContentLess, endThreshold);
  if (isOutsideStart && isOutsideEnd) {
    state.edgeReachedGate = void 0;
  }
}
function canDispatchReachedEdge(ctx, edge, allowedEdge, allowGateCreatedInCurrentCheck) {
  return !ctx.state.edgeReachedGate || allowedEdge === edge || !!allowGateCreatedInCurrentCheck;
}
function markReachedEdge(ctx) {
  ctx.state.edgeReachedGate = "closed";
}
function prepareReachedEdgeForNextUserScroll(ctx) {
  if (ctx.state.edgeReachedGate) {
    ctx.state.edgeReachedGate = "prepared";
  }
}
function beginReachedEdgeUserScroll(ctx, scrollDelta) {
  const state = ctx.state;
  if (state.edgeReachedGate !== "prepared") {
    return void 0;
  }
  const allowedEdge = scrollDelta < 0 ? "start" : "end";
  state.edgeReachedGate = "closed";
  resetEdgeLatch(ctx, allowedEdge);
  return allowedEdge;
}

// src/utils/hasActiveInitialScroll.ts
function hasActiveInitialScroll(state) {
  return !!(state == null ? void 0 : state.initialScroll) && !state.didFinishInitialScroll;
}

// src/utils/checkAtBottom.ts
function checkAtBottom(ctx, allowedEdge, allowGateCreatedInCurrentCheck) {
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
  resetSharedEdgeGateIfOutsideHysteresis(ctx);
  if (contentSize > 0 && queuedInitialLayout) {
    const insetEnd = getContentInsetEnd(ctx);
    const distanceFromEnd = contentSize - scroll - scrollLength - insetEnd;
    const isContentLess = contentSize < scrollLength;
    set$(ctx, "isAtEnd", isContentLess || distanceFromEnd <= EDGE_POSITION_EPSILON);
    set$(ctx, "isNearEnd", isContentLess || distanceFromEnd <= onEndReachedThreshold * scrollLength);
    set$(
      ctx,
      "isWithinMaintainScrollAtEndThreshold",
      isContentLess || distanceFromEnd <= maintainScrollAtEndThreshold * scrollLength
    );
    const shouldSkipThresholdChecks = hasActiveInitialScroll(state) || maintainingScrollAtEnd;
    if (!shouldSkipThresholdChecks) {
      state.isEndReached = checkThreshold(
        distanceFromEnd,
        isContentLess,
        onEndReachedThreshold * scrollLength,
        state.isEndReached,
        state.endReachedSnapshot,
        {
          contentSize,
          dataLength: getDataLength(state),
          scrollPosition: scroll
        },
        (distance) => {
          var _a3, _b;
          if (canDispatchReachedEdge(ctx, "end", allowedEdge, allowGateCreatedInCurrentCheck)) {
            markReachedEdge(ctx);
            (_b = (_a3 = state.props).onEndReached) == null ? void 0 : _b.call(_a3, { distanceFromEnd: distance });
          }
        },
        (snapshot) => {
          state.endReachedSnapshot = snapshot;
        }
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
    isStartReached,
    props: { onStartReachedThreshold },
    scroll,
    scrollLength,
    startReachedSnapshot,
    totalSize
  } = state;
  const dataLength = getDataLength(state);
  const threshold = onStartReachedThreshold * scrollLength;
  resetSharedEdgeGateIfOutsideHysteresis(ctx);
  if (isStartReached && threshold > 0 && scroll > threshold && startReachedSnapshot && (startReachedSnapshot.contentSize !== totalSize || startReachedSnapshot.dataLength !== dataLength)) {
    state.isStartReached = false;
    state.startReachedSnapshot = void 0;
  }
  set$(ctx, "isAtStart", scroll <= EDGE_POSITION_EPSILON);
  set$(ctx, "isNearStart", scroll <= threshold);
  const shouldSkipThresholdChecks = hasActiveInitialScroll(state) || !!state.scrollingTo;
  if (!shouldSkipThresholdChecks) {
    state.isStartReached = checkThreshold(
      scroll,
      false,
      threshold,
      state.isStartReached,
      startReachedSnapshot,
      {
        contentSize: totalSize,
        dataLength,
        scrollPosition: scroll
      },
      (distance) => {
        var _a3, _b;
        if (canDispatchReachedEdge(ctx, "start", allowedEdge, allowGateCreatedInCurrentCheck)) {
          markReachedEdge(ctx);
          (_b = (_a3 = state.props).onStartReached) == null ? void 0 : _b.call(_a3, { distanceFromStart: distance });
        }
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
}

// src/core/recalculateSettledScroll.ts
function recalculateSettledScroll(ctx) {
  var _a3, _b;
  const state = ctx.state;
  if ((_a3 = state.props) == null ? void 0 : _a3.data) {
    (_b = state.triggerCalculateItemsInView) == null ? void 0 : _b.call(state, { forceFullItemPositions: true });
  }
  checkThresholds(ctx);
}

// src/core/adaptiveRender.ts
var DEFAULT_ADAPTIVE_RENDER_ENTER_VELOCITY = 3;
var DEFAULT_ADAPTIVE_RENDER_EXIT_VELOCITY = 1;
var DEFAULT_ADAPTIVE_RENDER_EXIT_DELAY = 250;
var DEFAULT_WEB_ADAPTIVE_RENDER_ENTER_VELOCITY = 6;
var DEFAULT_WEB_ADAPTIVE_RENDER_EXIT_VELOCITY = 3;
var DEFAULT_WEB_ADAPTIVE_RENDER_EXIT_DELAY = 250;
function clearAdaptiveRenderExitTimeout(ctx) {
  ctx.state.scheduledWork.cancel("adaptiveRender");
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
  var _a3, _b;
  const previousMode = peek$(ctx, "adaptiveRender");
  if (previousMode !== mode) {
    set$(ctx, "adaptiveRender", mode);
    (_b = (_a3 = ctx.state.props.adaptiveRender) == null ? void 0 : _a3.onChange) == null ? void 0 : _b.call(_a3, mode, reason);
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
  var _a3;
  const drawDistance = ctx.state.props.drawDistance;
  const initialScroll = ctx.state.initialScroll;
  const needsFullInitialDrawDistance = initialScroll !== void 0 && ((_a3 = initialScroll.viewPosition) != null ? _a3 : 0) > 0;
  const shouldCapDrawDistance = mode === "visible-first" || mode !== "full" && !peek$(ctx, "readyToRender") && !needsFullInitialDrawDistance;
  return shouldCapDrawDistance ? Math.min(drawDistance, INITIAL_DRAW_DISTANCE) : drawDistance;
}
function scheduleFullDrawDistancePrewarm(ctx) {
  const { state } = ctx;
  if (state.props.drawDistance <= INITIAL_DRAW_DISTANCE || state.scheduledWork.has("fullDrawDistancePrewarm")) {
    return;
  }
  state.scheduledWork.frame(() => {
    var _a3;
    return (_a3 = state.triggerCalculateItemsInView) == null ? void 0 : _a3.call(state);
  }, "fullDrawDistancePrewarm");
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
    props: { onLoad }
  } = state;
  if (didLayout) {
    state.didContainersLayout = true;
  }
  if (didInitialScroll) {
    state.didFinishInitialScroll = true;
  }
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
  }
}

// src/core/finishInitialScroll.ts
var PRESERVED_INITIAL_SCROLL_FALLBACK_CLEAR_DELAY_MS = 2e3;
function syncInitialScrollOffset(state, offset) {
  state.scroll = offset;
  state.scrollPending = offset;
  state.scrollPrev = offset;
}
function clearPreservedInitialScrollTargetTimeout(state) {
  state.scheduledWork.cancel("preservedInitialScroll");
}
function clearPreservedInitialScrollTarget(state) {
  clearPreservedInitialScrollTargetTimeout(state);
  state.clearPreservedInitialScrollOnNextFinish = void 0;
  state.initialScroll = void 0;
  setInitialScrollSession(state);
}
function supersedeInitialScroll(ctx) {
  var _a3, _b, _c;
  const state = ctx.state;
  const bootstrapInitialScroll = ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "bootstrap" ? state.initialScrollSession.bootstrap : void 0;
  if (state.initialScroll || bootstrapInitialScroll || ((_b = state.scrollingTo) == null ? void 0 : _b.isInitialScroll)) {
    if ((bootstrapInitialScroll == null ? void 0 : bootstrapInitialScroll.frameHandle) !== void 0 && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(bootstrapInitialScroll.frameHandle);
    }
    if ((_c = state.scrollingTo) == null ? void 0 : _c.isInitialScroll) {
      cancelScrollCompletionChecks(state);
      state.scrollingTo = void 0;
      state.scrollTargetPinnedRange = void 0;
    }
    initialScrollCompletion.resetFlags(state);
    setInitialScrollSession(state, { bootstrap: null });
    finishInitialScroll(ctx);
  }
}
function finishInitialScroll(ctx, options) {
  var _a3, _b, _c;
  const state = ctx.state;
  if ((options == null ? void 0 : options.resolvedOffset) !== void 0) {
    syncInitialScrollOffset(state, options.resolvedOffset);
  } else if ((options == null ? void 0 : options.syncObservedOffset) && ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "offset") {
    const observedOffset = (_c = (_b = state.refScroller.current) == null ? void 0 : _b.getCurrentScrollOffset) == null ? void 0 : _c.call(_b);
    if (typeof observedOffset === "number" && Number.isFinite(observedOffset)) {
      syncInitialScrollOffset(state, observedOffset);
    }
  }
  const complete = () => {
    var _a4, _b2, _c2, _d, _e;
    const shouldReleaseDeferredPublicOnScroll = Platform.OS === "web" && ((_a4 = state.initialScrollSession) == null ? void 0 : _a4.kind) === "bootstrap";
    const finalScrollOffset = (_d = (_c2 = (_b2 = options == null ? void 0 : options.resolvedOffset) != null ? _b2 : state.scrollPending) != null ? _c2 : state.scroll) != null ? _d : 0;
    initialScrollWatchdog.clear(state);
    if ((options == null ? void 0 : options.preserveTarget) && state.initialScroll) {
      state.clearPreservedInitialScrollOnNextFinish = void 0;
      setInitialScrollSession(state);
      clearPreservedInitialScrollTargetTimeout(state);
      if (options == null ? void 0 : options.schedulePreservedTargetClear) {
        state.scheduledWork.timeout(
          () => {
            var _a5;
            if (!state.didFinishInitialScroll || ((_a5 = state.scrollingTo) == null ? void 0 : _a5.isInitialScroll) || !state.initialScroll) {
              return;
            }
            clearPreservedInitialScrollTarget(state);
          },
          PRESERVED_INITIAL_SCROLL_FALLBACK_CLEAR_DELAY_MS,
          "preservedInitialScroll"
        );
      }
    } else {
      clearPreservedInitialScrollTarget(state);
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
    requestAnimationFrame(complete);
    return;
  }
  complete();
}

// src/core/layoutAccessors.ts
function createLayoutAccess(_ctx, store) {
  return {
    getColumn(index) {
      return getLayoutColumnForStore(store, index);
    },
    getOffset(index) {
      return getLayoutOffsetForStore(store, index);
    },
    getSize(index) {
      return getLayoutSizeForStore(store, index);
    },
    getSpan(index) {
      return getLayoutSpanForStore(store, index);
    }
  };
}
function getLayoutColumn(ctx, index) {
  var _a3;
  const store = (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  return getLayoutColumnForStore(store, index);
}
function getLayoutOffset(ctx, index) {
  var _a3;
  const store = (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  return getLayoutOffsetForStore(store, index);
}
function getLayoutSize(ctx, index) {
  var _a3;
  const store = (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  return getLayoutSizeForStore(store, index);
}
function getLayoutSpan(ctx, index) {
  var _a3;
  const store = (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  return getLayoutSpanForStore(store, index);
}
function getLayoutColumnForStore(store, index) {
  let column;
  if (hasColumnLayout(store) && store.hasIndex(index)) {
    column = store.getColumn(index);
  }
  return column;
}
function getLayoutOffsetForStore(store, index) {
  let offset;
  if (store == null ? void 0 : store.hasIndex(index)) {
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

// src/core/getStartOffsetAdjustment.ts
function getStartOffsetAdjustment(ctx) {
  const { state } = ctx;
  const stylePaddingStart = state.props.horizontal ? (isHorizontalRTL(state) ? state.props.stylePaddingRight : state.props.stylePaddingLeft) || 0 : peek$(ctx, "stylePaddingTop") || 0;
  return stylePaddingStart + (peek$(ctx, "alignItemsAtEndPadding") || 0) + (peek$(ctx, "headerSize") || 0);
}

// src/core/calculateOffsetWithOffsetPosition.ts
function calculateOffsetWithOffsetPosition(ctx, offsetParam, params) {
  var _a3, _b;
  const state = ctx.state;
  const { index, viewOffset, viewPosition } = params;
  let offset = offsetParam;
  if (viewOffset) {
    offset -= viewOffset;
  }
  if (index !== void 0) {
    const startOffsetAdjustment = getStartOffsetAdjustment(ctx);
    if (startOffsetAdjustment) {
      offset += startOffsetAdjustment;
    }
  }
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
    offset -= viewPosition * (state.scrollLength - trailingInset - itemSize);
    if (!isOutOfBounds && index === dataLength - 1) {
      const footerSize = peek$(ctx, "footerSize") || 0;
      offset += footerSize;
    }
  }
  return offset;
}

// src/core/clampScrollOffset.ts
function clampScrollOffset(ctx, offset, scrollTarget) {
  const state = ctx.state;
  const contentSize = getContentSize(ctx);
  let clampedOffset = offset;
  if (Number.isFinite(contentSize) && Number.isFinite(state.scrollLength) && (Platform.OS !== "android" || state.lastLayout)) {
    const baseMaxOffset = Math.max(0, contentSize - state.scrollLength);
    const viewOffset = scrollTarget == null ? void 0 : scrollTarget.viewOffset;
    const extraEndOffset = typeof viewOffset === "number" && viewOffset < 0 ? -viewOffset : 0;
    const maxOffset = baseMaxOffset + extraEndOffset;
    clampedOffset = Math.min(offset, maxOffset);
  }
  clampedOffset = Math.max(0, clampedOffset);
  return clampedOffset;
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
  return shouldPad ? Math.max(0, state.scrollLength - getRawContentLength(ctx) - getContentInsetEnd(ctx)) : 0;
}
function updateContentMetricsState(ctx) {
  const previousPadding = peek$(ctx, "alignItemsAtEndPadding") || 0;
  const nextPadding = getAlignItemsAtEndPadding(ctx);
  if (previousPadding !== nextPadding) {
    set$(ctx, "alignItemsAtEndPadding", nextPadding);
  }
}

// src/core/addTotalSize.ts
function addTotalSize(ctx, key, add, notifyTotalSize = true) {
  const state = ctx.state;
  const prevTotalSize = state.totalSize;
  let totalSize = state.totalSize;
  if (key === null) {
    totalSize = add;
    if (state.timeoutSetPaddingTop) {
      clearTimeout(state.timeoutSetPaddingTop);
      state.timeoutSetPaddingTop = void 0;
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

// src/utils/getId.ts
function getId(state, index) {
  if (!state.props.dataSource && !state.props.data) {
    return "";
  }
  const id = index < getDataLength(state) ? getDataKey(state, index) : null;
  state.idCache[index] = id;
  return id;
}

// src/utils/getItemSize.ts
function getFixedItemLayoutSize(ctx, index, data, resolved) {
  var _a3, _b;
  const state = ctx.state;
  const { getFixedItemSize, getItemType } = state.props;
  let size;
  if (getFixedItemSize) {
    const itemType = (_b = resolved == null ? void 0 : resolved.itemType) != null ? _b : getItemType ? (_a3 = getItemType(data, index)) != null ? _a3 : "" : "";
    const fixedSize = (resolved == null ? void 0 : resolved.didResolveFixedItemSize) ? resolved.fixedItemSize : getFixedItemSize(data, index, itemType);
    if (fixedSize !== void 0) {
      size = fixedSize + ctx.scrollAxisGap;
    }
  }
  return size;
}
function getKnownOrFixedSize(ctx, key, index, data, resolved) {
  const state = ctx.state;
  let size = key ? state.sizesKnown.get(key) : void 0;
  if (size === void 0 && key) {
    const fixedLayoutSize = getFixedItemLayoutSize(ctx, index, data, resolved);
    if (fixedLayoutSize !== void 0) {
      size = fixedLayoutSize;
      state.sizesKnown.set(key, size);
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
function getItemSize(ctx, key, index, data, useAverageSize, preferCachedSize, notifyTotalSize, resolved) {
  var _a3, _b;
  const state = ctx.state;
  const {
    sizes,
    averageSizes,
    props: { estimatedItemSize, getItemType },
    scrollingTo
  } = state;
  const sizeKnown = state.sizesKnown.get(key);
  if (sizeKnown !== void 0) {
    return sizeKnown;
  }
  let size;
  const renderedSize = sizes.get(key);
  size = getKnownOrFixedSize(ctx, key, index, data, resolved);
  if (size !== void 0) {
    setSize(ctx, key, size, notifyTotalSize);
    return size;
  }
  (_b = resolved == null ? void 0 : resolved.itemType) != null ? _b : getItemType ? (_a3 = getItemType(data, index)) != null ? _a3 : "" : "";
  if (size === void 0 && renderedSize !== void 0) {
    return renderedSize;
  }
  if (size === void 0) {
    size = estimatedItemSize + ctx.scrollAxisGap;
  }
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
function materializeFixedLayoutStoreRange(ctx, startIndex, endIndex) {
  var _a3;
  const state = ctx.state;
  const store = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  let didChange = false;
  if (store && state.props.getFixedItemSize) {
    const start = Math.max(0, Math.trunc(startIndex));
    const end = Math.min(store.length - 1, Math.trunc(endIndex));
    for (let index = start; index <= end; index++) {
      const existingKey = state.idCache[index];
      const knownSize = existingKey !== void 0 ? state.sizesKnown.get(existingKey) : void 0;
      const fixedSize = knownSize != null ? knownSize : getFixedItemLayoutSize(ctx, index, getDataItem(state, index));
      if (fixedSize !== void 0) {
        didChange = store.setMeasuredSize(index, fixedSize) || didChange;
        if (existingKey !== void 0) {
          state.sizesKnown.set(existingKey, fixedSize);
          state.sizes.set(existingKey, fixedSize);
        }
      }
    }
  }
  return didChange;
}
function materializeFixedLayoutStoreIndex(ctx, index) {
  let didChange = false;
  if (index !== void 0 && Number.isInteger(index)) {
    didChange = materializeFixedLayoutStoreRange(ctx, index, index);
  }
  return didChange;
}
function materializeFixedLayoutStoreRangeAtOffsets(ctx, startOffset, endOffset) {
  var _a3, _b;
  const store = (_a3 = ctx.state.layoutStoreRuntime) == null ? void 0 : _a3.store;
  let range = store == null ? void 0 : store.findIndexRangeAtOffsets(startOffset, endOffset);
  let didChange = false;
  if (store && range && ctx.state.props.getFixedItemSize) {
    let materializedEnd = range.start - 1;
    let nextEnd = range.end;
    while (nextEnd > materializedEnd) {
      didChange = materializeFixedLayoutStoreRange(ctx, materializedEnd + 1, nextEnd) || didChange;
      materializedEnd = nextEnd;
      range = store.findIndexRangeAtOffsets(startOffset, endOffset);
      nextEnd = (_b = range == null ? void 0 : range.end) != null ? _b : materializedEnd;
    }
  }
  return { didChange, range };
}

// src/core/LayoutStoreRuntime.ts
var LayoutStoreRuntime = class {
  constructor(store, estimatedSize) {
    this.propEstimatedSize = estimatedSize;
    this.store = store;
  }
  resetTransientState() {
    this.positionListenerOffsets = void 0;
  }
  clearRowSpanCache() {
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
          spliceUnknownSpans(spans, operation.index, operation.deleteCount, operation.insertCount);
        } else if (operation.type === "move" && operation.count > 0 && operation.from !== operation.to) {
          moveSpans(spans, operation.from, operation.to, operation.count);
        }
      }
    }
    return spans;
  }
};
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
function spliceUnknownSpans(spans, index, deleteCount, insertCount) {
  const previousLength = spans.length;
  const nextLength = previousLength - deleteCount + insertCount;
  if (insertCount > deleteCount) {
    spans.length = nextLength;
    spans.copyWithin(index + insertCount, index + deleteCount, previousLength);
  } else if (insertCount < deleteCount) {
    spans.copyWithin(index + insertCount, index + deleteCount, previousLength);
    spans.length = nextLength;
  }
  spans.fill(void 0, index, index + insertCount);
}
function areRowSpanCacheInputsEqual(prev, next) {
  return prev.data === next.data && Object.is(prev.dataKey, next.dataKey) && Object.is(prev.dataVersion, next.dataVersion) && Object.is(prev.extraData, next.extraData) && prev.numColumns === next.numColumns && prev.overrideItemLayout === next.overrideItemLayout;
}

// src/core/LayoutStore.ts
function validateKnownSizeEntryOrder(entries) {
  let previousIndex = -1;
  for (const entry of entries) {
    if (entry.index <= previousIndex) {
      if (IS_DEV) {
        console.error(
          `[legend-list] replaceKnownSizeEntries requires strictly increasing, unique indexes. Received ${entry.index} after ${previousIndex}.`
        );
      }
      return false;
    }
    previousIndex = entry.index;
  }
  return true;
}

// src/core/PrefixLayoutStore.ts
var PIECE_UNKNOWN = 0;
var PIECE_KNOWN = 1;
var SIZE_CACHED = 1;
var SIZE_MEASURED = 2;
var KNOWN_BLOCK_CAPACITY = 128;
var nextNodeId = 1;
var SparseSequenceLayoutStore = class {
  constructor(length, estimatedSize) {
    this.lengthValue = normalizeLength(length);
    this.estimatedSize = normalizeSize(estimatedSize);
    this.root = createUnknownNode(this.lengthValue);
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
  clearKnownSizes() {
    this.root = createUnknownNode(this.length);
  }
  clearKnownSize(index) {
    this.assertIndex(index);
    const existing = this.getKnownValue(index);
    const didChange = existing !== void 0 && existing.size !== this.estimatedSize;
    if (existing) {
      const [before, fromIndex] = splitTree(this.root, index);
      const [, after] = splitTree(fromIndex, 1);
      this.root = joinTrees(joinTrees(before, createUnknownNode(1)), after);
    }
    return didChange;
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
    this.assertIndex(index);
    const located = findPieceAtIndex(this.root, index);
    return (located == null ? void 0 : located.node.piece.type) === PIECE_KNOWN ? located.node.piece.sizes[located.offset] : this.estimatedSize;
  }
  getTotalSize() {
    return getEffectiveSize(this.root, this.estimatedSize);
  }
  forEachLayout(startIndex, endIndex, callback) {
    const start = Math.max(0, Math.trunc(startIndex));
    const end = Math.min(this.length - 1, Math.trunc(endIndex));
    if (start <= end) {
      let offset = this.getOffset(start);
      for (let index = start; index <= end; index++) {
        const size = this.getSize(index);
        callback(index, offset, size);
        offset += size;
      }
    }
  }
  replaceKnownSizeEntries(entries) {
    for (const entry of entries) {
      this.assertIndex(entry.index);
      normalizeSize(entry.size);
    }
    if (!validateKnownSizeEntryOrder(entries)) {
      return false;
    }
    let root;
    let cursor = 0;
    let entryIndex = 0;
    while (entryIndex < entries.length) {
      const first = entries[entryIndex];
      if (first.index > cursor) {
        root = joinTrees(root, createUnknownNode(first.index - cursor));
        cursor = first.index;
      }
      const blockEntries = [];
      while (entryIndex < entries.length && entries[entryIndex].index === cursor && blockEntries.length < KNOWN_BLOCK_CAPACITY) {
        const entry = entries[entryIndex];
        blockEntries.push({
          kind: entry.type === "measured" ? SIZE_MEASURED : SIZE_CACHED,
          size: entry.size
        });
        cursor++;
        entryIndex++;
      }
      root = joinTrees(root, createKnownNodeFromEntries(blockEntries));
    }
    if (cursor < this.length) {
      root = joinTrees(root, createUnknownNode(this.length - cursor));
    }
    this.root = root;
    return true;
  }
  invalidateRange(index, count) {
    assertMutationRange(this.length, index, count, "invalidateRange");
    if (count > 0) {
      const [before, fromIndex] = splitTree(this.root, index);
      const [, after] = splitTree(fromIndex, count);
      this.root = joinTrees(joinTrees(before, createUnknownNode(count)), after);
    }
  }
  move(from, to, count) {
    assertMoveRange(this.length, from, to, count);
    if (count > 0 && from !== to) {
      const [before, fromIndex] = splitTree(this.root, from);
      const [moved, after] = splitTree(fromIndex, count);
      const withoutMoved = joinTrees(before, after);
      const [atDestination, afterDestination] = splitTree(withoutMoved, to);
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
      const [before, fromIndex] = splitTree(this.root, index);
      const [, after] = splitTree(fromIndex, deleteCount);
      this.lengthValue += insertCount - deleteCount;
      this.root = joinTrees(joinTrees(before, createUnknownNode(insertCount)), after);
    }
  }
  setMeasuredSize(index, size) {
    var _a3;
    this.assertIndex(index);
    const normalizedSize = normalizeSize(size);
    const located = findPieceAtIndex(this.root, index);
    const existingPiece = located == null ? void 0 : located.node.piece;
    const existing = located && (existingPiece == null ? void 0 : existingPiece.type) === PIECE_KNOWN ? {
      kind: existingPiece.kinds[located.offset],
      size: existingPiece.sizes[located.offset]
    } : void 0;
    const didChange = ((_a3 = existing == null ? void 0 : existing.size) != null ? _a3 : this.estimatedSize) !== normalizedSize;
    if (located && (existingPiece == null ? void 0 : existingPiece.type) === PIECE_KNOWN && existing) {
      if (existing.size !== normalizedSize || existing.kind !== SIZE_MEASURED) {
        const previousMeasuredSize = existing.kind === SIZE_MEASURED ? existing.size : 0;
        existingPiece.sizes[located.offset] = normalizedSize;
        existingPiece.kinds[located.offset] = SIZE_MEASURED;
        existingPiece.knownSizeTotal += normalizedSize - existing.size;
        existingPiece.measuredCount += existing.kind === SIZE_MEASURED ? 0 : 1;
        existingPiece.measuredSizeTotal += normalizedSize - previousMeasuredSize;
        updatePathToIndex(this.root, index);
      }
    } else if (!this.tryAppendMeasuredToPreviousBlock(index, normalizedSize, located)) {
      const [before, fromIndex] = splitTree(this.root, index);
      const [, after] = splitTree(fromIndex, 1);
      const measured = createKnownNodeFromEntries([{ kind: SIZE_MEASURED, size: normalizedSize }]);
      this.root = joinTrees(joinTrees(before, measured), after);
    }
    return didChange;
  }
  assertIndex(index) {
    if (!this.hasIndex(index)) {
      throw new RangeError(`PrefixLayoutStore index ${index} is out of bounds for length ${this.length}`);
    }
  }
  getKnownValue(index) {
    const located = findPieceAtIndex(this.root, index);
    const piece = located == null ? void 0 : located.node.piece;
    return located && (piece == null ? void 0 : piece.type) === PIECE_KNOWN ? { kind: piece.kinds[located.offset], size: piece.sizes[located.offset] } : void 0;
  }
  tryAppendMeasuredToPreviousBlock(index, size, current) {
    let didAppend = false;
    if (index > 0 && current) {
      const previous = findPieceAtIndexWithPath(this.root, index - 1);
      const currentPiece = current == null ? void 0 : current.node.piece;
      const previousPiece = previous == null ? void 0 : previous.node.piece;
      if (current && previous && current.offset === 0 && (currentPiece == null ? void 0 : currentPiece.type) === PIECE_UNKNOWN && currentPiece.count > 1 && (previousPiece == null ? void 0 : previousPiece.type) === PIECE_KNOWN && previous.offset === previousPiece.count - 1 && previousPiece.count < KNOWN_BLOCK_CAPACITY) {
        ensureKnownPieceCapacity(previousPiece, previousPiece.count + 1);
        previousPiece.sizes[previousPiece.count] = size;
        previousPiece.kinds[previousPiece.count] = SIZE_MEASURED;
        previousPiece.count++;
        previousPiece.knownSizeTotal += size;
        previousPiece.measuredCount++;
        previousPiece.measuredSizeTotal += size;
        currentPiece.count--;
        updatePaths([previous.path, current.path]);
        didAppend = true;
      }
    }
    return didAppend;
  }
};
var PrefixLayoutStore = class extends SparseSequenceLayoutStore {
};
function createUnknownNode(count) {
  return count > 0 ? createNode({ count, type: PIECE_UNKNOWN }) : void 0;
}
function createKnownNodeFromEntries(entries) {
  let node;
  if (entries.length > 0) {
    const sizes = new Float64Array(entries.length);
    const kinds = new Uint8Array(entries.length);
    for (let index = 0; index < entries.length; index++) {
      sizes[index] = entries[index].size;
      kinds[index] = entries[index].kind;
    }
    node = createNode(createKnownPiece(sizes, kinds, entries.length));
  }
  return node;
}
function createNode(piece) {
  return updateNode({
    knownCount: 0,
    knownSizeTotal: 0,
    logicalCount: 0,
    measuredCount: 0,
    measuredSizeTotal: 0,
    piece,
    priority: getNodePriority(nextNodeId++)
  });
}
function updateNode(node) {
  const pieceStats = getPieceStats(node.piece);
  node.logicalCount = getLogicalCount(node.left) + node.piece.count + getLogicalCount(node.right);
  node.knownCount = getKnownCount(node.left) + pieceStats.knownCount + getKnownCount(node.right);
  node.knownSizeTotal = getKnownSizeTotal(node.left) + pieceStats.knownSizeTotal + getKnownSizeTotal(node.right);
  node.measuredCount = getMeasuredCount(node.left) + pieceStats.measuredCount + getMeasuredCount(node.right);
  node.measuredSizeTotal = getMeasuredSizeTotal(node.left) + pieceStats.measuredSizeTotal + getMeasuredSizeTotal(node.right);
  return node;
}
function getPieceStats(piece) {
  return piece.type === PIECE_KNOWN ? {
    knownCount: piece.count,
    knownSizeTotal: piece.knownSizeTotal,
    measuredCount: piece.measuredCount,
    measuredSizeTotal: piece.measuredSizeTotal
  } : { knownCount: 0, knownSizeTotal: 0, measuredCount: 0, measuredSizeTotal: 0 };
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
function getMeasuredSizeTotal(node) {
  var _a3;
  return (_a3 = node == null ? void 0 : node.measuredSizeTotal) != null ? _a3 : 0;
}
function getEffectiveSize(node, estimatedSize) {
  return node ? node.knownSizeTotal + (node.logicalCount - node.knownCount) * estimatedSize : 0;
}
function getPieceEffectiveSize(piece, estimatedSize) {
  let size = piece.count * estimatedSize;
  if (piece.type === PIECE_KNOWN) {
    size = piece.knownSizeTotal;
  }
  return size;
}
function getPiecePrefixSize(piece, count, estimatedSize) {
  let size = count * estimatedSize;
  if (piece.type === PIECE_KNOWN) {
    size = 0;
    for (let index = 0; index < count; index++) {
      size += piece.sizes[index];
    }
  }
  return size;
}
function findPieceAtIndex(root, index) {
  return findPieceAtIndexWithPath(root, index);
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
function updatePathToIndex(root, index) {
  const located = findPieceAtIndexWithPath(root, index);
  if (located) {
    updatePaths([located.path]);
  }
}
function updatePaths(paths) {
  for (const path of paths) {
    for (let index = path.length - 1; index >= 0; index--) {
      updateNode(path[index]);
    }
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
  let index = 0;
  if (piece.type === PIECE_KNOWN) {
    let end = prefixSize;
    for (let current = 0; current < piece.count; current++) {
      end += piece.sizes[current];
      if (!isLessThanOrEqualOffset(end, offset)) {
        index = current;
        break;
      }
    }
  } else if (estimatedSize > 0) {
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
function splitTree(root, leftLogicalCount) {
  if (!root) {
    return [void 0, void 0];
  }
  const leftCount = getLogicalCount(root.left);
  if (leftLogicalCount < leftCount) {
    const [before, after] = splitTree(root.left, leftLogicalCount);
    root.left = after;
    return [before, updateNode(root)];
  }
  if (leftLogicalCount > leftCount + root.piece.count) {
    const [before, after] = splitTree(root.right, leftLogicalCount - leftCount - root.piece.count);
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
  return [joinTrees(root.left, createNode(leftPiece)), joinTrees(createNode(rightPiece), root.right)];
}
function splitPiece(piece, count) {
  return piece.type === PIECE_UNKNOWN ? [
    { count, type: PIECE_UNKNOWN },
    { count: piece.count - count, type: PIECE_UNKNOWN }
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
  if (left.type === PIECE_UNKNOWN && right.type === PIECE_UNKNOWN) {
    merged = { count: left.count + right.count, type: PIECE_UNKNOWN };
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
      sizes,
      type: PIECE_KNOWN
    };
  }
  return merged;
}
function createKnownPiece(sizes, kinds, count) {
  let knownSizeTotal = 0;
  let measuredCount = 0;
  let measuredSizeTotal = 0;
  for (let index = 0; index < count; index++) {
    const size = sizes[index];
    knownSizeTotal += size;
    if (kinds[index] === SIZE_MEASURED) {
      measuredCount++;
      measuredSizeTotal += size;
    }
  }
  return {
    count,
    kinds,
    knownSizeTotal,
    measuredCount,
    measuredSizeTotal,
    sizes,
    type: PIECE_KNOWN
  };
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

// src/core/RowLayoutStore.ts
var SIZE_CACHED2 = 1;
var SIZE_MEASURED2 = 2;
var RowLayoutStore = class {
  constructor(options) {
    this.knownSizes = /* @__PURE__ */ new Map();
    this.measuredCount = 0;
    this.measuredSizeTotal = 0;
    this.lengthValue = normalizeLength2(options.length);
    this.estimatedSize = normalizeSize2(options.estimatedSize);
    this.numColumns = normalizeNumColumns(options.numColumns);
    this.spanInput = options.spans;
    this.spanTopology = options.spans ? createSpanTopology(this.length, this.numColumns, options.spans) : void 0;
    this.rowLayout = new PrefixLayoutStore(this.getRowCount(), this.estimatedSize);
  }
  get length() {
    return this.lengthValue;
  }
  clearKnownSizes() {
    this.knownSizes.clear();
    this.measuredCount = 0;
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
  getMeasuredCount() {
    return this.measuredCount;
  }
  getEstimatedSize() {
    return this.estimatedSize;
  }
  hasIndex(index) {
    return index !== void 0 && Number.isInteger(index) && index >= 0 && index < this.length;
  }
  replaceKnownSizeEntries(entries) {
    for (const entry of entries) {
      this.assertIndex(entry.index);
      normalizeSize2(entry.size);
    }
    if (!validateKnownSizeEntryOrder(entries)) {
      return false;
    }
    const knownSizes = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      knownSizes.set(entry.index, {
        kind: entry.type === "measured" ? SIZE_MEASURED2 : SIZE_CACHED2,
        size: entry.size
      });
    }
    this.knownSizes = knownSizes;
    this.rebuildRowsAndTotals();
    return true;
  }
  invalidateRange(index, count) {
    assertMutationRange2(this.length, index, count, "invalidateRange");
    if (count > 0) {
      const end = index + count;
      for (const knownIndex of this.knownSizes.keys()) {
        if (knownIndex >= index && knownIndex < end) {
          this.knownSizes.delete(knownIndex);
        }
      }
      this.rebuildRowsAndTotals();
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
        const moved = spans.splice(from, count);
        spans.splice(to, 0, ...moved);
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
      const canUpdateTopologyTail = topologyInvalidationIndex !== void 0 && normalizedLength === this.length && normalizedNumColumns === this.numColumns && spans !== void 0 && this.spanTopology !== void 0;
      this.lengthValue = normalizedLength;
      this.numColumns = normalizedNumColumns;
      this.spanInput = spans;
      if (canUpdateTopologyTail) {
        updateSpanTopologyTail(
          this.spanTopology,
          this.length,
          this.numColumns,
          spans,
          topologyInvalidationIndex
        );
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
        spans.splice(index, deleteCount, ...new Array(insertCount).fill(1));
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
  setMeasuredSize(index, size) {
    this.assertIndex(index);
    const normalizedSize = normalizeSize2(size);
    const rowIndex = this.getRowIndex(index);
    const previousRowHeight = this.rowLayout.getSize(rowIndex);
    const previous = this.knownSizes.get(index);
    if ((previous == null ? void 0 : previous.kind) === SIZE_CACHED2) {
      this.measuredCount++;
      this.measuredSizeTotal += normalizedSize;
    } else if ((previous == null ? void 0 : previous.kind) === SIZE_MEASURED2) {
      this.measuredSizeTotal += normalizedSize - previous.size;
    } else {
      this.measuredCount++;
      this.measuredSizeTotal += normalizedSize;
    }
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
    return (_b = (_a3 = this.spanTopology) == null ? void 0 : _a3.rowEndIndexes[rowIndex]) != null ? _b : Math.min(this.length - 1, (rowIndex + 1) * this.numColumns - 1);
  }
  getRowIndex(index) {
    var _a3, _b;
    return (_b = (_a3 = this.spanTopology) == null ? void 0 : _a3.itemRowIndexes[index]) != null ? _b : Math.floor(index / this.numColumns);
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
    this.measuredSizeTotal = 0;
    this.rowLayout = new PrefixLayoutStore(this.getRowCount(), this.estimatedSize);
    const knownRows = /* @__PURE__ */ new Set();
    for (const [index, entry] of this.knownSizes) {
      knownRows.add(this.getRowIndex(index));
      if (entry.kind === SIZE_MEASURED2) {
        this.measuredCount++;
        this.measuredSizeTotal += entry.size;
      }
    }
    for (const rowIndex of knownRows) {
      this.syncRowHeight(rowIndex);
    }
  }
  syncRowHeight(rowIndex) {
    var _a3;
    const start = this.getRowStartIndex(rowIndex);
    const end = this.getRowEndIndex(rowIndex);
    let knownCount = 0;
    let maxKnownSize = 0;
    for (let index = start; index <= end; index++) {
      const knownSize = (_a3 = this.knownSizes.get(index)) == null ? void 0 : _a3.size;
      if (knownSize !== void 0) {
        knownCount++;
        maxKnownSize = Math.max(maxKnownSize, knownSize);
      }
    }
    const itemCount = end - start + 1;
    if (knownCount === itemCount || maxKnownSize > this.estimatedSize) {
      this.rowLayout.setMeasuredSize(
        rowIndex,
        Math.max(maxKnownSize, knownCount < itemCount ? this.estimatedSize : 0)
      );
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
  const firstRowIndex = (_a3 = topology.itemRowIndexes[boundedIndex]) != null ? _a3 : 0;
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

// src/utils/updateSnapToOffsets.ts
function updateSnapToOffsets(ctx) {
  const state = ctx.state;
  const {
    props: { snapToIndices }
  } = state;
  const contentSize = state.props.horizontal ? getContentSize(ctx) : void 0;
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
function clearLayoutStoreKnownSizes(ctx) {
  const runtime = ctx.state.layoutStoreRuntime;
  runtime == null ? void 0 : runtime.store.clearKnownSizes();
  resetLayoutStoreRuntimeState(ctx.state);
}
function replaceLayoutStoreKnownSizeEntries(ctx, entries) {
  const store = syncLayoutStoreStructure(ctx);
  const runtime = ctx.state.layoutStoreRuntime;
  if (!store || !runtime) {
    return false;
  }
  if (!store.replaceKnownSizeEntries(entries)) {
    return false;
  }
  store.setEstimatedSize(runtime.propEstimatedSize);
  runtime.resetTransientState();
  ctx.state.pendingTotalSize = void 0;
  syncLayoutStoreState(ctx);
  return true;
}
function getActiveLayoutStoreRuntime(ctx) {
  return ctx.state.layoutStoreRuntime;
}
function getActiveLayoutStore(ctx) {
  var _a3;
  return (_a3 = getActiveLayoutStoreRuntime(ctx)) == null ? void 0 : _a3.store;
}
function getSparseIdCacheSnapshot(state) {
  const snapshot = /* @__PURE__ */ new Map();
  for (const key of Object.keys(state.idCache)) {
    const index = Number(key);
    const id = state.idCache[index];
    if (Number.isInteger(index) && id !== void 0) {
      snapshot.set(index, id);
    }
  }
  return snapshot;
}
function materializeLayoutStoreRange(ctx, startIndex, endIndex) {
  const state = ctx.state;
  const runtime = getActiveLayoutStoreRuntime(ctx);
  const store = runtime == null ? void 0 : runtime.store;
  let range;
  if (store) {
    const start = Math.max(0, Math.trunc(startIndex));
    const end = Math.min(store.length - 1, Math.trunc(endIndex));
    if (start <= end) {
      range = { end, start };
      store.forEachLayout(start, end, (index, offset) => {
        var _a3;
        const id = (_a3 = state.idCache[index]) != null ? _a3 : getId(state, index);
        if (ctx.positionListeners.has(id)) {
          notifyLayoutStorePosition(ctx, runtime, id, offset);
        }
        state.indexByKey.set(id, index);
      });
    }
  }
  return range;
}
function applyLayoutStoreSeed(store, seed) {
  store.replaceKnownSizeEntries(seed.sizeEntries);
}
function resetLayoutStoreRuntimeState(state) {
  var _a3;
  (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.resetTransientState();
}
function setLayoutStoreMeasuredSize(ctx, index, size) {
  const store = getActiveLayoutStore(ctx);
  let didSet = false;
  if (store == null ? void 0 : store.hasIndex(index)) {
    const didChange = store.setMeasuredSize(index, size);
    if (didChange) {
      syncLayoutStoreState(ctx);
    }
    didSet = true;
  }
  return didSet;
}
function reconcileLayoutStoreDataChange(ctx, options) {
  var _a3;
  const state = ctx.state;
  const store = getActiveLayoutStore(ctx);
  let didReconcile = false;
  if (store) {
    const previousIdCache = (_a3 = options == null ? void 0 : options.previousIdCache) != null ? _a3 : getSparseIdCacheSnapshot(state);
    state.indexByKey.clear();
    state.idCache.length = 0;
    resetLayoutStoreRuntimeState(state);
    const seed = getLayoutStoreSeed(ctx, {
      didKeyExtractorChange: options == null ? void 0 : options.didKeyExtractorChange,
      mode: "reconcile",
      previousIdCache
    });
    didReconcile = !seed.hasDuplicateKey;
    if (didReconcile) {
      applyLayoutStoreSeed(store, seed);
    }
  }
  return didReconcile;
}
function syncActiveRowLayoutStoreSpans(ctx) {
  const state = ctx.state;
  const runtime = getActiveLayoutStoreRuntime(ctx);
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
      const spans = cachedSpans != null ? cachedSpans : new Array(dataLength);
      const startIndex = cachedSpans ? Math.max(0, Math.min(spanInvalidationIndex != null ? spanInvalidationIndex : 0, dataLength)) : 0;
      for (let index = startIndex; index < dataLength; index++) {
        layoutConfig.span = 1;
        const item = getDataItem(state, index);
        if (item !== void 0) {
          overrideItemLayout(layoutConfig, item, index, numColumns, extraData);
        }
        spans[index] = layoutConfig.span;
      }
      store.resize(dataLength, spans, numColumns, spanInvalidationIndex);
      runtime.setCachedRowSpans(cacheInput, spans);
      state.dataSourceSpanInvalidationIndex = void 0;
      didSync = true;
    }
  } else {
    runtime == null ? void 0 : runtime.clearRowSpanCache();
  }
  return didSync;
}
function syncLayoutStoreStructure(ctx) {
  var _a3;
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
      applyLayoutStoreSeed(runtime.store, seed);
    }
  }
  runtime.propEstimatedSize = estimatedSize;
  return (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
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
function rebuildLayoutStoreExact(ctx) {
  var _a3;
  const state = ctx.state;
  const store = syncLayoutStoreStructure(ctx);
  if (store) {
    const seed = getLayoutStoreSeed(ctx);
    applyLayoutStoreSeed(store, seed);
  }
  return (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
}
function syncLayoutStoreState(ctx) {
  const runtime = getActiveLayoutStoreRuntime(ctx);
  let didSync = false;
  if (runtime) {
    const store = runtime.store;
    addTotalSize(ctx, null, store.getTotalSize());
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
  return ((_a3 = ctx.state.props.estimatedItemSize) != null ? _a3 : 100) + ctx.scrollAxisGap;
}
function getLayoutStoreSeed(ctx, options = { mode: "seed" }) {
  var _a3, _b, _c;
  const state = ctx.state;
  const { data } = state.props;
  const dataLength = getDataLength(state);
  const sizeEntries = [];
  const canSeedKnownSizes = state.sizesKnown.size > 0;
  const canSeedCachedSizes = state.sizes.size > 0;
  if (options.mode === "seed" && !canSeedKnownSizes && !canSeedCachedSizes) {
    return { sizeEntries };
  }
  const previousData = state.previousData;
  const statePendingDataComparison = state.pendingDataComparison;
  const pendingDataComparison = statePendingDataComparison && statePendingDataComparison.previousData === previousData && statePendingDataComparison.nextData === data ? statePendingDataComparison : void 0;
  let hasDuplicateKey = false;
  const dataLengthDelta = previousData ? dataLength - previousData.length : 0;
  const materializedIndices = options.mode === "reconcile" ? (_a3 = options.previousIdCache) == null ? void 0 : _a3.keys() : getSparseIdCacheSnapshot(state).keys();
  for (const index of materializedIndices != null ? materializedIndices : []) {
    const isIndexInRange = index >= 0 && index < dataLength;
    if (!isIndexInRange && options.mode !== "reconcile") {
      continue;
    }
    const previousKey = (_b = options.previousIdCache) == null ? void 0 : _b.get(index);
    const canReusePreviousKey = isIndexInRange && options.mode === "reconcile" && !options.didKeyExtractorChange && previousKey !== void 0 && previousData !== void 0 && (previousData[index] === getDataItem(state, index) || (pendingDataComparison == null ? void 0 : pendingDataComparison.byIndex[index]) !== void 0);
    let shouldSeedKey = isIndexInRange;
    let targetIndex = index;
    let key = canReusePreviousKey ? previousKey : isIndexInRange ? getId(state, index) : previousKey;
    if (options.mode === "reconcile" && !canReusePreviousKey && !options.didKeyExtractorChange && previousKey !== void 0 && (!isIndexInRange || key !== previousKey)) {
      shouldSeedKey = dataLengthDelta === 0 && isIndexInRange;
      if (dataLengthDelta !== 0) {
        const shiftedIndex = index + dataLengthDelta;
        if (shiftedIndex >= 0 && shiftedIndex < dataLength) {
          const shiftedKey = (_c = state.idCache[shiftedIndex]) != null ? _c : getId(state, shiftedIndex);
          if (shiftedKey === previousKey) {
            shouldSeedKey = true;
            targetIndex = shiftedIndex;
            key = previousKey;
          }
        }
      }
    }
    if (!shouldSeedKey || key === void 0) {
      continue;
    }
    if (options.mode === "reconcile") {
      state.idCache[targetIndex] = key;
      if (state.indexByKey.has(key)) {
        hasDuplicateKey = true;
        break;
      }
      state.indexByKey.set(key, targetIndex);
    }
    const knownSize = canSeedKnownSizes ? state.sizesKnown.get(key) : void 0;
    if (knownSize !== void 0) {
      sizeEntries.push({
        index: targetIndex,
        size: knownSize,
        type: "measured"
      });
    } else {
      const cachedSize = canSeedCachedSizes ? state.sizes.get(key) : void 0;
      if (cachedSize !== void 0) {
        sizeEntries.push({
          index: targetIndex,
          size: cachedSize,
          type: "cached"
        });
      }
    }
  }
  return {
    hasDuplicateKey,
    sizeEntries
  };
}

// src/core/finishScrollTo.ts
function finishScrollTo(ctx) {
  var _a3, _b;
  const state = ctx.state;
  if (state == null ? void 0 : state.scrollingTo) {
    cancelScrollCompletionChecks(state);
    const resolvePendingScroll = state.pendingScrollResolve;
    state.pendingScrollResolve = void 0;
    const scrollingTo = state.scrollingTo;
    state.scrollHistory.length = 0;
    state.scrollingTo = void 0;
    state.scrollTargetPinnedRange = void 0;
    if (state.pendingTotalSize !== void 0) {
      addTotalSize(ctx, null, state.pendingTotalSize);
    }
    if (PlatformAdjustBreaksScroll) {
      state.scrollAdjustHandler.commitPendingAdjust(scrollingTo);
    }
    if (scrollingTo.isInitialScroll || state.initialScroll) {
      const isOffsetSession = ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "offset";
      const shouldPreserveResizeTarget = !!scrollingTo.isInitialScroll && !state.clearPreservedInitialScrollOnNextFinish && getDataLength(state) > 0 && ((_b = state.initialScroll) == null ? void 0 : _b.viewPosition) === 1;
      finishInitialScroll(ctx, {
        onFinished: () => {
          resolvePendingScroll == null ? void 0 : resolvePendingScroll();
        },
        preserveTarget: isOffsetSession && getDataLength(state) === 0 || shouldPreserveResizeTarget,
        recalculateItems: true,
        schedulePreservedTargetClear: shouldPreserveResizeTarget,
        syncObservedOffset: isOffsetSession,
        waitForCompletionFrame: !!scrollingTo.waitForInitialScrollCompletionFrame
      });
      return;
    }
    recalculateSettledScroll(ctx);
    resolvePendingScroll == null ? void 0 : resolvePendingScroll();
  }
}

// src/core/checkFinishedScroll.ts
var INITIAL_SCROLL_MAX_FALLBACK_CHECKS = 20;
var INITIAL_SCROLL_COMPLETION_TARGET_EPSILON = 1;
var INITIAL_SCROLL_ZERO_TARGET_EPSILON = 1;
var SILENT_INITIAL_SCROLL_RETRY_DELAY_MS = 16;
var SILENT_INITIAL_SCROLL_TARGET_EPSILON = 1;
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
function hasScrollCompletionOwnership(state, options) {
  const { clampedTargetOffset, scrollingTo } = options;
  return !scrollingTo.isInitialScroll || state.hasScrolled || clampedTargetOffset <= INITIAL_SCROLL_COMPLETION_TARGET_EPSILON;
}
function isSilentInitialDispatch(state, scrollingTo) {
  return !!(scrollingTo == null ? void 0 : scrollingTo.isInitialScroll) && initialScrollCompletion.didDispatchNativeScroll(state) && !state.hasScrolled;
}
function getInitialScrollWatchdogTargetOffset(state) {
  var _a3;
  return (_a3 = initialScrollWatchdog.get(state)) == null ? void 0 : _a3.targetOffset;
}
function isNativeInitialNonZeroTarget(state) {
  const targetOffset = getInitialScrollWatchdogTargetOffset(state);
  return !state.didFinishInitialScroll && initialScrollWatchdog.hasNonZeroTargetOffset(targetOffset);
}
function shouldFinishInitialScrollWithoutNativeProgress(state, scrollingTo) {
  var _a3, _b;
  if (!scrollingTo.isInitialScroll || scrollingTo.animated || !state.didContainersLayout) {
    return false;
  }
  if (((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "bootstrap") {
    return false;
  }
  const targetOffset = (_b = scrollingTo.targetOffset) != null ? _b : scrollingTo.offset;
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
function isEndAlignedLastItemTarget(ctx, scrollingTo) {
  return scrollingTo.index === getDataLength(ctx.state) - 1 && scrollingTo.viewPosition === 1;
}
function getCurrentTargetOffset(ctx, scrollingTo) {
  var _a3;
  const index = scrollingTo.index;
  const shouldRecomputeEndTarget = isEndAlignedLastItemTarget(ctx, scrollingTo);
  const requestedTargetOffset = shouldRecomputeEndTarget && index !== void 0 ? calculateOffsetWithOffsetPosition(ctx, calculateOffsetForIndex(ctx, index), scrollingTo) : (_a3 = scrollingTo.targetOffset) != null ? _a3 : clampScrollOffset(ctx, scrollingTo.offset - (scrollingTo.viewOffset || 0), scrollingTo);
  return clampScrollOffset(ctx, requestedTargetOffset, scrollingTo);
}
function getResolvedScrollCompletionState(ctx, scrollingTo) {
  const { state } = ctx;
  const scroll = state.scrollPending;
  const adjust = state.scrollAdjustHandler.getAdjust();
  const clampedTargetOffset = getCurrentTargetOffset(ctx, scrollingTo);
  const maxOffset = clampScrollOffset(ctx, scroll, scrollingTo);
  const diff1 = Math.abs(scroll - clampedTargetOffset);
  const adjustedTargetOffset = clampedTargetOffset + adjust;
  const diff2 = Math.abs(scroll - adjustedTargetOffset);
  const canUseAdjustedCompletion = !scrollingTo.animated || Platform.OS === "ios";
  return {
    clampedTargetOffset,
    isAtResolvedTarget: Math.abs(scroll - maxOffset) < 1 && (diff1 < 1 || canUseAdjustedCompletion && diff2 < 1)
  };
}
function checkFinishedScrollFrame(ctx) {
  const scrollingTo = ctx.state.scrollingTo;
  if (!scrollingTo) {
    return;
  }
  const { state } = ctx;
  const completionState = getResolvedScrollCompletionState(ctx, scrollingTo);
  if (completionState.isAtResolvedTarget && hasScrollCompletionOwnership(state, {
    clampedTargetOffset: completionState.clampedTargetOffset,
    scrollingTo
  })) {
    finishScrollTo(ctx);
  }
}
function scrollToFallbackOffset(ctx, offset) {
  var _a3;
  (_a3 = ctx.state.refScroller.current) == null ? void 0 : _a3.scrollTo({
    animated: false,
    x: ctx.state.props.horizontal ? offset : 0,
    y: ctx.state.props.horizontal ? 0 : offset
  });
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
  const slowTimeout = (scrollingTo == null ? void 0 : scrollingTo.isInitialScroll) && !shouldFinishInitialZeroTarget && !canFinishInitialWithoutNativeProgress || !state.didContainersLayout;
  const initialDelay = shouldFinishInitialZeroTarget || canFinishInitialWithoutNativeProgress ? 0 : silentInitialDispatch ? SILENT_INITIAL_SCROLL_RETRY_DELAY_MS : slowTimeout ? 500 : 100;
  let numChecks = 0;
  const scheduleFallbackCheck = (delay) => {
    state.scheduledWork.timeout(checkHasScrolled, delay, "checkFinishedScrollFallback");
  };
  const checkHasScrolled = () => {
    var _a3, _b, _c, _d;
    const isStillScrollingTo = state.scrollingTo;
    if (isStillScrollingTo) {
      numChecks++;
      const isNativeInitialPending = isNativeInitialNonZeroTarget(state) && !state.hasScrolled;
      const maxChecks = silentInitialDispatch ? 5 : isNativeInitialPending ? INITIAL_SCROLL_MAX_FALLBACK_CHECKS : 5;
      const shouldFinishZeroTarget = shouldFinishInitialZeroTargetScroll(ctx);
      const canFinishInitialScrollWithoutNativeProgress = shouldFinishInitialScrollWithoutNativeProgress(
        state,
        isStillScrollingTo
      );
      const completionState = getResolvedScrollCompletionState(ctx, isStillScrollingTo);
      const canFinishAfterSilentNativeDispatch = Platform.OS === "android" && silentInitialDispatch && completionState.isAtResolvedTarget && numChecks >= 1;
      const shouldRetrySilentInitialNativeScroll = Platform.OS === "android" && canFinishAfterSilentNativeDispatch && !initialScrollCompletion.didRetrySilentInitialScroll(state);
      const shouldFinishAfterObservedScroll = state.hasScrolled && (!isStillScrollingTo.isInitialScroll || completionState.isAtResolvedTarget);
      const shouldRetryUnalignedInitialScroll = isStillScrollingTo.isInitialScroll && !completionState.isAtResolvedTarget && numChecks <= maxChecks;
      const shouldRetryUnalignedEndScroll = Platform.OS === "ios" && !isStillScrollingTo.isInitialScroll && isEndAlignedLastItemTarget(ctx, isStillScrollingTo) && !completionState.isAtResolvedTarget && numChecks <= maxChecks;
      if (shouldRetrySilentInitialNativeScroll) {
        const targetOffset = (_b = (_a3 = getInitialScrollWatchdogTargetOffset(state)) != null ? _a3 : isStillScrollingTo.targetOffset) != null ? _b : 0;
        const jiggleOffset = targetOffset >= SILENT_INITIAL_SCROLL_TARGET_EPSILON ? targetOffset - SILENT_INITIAL_SCROLL_TARGET_EPSILON : targetOffset + SILENT_INITIAL_SCROLL_TARGET_EPSILON;
        initialScrollCompletion.markSilentInitialScrollRetry(state);
        scrollToFallbackOffset(ctx, jiggleOffset);
        state.scheduledWork.frame(
          () => scrollToFallbackOffset(ctx, targetOffset),
          "checkFinishedScrollRetryFrame"
        );
        scheduleFallbackCheck(SILENT_INITIAL_SCROLL_RETRY_DELAY_MS);
      } else if (shouldRetryUnalignedEndScroll) {
        scrollToFallbackOffset(ctx, completionState.clampedTargetOffset);
        scheduleFallbackCheck(100);
      } else if (shouldFinishZeroTarget || shouldFinishAfterObservedScroll || canFinishInitialScrollWithoutNativeProgress || canFinishAfterSilentNativeDispatch || numChecks > maxChecks) {
        finishScrollTo(ctx);
      } else if ((isNativeInitialPending || shouldRetryUnalignedInitialScroll) && numChecks <= maxChecks) {
        const targetOffset = (_d = (_c = getInitialScrollWatchdogTargetOffset(state)) != null ? _c : isStillScrollingTo.targetOffset) != null ? _d : state.scrollPending;
        scrollToFallbackOffset(ctx, targetOffset);
        scheduleFallbackCheck(silentInitialDispatch ? SILENT_INITIAL_SCROLL_RETRY_DELAY_MS : 100);
      } else {
        scheduleFallbackCheck(silentInitialDispatch ? SILENT_INITIAL_SCROLL_RETRY_DELAY_MS : 100);
      }
    }
  };
  scheduleFallbackCheck(initialDelay);
}

// src/core/doScrollTo.native.ts
function doScrollTo(ctx, params) {
  var _a3;
  const state = ctx.state;
  const { animated, horizontal, isInitialScroll, offset } = params;
  const isAnimated = !!animated;
  const { refScroller } = state;
  const scroller = refScroller.current;
  if (!scroller) {
    return;
  }
  const isHorizontal = !!horizontal;
  const contentSize = isHorizontal ? getContentSize(ctx) : void 0;
  const nativeOffset = toNativeHorizontalOffset(state, offset, contentSize);
  scroller.scrollTo({
    animated: isAnimated,
    x: isHorizontal ? nativeOffset : 0,
    y: isHorizontal ? 0 : offset
  });
  if (isInitialScroll) {
    initialScrollCompletion.markInitialScrollNativeDispatch(state);
  }
  if (isAnimated && Math.abs(state.scroll - offset) <= 1) {
    checkFinishedScroll(ctx);
  }
  if (!isAnimated) {
    const pendingAdjust = (_a3 = peek$(ctx, "scrollAdjustPending")) != null ? _a3 : 0;
    if (Math.abs(pendingAdjust) <= 0.1) {
      state.scroll = offset;
    }
    checkFinishedScrollFallback(ctx);
  }
}

// src/core/doMaintainScrollAtEnd.ts
function doMaintainScrollAtEnd(ctx) {
  const state = ctx.state;
  const {
    didContainersLayout,
    pendingNativeMVCPAdjust,
    refScroller,
    props: { maintainScrollAtEnd }
  } = state;
  const isWithinMaintainScrollAtEndThreshold = peek$(ctx, "isWithinMaintainScrollAtEndThreshold");
  const shouldMaintainScrollAtEnd = !!(isWithinMaintainScrollAtEndThreshold && maintainScrollAtEnd && didContainersLayout);
  if (pendingNativeMVCPAdjust) {
    state.pendingMaintainScrollAtEnd = shouldMaintainScrollAtEnd;
    return false;
  }
  if (shouldMaintainScrollAtEnd) {
    state.pendingMaintainScrollAtEnd = false;
    const contentSize = getContentSize(ctx);
    if (contentSize < state.scrollLength) {
      state.scroll = 0;
    }
    if (!state.maintainingScrollAtEnd) {
      const pendingState = maintainScrollAtEnd.animated ? "pending-animated" : "pending-instant";
      const activeState = maintainScrollAtEnd.animated ? "animated" : "instant";
      const scrollAtRequest = state.scroll;
      state.maintainingScrollAtEnd = pendingState;
      requestAnimationFrame(() => {
        const isStillWithinThreshold = peek$(ctx, "isWithinMaintainScrollAtEndThreshold");
        const didScrollSinceRequest = state.scroll !== scrollAtRequest;
        if (isStillWithinThreshold || !didScrollSinceRequest) {
          state.maintainingScrollAtEnd = activeState;
          const scroller = refScroller.current;
          if (state.props.horizontal && isHorizontalRTL(state)) {
            const currentContentSize = getContentSize(ctx);
            const logicalEndOffset = getLogicalHorizontalMaxOffset(state, currentContentSize);
            const nativeOffset = toNativeHorizontalOffset(state, logicalEndOffset, currentContentSize);
            scroller == null ? void 0 : scroller.scrollTo({
              animated: maintainScrollAtEnd.animated,
              x: nativeOffset,
              y: 0
            });
          } else {
            scroller == null ? void 0 : scroller.scrollToEnd({
              animated: maintainScrollAtEnd.animated
            });
          }
          setTimeout(
            () => {
              if (state.maintainingScrollAtEnd === activeState) {
                state.maintainingScrollAtEnd = void 0;
                if (state.pendingMaintainScrollAtEnd) {
                  doMaintainScrollAtEnd(ctx);
                }
              }
            },
            maintainScrollAtEnd.animated ? 500 : 0
          );
        } else if (state.maintainingScrollAtEnd === pendingState) {
          state.maintainingScrollAtEnd = void 0;
          state.pendingMaintainScrollAtEnd = false;
        }
      });
    } else {
      state.pendingMaintainScrollAtEnd = true;
    }
    return true;
  }
  state.pendingMaintainScrollAtEnd = false;
  return false;
}

// src/utils/requestAdjust.ts
function requestAdjust(ctx, positionDiff, dataChanged) {
  const state = ctx.state;
  if (Math.abs(positionDiff) > 0.1) {
    const needsScrollWorkaround = Platform.OS === "android" && !IsNewArchitecture && dataChanged && state.scroll <= positionDiff;
    const doit = () => {
      if (needsScrollWorkaround) {
        doScrollTo(ctx, { horizontal: state.props.horizontal, offset: state.scroll });
      } else {
        state.scrollAdjustHandler.requestAdjust(positionDiff);
        if (state.adjustingFromInitialMount) {
          state.adjustingFromInitialMount--;
        }
      }
    };
    state.scroll += positionDiff;
    state.scrollForNextCalculateItemsInView = void 0;
    const readyToRender = peek$(ctx, "readyToRender");
    if (readyToRender) {
      doit();
      if (Platform.OS !== "web") {
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
        state.scheduledWork.timeout(
          () => {
            var _a3;
            state.ignoreScrollFromMVCP = void 0;
            const shouldForceUpdate = state.ignoreScrollFromMVCPIgnored && state.scrollProcessingEnabled !== false;
            if (shouldForceUpdate) {
              state.ignoreScrollFromMVCPIgnored = false;
              state.scrollPending = state.scroll;
              (_a3 = state.reprocessCurrentScroll) == null ? void 0 : _a3.call(state);
            }
          },
          delay,
          "ignoreScrollFromMVCP"
        );
      }
    } else {
      state.adjustingFromInitialMount = (state.adjustingFromInitialMount || 0) + 1;
      requestAnimationFrame(doit);
    }
  }
}

// src/core/mvcp.ts
var MVCP_POSITION_EPSILON = 0.1;
var MVCP_ANCHOR_LOCK_TTL_MS = 300;
var MVCP_ANCHOR_LOCK_QUIET_PASSES_TO_RELEASE = 2;
var NATIVE_END_CLAMP_EPSILON = 1;
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
function shouldQueueNativeMVCPAdjust(dataChanged, state, positionDiff, prevTotalSize, prevScroll, scrollTarget) {
  if (!dataChanged || Platform.OS === "web" || !state.props.maintainVisibleContentPosition.data || scrollTarget !== void 0 || positionDiff >= -MVCP_POSITION_EPSILON) {
    return false;
  }
  const distanceFromEnd = prevTotalSize - prevScroll - state.scrollLength;
  return distanceFromEnd < Math.abs(positionDiff) - MVCP_POSITION_EPSILON;
}
function getPredictedNativeClamp(state, unresolvedAmount, totalSize) {
  if (Math.abs(unresolvedAmount) <= MVCP_POSITION_EPSILON) {
    return 0;
  }
  const maxScroll = Math.max(0, totalSize - state.scrollLength);
  const clampDelta = maxScroll - state.scroll;
  if (unresolvedAmount < 0) {
    return Math.max(unresolvedAmount, Math.min(0, clampDelta));
  }
  if (unresolvedAmount > 0) {
    return Math.min(unresolvedAmount, Math.max(0, clampDelta));
  }
  return 0;
}
function getProgressTowardAmount(targetDelta, nativeDelta) {
  return targetDelta < 0 ? -nativeDelta : nativeDelta;
}
function settlePendingNativeMVCPAdjust(ctx, remainingAfterManual, nativeDelta) {
  const state = ctx.state;
  state.pendingNativeMVCPAdjust = void 0;
  const remaining = remainingAfterManual - nativeDelta;
  if (Math.abs(remaining) > MVCP_POSITION_EPSILON) {
    requestAdjust(ctx, remaining, true);
  }
}
function maybeApplyPredictedNativeMVCPAdjust(ctx) {
  const state = ctx.state;
  const pending = state.pendingNativeMVCPAdjust;
  if (!pending || Math.abs(pending.manualApplied) > MVCP_POSITION_EPSILON) {
    return;
  }
  const totalSize = getContentSize(ctx);
  const predictedNativeClamp = getPredictedNativeClamp(state, pending.amount, totalSize);
  if (Math.abs(predictedNativeClamp) <= MVCP_POSITION_EPSILON) {
    return;
  }
  const manualDesired = pending.amount - predictedNativeClamp;
  if (Math.abs(manualDesired) <= MVCP_POSITION_EPSILON) {
    return;
  }
  pending.manualApplied = manualDesired;
  requestAdjust(ctx, manualDesired, true);
  pending.furthestProgressTowardAmount = 0;
}
function resolvePendingNativeMVCPAdjust(ctx, newScroll) {
  const state = ctx.state;
  const pending = state.pendingNativeMVCPAdjust;
  if (!pending) {
    return false;
  }
  const remainingAfterManual = pending.amount - pending.manualApplied;
  const nativeDelta = newScroll - (pending.startScroll + pending.manualApplied);
  const isWrongDirection = remainingAfterManual < 0 && nativeDelta > MVCP_POSITION_EPSILON || remainingAfterManual > 0 && nativeDelta < -MVCP_POSITION_EPSILON;
  const progressTowardAmount = getProgressTowardAmount(remainingAfterManual, nativeDelta);
  if (Math.abs(remainingAfterManual) <= MVCP_POSITION_EPSILON) {
    state.pendingNativeMVCPAdjust = void 0;
    return true;
  }
  if (isWrongDirection) {
    state.pendingNativeMVCPAdjust = void 0;
    return false;
  }
  if (progressTowardAmount + MVCP_POSITION_EPSILON >= Math.abs(remainingAfterManual)) {
    settlePendingNativeMVCPAdjust(ctx, remainingAfterManual, nativeDelta);
    return true;
  }
  const expectedNativeClampScroll = Math.max(0, getContentSize(ctx) - state.scrollLength);
  const distanceToClamp = Math.abs(newScroll - expectedNativeClampScroll);
  const isAtExpectedNativeClamp = distanceToClamp <= NATIVE_END_CLAMP_EPSILON;
  if (isAtExpectedNativeClamp) {
    settlePendingNativeMVCPAdjust(ctx, remainingAfterManual, nativeDelta);
    return true;
  }
  if (state.pendingMaintainScrollAtEnd && peek$(ctx, "isWithinMaintainScrollAtEndThreshold") && progressTowardAmount > MVCP_POSITION_EPSILON) {
    settlePendingNativeMVCPAdjust(ctx, remainingAfterManual, nativeDelta);
    return true;
  }
  if (progressTowardAmount > pending.furthestProgressTowardAmount + MVCP_POSITION_EPSILON) {
    pending.furthestProgressTowardAmount = progressTowardAmount;
    return false;
  }
  if (pending.furthestProgressTowardAmount > MVCP_POSITION_EPSILON && progressTowardAmount < pending.furthestProgressTowardAmount - MVCP_POSITION_EPSILON) {
    state.pendingNativeMVCPAdjust = void 0;
    return false;
  }
  return false;
}
function prepareMVCP(ctx, dataChanged) {
  var _a3, _b, _c, _d;
  const state = ctx.state;
  const { idsInView, props } = state;
  const {
    maintainVisibleContentPosition: { data: mvcpData, size: mvcpScroll, shouldRestorePosition }
  } = props;
  const isWeb = Platform.OS === "web";
  const now = Date.now();
  const enableMVCPAnchorLock = isWeb && (!!dataChanged || !!state.mvcpAnchorLock);
  const scrollingTo = state.scrollingTo;
  if (isWeb && dataChanged && state.pendingScrollToEnd && scrollingTo === void 0) {
    state.mvcpAnchorLock = void 0;
    return void 0;
  }
  const anchorLock = isWeb ? resolveAnchorLock(state, enableMVCPAnchorLock, mvcpData, now) : void 0;
  let prevPosition;
  let targetId;
  const idsInViewWithPositions = [];
  const scrollTarget = scrollingTo == null ? void 0 : scrollingTo.index;
  const scrollingToViewPosition = scrollingTo == null ? void 0 : scrollingTo.viewPosition;
  const isEndAnchoredScrollTarget = scrollTarget !== void 0 && getDataLength(state) > 0 && scrollTarget >= getDataLength(state) - 1 && (scrollingToViewPosition != null ? scrollingToViewPosition : 0) > 0;
  const shouldMVCP = dataChanged ? mvcpData : mvcpScroll;
  const indexByKey = state.indexByKey;
  const resolveTargetIndex = () => scrollTarget !== void 0 && !dataChanged ? scrollTarget : targetId !== void 0 ? indexByKey.get(targetId) : void 0;
  const prevScroll = state.scroll;
  const prevTotalSize = getContentSize(ctx);
  if (shouldMVCP) {
    if (!isWeb && state.pendingNativeMVCPAdjust && scrollTarget === void 0) {
      maybeApplyPredictedNativeMVCPAdjust(ctx);
      return void 0;
    }
    if (anchorLock && scrollTarget === void 0) {
      targetId = anchorLock.id;
      prevPosition = anchorLock.position;
    } else if (scrollTarget !== void 0) {
      if (!IsNewArchitecture && (scrollingTo == null ? void 0 : scrollingTo.isInitialScroll)) {
        return void 0;
      }
      targetId = getId(state, scrollTarget);
    } else if (idsInView.length > 0 && state.didContainersLayout && !dataChanged) {
      targetId = idsInView.find((id) => indexByKey.get(id) !== void 0);
    }
    if (dataChanged && idsInView.length > 0 && state.didContainersLayout) {
      for (let i = 0; i < idsInView.length; i++) {
        const id = idsInView[i];
        const index = indexByKey.get(id);
        if (index !== void 0) {
          const position = (_b = (_a3 = state.dataSourceAnchorPositions) == null ? void 0 : _a3.get(id)) != null ? _b : getLayoutOffset(ctx, index);
          if (position !== void 0) {
            idsInViewWithPositions.push({ id, position });
          }
        }
      }
    }
    if (targetId !== void 0 && prevPosition === void 0) {
      const targetIndex = resolveTargetIndex();
      if (targetIndex !== void 0) {
        prevPosition = (_d = (_c = state.dataSourceAnchorPositions) == null ? void 0 : _c.get(targetId)) != null ? _d : getLayoutOffset(ctx, targetIndex);
      }
    }
    return () => {
      var _a4;
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
            positionDiff = newPosition - position;
            anchorIdForLock = id;
            anchorPositionForLock = newPosition;
            break;
          }
        }
      }
      if (!skipTargetAnchor && targetId !== void 0 && prevPosition !== void 0) {
        const targetIndex = resolveTargetIndex();
        const newPosition = getLayoutOffset(ctx, targetIndex);
        if (newPosition !== void 0) {
          const totalSize = getContentSize(ctx);
          let diff = newPosition - prevPosition;
          if (diff !== 0 && isEndAnchoredScrollTarget && state.scroll + state.scrollLength > totalSize) {
            if (diff > 0) {
              diff = Math.max(0, totalSize - state.scroll - state.scrollLength);
            } else {
              const maxScroll = Math.max(0, totalSize - state.scrollLength);
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
      if (scrollingToViewPosition && scrollingToViewPosition > 0) {
        const newSize = getItemSize(ctx, targetId, scrollTarget, getDataItem(state, scrollTarget));
        const prevSize = scrollingTo == null ? void 0 : scrollingTo.itemSize;
        if (newSize !== void 0 && prevSize !== void 0 && newSize !== prevSize) {
          const diff = newSize - prevSize;
          if (diff !== 0) {
            positionDiff += diff * scrollingToViewPosition;
            scrollingTo.itemSize = newSize;
          }
        }
      }
      updateAnchorLock(state, {
        anchorId: anchorIdForLock,
        anchorPosition: anchorPositionForLock,
        dataChanged,
        now,
        positionDiff
      });
      if (shouldQueueNativeMVCPAdjust(dataChanged, state, positionDiff, prevTotalSize, prevScroll, scrollTarget)) {
        state.pendingNativeMVCPAdjust = {
          amount: positionDiff,
          furthestProgressTowardAmount: 0,
          manualApplied: 0,
          startScroll: prevScroll
        };
        maybeApplyPredictedNativeMVCPAdjust(ctx);
        return;
      }
      if (Math.abs(positionDiff) > MVCP_POSITION_EPSILON) {
        const shouldSkipAdjustForMaintainedEnd = (state.maintainingScrollAtEnd === "pending-animated" || state.maintainingScrollAtEnd === "animated") && peek$(ctx, "isWithinMaintainScrollAtEndThreshold");
        if (!shouldSkipAdjustForMaintainedEnd) {
          requestAdjust(ctx, positionDiff, dataChanged && mvcpData);
        }
      }
    };
  }
}

// src/platform/flushSync.native.ts
var flushSync = (fn) => {
  fn();
};

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

// src/utils/isInMVCPActiveMode.native.ts
function isInMVCPActiveMode(state) {
  return state.dataChangeNeedsScrollUpdate;
}

// src/core/updateScroll.ts
function updateScroll(ctx, newScroll, forceUpdate, options) {
  var _a3;
  const state = ctx.state;
  const { ignoreScrollFromMVCP, lastScrollAdjustForHistory, scrollAdjustHandler, scrollHistory, scrollingTo } = state;
  const prevScroll = state.scroll;
  if ((options == null ? void 0 : options.markHasScrolled) !== false) {
    state.hasScrolled = true;
  }
  const currentTime = Date.now();
  state.lastBatchingAction = currentTime;
  const adjust = scrollAdjustHandler.getAdjust();
  const adjustChanged = lastScrollAdjustForHistory !== void 0 && Math.abs(adjust - lastScrollAdjustForHistory) > 0.1;
  if (adjustChanged) {
    scrollHistory.length = 0;
  }
  state.lastScrollAdjustForHistory = adjust;
  if (scrollingTo === void 0 && !(scrollHistory.length === 0 && newScroll === state.scroll)) {
    if (!adjustChanged) {
      scrollHistory.push({ scroll: newScroll, time: currentTime });
    }
  }
  if (scrollHistory.length > 5) {
    scrollHistory.shift();
  }
  if (ignoreScrollFromMVCP && !scrollingTo) {
    const { lt, gt } = ignoreScrollFromMVCP;
    if (lt && newScroll < lt || gt && newScroll > gt) {
      state.ignoreScrollFromMVCPIgnored = true;
      return;
    }
  }
  state.scrollPrev = prevScroll;
  state.scrollPrevTime = state.scrollTime;
  state.scroll = newScroll;
  state.scrollTime = currentTime;
  const scrollDelta = Math.abs(newScroll - prevScroll);
  const isUserScrollEvent = !!(options == null ? void 0 : options.fromNativeScrollEvent) && scrollDelta > 0.1 && !adjustChanged && scrollingTo === void 0 && !state.pendingNativeMVCPAdjust;
  const allowedEdge = isUserScrollEvent ? beginReachedEdgeUserScroll(ctx, newScroll - prevScroll) : void 0;
  const didResolvePendingNativeMVCPAdjust = resolvePendingNativeMVCPAdjust(ctx, newScroll);
  const scrollLength = state.scrollLength;
  const isLargeUserScrollJump = scrollLength > 0 && scrollingTo === void 0 && scrollDelta > scrollLength && !state.pendingNativeMVCPAdjust;
  const scrollVelocity = getScrollVelocity(state);
  updateAdaptiveRender(ctx, scrollVelocity, { forceLight: isLargeUserScrollJump });
  const lastCalculated = state.scrollLastCalculate;
  const useAggressiveItemRecalculation = isInMVCPActiveMode(state);
  const shouldUpdate = useAggressiveItemRecalculation || didResolvePendingNativeMVCPAdjust || allowedEdge !== void 0 || forceUpdate || lastCalculated === void 0 || Math.abs(state.scroll - lastCalculated) > 2;
  if (shouldUpdate) {
    state.scrollLastCalculate = state.scroll;
    state.ignoreScrollFromMVCPIgnored = false;
    state.lastScrollDelta = scrollDelta;
    const runCalculateItems = () => {
      var _a4;
      const calculateItemsParams = {
        doMVCP: scrollingTo !== void 0,
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
      flushSync(runCalculateItems);
      scheduleFullDrawDistancePrewarm(ctx);
    } else {
      runCalculateItems();
    }
    const shouldMaintainScrollAtEndAfterPendingSettle = !!state.pendingMaintainScrollAtEnd || !!((_a3 = state.props.maintainScrollAtEnd) == null ? void 0 : _a3.onDataChange);
    if (didResolvePendingNativeMVCPAdjust && shouldMaintainScrollAtEndAfterPendingSettle) {
      state.pendingMaintainScrollAtEnd = false;
      doMaintainScrollAtEnd(ctx);
    }
    state.dataChangeNeedsScrollUpdate = false;
    state.lastScrollDelta = 0;
  }
}

// src/core/scrollTo.ts
function getAverageSizeSnapshot(state) {
  if (Object.keys(state.averageSizes).length === 0) {
    return void 0;
  }
  const snapshot = {};
  for (const itemType in state.averageSizes) {
    const averages = state.averageSizes[itemType];
    snapshot[itemType] = averages.avg;
  }
  return snapshot;
}
function syncInitialScrollNativeWatchdog(state, options) {
  var _a3;
  const { isInitialScroll, requestedOffset, targetOffset } = options;
  const existingWatchdog = initialScrollWatchdog.get(state);
  const shouldWatchInitialNativeScroll = !state.didFinishInitialScroll && (isInitialScroll || !!existingWatchdog) && initialScrollWatchdog.hasNonZeroTargetOffset(targetOffset);
  const shouldClearInitialNativeScrollWatchdog = !state.didFinishInitialScroll && !!existingWatchdog && initialScrollWatchdog.isAtZeroTargetOffset(requestedOffset);
  if (shouldWatchInitialNativeScroll) {
    state.hasScrolled = false;
    initialScrollWatchdog.set(state, {
      startScroll: (_a3 = existingWatchdog == null ? void 0 : existingWatchdog.startScroll) != null ? _a3 : state.scroll,
      targetOffset
    });
    return;
  }
  if (shouldClearInitialNativeScrollWatchdog) {
    initialScrollWatchdog.clear(state);
  }
}
function pinScrollTargetRenderRange(ctx, targetOffset) {
  const viewportStart = Math.max(0, targetOffset);
  const viewportEnd = Math.max(viewportStart, targetOffset + ctx.state.scrollLength);
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
}
function scrollTo(ctx, params) {
  var _a3, _b;
  const state = ctx.state;
  const { noScrollingTo, forceScroll, ...scrollTarget } = params;
  const {
    animated,
    isInitialScroll,
    offset: scrollTargetOffset,
    precomputedWithViewOffset,
    waitForInitialScrollCompletionFrame
  } = scrollTarget;
  const {
    props: { horizontal }
  } = state;
  cancelScrollCompletionChecks(state);
  const requestedOffset = precomputedWithViewOffset ? scrollTargetOffset : calculateOffsetWithOffsetPosition(ctx, scrollTargetOffset, scrollTarget);
  const shouldPreserveRawInitialOffsetRequest = !!isInitialScroll && ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "offset";
  const targetOffset = clampScrollOffset(ctx, requestedOffset, scrollTarget);
  const offset = shouldPreserveRawInitialOffsetRequest ? requestedOffset : targetOffset;
  state.scrollHistory.length = 0;
  if (!noScrollingTo) {
    if (isInitialScroll) {
      initialScrollCompletion.resetFlags(state);
    }
    const averageSizeSnapshot = getAverageSizeSnapshot(state);
    state.scrollingTo = {
      ...scrollTarget,
      ...averageSizeSnapshot ? { averageSizeSnapshot } : {},
      targetOffset,
      waitForInitialScrollCompletionFrame
    };
    if (!isInitialScroll) {
      pinScrollTargetRenderRange(ctx, targetOffset);
    }
  }
  state.scrollPending = targetOffset;
  syncInitialScrollNativeWatchdog(state, { isInitialScroll, requestedOffset: offset, targetOffset });
  if (!isInitialScroll && !noScrollingTo && Math.abs(state.scroll - targetOffset) > 1) {
    if (animated) {
      if (state.scrollTargetPinnedRange) {
        (_b = state.triggerCalculateItemsInView) == null ? void 0 : _b.call(state);
      }
    } else {
      updateScroll(ctx, targetOffset, true, { markHasScrolled: false });
    }
  }
  if (forceScroll || !isInitialScroll || Platform.OS === "android") {
    doScrollTo(ctx, { animated, horizontal, isInitialScroll, offset });
  } else {
    state.scroll = offset;
  }
}

// src/core/scrollToIndex.ts
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
function scrollToIndex(ctx, {
  index,
  viewOffset = 0,
  animated = true,
  forceScroll,
  isInitialScroll,
  viewPosition
}) {
  const state = ctx.state;
  const dataLength = getDataLength(state);
  index = clampScrollIndex(index, dataLength);
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
    forceScroll,
    index,
    isInitialScroll,
    itemSize,
    offset: firstIndexOffset,
    viewOffset,
    viewPosition: viewPosition != null ? viewPosition : 0
  });
}

// src/core/initialScroll.ts
function dispatchInitialScroll(ctx, params) {
  const { forceScroll, resolvedOffset, target, waitForCompletionFrame } = params;
  const requestedIndex = target.index;
  const index = requestedIndex !== void 0 ? clampScrollIndex(requestedIndex, getDataLength(ctx.state)) : void 0;
  const itemSize = getItemSizeAtIndex(ctx, index);
  scrollTo(ctx, {
    animated: false,
    forceScroll,
    index: index !== void 0 && index >= 0 ? index : void 0,
    isInitialScroll: true,
    itemSize,
    offset: resolvedOffset,
    precomputedWithViewOffset: true,
    viewOffset: target.viewOffset,
    viewPosition: target.viewPosition,
    waitForInitialScrollCompletionFrame: waitForCompletionFrame
  });
}
function setInitialScrollTarget(ctx, target, options) {
  var _a3;
  const { state } = ctx;
  state.clearPreservedInitialScrollOnNextFinish = void 0;
  state.scheduledWork.cancel("preservedInitialScroll");
  state.initialScroll = target;
  if (options == null ? void 0 : options.resetDidFinish) {
    resetInitialRenderState(ctx, { resetInitialScroll: true });
  }
  setInitialScrollSession(state, {
    kind: ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "offset" ? "offset" : "bootstrap"
  });
}
function resolveInitialScrollOffset(ctx, initialScroll) {
  var _a3, _b;
  const state = ctx.state;
  if (((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "offset") {
    return (_b = initialScroll.contentOffset) != null ? _b : 0;
  }
  if (materializeFixedLayoutStoreIndex(ctx, initialScroll.index)) {
    syncLayoutStoreState(ctx);
  }
  const baseOffset = initialScroll.index !== void 0 ? calculateOffsetForIndex(ctx, initialScroll.index) : 0;
  const resolvedOffset = calculateOffsetWithOffsetPosition(ctx, baseOffset, initialScroll);
  return clampScrollOffset(ctx, resolvedOffset, initialScroll);
}
function getAdvanceableInitialScrollState(state, options) {
  const { didFinishInitialScroll, queuedInitialLayout, scrollingTo } = state;
  const initialScroll = state.initialScroll;
  const isInitialScrollInProgress = !!(scrollingTo == null ? void 0 : scrollingTo.isInitialScroll);
  const shouldWaitForInitialLayout = !!(options == null ? void 0 : options.requiresMeasuredLayout) && !queuedInitialLayout && !isInitialScrollInProgress;
  if (!initialScroll || shouldWaitForInitialLayout || didFinishInitialScroll || scrollingTo && !isInitialScrollInProgress) {
    return void 0;
  }
  return {
    initialScroll,
    isInitialScrollInProgress,
    queuedInitialLayout,
    scrollingTo
  };
}
function advanceMeasuredInitialScroll(ctx, options) {
  var _a3, _b, _c;
  const state = ctx.state;
  const advanceableState = getAdvanceableInitialScrollState(state, {
    requiresMeasuredLayout: true
  });
  if (!advanceableState) {
    return false;
  }
  const { initialScroll, isInitialScrollInProgress, queuedInitialLayout } = advanceableState;
  const scrollingTo = isInitialScrollInProgress ? advanceableState.scrollingTo : void 0;
  const resolvedOffset = resolveInitialScrollOffset(ctx, initialScroll);
  const activeInitialTargetOffset = scrollingTo ? (_a3 = scrollingTo.targetOffset) != null ? _a3 : scrollingTo.offset : void 0;
  const didOffsetChange = initialScroll.contentOffset === void 0 || Math.abs(initialScroll.contentOffset - resolvedOffset) > 1;
  const didActiveInitialTargetChange = activeInitialTargetOffset !== void 0 && Math.abs(activeInitialTargetOffset - resolvedOffset) > 1;
  const isAlreadyAtDesiredInitialTarget = activeInitialTargetOffset !== void 0 && Math.abs(state.scroll - resolvedOffset) <= 1 && Math.abs(state.scrollPending - resolvedOffset) <= 1;
  if (!(options == null ? void 0 : options.forceScroll) && !didOffsetChange && isInitialScrollInProgress && !didActiveInitialTargetChange) {
    return false;
  }
  if ((options == null ? void 0 : options.forceScroll) && isAlreadyAtDesiredInitialTarget) {
    return false;
  }
  if (didOffsetChange && ((_b = state.initialScrollSession) == null ? void 0 : _b.kind) !== "offset") {
    setInitialScrollTarget(ctx, { ...initialScroll, contentOffset: resolvedOffset });
  }
  const forceScroll = (_c = options == null ? void 0 : options.forceScroll) != null ? _c : !!queuedInitialLayout || isInitialScrollInProgress && didOffsetChange;
  dispatchInitialScroll(ctx, {
    forceScroll,
    resolvedOffset,
    target: initialScroll
  });
  return true;
}
function advanceOffsetInitialScroll(ctx, options) {
  var _a3, _b;
  const state = ctx.state;
  const advanceableState = getAdvanceableInitialScrollState(state);
  if (!advanceableState) {
    return false;
  }
  const { initialScroll, queuedInitialLayout } = advanceableState;
  const resolvedOffset = (_a3 = initialScroll.contentOffset) != null ? _a3 : 0;
  const isAlreadyAtDesiredInitialTarget = Math.abs(state.scroll - resolvedOffset) <= 1 && Math.abs(state.scrollPending - resolvedOffset) <= 1;
  if ((options == null ? void 0 : options.forceScroll) && isAlreadyAtDesiredInitialTarget) {
    return false;
  }
  const hasMeasuredScrollLayout = !!state.lastLayout && state.scrollLength > 0;
  const forceScroll = (_b = options == null ? void 0 : options.forceScroll) != null ? _b : hasMeasuredScrollLayout || !!queuedInitialLayout;
  dispatchInitialScroll(ctx, {
    forceScroll,
    resolvedOffset,
    target: initialScroll
  });
  return true;
}
function advanceCurrentInitialScrollSession(ctx, options) {
  var _a3;
  return ((_a3 = ctx.state.initialScrollSession) == null ? void 0 : _a3.kind) === "offset" ? advanceOffsetInitialScroll(ctx, {
    forceScroll: options == null ? void 0 : options.forceScroll
  }) : advanceMeasuredInitialScroll(ctx, {
    forceScroll: options == null ? void 0 : options.forceScroll
  });
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
var DEFAULT_BOOTSTRAP_REVEAL_EPSILON = 1;
var DEFAULT_BOOTSTRAP_REVEAL_MAX_FRAMES = 8;
var DEFAULT_BOOTSTRAP_REVEAL_MAX_PASSES = 24;
var BOOTSTRAP_REVEAL_ABORT_WARNING = "LegendList bootstrap initial scroll aborted after exceeding convergence bounds.";
function getBootstrapInitialScrollSession(state) {
  var _a3;
  return ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "bootstrap" ? state.initialScrollSession.bootstrap : void 0;
}
function isOffsetInitialScrollSession(state) {
  var _a3;
  return ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "offset";
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
function getBootstrapRevealVisibleIndices(options) {
  const { dataLength, getPosition, getSize, offset, scrollLength, startIndex: requestedStartIndex } = options;
  const endOffset = offset + scrollLength;
  const visibleIndices = [];
  let index = requestedStartIndex !== void 0 ? Math.max(0, Math.min(dataLength - 1, requestedStartIndex)) : 0;
  while (index > 0) {
    const previousIndex = index - 1;
    const previousPosition = getPosition(previousIndex);
    if (previousPosition === void 0) {
      index = previousIndex;
      continue;
    }
    const previousSize = getSize(previousIndex);
    if (previousSize === void 0) {
      index = previousIndex;
      continue;
    }
    if (previousPosition + previousSize <= offset) {
      break;
    }
    index = previousIndex;
  }
  for (; index < dataLength; index++) {
    const position = getPosition(index);
    if (position === void 0) {
      continue;
    }
    const size = getSize(index);
    if (size === void 0) {
      continue;
    }
    if (position < endOffset && position + size > offset) {
      visibleIndices.push(index);
    } else if (visibleIndices.length > 0 && position >= endOffset) {
      break;
    }
  }
  return visibleIndices;
}
function shouldAbortBootstrapReveal(options) {
  const {
    mountFrameCount,
    maxFrames = DEFAULT_BOOTSTRAP_REVEAL_MAX_FRAMES,
    maxPasses = DEFAULT_BOOTSTRAP_REVEAL_MAX_PASSES,
    passCount
  } = options;
  return mountFrameCount >= maxFrames || passCount >= maxPasses;
}
function abortBootstrapRevealIfNeeded(ctx, options) {
  if (!shouldAbortBootstrapReveal(options)) {
    return false;
  }
  if (IS_DEV) {
    console.warn(BOOTSTRAP_REVEAL_ABORT_WARNING);
  }
  abortBootstrapInitialScroll(ctx);
  return true;
}
function clearBootstrapInitialScrollSession(state) {
  var _a3;
  const bootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  const frameHandle = bootstrapInitialScroll == null ? void 0 : bootstrapInitialScroll.frameHandle;
  if (frameHandle !== void 0 && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frameHandle);
  }
  if (bootstrapInitialScroll) {
    bootstrapInitialScroll.frameHandle = void 0;
  }
  setInitialScrollSession(state, {
    bootstrap: null,
    kind: (_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind
  });
}
function startBootstrapInitialScrollSession(state, options) {
  var _a3, _b, _c;
  const previousBootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  setInitialScrollSession(state, {
    bootstrap: {
      frameHandle: previousBootstrapInitialScroll == null ? void 0 : previousBootstrapInitialScroll.frameHandle,
      // Re-arming during the initial mount should spend from the same watchdog budget.
      mountFrameCount: (_a3 = previousBootstrapInitialScroll == null ? void 0 : previousBootstrapInitialScroll.mountFrameCount) != null ? _a3 : 0,
      passCount: 0,
      previousResolvedOffset: void 0,
      scroll: options.scroll,
      seedContentOffset: (_c = (_b = options.seedContentOffset) != null ? _b : previousBootstrapInitialScroll == null ? void 0 : previousBootstrapInitialScroll.seedContentOffset) != null ? _c : options.scroll,
      targetIndexSeed: options.targetIndexSeed,
      visibleIndices: void 0
    },
    kind: "bootstrap"
  });
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
    bootstrapInitialScroll.previousResolvedOffset = void 0;
    bootstrapInitialScroll.scroll = (_a3 = options == null ? void 0 : options.scroll) != null ? _a3 : bootstrapInitialScroll.scroll;
    bootstrapInitialScroll.seedContentOffset = (_b = options == null ? void 0 : options.seedContentOffset) != null ? _b : bootstrapInitialScroll.seedContentOffset;
    bootstrapInitialScroll.targetIndexSeed = (_c = options == null ? void 0 : options.targetIndexSeed) != null ? _c : bootstrapInitialScroll.targetIndexSeed;
    bootstrapInitialScroll.visibleIndices = void 0;
    setInitialScrollSession(state, {
      bootstrap: bootstrapInitialScroll,
      kind: "bootstrap"
    });
  }
}
function queueBootstrapInitialScrollReevaluation(state) {
  requestAnimationFrame(() => {
    var _a3;
    if (getBootstrapInitialScrollSession(state)) {
      (_a3 = state.triggerCalculateItemsInView) == null ? void 0 : _a3.call(state, { forceFullItemPositions: true });
    }
  });
}
function ensureBootstrapInitialScrollFrameTicker(ctx) {
  const state = ctx.state;
  const bootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  if (!bootstrapInitialScroll || bootstrapInitialScroll.frameHandle !== void 0) {
    return;
  }
  const tick = () => {
    const activeBootstrapInitialScroll = getBootstrapInitialScrollSession(state);
    if (!activeBootstrapInitialScroll) {
      return;
    }
    activeBootstrapInitialScroll.frameHandle = void 0;
    activeBootstrapInitialScroll.mountFrameCount += 1;
    if (abortBootstrapRevealIfNeeded(ctx, {
      mountFrameCount: activeBootstrapInitialScroll.mountFrameCount,
      passCount: activeBootstrapInitialScroll.passCount
    })) {
      return;
    }
    ensureBootstrapInitialScrollFrameTicker(ctx);
  };
  bootstrapInitialScroll.frameHandle = requestAnimationFrame(tick);
}
function rearmBootstrapInitialScroll(ctx, options) {
  resetBootstrapInitialScrollSession(ctx.state, options);
  ensureBootstrapInitialScrollFrameTicker(ctx);
  queueBootstrapInitialScrollReevaluation(ctx.state);
}
function createInitialScrollAtEndTarget(options) {
  const { dataLength, footerSize, preserveForFooterLayout, stylePaddingEnd } = options;
  return {
    contentOffset: void 0,
    index: Math.max(0, dataLength - 1),
    preserveForBottomPadding: true,
    preserveForFooterLayout,
    viewOffset: -stylePaddingEnd - footerSize,
    viewPosition: 1
  };
}
function shouldPreserveInitialScrollForBottomPadding(target) {
  return !!(target == null ? void 0 : target.preserveForBottomPadding);
}
function shouldPreserveInitialScrollForFooterLayout(target) {
  return !!(target == null ? void 0 : target.preserveForFooterLayout);
}
function isRetargetableBottomAlignedInitialScrollTarget(target) {
  return !!(target && target.viewPosition === 1 && (shouldPreserveInitialScrollForBottomPadding(target) || shouldPreserveInitialScrollForFooterLayout(target)));
}
function createRetargetedBottomAlignedInitialScroll(options) {
  const { dataLength, footerSize, initialScrollAtEnd, stylePaddingEnd, target } = options;
  const preserveForFooterLayout = shouldPreserveInitialScrollForFooterLayout(target);
  return {
    ...target,
    contentOffset: void 0,
    index: initialScrollAtEnd ? Math.max(0, dataLength - 1) : target.index,
    preserveForBottomPadding: true,
    preserveForFooterLayout,
    viewOffset: -stylePaddingEnd - (preserveForFooterLayout ? footerSize : 0),
    viewPosition: 1
  };
}
function areEquivalentBootstrapInitialScrollTargets(current, next) {
  return current.index === next.index && current.preserveForBottomPadding === next.preserveForBottomPadding && current.preserveForFooterLayout === next.preserveForFooterLayout && current.viewOffset === next.viewOffset && current.viewPosition === next.viewPosition;
}
function clearPendingInitialScrollFooterLayout(ctx, options) {
  const { dataLength, stylePaddingEnd, target } = options;
  if (!shouldPreserveInitialScrollForFooterLayout(target)) {
    return;
  }
  const clearedFooterTarget = createInitialScrollAtEndTarget({
    dataLength,
    footerSize: 0,
    preserveForFooterLayout: void 0,
    stylePaddingEnd
  });
  setInitialScrollTarget(ctx, clearedFooterTarget);
}
function clearFinishedViewportRetargetableInitialScroll(state) {
  clearPreservedInitialScrollTarget(state);
}
function didFinishedInitialScrollMoveAwayFromTarget(ctx, target, epsilon = DEFAULT_BOOTSTRAP_REVEAL_EPSILON) {
  const state = ctx.state;
  if (!state.didFinishInitialScroll) {
    return false;
  }
  const currentOffset = getObservedBootstrapInitialScrollOffset(state);
  return Math.abs(currentOffset - resolveInitialScrollOffset(ctx, target)) > epsilon;
}
function getObservedBootstrapInitialScrollOffset(state) {
  var _a3, _b, _c, _d;
  const observedOffset = (_b = (_a3 = state.refScroller.current) == null ? void 0 : _a3.getCurrentScrollOffset) == null ? void 0 : _b.call(_a3);
  return typeof observedOffset === "number" && Number.isFinite(observedOffset) ? observedOffset : (_d = (_c = state.scrollPending) != null ? _c : state.scroll) != null ? _d : 0;
}
function getPreservedEndAnchorOffsetDiff(ctx) {
  var _a3;
  const state = ctx.state;
  const initialScroll = state.initialScroll;
  if (!state.didFinishInitialScroll || ((_a3 = state.scrollingTo) == null ? void 0 : _a3.isInitialScroll) || !initialScroll || initialScroll.viewPosition !== 1 || getDataLength(state) === 0 || isOffsetInitialScrollSession(state)) {
    return;
  }
  const currentOffset = typeof state.lastNativeScroll === "number" && Number.isFinite(state.lastNativeScroll) ? state.lastNativeScroll : getObservedBootstrapInitialScrollOffset(state);
  return resolveInitialScrollOffset(ctx, initialScroll) - currentOffset;
}
function schedulePreservedEndAnchorCorrection(ctx) {
  if (getPreservedEndAnchorOffsetDiff(ctx) === void 0) {
    return false;
  }
  const correction = {};
  schedulePreservedEndAnchorCorrectionFrame(ctx, correction);
  return true;
}
function schedulePreservedEndAnchorCorrectionFrame(ctx, correction) {
  const state = ctx.state;
  state.preservedEndAnchorCorrection = correction;
  requestAnimationFrame(() => {
    var _a3;
    const activeCorrection = state.preservedEndAnchorCorrection;
    if (activeCorrection !== correction) {
      return;
    }
    const offsetDiff = getPreservedEndAnchorOffsetDiff(ctx);
    if (offsetDiff === void 0 || Math.abs(offsetDiff) <= DEFAULT_BOOTSTRAP_REVEAL_EPSILON) {
      state.preservedEndAnchorCorrection = void 0;
      return;
    }
    const hasObservedNativeScrollAfterRequest = !activeCorrection.lastRequestTime || ((_a3 = state.lastNativeScrollTime) != null ? _a3 : 0) > activeCorrection.lastRequestTime;
    if (hasObservedNativeScrollAfterRequest) {
      activeCorrection.lastRequestTime = Date.now();
      requestAdjust(ctx, offsetDiff);
    }
    schedulePreservedEndAnchorCorrectionFrame(ctx, correction);
  });
}
function clearFinishedBootstrapInitialScrollTargetIfMovedAway(ctx) {
  var _a3;
  const state = ctx.state;
  const initialScroll = state.initialScroll;
  if (!state.didFinishInitialScroll || ((_a3 = state.scrollingTo) == null ? void 0 : _a3.isInitialScroll) || (initialScroll == null ? void 0 : initialScroll.viewPosition) !== 1 || state.preservedEndAnchorCorrection) {
    return;
  }
  if (didFinishedInitialScrollMoveAwayFromTarget(ctx, initialScroll)) {
    const shouldKeepEndTargetAlive = isRetargetableBottomAlignedInitialScrollTarget(initialScroll) && peek$(ctx, "isAtEnd");
    if (!shouldKeepEndTargetAlive) {
      if (shouldPreserveInitialScrollForFooterLayout(initialScroll)) {
        clearPendingInitialScrollFooterLayout(ctx, {
          dataLength: getDataLength(state),
          stylePaddingEnd: getStylePaddingEnd(state.props),
          target: initialScroll
        });
      } else {
        clearFinishedViewportRetargetableInitialScroll(state);
      }
    }
  }
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
  const { dataLength, didDataChange, initialScrollAtEnd, previousDataLength, stylePaddingEnd } = options;
  const state = ctx.state;
  const initialScroll = state.initialScroll;
  if (isOffsetInitialScrollSession(state) || !initialScroll) {
    return;
  }
  const shouldResetDidFinish = !!(state.didFinishInitialScroll && previousDataLength === 0 && dataLength > 0 && initialScroll.index !== void 0);
  const bootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  const shouldClearFinishedResizePreservation = !initialScrollAtEnd && didDataChange && dataLength > 0 && state.didFinishInitialScroll && !bootstrapInitialScroll && !shouldResetDidFinish;
  if (shouldClearFinishedResizePreservation) {
    clearPreservedInitialScrollTarget(state);
    return;
  }
  const shouldRetargetBottomAligned = dataLength > 0 && (initialScrollAtEnd || isRetargetableBottomAlignedInitialScrollTarget(initialScroll));
  if (!didDataChange && !shouldResetDidFinish && !shouldRetargetBottomAligned) {
    return;
  }
  if (shouldRetargetBottomAligned) {
    const updatedInitialScroll = initialScrollAtEnd ? createInitialScrollAtEndTarget({
      dataLength,
      footerSize: peek$(ctx, "footerSize") || 0,
      preserveForFooterLayout: shouldPreserveInitialScrollForFooterLayout(initialScroll),
      stylePaddingEnd
    }) : createRetargetedBottomAlignedInitialScroll({
      dataLength,
      footerSize: peek$(ctx, "footerSize") || 0,
      initialScrollAtEnd,
      stylePaddingEnd,
      target: initialScroll
    });
    if (!shouldResetDidFinish && didFinishedInitialScrollMoveAwayFromTarget(ctx, initialScroll)) {
      clearPendingInitialScrollFooterLayout(ctx, {
        dataLength,
        stylePaddingEnd,
        target: initialScroll
      });
      return;
    }
    if (!areEquivalentBootstrapInitialScrollTargets(initialScroll, updatedInitialScroll) || !!bootstrapInitialScroll || shouldResetDidFinish || didDataChange) {
      setInitialScrollTarget(ctx, updatedInitialScroll, {
        resetDidFinish: shouldResetDidFinish
      });
      rearmBootstrapInitialScroll(ctx, {
        scroll: resolveInitialScrollOffset(ctx, updatedInitialScroll),
        seedContentOffset: shouldResetDidFinish && !bootstrapInitialScroll ? getObservedBootstrapInitialScrollOffset(state) : void 0,
        targetIndexSeed: updatedInitialScroll.index
      });
      return;
    }
  }
  if (!didDataChange) {
    return;
  }
  if (bootstrapInitialScroll || shouldResetDidFinish) {
    setInitialScrollTarget(ctx, initialScroll, {
      resetDidFinish: shouldResetDidFinish
    });
    rearmBootstrapInitialScroll(ctx, {
      scroll: resolveInitialScrollOffset(ctx, initialScroll),
      seedContentOffset: shouldResetDidFinish && !bootstrapInitialScroll ? getObservedBootstrapInitialScrollOffset(state) : void 0,
      targetIndexSeed: initialScroll.index
    });
  }
}
function handleBootstrapInitialScrollFooterLayout(ctx, options) {
  const { dataLength, footerSize, initialScrollAtEnd, stylePaddingEnd } = options;
  const state = ctx.state;
  if (!initialScrollAtEnd) {
    return;
  }
  const initialScroll = state.initialScroll;
  if (isOffsetInitialScrollSession(state) || dataLength === 0 || !initialScroll) {
    return;
  }
  const shouldProcessFooterLayout = !!getBootstrapInitialScrollSession(state) || shouldPreserveInitialScrollForFooterLayout(initialScroll);
  if (!shouldProcessFooterLayout) {
    return;
  }
  if (didFinishedInitialScrollMoveAwayFromTarget(ctx, initialScroll)) {
    clearPendingInitialScrollFooterLayout(ctx, {
      dataLength,
      stylePaddingEnd,
      target: initialScroll
    });
  } else {
    const updatedInitialScroll = createInitialScrollAtEndTarget({
      dataLength,
      footerSize,
      preserveForFooterLayout: shouldPreserveInitialScrollForFooterLayout(initialScroll),
      stylePaddingEnd
    });
    const didTargetChange = initialScroll.index !== updatedInitialScroll.index || initialScroll.viewPosition !== updatedInitialScroll.viewPosition || initialScroll.viewOffset !== updatedInitialScroll.viewOffset;
    if (!didTargetChange) {
      clearPendingInitialScrollFooterLayout(ctx, {
        dataLength,
        stylePaddingEnd,
        target: initialScroll
      });
    } else {
      const didFinishInitialScroll = !!state.didFinishInitialScroll;
      setInitialScrollTarget(ctx, updatedInitialScroll, {
        resetDidFinish: didFinishInitialScroll
      });
      rearmBootstrapInitialScroll(ctx, {
        scroll: resolveInitialScrollOffset(ctx, updatedInitialScroll),
        targetIndexSeed: updatedInitialScroll.index
      });
    }
  }
}
function handleBootstrapInitialScrollLayoutChange(ctx) {
  var _a3, _b, _c;
  const state = ctx.state;
  const initialScroll = state.initialScroll;
  const bootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  if (initialScroll && getDataLength(state) > 0 && !isOffsetInitialScrollSession(state) && (bootstrapInitialScroll || initialScroll.viewPosition === 1)) {
    const resolvedOffset = resolveInitialScrollOffset(ctx, initialScroll);
    const scrollingTo = ((_a3 = state.scrollingTo) == null ? void 0 : _a3.isInitialScroll) ? state.scrollingTo : void 0;
    if (!bootstrapInitialScroll && (scrollingTo || state.didFinishInitialScroll)) {
      const currentOffset = scrollingTo ? (_b = scrollingTo.targetOffset) != null ? _b : scrollingTo.offset : getObservedBootstrapInitialScrollOffset(state);
      const offsetDiff = resolvedOffset - currentOffset;
      if (Math.abs(offsetDiff) > DEFAULT_BOOTSTRAP_REVEAL_EPSILON) {
        if (state.didFinishInitialScroll) {
          schedulePreservedEndAnchorCorrection(ctx);
        } else if (scrollingTo) {
          const existingWatchdog = initialScrollWatchdog.get(state);
          scrollingTo.offset = resolvedOffset;
          scrollingTo.targetOffset = resolvedOffset;
          state.initialScroll = {
            ...initialScroll,
            contentOffset: resolvedOffset
          };
          state.hasScrolled = false;
          initialScrollWatchdog.set(state, {
            startScroll: (_c = existingWatchdog == null ? void 0 : existingWatchdog.startScroll) != null ? _c : state.scroll,
            targetOffset: resolvedOffset
          });
          requestAdjust(ctx, offsetDiff);
        }
      }
    } else {
      rearmBootstrapInitialScroll(ctx, {
        scroll: resolvedOffset,
        targetIndexSeed: initialScroll.index
      });
    }
  }
}
function evaluateBootstrapInitialScroll(ctx) {
  var _a3, _b;
  const state = ctx.state;
  const bootstrapInitialScroll = getBootstrapInitialScrollSession(state);
  const initialScroll = state.initialScroll;
  if (!bootstrapInitialScroll || !initialScroll || isOffsetInitialScrollSession(state) || ((_a3 = state.scrollingTo) == null ? void 0 : _a3.isInitialScroll)) {
    return;
  }
  bootstrapInitialScroll.passCount += 1;
  if (abortBootstrapRevealIfNeeded(ctx, {
    mountFrameCount: bootstrapInitialScroll.mountFrameCount,
    passCount: bootstrapInitialScroll.passCount
  })) {
    return;
  }
  if (initialScroll.index !== void 0 && state.startBuffered >= 0 && state.endBuffered >= 0 && initialScroll.index >= state.startBuffered && initialScroll.index <= state.endBuffered) {
    bootstrapInitialScroll.targetIndexSeed = void 0;
  }
  const resolvedOffset = resolveInitialScrollOffset(ctx, initialScroll);
  const areMountedBufferedIndicesMeasured = checkAllSizesKnown(state, state.startBuffered, state.endBuffered);
  const didResolvedOffsetChange = Math.abs(bootstrapInitialScroll.scroll - resolvedOffset) > 1;
  const visibleIndices = getBootstrapRevealVisibleIndices({
    dataLength: getDataLength(state),
    getPosition: (index) => getLayoutOffset(ctx, index),
    getSize: (index) => {
      var _a4;
      return (_a4 = getKnownOrFixedItemSize(ctx, index)) != null ? _a4 : getLayoutSize(ctx, index);
    },
    offset: resolvedOffset,
    scrollLength: state.scrollLength,
    startIndex: (_b = bootstrapInitialScroll.targetIndexSeed) != null ? _b : state.startBuffered >= 0 ? state.startBuffered : void 0
  });
  const areVisibleIndicesMeasured = visibleIndices.length > 0 && visibleIndices.every((index) => {
    var _a4;
    const id = (_a4 = state.idCache[index]) != null ? _a4 : getId(state, index);
    return state.sizesKnown.has(id);
  });
  const previousResolvedOffset = bootstrapInitialScroll.previousResolvedOffset;
  const previousVisibleIndices = bootstrapInitialScroll.visibleIndices;
  bootstrapInitialScroll.previousResolvedOffset = resolvedOffset;
  bootstrapInitialScroll.visibleIndices = visibleIndices;
  if (didResolvedOffsetChange) {
    bootstrapInitialScroll.scroll = resolvedOffset;
    queueBootstrapInitialScrollReevaluation(state);
    return;
  }
  if (!areMountedBufferedIndicesMeasured || !areVisibleIndicesMeasured) {
    return;
  }
  const didRevealSettle = previousResolvedOffset !== void 0 && Math.abs(previousResolvedOffset - resolvedOffset) <= DEFAULT_BOOTSTRAP_REVEAL_EPSILON && doVisibleIndicesMatch(previousVisibleIndices, visibleIndices);
  if (!didRevealSettle) {
    queueBootstrapInitialScrollReevaluation(state);
    return;
  }
  if (Platform.OS !== "web" && Platform.OS !== "android" && Math.abs(bootstrapInitialScroll.seedContentOffset - resolvedOffset) <= 1 && Math.abs(getObservedBootstrapInitialScrollOffset(state) - resolvedOffset) <= 1) {
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
  const shouldPreserveResizeTarget = !state.clearPreservedInitialScrollOnNextFinish && getDataLength(state) > 0 && ((_a3 = state.initialScroll) == null ? void 0 : _a3.viewPosition) === 1;
  finishInitialScroll(ctx, {
    preserveTarget: shouldPreserveResizeTarget,
    recalculateItems: true,
    resolvedOffset,
    schedulePreservedTargetClear: shouldPreserveResizeTarget
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

// src/core/initialScrollLifecycle.ts
function retargetActiveInitialScrollAtEnd(ctx) {
  var _a3;
  const state = ctx.state;
  const initialScroll = state.initialScroll;
  if (state.didFinishInitialScroll) {
    return schedulePreservedEndAnchorCorrection(ctx);
  }
  if (!initialScroll || ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "offset" || initialScroll.viewPosition !== 1 || getDataLength(state) === 0) {
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
  if (((_a3 = ctx.state.initialScrollSession) == null ? void 0 : _a3.kind) !== "offset") {
    requestAnimationFrame(runScroll);
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
  if (initialScroll && (initialScroll.contentOffset === void 0 || !!initialScroll.preserveForFooterLayout !== preserveForFooterLayout && ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) !== "offset")) {
    setInitialScrollTarget(ctx, {
      ...initialScroll,
      contentOffset: resolvedInitialContentOffset,
      preserveForFooterLayout
    });
  }
  if (useBootstrapInitialScroll && initialScroll && ((_b = state.initialScrollSession) == null ? void 0 : _b.kind) !== "offset") {
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
  var _a3, _b, _c;
  const {
    dataLength,
    didDataChange,
    didStartFreshData,
    initialScrollAtEnd,
    latestInitialScroll,
    latestInitialScrollSessionKind,
    stylePaddingEnd,
    useBootstrapInitialScroll
  } = options;
  const state = ctx.state;
  const previousInitialScrollDataLength = (_b = (_a3 = state.initialScrollSession) == null ? void 0 : _a3.previousDataLength) != null ? _b : 0;
  const shouldUseLatestInitialScroll = dataLength > 0 && (!state.hasHadNonEmptyData || didStartFreshData);
  if (dataLength > 0) {
    state.hasHadNonEmptyData = true;
  }
  if (shouldUseLatestInitialScroll) {
    if (latestInitialScroll) {
      setInitialScrollTarget(ctx, latestInitialScroll);
      setInitialScrollSession(state, {
        kind: latestInitialScrollSessionKind,
        previousDataLength: previousInitialScrollDataLength
      });
    } else {
      clearPreservedInitialScrollTarget(state);
    }
  }
  if (state.initialScrollSession) {
    state.initialScrollSession.previousDataLength = dataLength;
  }
  setInitialScrollSession(state);
  if (useBootstrapInitialScroll) {
    handleBootstrapInitialScrollDataChange(ctx, {
      dataLength,
      didDataChange,
      initialScrollAtEnd,
      previousDataLength: previousInitialScrollDataLength,
      stylePaddingEnd
    });
    return;
  }
  const shouldReplayFinishedOffsetInitialScroll = previousInitialScrollDataLength === 0 && dataLength > 0 && !!state.initialScroll && ((_c = ctx.state.initialScrollSession) == null ? void 0 : _c.kind) === "offset" && !!state.didFinishInitialScroll;
  if (previousInitialScrollDataLength !== 0 || dataLength === 0 || !state.initialScroll || !state.queuedInitialLayout || state.didFinishInitialScroll && !shouldReplayFinishedOffsetInitialScroll) {
    return;
  }
  if (shouldReplayFinishedOffsetInitialScroll) {
    resetInitialRenderState(ctx, { resetInitialScroll: true });
  }
  advanceCurrentInitialScrollSession(ctx);
}

// src/core/resetLayoutCachesForDataChange.ts
function resetLayoutCachesForDataChange(state, options) {
  var _a3;
  state.indexByKey.clear();
  state.idCache.length = 0;
  if ((options == null ? void 0 : options.includeLayoutStoreMeasurements) !== false) {
    (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store.clearKnownSizes();
    resetLayoutStoreRuntimeState(state);
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

// src/core/syncMountedContainer.ts
function syncMountedContainer(ctx, containerIndex, itemIndex, options) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i;
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
    const layout = options == null ? void 0 : options.layout;
    const positionValue = layout ? layout.getOffset(itemIndex) : getLayoutOffset(ctx, itemIndex);
    if (positionValue === void 0) {
      set$(ctx, `containerPosition${containerIndex}`, POSITION_OUT_OF_VIEW);
      return { didChangePosition: false, didRefreshData: false };
    }
    const logicalPosition = (positionValue || 0) - ((_c = options == null ? void 0 : options.scrollAdjustPending) != null ? _c : 0);
    const itemSize = (_d = layout ? layout.getSize(itemIndex) : getLayoutSize(ctx, itemIndex)) != null ? _d : getItemSize(ctx, itemKey, itemIndex, item, void 0, void 0, void 0, metadata);
    const position = toPhysicalHorizontalItemPosition(state, logicalPosition, itemSize, peek$(ctx, "totalSize"));
    const column = (layout ? layout.getColumn(itemIndex) : getLayoutColumn(ctx, itemIndex)) || 1;
    const span = (layout ? layout.getSpan(itemIndex) : getLayoutSpan(ctx, itemIndex)) || 1;
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
    const pendingDataComparison = ((_e = state.pendingDataComparison) == null ? void 0 : _e.previousData) === state.previousData && ((_f = state.pendingDataComparison) == null ? void 0 : _f.nextData) === data ? state.pendingDataComparison : void 0;
    const cachedComparison = (_g = pendingDataComparison == null ? void 0 : pendingDataComparison.byIndex[itemIndex]) != null ? _g : 0;
    if (indexedData.kind === "dataSource" || cachedComparison === 2) {
      updateData();
    } else if (cachedComparison !== 1) {
      const nextItemKey = (_h = peek$(ctx, `containerItemKey${containerIndex}`)) != null ? _h : itemKey;
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
        if ((_i = state.pendingDataComparison) == null ? void 0 : _i.byIndex) {
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
function setupViewability(props) {
  const { viewabilityConfig, viewabilityConfigCallbackPairs, onViewableItemsChanged } = props;
  const pairs = (viewabilityConfigCallbackPairs != null ? viewabilityConfigCallbackPairs : []).map((pair, index) => {
    const normalizedConfig = normalizeViewabilityConfig(pair.viewabilityConfig, `pair-${index}`);
    return normalizedConfig === pair.viewabilityConfig ? pair : { ...pair, viewabilityConfig: normalizedConfig };
  });
  pairs.push({
    onViewableItemsChanged,
    viewabilityConfig: normalizeViewabilityConfig(viewabilityConfig, "")
  });
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
    state.enableScrollForNextCalculateItemsInView = true;
    state.scrollForNextCalculateItemsInView = void 0;
    (_a3 = state.triggerCalculateItemsInView) == null ? void 0 : _a3.call(state);
  }
}
function updateViewableItems(ctx, viewabilityConfigCallbackPairs, scrollSize, start, end, startBuffered = start, endBuffered = end, layout) {
  const state = ctx.state;
  const indexedData = getIndexedData(state);
  for (let pairIndex = 0; pairIndex < viewabilityConfigCallbackPairs.length; pairIndex++) {
    const viewabilityConfigCallbackPair = viewabilityConfigCallbackPairs[pairIndex];
    const publishAmounts = pairIndex === viewabilityConfigCallbackPairs.length - 1;
    const viewabilityState = ensureViewabilityState(ctx, viewabilityConfigCallbackPair.viewabilityConfig.id);
    viewabilityState.start = start;
    viewabilityState.end = end;
    viewabilityState.startBuffered = startBuffered;
    viewabilityState.endBuffered = endBuffered;
    if (viewabilityConfigCallbackPair.viewabilityConfig.minimumViewTime) {
      state.scheduledWork.timeout(() => {
        const currentPairs = state.viewabilityConfigCallbackPairs;
        if ((!currentPairs || currentPairs.includes(viewabilityConfigCallbackPair)) && hasViewabilityConsumers(ctx, currentPairs != null ? currentPairs : [viewabilityConfigCallbackPair])) {
          updateViewableItemsWithConfig(
            indexedData,
            viewabilityConfigCallbackPair,
            state,
            ctx,
            scrollSize,
            void 0,
            publishAmounts
          );
        }
      }, viewabilityConfigCallbackPair.viewabilityConfig.minimumViewTime);
    } else {
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
}
function updateViewableItemsWithConfig(data, viewabilityConfigCallbackPair, state, ctx, scrollSize, layout, publishAmounts = false) {
  const { viewabilityConfig, onViewableItemsChanged } = viewabilityConfigCallbackPair;
  const configId = viewabilityConfig.id;
  const viewabilityState = ensureViewabilityState(ctx, configId);
  const { viewableItems: previousViewableItems, start, end, startBuffered, endBuffered } = viewabilityState;
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
      if (currentIndex !== void 0 && currentIndex >= start && currentIndex <= end && (currentItem !== void 0 || data.kind === "dataSource")) {
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
  for (let i = start; i <= end; i++) {
    const item = data.getItem(i);
    if (item !== void 0 || data.kind === "dataSource") {
      const key = getId(state, i);
      const containerId = findContainerId(ctx, key);
      if (checkIsViewable(
        state,
        ctx,
        layout,
        viewabilityConfig,
        containerId,
        key,
        scrollSize,
        item,
        i,
        publishAmounts
      )) {
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
  var _a3;
  const { scroll: scrollState } = state;
  const topPad = (peek$(ctx, "stylePaddingTop") || 0) + (peek$(ctx, "alignItemsAtEndPadding") || 0) + (peek$(ctx, "headerSize") || 0);
  const { itemVisiblePercentThreshold, viewAreaCoveragePercentThreshold } = viewabilityConfig;
  const viewAreaMode = viewAreaCoveragePercentThreshold != null;
  const viewablePercentThreshold = viewAreaMode ? viewAreaCoveragePercentThreshold : itemVisiblePercentThreshold;
  const startOffset = getViewabilityStartOffset(viewabilityConfig);
  const effectiveScrollSize = Math.max(0, scrollSize - startOffset);
  const scroll = scrollState - topPad + startOffset;
  const position = layout ? layout.getOffset(index) : getLayoutOffset(ctx, index);
  const size = (_a3 = layout ? layout.getSize(index) : getLayoutSize(ctx, index)) != null ? _a3 : 0;
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
  const isViewable = sizeVisible > 0 && percent >= (viewablePercentThreshold != null ? viewablePercentThreshold : 0);
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
var unstableBatchedUpdates = ReactNative__namespace.unstable_batchedUpdates;
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
function findAvailableContainers(ctx, needNewContainers, startBuffered, endBuffered, pendingRemoval, getRequiredItemType, protectedKeys) {
  var _a3;
  const numNeeded = needNewContainers.length;
  if (numNeeded === 0) {
    return [];
  }
  const numContainers = peek$(ctx, "numContainers");
  const state = ctx.state;
  const { containerItemMetadata, stickyContainerPool } = state;
  const shouldAvoidAssignedContainerReuse = state.props.recycleItems && !!state.props.positionComponentInternal;
  const pendingRemovalSet = pendingRemoval.length > 0 ? new Set(pendingRemoval) : void 0;
  const requests = needNewContainers.map((itemIndex, order) => ({
    isSticky: state.props.stickyHeaderIndicesSet.has(itemIndex),
    itemIndex,
    itemType: getRequiredItemType == null ? void 0 : getRequiredItemType(itemIndex),
    order
  }));
  const normalRequests = requests.filter((request) => !request.isSticky);
  const stickyRequests = requests.filter((request) => request.isSticky);
  const normalCandidates = [];
  const stickyCandidates = [];
  for (let containerIndex = 0; containerIndex < numContainers; containerIndex++) {
    const key = peek$(ctx, `containerItemKey${containerIndex}`);
    const isPendingRemoval = !!(pendingRemovalSet == null ? void 0 : pendingRemovalSet.has(containerIndex));
    const isProtected = !!key && !!(protectedKeys == null ? void 0 : protectedKeys.has(key)) && state.indexByKey.has(key);
    if (isProtected) {
      continue;
    }
    if (stickyContainerPool.has(containerIndex)) {
      if (key === void 0 || isPendingRemoval) {
        stickyCandidates.push({ containerIndex, distance: Number.POSITIVE_INFINITY });
      }
    } else if (key === void 0 || isPendingRemoval) {
      normalCandidates.push({ containerIndex, distance: Number.POSITIVE_INFINITY });
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
    if (getRequiredItemType) {
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
    }
  }
  return allocations;
}
function comparatorByDistance(a, b) {
  return b.distance - a.distance;
}

// src/utils/setDidLayout.ts
function setDidLayout(ctx) {
  const state = ctx.state;
  state.queuedInitialLayout = true;
  checkAtBottom(ctx);
  setInitialRenderState(ctx, { didLayout: true });
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
    const stickyPos = layout.getOffset(stickyIndex);
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
      set$(ctx, `containerSticky${containerIndex}`, false);
      continue;
    }
    const isRecentSticky = arrayIdx >= currentStickyIdx - 1 && arrayIdx <= currentStickyIdx + 1;
    if (isRecentSticky) continue;
    const nextIndex = stickyArray[arrayIdx + 1];
    let shouldRecycle = false;
    if (nextIndex) {
      const nextPos = layout.getOffset(nextIndex);
      shouldRecycle = nextPos !== void 0 && scroll > nextPos + drawDistance * 2;
    } else {
      const currentId = (_a3 = state.idCache[itemIndex]) != null ? _a3 : getId(state, itemIndex);
      if (currentId) {
        const currentPos = layout.getOffset(itemIndex);
        const currentSize = (_b = layout.getSize(itemIndex)) != null ? _b : getItemSize(ctx, currentId, itemIndex, getDataItem(state, itemIndex));
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
  if (range.startNoBuffer === null && top + size > scroll) {
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
  return (_b = (_a3 = preferKnownOrFixedSize ? getKnownOrFixedItemSize(ctx, index) : void 0) != null ? _a3 : layout.getSize(index)) != null ? _b : getItemSize(ctx, id, index, getDataItem(state, index));
}
function reconcileLayoutStorePinnedIndices(ctx, options) {
  const hasStickyIndex = options.currentStickyIdx >= 0 && options.stickyHeaderIndices.length > 0;
  if (options.alwaysRenderIndices.length === 0 && !options.hasScrollTargetPinnedRange && !hasStickyIndex) {
    return;
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
}
function materializeLayoutStoreOffsetRange(ctx, startOffset, endOffset) {
  const materialized = materializeFixedLayoutStoreRangeAtOffsets(ctx, startOffset, endOffset);
  if (materialized.didChange) {
    syncLayoutStoreState(ctx);
  }
  let range;
  if (materialized.range) {
    range = materializeLayoutStoreRange(ctx, materialized.range.start, materialized.range.end);
  }
  return range;
}
function clearUnsafeSizeCaches(state) {
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
function findFirstVisibleIndexInCachedRange(ctx, layout, scroll) {
  var _a3;
  const state = ctx.state;
  const { endBuffered, idCache, startBuffered } = state;
  const dataLength = getDataLength(state);
  if (startBuffered === null || endBuffered === null || startBuffered < 0 || endBuffered < startBuffered) {
    return null;
  }
  for (let i = startBuffered; i <= endBuffered && i < dataLength; i++) {
    const id = (_a3 = idCache[i]) != null ? _a3 : getId(state, i);
    const size = getVisibleLoopItemSize(ctx, state, layout, i, id, false);
    const top = layout.getOffset(i);
    if (top !== void 0 && top + size > scroll) {
      return i;
    }
  }
  return null;
}
function updateViewabilityForCachedRange(ctx, layout, viewabilityConfigCallbackPairs, scrollLength, scroll, scrollBottom) {
  var _a3;
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
    const top = layout.getOffset(i);
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
  Object.assign(state, {
    endNoBuffer: visibleRange.endNoBuffer,
    firstFullyOnScreenIndex: visibleRange.firstFullyOnScreenIndex,
    idsInView: getIdsInVisibleRange(state, visibleRange),
    startNoBuffer: visibleRange.startNoBuffer
  });
  maybeEmitFirstVisibleItemChanged(
    state,
    firstVisibleScroll === void 0 ? visibleRange.startNoBuffer : visibleRange.firstVisibleIndex
  );
  if (visibleRange.startNoBuffer !== null && visibleRange.endNoBuffer !== null) {
    updateViewableItems(
      ctx,
      viewabilityConfigCallbackPairs,
      scrollLength,
      visibleRange.startNoBuffer,
      visibleRange.endNoBuffer,
      startBuffered,
      endBuffered,
      layout
    );
  }
}
function calculateItemsInView(ctx, params = {}) {
  const state = ctx.state;
  batchedUpdates(() => {
    var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t;
    const {
      containerItemKeys,
      enableScrollForNextCalculateItemsInView,
      idCache,
      indexByKey,
      minIndexSizeChanged,
      props: { alwaysRenderIndicesArr, alwaysRenderIndicesSet, getItemType, keyExtractor, onStickyHeaderChange },
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
    const { doMVCP, forceFullItemPositions, initialLayout } = params;
    const didDataChange = !!params.dataChanged;
    const isInitialLayout = !!initialLayout;
    const bootstrapInitialScrollState = ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "bootstrap" ? state.initialScrollSession.bootstrap : void 0;
    const suppressInitialScrollSideEffects = !!bootstrapInitialScrollState;
    const prevNumContainers = peek$(ctx, "numContainers");
    if (scrollLength === 0 || !prevNumContainers) {
      return;
    }
    const dataLength = indexedData.getLength();
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
    const isPinnedRenderIndex = (index) => alwaysRenderIndicesSet.has(index) || hasScrollTargetPinnedRange && index >= scrollTargetPinnedStart && index <= scrollTargetPinnedEnd;
    if ((didDataChange || isInitialLayout) && state.isFirst) {
      syncLayoutStoreState(ctx);
    }
    if (syncActiveRowLayoutStoreSpans(ctx)) {
      syncLayoutStoreState(ctx);
    }
    let totalSize = getContentSize(ctx);
    let changedContainerIds;
    const topPad = peek$(ctx, "stylePaddingTop") + peek$(ctx, "alignItemsAtEndPadding") + peek$(ctx, "headerSize");
    const numColumns = peek$(ctx, "numColumns");
    const speed = (_b = params.scrollVelocity) != null ? _b : getScrollVelocity(state);
    const scrollExtra = 0;
    const { initialScroll, queuedInitialLayout } = state;
    const scrollState = suppressInitialScrollSideEffects ? (_c = bootstrapInitialScrollState == null ? void 0 : bootstrapInitialScrollState.scroll) != null ? _c : state.scroll : !queuedInitialLayout && hasActiveInitialScroll(state) && initialScroll ? (
      // Before the initial layout settles, keep viewport math anchored to the
      // current initial-scroll target instead of transient native adjustments.
      resolveInitialScrollOffset(ctx, initialScroll)
    ) : state.scroll;
    let scrollAdjustPending = 0;
    let scrollAdjustPad = 0;
    let scroll = 0;
    let scrollTopBuffered = 0;
    let scrollBottom = 0;
    let scrollBottomBuffered = 0;
    let nativeScrollState = scrollState;
    const updateScroll2 = (nextScrollState) => {
      var _a4;
      nativeScrollState = nextScrollState;
      scrollAdjustPending = (_a4 = peek$(ctx, "scrollAdjustPending")) != null ? _a4 : 0;
      scrollAdjustPad = scrollAdjustPending - topPad;
      scroll = Math.round(nextScrollState + scrollExtra + scrollAdjustPad);
      if (scroll + scrollLength > totalSize) {
        scroll = Math.max(0, totalSize - scrollLength);
      }
    };
    updateScroll2(scrollState);
    let layout = createLayoutAccess(ctx, getActiveLayoutStore(ctx));
    const previousStickyIndex = peek$(ctx, "activeStickyIndex");
    const resolveStickyState = () => {
      const currentStickyIdx = stickyHeaderIndicesArr.length > 0 ? findCurrentStickyIndex(layout, stickyHeaderIndicesArr, scroll) : -1;
      const nextActiveStickyIndex = currentStickyIdx >= 0 ? stickyHeaderIndicesArr[currentStickyIdx] : -1;
      const stickyIndexDidChange = previousStickyIndex !== nextActiveStickyIndex;
      if (currentStickyIdx >= 0 || previousStickyIndex >= 0) {
        set$(ctx, "activeStickyIndex", nextActiveStickyIndex);
      }
      const shouldNotifyStickyHeaderChange = !!onStickyHeaderChange && stickyHeaderIndicesArr.length > 0 && stickyIndexDidChange;
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
    let stickyState = didDataChange ? void 0 : resolveStickyState();
    let scrollBufferTop = drawDistance;
    let scrollBufferBottom = drawDistance;
    if (speed > 0 || speed === 0 && scroll < Math.max(50, drawDistance)) {
      scrollBufferTop = drawDistance * 0.5;
      scrollBufferBottom = drawDistance * 1.5;
    } else {
      scrollBufferTop = drawDistance * 1.5;
      scrollBufferBottom = drawDistance * 0.5;
    }
    const shouldProjectRenderRange = !didDataChange && !forceFullItemPositions && !suppressInitialScrollSideEffects && !hasActiveInitialScroll(state) && !state.scrollingTo && !state.pendingNativeMVCPAdjust && !!peek$(ctx, "readyToRender");
    const projectedBufferAdjustment = shouldProjectRenderRange ? getProjectedBufferAdjustment(speed, Math.min(scrollBufferTop, scrollBufferBottom)) : 0;
    const updateScrollRange = () => {
      const scrollStart = Math.max(0, scroll);
      const overscrollBeforeContent = Math.max(0, -nativeScrollState);
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
    if (enableScrollForNextCalculateItemsInView && !suppressInitialScrollSideEffects && !didDataChange && !forceFullItemPositions && scrollForNextCalculateItemsInView) {
      const { top, bottom } = scrollForNextCalculateItemsInView;
      if (top === null && bottom === null) {
        state.scrollForNextCalculateItemsInView = void 0;
      } else if ((top === null || scrollTopBuffered > top) && (bottom === null || scrollBottomBuffered < bottom)) {
        if (Platform.OS !== "web" || !isInMVCPActiveMode(state)) {
          if (viewabilityConfigCallbackPairs) {
            updateViewabilityForCachedRange(
              ctx,
              layout,
              viewabilityConfigCallbackPairs,
              scrollLength,
              scroll,
              scrollBottom
            );
          } else if (state.props.onFirstVisibleItemChanged) {
            maybeEmitFirstVisibleItemChanged(
              state,
              firstVisibleScroll === null ? null : findFirstVisibleIndexInCachedRange(ctx, layout, firstVisibleScroll != null ? firstVisibleScroll : scroll)
            );
          }
          (_d = stickyState == null ? void 0 : stickyState.finishCalculateItemsInView) == null ? void 0 : _d.call(stickyState);
          return;
        }
      }
    }
    const checkMVCP = doMVCP && !suppressInitialScrollSideEffects ? prepareMVCP(ctx, didDataChange) : void 0;
    const hasActiveLayoutStore = !!getActiveLayoutStore(ctx);
    const didApplyDataSourceMutation = !!state.dataSourceMutationApplied && !state.dataSourceNeedsReset;
    const shouldReconcileLayoutStoreDataChange = !forceFullItemPositions && didDataChange && !state.isFirst && hasActiveLayoutStore && !state.dataSourceNeedsReset && !didApplyDataSourceMutation && state.props.hasReliableKeyExtractor;
    const previousIdCache = shouldReconcileLayoutStoreDataChange ? getSparseIdCacheSnapshot(state) : void 0;
    if (didDataChange && !didApplyDataSourceMutation) {
      resetLayoutCachesForDataChange(state, {
        includeLayoutStoreMeasurements: !shouldReconcileLayoutStoreDataChange
      });
    }
    if (didApplyDataSourceMutation) {
      layout = createLayoutAccess(ctx, getActiveLayoutStore(ctx));
    }
    const shouldMaterializeLayoutStoreRange = hasActiveLayoutStore && (!didDataChange || didApplyDataSourceMutation);
    let layoutStoreMaterializedRange = shouldMaterializeLayoutStoreRange ? materializeLayoutStoreOffsetRange(ctx, scrollTopBuffered, scrollBottomBuffered) : void 0;
    let didReconcileLayoutStoreDataChange = false;
    if (!layoutStoreMaterializedRange && shouldReconcileLayoutStoreDataChange) {
      didReconcileLayoutStoreDataChange = reconcileLayoutStoreDataChange(ctx, {
        didKeyExtractorChange: state.dataChangeKeyExtractorChanged,
        previousIdCache
      });
      if (didReconcileLayoutStoreDataChange) {
        layout = createLayoutAccess(ctx, getActiveLayoutStore(ctx));
        layoutStoreMaterializedRange = materializeLayoutStoreOffsetRange(
          ctx,
          scrollTopBuffered,
          scrollBottomBuffered
        );
      }
    }
    if (!layoutStoreMaterializedRange && didDataChange && hasActiveLayoutStore && !didApplyDataSourceMutation) {
      const didFailReliableReconcile = shouldReconcileLayoutStoreDataChange && !didReconcileLayoutStoreDataChange;
      if (didFailReliableReconcile || !state.props.hasReliableKeyExtractor) {
        clearUnsafeSizeCaches(state);
      }
      resetLayoutCachesForDataChange(state);
      rebuildLayoutStoreExact(ctx);
      layout = createLayoutAccess(ctx, getActiveLayoutStore(ctx));
      layoutStoreMaterializedRange = materializeLayoutStoreOffsetRange(
        ctx,
        scrollTopBuffered,
        scrollBottomBuffered
      );
    }
    syncLayoutStoreState(ctx);
    totalSize = getContentSize(ctx);
    if (minIndexSizeChanged !== void 0) {
      state.minIndexSizeChanged = void 0;
    }
    let protectedContainerKeys;
    if (didDataChange && doMVCP && state.props.maintainVisibleContentPosition.data && state.didContainersLayout && state.idsInView.length > 0) {
      const shouldRestorePosition = state.props.maintainVisibleContentPosition.shouldRestorePosition;
      protectedContainerKeys = /* @__PURE__ */ new Set();
      for (const id of state.idsInView) {
        const index = indexByKey.get(id);
        if (index === void 0) continue;
        if (shouldRestorePosition && !shouldRestorePosition(indexedData.getItem(index), index, legacyData != null ? legacyData : []))
          continue;
        protectedContainerKeys.add(id);
      }
    }
    const scrollBeforeMVCP = state.scroll;
    const scrollAdjustPendingBeforeMVCP = (_e = peek$(ctx, "scrollAdjustPending")) != null ? _e : 0;
    checkMVCP == null ? void 0 : checkMVCP();
    const didMVCPAdjustScroll = !!checkMVCP && (state.scroll !== scrollBeforeMVCP || ((_f = peek$(ctx, "scrollAdjustPending")) != null ? _f : 0) !== scrollAdjustPendingBeforeMVCP);
    if (didMVCPAdjustScroll) {
      updateScroll2(state.scroll);
      updateScrollRange();
      firstVisibleScroll = firstVisibleItemStartOffset >= scrollLength ? null : firstVisibleItemStartOffset > 0 ? scroll + firstVisibleItemStartOffset : void 0;
    }
    if (didDataChange) {
      stickyState = resolveStickyState();
    }
    let startBuffered = null;
    let startBufferedId = null;
    let endBuffered = null;
    let loopStart = (_h = (_g = layoutStoreMaterializedRange == null ? void 0 : layoutStoreMaterializedRange.start) != null ? _g : suppressInitialScrollSideEffects ? bootstrapInitialScrollState == null ? void 0 : bootstrapInitialScrollState.targetIndexSeed : void 0) != null ? _h : !didDataChange && startBufferedIdOrig ? indexByKey.get(startBufferedIdOrig) || 0 : 0;
    for (let i = loopStart; i >= 0; i--) {
      const id = (_i = idCache[i]) != null ? _i : getId(state, i);
      const top = layout.getOffset(i);
      if (top === void 0) {
        break;
      }
      const size = getVisibleLoopItemSize(
        ctx,
        state,
        layout,
        i,
        id,
        isInitialLayout && hasActiveInitialScroll(state)
      );
      const bottom = top + size;
      if (bottom > scrollTopBuffered) {
        loopStart = i;
      } else {
        break;
      }
    }
    if (numColumns > 1) {
      while (loopStart > 0) {
        const loopColumn = layout.getColumn(loopStart);
        if (loopColumn === 1 || loopColumn === void 0) {
          break;
        }
        loopStart -= 1;
      }
    }
    let foundEnd = false;
    let nextTop;
    let nextBottom;
    let maxIndexRendered = 0;
    for (let i = 0; i < prevNumContainers; i++) {
      const key = peek$(ctx, `containerItemKey${i}`);
      if (key !== void 0) {
        const index = indexByKey.get(key);
        if (index !== void 0) {
          maxIndexRendered = Math.max(maxIndexRendered, index);
        }
      }
    }
    const visibleRange = {
      endNoBuffer: null,
      firstFullyOnScreenIndex: void 0,
      firstVisibleIndex: null,
      startNoBuffer: null
    };
    for (let i = Math.max(0, loopStart); i < dataLength && (!foundEnd || i <= maxIndexRendered); i++) {
      const id = (_j = idCache[i]) != null ? _j : getId(state, i);
      const top = layout.getOffset(i);
      if (top === void 0 && layoutStoreMaterializedRange) {
        break;
      }
      if (top === void 0) {
        continue;
      }
      const size = getVisibleLoopItemSize(
        ctx,
        state,
        layout,
        i,
        id,
        isInitialLayout && hasActiveInitialScroll(state)
      );
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
        if (visibleRange.startNoBuffer !== null) {
          if (top <= scrollBottomBuffered) {
            endBuffered = i;
            if (scrollBottomBuffered > totalSize) {
              nextBottom = null;
            } else {
              nextBottom = top + size;
            }
          } else {
            foundEnd = true;
          }
        }
      }
    }
    Object.assign(state, {
      endBuffered,
      endNoBuffer: visibleRange.endNoBuffer,
      firstFullyOnScreenIndex: visibleRange.firstFullyOnScreenIndex,
      idsInView: getIdsInVisibleRange(state, visibleRange),
      startBuffered,
      startBufferedId,
      startNoBuffer: visibleRange.startNoBuffer
    });
    if (enableScrollForNextCalculateItemsInView && nextTop !== void 0 && nextBottom !== void 0) {
      state.scrollForNextCalculateItemsInView = isNullOrUndefined(nextTop) && isNullOrUndefined(nextBottom) ? void 0 : {
        bottom: nextBottom,
        top: nextTop
      };
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
    if (layoutStoreMaterializedRange) {
      reconcileLayoutStorePinnedIndices(ctx, {
        alwaysRenderIndices: alwaysRenderIndicesArr,
        currentStickyIdx: (_k = stickyState == null ? void 0 : stickyState.currentStickyIdx) != null ? _k : -1,
        dataLength,
        hasScrollTargetPinnedRange,
        scrollTargetPinnedEnd,
        scrollTargetPinnedStart,
        stickyHeaderIndices: stickyHeaderIndicesArr
      });
    }
    if (startBuffered !== null && endBuffered !== null) {
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
      for (let i = startBuffered; i <= endBuffered; i++) {
        const id = (_l = idCache[i]) != null ? _l : getId(state, i);
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
      if (stickyHeaderIndicesArr.length > 0) {
        handleStickyActivation(
          ctx,
          stickyHeaderIndicesArr,
          (_m = stickyState == null ? void 0 : stickyState.currentStickyIdx) != null ? _m : -1,
          needNewContainers,
          needNewContainersSet,
          startBuffered,
          endBuffered
        );
      } else if (previousStickyIndex !== -1) {
        set$(ctx, "activeStickyIndex", -1);
      }
      if (needNewContainers.length > 0) {
        const getRequiredItemType = getItemType ? (i) => {
          const item = indexedData.getItem(i);
          const itemType = item !== void 0 ? getItemType(item, i) : void 0;
          return itemType !== void 0 ? String(itemType) : "";
        } : void 0;
        const availableContainerAllocations = findAvailableContainers(
          ctx,
          needNewContainers,
          startBuffered,
          endBuffered,
          pendingRemoval,
          getRequiredItemType,
          protectedContainerKeys
        );
        for (const allocation of availableContainerAllocations) {
          const i = allocation.itemIndex;
          const containerIndex = allocation.containerIndex;
          const id = (_n = idCache[i]) != null ? _n : getId(state, i);
          const oldKey = peek$(ctx, `containerItemKey${containerIndex}`);
          if (oldKey && oldKey !== id) {
            containerItemKeys.delete(oldKey);
          }
          if (oldKey !== id) {
            changedContainerIds != null ? changedContainerIds : changedContainerIds = /* @__PURE__ */ new Set();
            changedContainerIds.add(containerIndex);
            state.containerItemGenerations[containerIndex] = ((_o = state.containerItemGenerations[containerIndex]) != null ? _o : 0) + 1;
          }
          const item = indexedData.getItem(i);
          indexByKey.set(id, i);
          state.containerItemMetadata.set(
            containerIndex,
            createContainerItemMetadata(state, i, item, allocation.itemType)
          );
          set$(ctx, `containerItemKey${containerIndex}`, id);
          set$(ctx, `containerItemIndex${containerIndex}`, i);
          set$(ctx, `containerItemData${containerIndex}`, item);
          containerItemKeys.set(id, containerIndex);
          (_p = state.userScrollAnchorReset) == null ? void 0 : _p.keys.add(id);
          const containerSticky = `containerSticky${containerIndex}`;
          const isSticky = stickyHeaderIndicesSet.has(i);
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
      }
    }
    if (state.stickyContainerPool.size > 0) {
      handleStickyRecycling(
        ctx,
        layout,
        stickyHeaderIndicesArr,
        scroll,
        drawDistance,
        (_r = stickyState == null ? void 0 : stickyState.currentStickyIdx) != null ? _r : -1,
        pendingRemoval,
        isPinnedRenderIndex
      );
    }
    const pendingRemovalSet = pendingRemoval.length > 0 ? new Set(pendingRemoval) : void 0;
    let didChangePositions = false;
    for (let i = 0; i < numContainers; i++) {
      const itemKey = peek$(ctx, `containerItemKey${i}`);
      if (pendingRemovalSet == null ? void 0 : pendingRemovalSet.has(i)) {
        if (itemKey !== void 0) {
          containerItemKeys.delete(itemKey);
          changedContainerIds != null ? changedContainerIds : changedContainerIds = /* @__PURE__ */ new Set();
          changedContainerIds.add(i);
          state.containerItemGenerations[i] = ((_s = state.containerItemGenerations[i]) != null ? _s : 0) + 1;
        }
        state.containerItemMetadata.delete(i);
        if (state.stickyContainerPool.has(i)) {
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
          didChangePositions = syncMountedContainer(ctx, i, itemIndex, {
            layout,
            scrollAdjustPending,
            updateLayout: true
          }).didChangePosition || didChangePositions;
        }
      }
    }
    if (changedContainerIds && (IsNewArchitecture || Platform.OS === "web")) {
      scheduleContainerLayout(ctx, changedContainerIds);
    }
    if (Platform.OS === "web" && didChangePositions) {
      set$(ctx, "lastPositionUpdate", Date.now());
    }
    if (suppressInitialScrollSideEffects) {
      evaluateBootstrapInitialScroll(ctx);
      return;
    }
    maybeEmitFirstVisibleItemChanged(
      state,
      firstVisibleScroll === void 0 ? visibleRange.startNoBuffer : visibleRange.firstVisibleIndex
    );
    if (!queuedInitialLayout && !state.didContainersLayout) {
      const isInitialLayoutReady = hasActiveInitialScroll(state) ? checkAllSizesKnown(state, state.startBuffered, state.endBuffered) : checkAllSizesKnown(state, state.startNoBuffer, state.endNoBuffer) || checkAllSizesKnown(state, state.startBuffered, state.endBuffered);
      if (isInitialLayoutReady) {
        setDidLayout(ctx);
        handleInitialScrollLayoutReady(ctx);
      }
    }
    if (viewabilityConfigCallbackPairs && visibleRange.startNoBuffer !== null && visibleRange.endNoBuffer !== null) {
      updateViewableItems(
        ctx,
        viewabilityConfigCallbackPairs,
        scrollLength,
        visibleRange.startNoBuffer,
        visibleRange.endNoBuffer,
        startBuffered != null ? startBuffered : visibleRange.startNoBuffer,
        endBuffered != null ? endBuffered : visibleRange.endNoBuffer,
        layout
      );
    }
    (_t = stickyState == null ? void 0 : stickyState.finishCalculateItemsInView) == null ? void 0 : _t.call(stickyState);
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
      nextSize = hasUnknownTailSize ? previousSize || 0 : Math.max(0, state.scrollLength - contentBelowAnchor - anchorOffset);
    } else if (anchorIndex >= 0) {
      isReady = false;
    }
  }
  const didSizeChange = previousSize !== nextSize && (previousSize !== void 0 || anchoredEndSpace !== void 0);
  const didEffectiveSizeChange = (previousSize || 0) !== nextSize;
  const didReadyAnchorChange = previousReadyAnchorIndex !== nextAnchorIndex || previousReadyAnchorKey !== nextAnchorKey;
  if (isReady && (didSizeChange || didReadyAnchorChange)) {
    state.anchoredEndSpaceReadyAnchorIndex = nextAnchorIndex;
    state.anchoredEndSpaceReadyAnchorKey = nextAnchorKey;
    if (didSizeChange) {
      set$(ctx, "anchoredEndSpaceSize", nextSize);
      (_a3 = anchoredEndSpace == null ? void 0 : anchoredEndSpace.onSizeChanged) == null ? void 0 : _a3.call(anchoredEndSpace, nextSize);
    }
    if (didEffectiveSizeChange) {
      updateContentMetricsState(ctx);
      updateScroll(ctx, state.scroll, true, { markHasScrolled: false });
    }
    (_b = anchoredEndSpace == null ? void 0 : anchoredEndSpace.onReady) == null ? void 0 : _b.call(anchoredEndSpace, { anchorIndex: nextAnchorIndex, anchorKey: nextAnchorKey, size: nextSize });
  }
  return nextSize;
}
var PixelRatio = ReactNative.PixelRatio;

// src/utils/layoutMeasurement.ts
var FLOATING_POINT_SLACK = 0.01;
var NATIVE_LAYOUT_MEASUREMENT_EPSILON = 1 / PixelRatio.get() + FLOATING_POINT_SLACK;
function isWithinEpsilon(delta) {
  return Math.abs(delta) <= NATIVE_LAYOUT_MEASUREMENT_EPSILON;
}
function isNativeLayoutNoise(delta) {
  return isWithinEpsilon(delta);
}

// src/core/updateItemSizes.ts
function runOrScheduleMVCPRecalculate(ctx) {
  var _a3;
  const state = ctx.state;
  if (state.userScrollAnchorReset !== void 0) {
    calculateItemsInView(ctx);
    if (((_a3 = state.userScrollAnchorReset) == null ? void 0 : _a3.keys.size) === 0) {
      state.userScrollAnchorReset = void 0;
    }
  } else if (Platform.OS === "web") {
    if (!state.mvcpAnchorLock) {
      state.scheduledWork.cancel("mvcpRecalculate");
      calculateItemsInView(ctx, { doMVCP: true });
    } else if (!state.scheduledWork.has("mvcpRecalculate")) {
      state.scheduledWork.frame(() => calculateItemsInView(ctx, { doMVCP: true }), "mvcpRecalculate");
    }
  } else {
    calculateItemsInView(ctx, { doMVCP: true });
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
  var _a3;
  (_a3 = result.applyMVCPAdjustment) != null ? _a3 : result.applyMVCPAdjustment = next.applyMVCPAdjustment;
  result.didChange || (result.didChange = next.didChange);
  result.didMeasureUserScrollAnchorResetItem || (result.didMeasureUserScrollAnchorResetItem = next.didMeasureUserScrollAnchorResetItem);
  result.needsRecalculate || (result.needsRecalculate = next.needsRecalculate);
  result.shouldMaintainScrollAtEnd || (result.shouldMaintainScrollAtEnd = next.shouldMaintainScrollAtEnd);
}
function flushItemSizeUpdates(ctx, result) {
  var _a3, _b;
  const state = ctx.state;
  if (result.didChange) {
    (_a3 = result.applyMVCPAdjustment) == null ? void 0 : _a3.call(result);
  }
  if (result.needsRecalculate) {
    state.scrollForNextCalculateItemsInView = void 0;
    runOrScheduleMVCPRecalculate(ctx);
  } else if (result.didMeasureUserScrollAnchorResetItem && ((_b = state.userScrollAnchorReset) == null ? void 0 : _b.keys.size) === 0) {
    state.userScrollAnchorReset = void 0;
  }
  if (result.didChange) {
    maybeUpdateAnchoredEndSpace(ctx);
  }
  if (result.didChange && result.shouldMaintainScrollAtEnd) {
    doMaintainScrollAtEnd(ctx);
  }
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
function updateItemSizesBatch(ctx, measurements) {
  var _a3;
  const state = ctx.state;
  const result = {};
  for (const measurement of measurements) {
    const ownsMeasuredItem = measurement.containerId === void 0 || peek$(ctx, `containerItemKey${measurement.containerId}`) === measurement.itemKey;
    if (ownsMeasuredItem) {
      const index = state.indexByKey.get(measurement.itemKey);
      const itemData = index === void 0 ? void 0 : (_a3 = state.props.data) == null ? void 0 : _a3[index];
      const metadata = measurement.containerId !== void 0 && index !== void 0 && itemData !== void 0 ? resolveContainerItemMetadata(state, measurement.containerId, index, itemData) : void 0;
      const nextResult = applyItemSize(ctx, measurement.itemKey, measurement.size, metadata);
      mergeItemSizeUpdateResult(result, nextResult);
    }
  }
  flushItemSizeUpdates(ctx, result);
}
function applyItemSize(ctx, itemKey, sizeObj, resolvedMeasurementItem) {
  var _a3, _b;
  const state = ctx.state;
  const userScrollAnchorReset = state.userScrollAnchorReset;
  const didMeasureUserScrollAnchorResetItem = !!(userScrollAnchorReset == null ? void 0 : userScrollAnchorReset.keys.delete(itemKey));
  const {
    didContainersLayout,
    sizesKnown,
    props: { getFixedItemSize, getItemType, horizontal, onItemSizeChanged, maintainScrollAtEnd }
  } = state;
  if (!state.props.dataSource && !state.props.data) return { didMeasureUserScrollAnchorResetItem };
  const index = state.indexByKey.get(itemKey);
  if (getFixedItemSize) {
    if (index === void 0) {
      return { didMeasureUserScrollAnchorResetItem };
    }
    const itemData = getDataItem(state, index);
    if (itemData === void 0) {
      return { didMeasureUserScrollAnchorResetItem };
    }
    if (!(resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.didResolveFixedItemSize)) {
      const type = (_b = resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.itemType) != null ? _b : getItemType ? (_a3 = getItemType(itemData, index)) != null ? _a3 : "" : "";
      resolvedMeasurementItem = {
        didResolveFixedItemSize: true,
        fixedItemSize: getFixedItemSize(itemData, index, type),
        itemType: type
      };
    }
    const size2 = resolvedMeasurementItem.fixedItemSize;
    if (size2 !== void 0 && size2 === sizesKnown.get(itemKey)) {
      updateOtherAxisSizeIfNeeded(ctx, sizeObj, horizontal);
      return { didMeasureUserScrollAnchorResetItem };
    }
  }
  let needsRecalculate = !didContainersLayout;
  let shouldMaintainScrollAtEnd = false;
  let minIndexSizeChanged;
  const prevSizeKnown = state.sizesKnown.get(itemKey);
  const applyMVCPAdjustment = state.props.maintainVisibleContentPosition.size ? prepareMVCP(ctx) : void 0;
  const diff = updateOneItemSize(ctx, itemKey, sizeObj, resolvedMeasurementItem);
  const size = roundSize(horizontal ? sizeObj.width : sizeObj.height);
  if (diff !== 0) {
    minIndexSizeChanged = minIndexSizeChanged !== void 0 ? Math.min(minIndexSizeChanged, index) : index;
    const { startBuffered, endBuffered } = state;
    needsRecalculate || (needsRecalculate = index >= startBuffered && index <= endBuffered);
    if (!needsRecalculate && state.containerItemKeys.has(itemKey)) {
      needsRecalculate = true;
    }
    if (prevSizeKnown === void 0 || Math.abs(prevSizeKnown - size) > 5) {
      shouldMaintainScrollAtEnd = true;
    }
    onItemSizeChanged == null ? void 0 : onItemSizeChanged({
      index,
      itemData: getDataItem(state, index),
      itemKey,
      previous: size - diff,
      size
    });
  }
  if (minIndexSizeChanged !== void 0) {
    state.minIndexSizeChanged = state.minIndexSizeChanged !== void 0 ? Math.min(state.minIndexSizeChanged, minIndexSizeChanged) : minIndexSizeChanged;
  }
  updateOtherAxisSizeIfNeeded(ctx, sizeObj, horizontal);
  if (didContainersLayout || checkAllSizesKnown(state, state.startBuffered, state.endBuffered)) {
    const canMaintainScrollAtEnd = shouldMaintainScrollAtEnd && !!(maintainScrollAtEnd == null ? void 0 : maintainScrollAtEnd.onItemLayout);
    return {
      applyMVCPAdjustment: diff !== 0 ? applyMVCPAdjustment : void 0,
      didChange: diff !== 0,
      didMeasureUserScrollAnchorResetItem,
      needsRecalculate,
      shouldMaintainScrollAtEnd: canMaintainScrollAtEnd
    };
  }
  return {
    applyMVCPAdjustment: diff !== 0 ? applyMVCPAdjustment : void 0,
    didChange: diff !== 0,
    didMeasureUserScrollAnchorResetItem
  };
}
function updateOneItemSize(ctx, itemKey, sizeObj, resolvedMeasurementItem) {
  var _a3, _b, _c;
  const state = ctx.state;
  const {
    indexByKey,
    sizesKnown,
    averageSizes,
    props: { horizontal, getItemType, getFixedItemSize }
  } = state;
  if (!state.props.dataSource && !state.props.data) return 0;
  const index = indexByKey.get(itemKey);
  const layoutStore = getActiveLayoutStore(ctx);
  if (layoutStore && !layoutStore.hasIndex(index)) {
    return 0;
  }
  const itemIndex = index;
  const itemData = (_a3 = resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.itemData) != null ? _a3 : getDataItem(state, itemIndex);
  let itemType = resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.itemType;
  let fixedItemSize = resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.fixedItemSize;
  if (getFixedItemSize && !(resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.didResolveFixedItemSize)) {
    itemType = getItemType ? (_b = getItemType(itemData, itemIndex)) != null ? _b : "" : "";
    fixedItemSize = getFixedItemSize(itemData, itemIndex, itemType);
  }
  const resolvedItemSize = (resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.didResolveFixedItemSize) || itemType !== void 0 || fixedItemSize !== void 0 ? {
    didResolveFixedItemSize: resolvedMeasurementItem == null ? void 0 : resolvedMeasurementItem.didResolveFixedItemSize,
    fixedItemSize,
    itemType
  } : void 0;
  const prevSize = layoutStore && index !== void 0 ? layoutStore.getSize(index) : getItemSize(ctx, itemKey, itemIndex, itemData, void 0, void 0, void 0, resolvedItemSize);
  const rawSize = horizontal ? sizeObj.width : sizeObj.height;
  const prevSizeKnown = sizesKnown.get(itemKey);
  if (Platform.OS !== "web" && prevSizeKnown !== void 0 && isNativeLayoutNoise(rawSize - prevSizeKnown)) {
    return 0;
  }
  const size = Platform.OS === "web" ? Math.round(rawSize) : roundSize(rawSize);
  sizesKnown.set(itemKey, size);
  if (fixedItemSize === void 0 && size > 0) {
    itemType != null ? itemType : itemType = getItemType ? (_c = getItemType(itemData, itemIndex)) != null ? _c : "" : "";
    let averages = averageSizes[itemType];
    if (!averages) {
      averages = averageSizes[itemType] = { avg: 0, num: 0 };
    }
    if (averages.num === 0) {
      averages.avg = size;
      averages.num++;
    } else if (prevSizeKnown !== void 0 && prevSizeKnown > 0) {
      averages.avg += (size - prevSizeKnown) / averages.num;
    } else {
      averages.avg = (averages.avg * averages.num + size) / (averages.num + 1);
      averages.num++;
    }
  }
  const didSizeChange = !prevSize || Math.abs(prevSize - size) > 0.1;
  const didSetPrefixLayoutStoreSize = setLayoutStoreMeasuredSize(ctx, index, size);
  if (didSizeChange || didSetPrefixLayoutStoreSize) {
    if (!didSetPrefixLayoutStoreSize) {
      setSize(ctx, itemKey, size);
    }
    return didSizeChange ? size - prevSize : 0;
  }
  return 0;
}

// src/core/measureContainersInLayoutEffect.native.ts
function resolveFixedItemSize(ctx, containerId, itemKey) {
  var _a3;
  const state = ctx.state;
  const { data, getFixedItemSize } = state.props;
  const index = state.indexByKey.get(itemKey);
  let fixedItemSize;
  if (data && getFixedItemSize && index !== void 0) {
    const itemData = data[index];
    if (itemData !== void 0) {
      fixedItemSize = (_a3 = resolveContainerItemMetadata(state, containerId, index, itemData)) == null ? void 0 : _a3.fixedItemSize;
    }
  }
  return fixedItemSize;
}
function resolveSkippedAnchorReset(ctx, itemKey) {
  const state = ctx.state;
  const anchorReset = state.userScrollAnchorReset;
  if ((anchorReset == null ? void 0 : anchorReset.keys.delete(itemKey)) && anchorReset.keys.size === 0) {
    state.userScrollAnchorReset = void 0;
  }
}
function measureContainersInLayoutEffect(ctx, targetContainerIds = null) {
  var _a3, _b, _c;
  const state = ctx.state;
  const measurements = [];
  let isCollectingSynchronousMeasurements = true;
  const containerIds = targetContainerIds != null ? targetContainerIds : ctx.viewRefs.keys();
  for (const containerId of containerIds) {
    const viewRef = ctx.viewRefs.get(containerId);
    const itemKey = peek$(ctx, `containerItemKey${containerId}`);
    if (itemKey !== void 0) {
      const generation = ((_a3 = state.containerItemGenerations[containerId]) != null ? _a3 : 0) + 1;
      state.containerItemGenerations[containerId] = generation;
      const fixedItemSize = resolveFixedItemSize(ctx, containerId, itemKey);
      const canSkipMeasurement = !state.needsOtherAxisSize && fixedItemSize !== void 0 && state.sizesKnown.get(itemKey) === fixedItemSize + ctx.scrollAxisGap;
      if (canSkipMeasurement) {
        resolveSkippedAnchorReset(ctx, itemKey);
      } else if (viewRef) {
        (_c = (_b = viewRef.current) == null ? void 0 : _b.measure) == null ? void 0 : _c.call(_b, (_x, _y, width, height) => {
          var _a4;
          const isCurrentGeneration = ((_a4 = ctx.state.containerItemGenerations[containerId]) != null ? _a4 : 0) === generation;
          if (isCurrentGeneration) {
            const measurement = {
              containerId,
              itemKey,
              size: { height, width }
            };
            if (isCollectingSynchronousMeasurements) {
              measurements.push(measurement);
            } else {
              updateItemSizes(ctx, measurement);
            }
          }
        });
      }
    }
  }
  isCollectingSynchronousMeasurements = false;
  if (measurements.length > 0) {
    updateItemSizesBatch(ctx, measurements);
  }
}
var typedForwardRef = React2__namespace.forwardRef;
var typedMemo = React2__namespace.memo;

// src/components/ContainerLayoutCoordinator.tsx
var ContainerLayoutCoordinator = typedMemo(function ContainerLayoutCoordinatorComponent({
  children
}) {
  const ctx = useStateContext();
  const [containerLayoutEpoch] = useArr$(["containerLayoutEpoch"]);
  React2__namespace.useLayoutEffect(() => {
    if (IsNewArchitecture) {
      const targetContainerIds = getContainerLayoutEffectScope(ctx);
      if (targetContainerIds !== void 0) {
        measureContainersInLayoutEffect(ctx, targetContainerIds);
      }
    }
  }, [ctx, containerLayoutEpoch]);
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
  const nextStickyPosition = getLayoutOffset(ctx, nextStickyIndex);
  if (nextStickyPosition === void 0) {
    return void 0;
  }
  return nextStickyPosition - currentSize;
}
var useAnimatedValue = (initialValue) => {
  const [animAnimatedValue] = React2.useState(() => new ReactNative.Animated.Value(initialValue));
  return animAnimatedValue;
};

// src/hooks/useValue$.ts
function useValue$(key, params) {
  const { getValue } = params || {};
  const ctx = useStateContext();
  const getNewValue = () => {
    var _a3;
    return (_a3 = getValue ? getValue(peek$(ctx, key)) : peek$(ctx, key)) != null ? _a3 : 0;
  };
  const animValue = useAnimatedValue(getNewValue());
  React2.useLayoutEffect(() => {
    const syncCurrentValue = () => {
      animValue.setValue(getNewValue());
    };
    const unsubscribe = listen$(ctx, key, syncCurrentValue);
    syncCurrentValue();
    return unsubscribe;
  }, [animValue, ctx, key]);
  return animValue;
}
var getComponent = (Component) => {
  if (React2__namespace.isValidElement(Component)) {
    return Component;
  }
  if (Component) {
    return /* @__PURE__ */ React2__namespace.createElement(Component, null);
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
  const [position = POSITION_OUT_OF_VIEW, _itemKey] = useArr$([`containerPosition${id}`, `containerItemKey${id}`]);
  return /* @__PURE__ */ React2__namespace.createElement(ReactNative.View, { ref: refView, style: [style, horizontal ? { left: position } : { top: position }], ...rest });
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
  return /* @__PURE__ */ React2__namespace.createElement(ReactNative.Animated.View, { ref: refView, style: [style, position], ...rest });
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
  const ctx = useStateContext();
  const [
    position = POSITION_OUT_OF_VIEW,
    alignItemsAtEndPadding = 0,
    headerSize = 0,
    stylePaddingTop = 0,
    itemKey,
    itemIndex,
    _totalSize = 0
  ] = useArr$([
    `containerPosition${id}`,
    "alignItemsAtEndPadding",
    "headerSize",
    "stylePaddingTop",
    `containerItemKey${id}`,
    `containerItemIndex${id}`,
    "totalSize"
  ]);
  const pushLimit = React2__namespace.useMemo(
    () => getStickyPushLimit(ctx, itemIndex, itemKey),
    [ctx, itemIndex, itemKey, _totalSize]
  );
  const transform = React2__namespace.useMemo(() => {
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
  const viewStyle = React2__namespace.useMemo(
    () => [style, { zIndex: itemIndex + 1e3 }, { transform }],
    [style, itemIndex, transform]
  );
  const renderStickyHeaderBackdrop = React2__namespace.useMemo(() => {
    if (!(stickyHeaderConfig == null ? void 0 : stickyHeaderConfig.backdropComponent)) {
      return null;
    }
    return /* @__PURE__ */ React2__namespace.createElement(
      ReactNative.View,
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
  return /* @__PURE__ */ React2__namespace.createElement(ReactNative.Animated.View, { ref: refView, style: viewStyle, ...rest }, renderStickyHeaderBackdrop, children);
});
var PositionView = IsNewArchitecture ? PositionViewState : PositionViewAnimated;
function useInit(cb) {
  React2.useState(() => cb());
}

// src/state/ContextContainer.ts
var ContextContainer = React2.createContext(null);
var NO_CONTAINER_ID = -1;
function useContextContainer() {
  return React2.useContext(ContextContainer);
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
function useAdaptiveRender() {
  const [mode] = useArr$(["adaptiveRender"]);
  return mode;
}
function useAdaptiveRenderChange(callback) {
  const ctx = useStateContext();
  const callbackRef = React2.useRef(callback);
  callbackRef.current = callback;
  React2.useLayoutEffect(() => {
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
  useInit(() => {
    if (!containerContext) {
      return;
    }
    const { containerId } = containerContext;
    const key = containerId + (configId != null ? configId : "");
    const value = ctx.mapViewabilityValues.get(key);
    if (value) {
      callback(value);
    }
  });
  React2.useEffect(() => {
    if (!containerContext) {
      return;
    }
    const { containerId } = containerContext;
    const key = containerId + (configId != null ? configId : "");
    const hadConsumers = hasViewabilityConsumers(ctx);
    ctx.mapViewabilityCallbacks.set(key, callback);
    if (!hadConsumers) {
      requestViewabilityRecalculation(ctx);
    }
    return () => {
      ctx.mapViewabilityCallbacks.delete(key);
    };
  }, [ctx, callback, configId, containerContext]);
}
function useViewabilityAmount(callback) {
  const ctx = useStateContext();
  const containerContext = useContextContainer();
  useInit(() => {
    if (!containerContext) {
      return;
    }
    const { containerId } = containerContext;
    const value = ctx.mapViewabilityAmountValues.get(containerId);
    if (value) {
      callback(value);
    }
  });
  React2.useEffect(() => {
    if (!containerContext) {
      return;
    }
    const { containerId } = containerContext;
    const hadConsumers = hasViewabilityConsumers(ctx);
    ctx.mapViewabilityAmountCallbacks.set(containerId, callback);
    if (!hadConsumers) {
      requestViewabilityRecalculation(ctx);
    }
    return () => {
      ctx.mapViewabilityAmountCallbacks.delete(containerId);
    };
  }, [ctx, callback, containerContext]);
}
function useRecyclingEffect(effect) {
  const containerContext = useContextContainer();
  const { hasItemInfo, item, itemIndex, itemKey } = useContainerItemSignals(containerContext);
  const prevInfo = React2.useRef(void 0);
  React2.useEffect(() => {
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
  const [stateValue, setStateValue] = React2.useState(() => {
    return computeValue();
  });
  const prevItemKeyRef = React2.useRef(hasItemInfo ? itemKey : null);
  if (hasItemInfo && prevItemKeyRef.current !== itemKey) {
    prevItemKeyRef.current = itemKey;
    setStateValue(computeValue());
  }
  const triggerLayout = containerContext == null ? void 0 : containerContext.triggerLayout;
  const setState = React2.useCallback(
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
  return isLastItem ? null : /* @__PURE__ */ React2__namespace.createElement(ItemSeparatorComponent, { leadingItem });
}
function useOnLayoutSync({
  ref,
  measureInLayoutEffect = true,
  onLayoutProp,
  onLayoutChange
}, deps = []) {
  const onLayout = React2.useCallback(
    (event) => {
      const { layout } = event.nativeEvent;
      onLayoutChange(layout, false);
      onLayoutProp == null ? void 0 : onLayoutProp(event);
    },
    [onLayoutChange, onLayoutProp]
  );
  if (IsNewArchitecture) {
    React2.useLayoutEffect(() => {
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
  var _a3, _b;
  const listState = ctx.state;
  const currentItemKey = state.itemKey;
  state.didLayout = true;
  let layout = rectangle;
  const axis = state.horizontal ? "width" : "height";
  const size = roundSize(rectangle[axis]);
  const localPreviousSize = state.lastSize ? roundSize(state.lastSize[axis]) : void 0;
  const coreKnownSize = listState.sizesKnown.get(currentItemKey);
  const previousSize = Platform.OS === "web" ? coreKnownSize : localPreviousSize;
  const applyLayout = () => {
    state.lastSize = layout;
    updateItemSizes(ctx, {
      containerId,
      itemKey: currentItemKey,
      size: layout
    });
  };
  const shouldDeferWebShrinkLayoutUpdate = Platform.OS === "web" && !isInMVCPActiveMode(listState) && previousSize !== void 0 && size + 1 < previousSize;
  if (shouldDeferWebShrinkLayoutUpdate) {
    scheduleWebShrinkMeasurement(state, () => {
      var _a4;
      if (state.itemKey === currentItemKey) {
        const element = ref.current;
        const rect = (_a4 = element == null ? void 0 : element.getBoundingClientRect) == null ? void 0 : _a4.call(element);
        if (rect) {
          layout = { height: rect.height, width: rect.width };
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
      (_b = (_a3 = ref.current) == null ? void 0 : _a3.measure) == null ? void 0 : _b.call(_a3, (_x, _y, width, height) => {
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
}) {
  const stateRef = React2.useRef({
    didLayout: false,
    horizontal,
    itemKey
  });
  stateRef.current.horizontal = horizontal;
  stateRef.current.itemKey = itemKey;
  const [layoutRenderCount, forceLayoutRender] = React2.useState(0);
  const onLayoutChange = React2.useCallback(
    (rectangle) => {
      processContainerLayout({ containerId, ctx, rectangle, ref, state: stateRef.current });
    },
    [containerId, ctx, ref]
  );
  const triggerLayout = React2.useCallback(() => {
    if (IsNewArchitecture) {
      scheduleContainerLayout(ctx, containerId);
    } else {
      forceLayoutRender((value) => value + 1);
    }
  }, [containerId, ctx]);
  React2.useLayoutEffect(() => {
    ctx.containerLayoutTriggers.set(containerId, triggerLayout);
    return () => {
      cancelWebShrinkMeasurement(stateRef.current);
      if (ctx.containerLayoutTriggers.get(containerId) === triggerLayout) {
        ctx.containerLayoutTriggers.delete(containerId);
      }
    };
  }, [containerId, ctx, triggerLayout]);
  React2.useLayoutEffect(() => {
    if (IsNewArchitecture) {
      scheduleContainerLayout(ctx, containerId);
    }
  });
  const { onLayout } = useOnLayoutSync(
    {
      measureInLayoutEffect: !IsNewArchitecture,
      onLayoutChange,
      ref},
    [itemKey, layoutRenderCount]
  );
  React2.useEffect(() => {
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
  const ctx = useStateContext();
  const { columnWrapperStyle, animatedScrollY } = ctx;
  const isHorizontalRTLList = isHorizontalRTL(ctx.state);
  const positionComponentInternal = ctx.state.props.positionComponentInternal;
  const stickyPositionComponentInternal = ctx.state.props.stickyPositionComponentInternal;
  const [column = 0, span = 1, data, dataVersion, numColumns = 1, extraData, isSticky] = useArr$([
    `containerColumn${id}`,
    `containerSpan${id}`,
    `containerItemData${id}`,
    `containerDataVersion${id}`,
    "numColumns",
    "extraData",
    `containerSticky${id}`
  ]);
  const ref = React2.useRef(null);
  const { onLayout, triggerLayout } = useContainerMeasurement({
    containerId: id,
    ctx,
    horizontal,
    itemKey,
    ref
  });
  const resolvedColumn = column > 0 ? column : 1;
  const resolvedSpan = Math.min(Math.max(span || 1, 1), numColumns);
  const otherAxisPos = numColumns > 1 ? `${(resolvedColumn - 1) / numColumns * 100}%` : 0;
  const otherAxisSize = numColumns > 1 ? `${resolvedSpan / numColumns * 100}%` : void 0;
  const style = React2.useMemo(
    () => getContainerPositionStyle({
      columnWrapperStyle,
      contentContainerAlignItems: ctx.state.props.contentContainerAlignItems,
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
      ctx.state.props.contentContainerAlignItems,
      numColumns,
      ItemSeparatorComponent
    ]
  );
  const renderedItemInfo = React2.useMemo(
    () => itemKey !== void 0 ? getRenderedItem2(itemKey, id) : null,
    [itemKey, data, dataVersion, extraData]
  );
  const { renderedItem } = renderedItemInfo || {};
  const contextValue = React2.useMemo(() => {
    ctx.viewRefs.set(id, ref);
    return {
      containerId: id,
      triggerLayout
    };
  }, [id, triggerLayout]);
  const PositionComponent = isSticky ? stickyPositionComponentInternal ? stickyPositionComponentInternal : PositionViewSticky : positionComponentInternal ? positionComponentInternal : PositionView;
  return /* @__PURE__ */ React2__namespace.createElement(
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
    /* @__PURE__ */ React2__namespace.createElement(ContextContainer.Provider, { value: contextValue }, renderedItem, renderedItemInfo && ItemSeparatorComponent && /* @__PURE__ */ React2__namespace.createElement(Separator, { ItemSeparatorComponent, leadingItem: renderedItemInfo.item }))
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
  return /* @__PURE__ */ React2__namespace.createElement(
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
  return /* @__PURE__ */ React2__namespace.createElement(ContainerSlotBase, { ...props });
});
function useFreshDataTransitionVisibility(readyToRender, transitionEpoch) {
  const [completedTransitionEpoch, setCompletedTransitionEpoch] = React2.useState(transitionEpoch);
  const isTransitionPending = completedTransitionEpoch !== transitionEpoch;
  React2.useLayoutEffect(() => {
    setCompletedTransitionEpoch(transitionEpoch);
  }, [transitionEpoch]);
  return readyToRender && !isTransitionPending;
}

// src/components/Containers.native.tsx
var ContainersLayer = typedMemo(function ContainersLayer2({
  children,
  freshDataTransitionEpoch,
  horizontal
}) {
  const ctx = useStateContext();
  const columnWrapperStyle = ctx.columnWrapperStyle;
  const animSize = useValue$("totalSize");
  const [readyToRender, numColumns, otherAxisSize = 0] = useArr$(["readyToRender", "numColumns", "otherAxisSize"]);
  const isVisible = useFreshDataTransitionVisibility(!!readyToRender, freshDataTransitionEpoch);
  const style = horizontal ? {
    height: otherAxisSize || "100%",
    minHeight: otherAxisSize,
    opacity: isVisible ? 1 : 0,
    width: animSize
  } : { height: animSize, minWidth: otherAxisSize, opacity: isVisible ? 1 : 0 };
  if (columnWrapperStyle) {
    const { columnGap, rowGap, gap } = columnWrapperStyle;
    const gapX = columnGap || gap || 0;
    const gapY = rowGap || gap || 0;
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
  return /* @__PURE__ */ React2__namespace.createElement(ReactNative.Animated.View, { pointerEvents: isVisible ? void 0 : "none", style }, /* @__PURE__ */ React2__namespace.createElement(ContainerLayoutCoordinator, null, children));
});
var Containers = typedMemo(function Containers2({
  freshDataTransitionEpoch,
  horizontal,
  recycleItems,
  ItemSeparatorComponent,
  stickyHeaderConfig,
  getRenderedItem: getRenderedItem2
}) {
  const [numContainersPooled] = useArr$(["numContainersPooled"]);
  const containers = [];
  for (let i = 0; i < numContainersPooled; i++) {
    containers.push(
      /* @__PURE__ */ React2__namespace.createElement(
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
  return /* @__PURE__ */ React2__namespace.createElement(ContainersLayer, { freshDataTransitionEpoch, horizontal }, containers);
});
var ListComponentScrollView = ReactNative.Animated.ScrollView;

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
function ScrollAdjust() {
  var _a3;
  const ctx = useStateContext();
  const bias = 1e7;
  const [scrollAdjust, scrollAdjustUserOffset] = useArr$(["scrollAdjust", "scrollAdjustUserOffset"]);
  const scrollOffset = (scrollAdjust || 0) + (scrollAdjustUserOffset || 0) + bias;
  const horizontal = !!((_a3 = ctx.state) == null ? void 0 : _a3.props.horizontal);
  return /* @__PURE__ */ React2__namespace.createElement(
    ReactNative.View,
    {
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
var SnapWrapper = React2__namespace.forwardRef(function SnapWrapperInner({ ScrollComponent, ...props }, ref) {
  const [snapToOffsets] = useArr$(["snapToOffsets"]);
  return /* @__PURE__ */ React2__namespace.createElement(ScrollComponent, { ...props, ref, snapToOffsets });
});

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
      requestAdjust(ctx, size - previousHeaderSize);
    }
  }
  state.didMeasureHeader = true;
}
function setFooterSize(ctx, size) {
  const didChange = setContentLengthSignal(ctx, "footerSize", size);
  if (didChange) {
    maybeUpdateAnchoredEndSpace(ctx);
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
    updateContentMetricsState(ctx);
  }
  return didChange;
}
function useLatestRef(value) {
  const ref = React2__namespace.useRef(value);
  ref.current = value;
  return ref;
}

// src/hooks/useStableRenderComponent.tsx
function useStableRenderComponent(renderComponent, mapProps) {
  const renderComponentRef = useLatestRef(renderComponent);
  const mapPropsRef = useLatestRef(mapProps);
  return React2__namespace.useMemo(
    () => React2__namespace.forwardRef(
      (props, ref) => {
        var _a3, _b;
        return (_b = (_a3 = renderComponentRef.current) == null ? void 0 : _a3.call(renderComponentRef, mapPropsRef.current(props, ref))) != null ? _b : null;
      }
    ),
    [mapPropsRef, renderComponentRef]
  );
}
var LayoutView = ({ onLayoutChange, refView, ...rest }) => {
  const localRef = React2.useRef(null);
  const ref = refView != null ? refView : localRef;
  const { onLayout } = useOnLayoutSync({ onLayoutChange, ref });
  return /* @__PURE__ */ React2__namespace.createElement(ReactNative.View, { ...rest, onLayout, ref });
};
var StyleSheet = ReactNative.StyleSheet;

// src/components/ListComponent.tsx
var AlignItemsAtEndSpacer = typedMemo(function AlignItemsAtEndSpacer2({ horizontal }) {
  const [alignItemsAtEndPadding = 0] = useArr$(["alignItemsAtEndPadding"]);
  if (alignItemsAtEndPadding <= 0) {
    return null;
  }
  return /* @__PURE__ */ React2__namespace.createElement(
    View,
    {
      style: horizontal ? { flexShrink: 0, width: alignItemsAtEndPadding } : { flexShrink: 0, height: alignItemsAtEndPadding }
    },
    null
  );
});
var ListComponent = typedMemo(function ListComponent2({
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
  onInternalScrollEnd,
  scrollAdjustHandler,
  snapToIndices,
  stickyHeaderConfig,
  stickyHeaderIndices,
  useWindowScroll = false,
  ...rest
}) {
  const ctx = useStateContext();
  const maintainVisibleContentPosition = ctx.state.props.maintainVisibleContentPosition;
  const [anchoredEndSpaceSize = 0, otherAxisSize = 0] = useArr$(["anchoredEndSpaceSize", "otherAxisSize"]);
  const shouldRenderAlignItemsAtEndSpacer = ctx.state.props.alignItemsAtEndPaddingEnabled;
  const shouldMaterializeAnchoredEndSpace = !!ctx.state.props.anchoredEndSpace && ctx.state.props.anchoredEndSpaceOwner === "list" && anchoredEndSpaceSize > 0;
  let anchoredEndSpaceStyle;
  if (shouldMaterializeAnchoredEndSpace) {
    const paddingEnd = horizontal ? isHorizontalRTL(ctx.state) ? "Left" : "Right" : "Bottom";
    const flattenedContentContainerStyle = StyleSheet.flatten(contentContainerStyle);
    anchoredEndSpaceStyle = {
      [`padding${paddingEnd}`]: extractPadding({}, flattenedContentContainerStyle || {}, paddingEnd) + anchoredEndSpaceSize
    };
  }
  const autoOtherAxisStyle = getAutoOtherAxisStyle({
    horizontal,
    needsOtherAxisSize: ctx.state.needsOtherAxisSize,
    otherAxisSize
  });
  const CustomScrollComponent = useStableRenderComponent(
    renderScrollComponent,
    (props, ref) => ({ ...props, ref })
  );
  const ScrollComponent = renderScrollComponent ? CustomScrollComponent : ListComponentScrollView;
  const SnapOrScroll = snapToIndices ? SnapWrapper : ScrollComponent;
  const updateFooterSize = React2.useCallback(
    (size, afterSizeUpdate) => {
      var _a3;
      const didFooterSizeChange = setFooterSize(ctx, size);
      afterSizeUpdate == null ? void 0 : afterSizeUpdate();
      if (didFooterSizeChange && ((_a3 = ctx.state.props.maintainScrollAtEnd) == null ? void 0 : _a3.onFooterLayout)) {
        doMaintainScrollAtEnd(ctx);
      }
    },
    [ctx]
  );
  React2.useLayoutEffect(() => {
    if (!ListHeaderComponent) {
      setHeaderSize(ctx, 0);
    }
    if (!ListFooterComponent) {
      updateFooterSize(0);
    }
  }, [ListHeaderComponent, ListFooterComponent, ctx, updateFooterSize]);
  const onLayoutHeader = React2.useCallback(
    (rect) => {
      const size = rect[horizontal ? "width" : "height"];
      setHeaderSize(ctx, size);
    },
    [ctx, horizontal]
  );
  const onLayoutFooterInternal = React2.useCallback(
    (rect, fromLayoutEffect) => {
      const size = rect[horizontal ? "width" : "height"];
      updateFooterSize(size, () => {
        onLayoutFooter == null ? void 0 : onLayoutFooter(rect, fromLayoutEffect);
      });
    },
    [horizontal, onLayoutFooter, updateFooterSize]
  );
  return /* @__PURE__ */ React2__namespace.createElement(
    SnapOrScroll,
    {
      ...rest,
      ...Platform.OS === "web" ? ScrollComponent === ListComponentScrollView ? { onInternalScrollEnd, useWindowScroll } : {} : { onScrollBeginDrag: onInternalScrollBeginDrag },
      contentContainerStyle: [
        horizontal ? { height: "100%" } : {},
        contentContainerStyle,
        anchoredEndSpaceStyle,
        Platform.OS === "web" ? { boxSizing: "border-box" } : void 0
      ],
      contentOffset: initialContentOffset !== void 0 ? horizontal ? { x: initialContentOffset, y: 0 } : { x: 0, y: initialContentOffset } : void 0,
      horizontal,
      maintainVisibleContentPosition: maintainVisibleContentPosition.size || maintainVisibleContentPosition.data ? { minIndexForVisible: 0 } : void 0,
      onLayout,
      onScroll: onScroll2,
      ref: refScrollView,
      ScrollComponent: snapToIndices ? ScrollComponent : void 0,
      style: autoOtherAxisStyle ? [autoOtherAxisStyle, style] : style
    },
    /* @__PURE__ */ React2__namespace.createElement(ScrollAdjust, null),
    ListHeaderComponent && /* @__PURE__ */ React2__namespace.createElement(LayoutView, { onLayoutChange: onLayoutHeader, style: ListHeaderComponentStyle }, getComponent(ListHeaderComponent)),
    ListEmptyComponent && getComponent(ListEmptyComponent),
    shouldRenderAlignItemsAtEndSpacer && /* @__PURE__ */ React2__namespace.createElement(AlignItemsAtEndSpacer, { horizontal }),
    canRender && !ListEmptyComponent && /* @__PURE__ */ React2__namespace.createElement(
      Containers,
      {
        freshDataTransitionEpoch,
        getRenderedItem: getRenderedItem2,
        horizontal,
        ItemSeparatorComponent,
        recycleItems,
        stickyHeaderConfig
      }
    ),
    ListFooterComponent && /* @__PURE__ */ React2__namespace.createElement(LayoutView, { onLayoutChange: onLayoutFooterInternal, style: ListFooterComponentStyle }, getComponent(ListFooterComponent)),
    IS_DEV && ENABLE_DEVMODE
  );
});
var WEB_UNBOUNDED_HEIGHT_MIN_DATA_LENGTH = 100;
var WEB_UNBOUNDED_HEIGHT_CONTAINER_RATIO = 0.9;
var WEB_UNBOUNDED_HEIGHT_VIEWPORT_RATIO = 0.9;
function useDevChecksImpl(props) {
  const ctx = useStateContext();
  const { anchoredEndSpace, childrenMode, keyExtractor, numColumns, renderScrollComponent, useWindowScroll } = props;
  const hasAnchoredEndSpace = !!anchoredEndSpace;
  React2.useEffect(() => {
    if (hasAnchoredEndSpace && (numColumns != null ? numColumns : 1) > 1) {
      warnDevOnce(
        "anchoredEndSpaceNumColumns",
        "anchoredEndSpace is only supported when numColumns is 1. Using it with multiple columns may produce incorrect anchored spacing."
      );
    }
  }, [hasAnchoredEndSpace, numColumns]);
  React2.useEffect(() => {
    if (useWindowScroll && renderScrollComponent) {
      warnDevOnce(
        "useWindowScrollRenderScrollComponent",
        "useWindowScroll is not supported when renderScrollComponent is provided."
      );
    }
  }, [renderScrollComponent, useWindowScroll]);
  React2.useEffect(() => {
    if (!keyExtractor && !ctx.state.isFirst && ctx.state.didDataChange && !childrenMode) {
      warnDevOnce(
        "keyExtractor",
        "Changing data without a keyExtractor can cause slow performance and resetting scroll. If your list data can change you should use a keyExtractor with a unique id for best performance and behavior."
      );
    }
  }, [childrenMode, ctx, keyExtractor]);
  React2.useEffect(() => {
    const state = ctx.state;
    const dataLength = getDataLength(state);
    const useWindowScrollResolved = state.props.useWindowScroll;
    if (Platform.OS !== "web" || useWindowScrollResolved || dataLength < WEB_UNBOUNDED_HEIGHT_MIN_DATA_LENGTH) {
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
function useDevChecksNoop(_props) {
}
var useDevChecks = IS_DEV ? useDevChecksImpl : useDevChecksNoop;

// src/core/checkResetContainers.ts
function checkResetContainers(ctx, dataProp, { didColumnsChange = false, previousDataLength } = {}) {
  var _a3;
  const state = ctx.state;
  const { previousData } = state;
  const { maintainScrollAtEnd } = state.props;
  if (didColumnsChange) {
    state.sizes.clear();
    state.sizesKnown.clear();
    invalidateContainerFixedItemSizes(state);
    for (const key in state.averageSizes) {
      delete state.averageSizes[key];
    }
    clearLayoutStoreKnownSizes(ctx);
    state.minIndexSizeChanged = 0;
    state.scrollForNextCalculateItemsInView = void 0;
  }
  calculateItemsInView(ctx, { dataChanged: true, doMVCP: true });
  const shouldMaintainScrollAtEnd = !didColumnsChange && (maintainScrollAtEnd == null ? void 0 : maintainScrollAtEnd.onDataChange);
  const didMaintainScrollAtEnd = shouldMaintainScrollAtEnd && doMaintainScrollAtEnd(ctx);
  const previousLength = (_a3 = previousData == null ? void 0 : previousData.length) != null ? _a3 : previousDataLength;
  const currentLength = state.props.dataSource ? getDataLength(state) : dataProp.length;
  if (!didMaintainScrollAtEnd && previousLength !== void 0 && currentLength > previousLength) {
    state.isEndReached = false;
  }
  if (!didMaintainScrollAtEnd) {
    checkThresholds(ctx);
  }
  delete state.previousData;
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
function snapshotAnchorPositions(ctx) {
  var _a3, _b, _c;
  const state = ctx.state;
  const anchorKeys = new Set(state.idsInView);
  if (((_a3 = state.scrollingTo) == null ? void 0 : _a3.index) !== void 0) {
    const scrollTargetKey = (_c = state.idCache[state.scrollingTo.index]) != null ? _c : (_b = Array.from(state.indexByKey).find((entry) => {
      var _a4;
      return entry[1] === ((_a4 = state.scrollingTo) == null ? void 0 : _a4.index);
    })) == null ? void 0 : _b[0];
    if (scrollTargetKey !== void 0) {
      anchorKeys.add(scrollTargetKey);
    }
  }
  const positions = /* @__PURE__ */ new Map();
  for (const key of anchorKeys) {
    const index = state.indexByKey.get(key);
    const offset = getLayoutOffset(ctx, index);
    if (offset !== void 0) {
      positions.set(key, offset);
    }
  }
  return positions;
}
function applyOperationToEntries(entries, operation, invalidatedKeys, rerenderKeys, removedKeys) {
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
function transformRange(range, operations, length) {
  let nextRange;
  if (range && length > 0) {
    const first = Math.min(length - 1, Math.max(0, transformDataSourceIndex(range.start, operations)));
    const second = Math.min(length - 1, Math.max(0, transformDataSourceIndex(range.end, operations)));
    nextRange = {
      end: Math.min(length - 1, Math.max(first, second)),
      start: Math.max(0, Math.min(first, second))
    };
  }
  return nextRange;
}
function updateViewabilityState(ctx, source, nextIndexByKey, operations) {
  var _a3, _b, _c, _d, _e;
  const sourceLength = source.getLength();
  const transformViewabilityIndex = (index) => index < 0 || sourceLength === 0 ? -1 : Math.min(sourceLength - 1, Math.max(0, transformDataSourceIndex(index, operations)));
  for (const [configId, viewabilityState] of ctx.mapViewabilityConfigStates) {
    const changed = [];
    const viewableItems = [];
    for (const token of viewabilityState.viewableItems) {
      const index = nextIndexByKey.get(token.key);
      if (index === void 0) {
        const removedToken = { ...token, isViewable: false };
        changed.push(removedToken);
        const callbackKey = token.containerId + configId;
        ctx.mapViewabilityValues.set(callbackKey, removedToken);
        (_a3 = ctx.mapViewabilityCallbacks.get(callbackKey)) == null ? void 0 : _a3(removedToken);
      } else {
        const item = source.getItem(index);
        const nextToken = { ...token, index, item };
        viewableItems.push(nextToken);
        if (index !== token.index || item !== token.item) {
          const callbackKey = token.containerId + configId;
          ctx.mapViewabilityValues.set(callbackKey, nextToken);
          (_b = ctx.mapViewabilityCallbacks.get(callbackKey)) == null ? void 0 : _b(nextToken);
        }
      }
    }
    if (changed.length > 0) {
      const pair = (_c = ctx.state.viewabilityConfigCallbackPairs) == null ? void 0 : _c.find(
        (candidate) => candidate.viewabilityConfig.id === configId
      );
      (_d = pair == null ? void 0 : pair.onViewableItemsChanged) == null ? void 0 : _d.call(pair, {
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
      (_e = ctx.mapViewabilityAmountCallbacks.get(containerId)) == null ? void 0 : _e(removedToken);
    } else if (index !== token.index || source.getItem(index) !== token.item) {
      ctx.mapViewabilityAmountValues.delete(containerId);
    }
  }
}
function applyDataSourceMutationBatches(ctx, source, batches) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
  const state = ctx.state;
  const operations = batches.flatMap((batch) => batch.operations);
  const explicitReset = operations.some((operation) => operation.type === "reset");
  if (explicitReset) {
    return { applied: false, materializedCount: 0, resetReason: "the data source requested a reset" };
  }
  let entries = collectMaterializedEntries(ctx);
  const anchorPositions = snapshotAnchorPositions(ctx);
  const invalidatedKeys = /* @__PURE__ */ new Set();
  const removedKeys = /* @__PURE__ */ new Set();
  const rerenderKeys = /* @__PURE__ */ new Set();
  for (const operation of operations) {
    entries = applyOperationToEntries(entries, operation, invalidatedKeys, rerenderKeys, removedKeys);
  }
  let resetReason;
  const nextIndexByKey = /* @__PURE__ */ new Map();
  try {
    for (const entry of entries.values()) {
      const finalKey = source.getKey(entry.index);
      if (finalKey !== entry.key) {
        resetReason = `materialized key ${entry.key} changed at index ${entry.index}`;
        break;
      }
      if (nextIndexByKey.has(entry.key)) {
        resetReason = `materialized key ${entry.key} is duplicated`;
        break;
      }
      nextIndexByKey.set(entry.key, entry.index);
    }
  } catch (error) {
    resetReason = `reading a materialized key failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (resetReason) {
    return { applied: false, materializedCount: entries.size, resetReason };
  }
  const layoutStore = (_a3 = state.layoutStoreRuntime) == null ? void 0 : _a3.store;
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
  if (state.props.overrideItemLayout && state.props.numColumns > 1) {
    let spanInvalidationIndex = state.dataSourceSpanInvalidationIndex;
    for (const operation of operations) {
      let operationIndex;
      if (operation.type === "splice") {
        operationIndex = operation.index;
      } else if (operation.type === "move") {
        operationIndex = Math.min(operation.from, operation.to);
      } else if (operation.type === "update" && operation.layout === "invalidate") {
        operationIndex = operation.index;
      }
      if (operationIndex !== void 0) {
        spanInvalidationIndex = Math.min(spanInvalidationIndex != null ? spanInvalidationIndex : operationIndex, operationIndex);
      }
    }
    state.dataSourceSpanInvalidationIndex = spanInvalidationIndex;
    (_b = state.layoutStoreRuntime) == null ? void 0 : _b.transformCachedRowSpans(operations);
  }
  (_c = state.dataSourceAnchorPositions) != null ? _c : state.dataSourceAnchorPositions = anchorPositions;
  state.idCache.length = 0;
  state.indexByKey.clear();
  for (const entry of entries.values()) {
    state.idCache[entry.index] = entry.key;
    state.indexByKey.set(entry.key, entry.index);
  }
  for (const key of removedKeys) {
    state.sizes.delete(key);
    state.sizesKnown.delete(key);
    state.containerItemKeys.delete(key);
    (_d = state.pendingLayoutEffectMeasurements) == null ? void 0 : _d.delete(key);
    (_e = state.userScrollAnchorReset) == null ? void 0 : _e.keys.delete(key);
    (_g = (_f = state.layoutStoreRuntime) == null ? void 0 : _f.positionListenerOffsets) == null ? void 0 : _g.delete(key);
    notifyPosition$(ctx, key, void 0);
  }
  for (const key of invalidatedKeys) {
    state.sizes.delete(key);
    state.sizesKnown.delete(key);
  }
  for (const key of rerenderKeys) {
    const containerId = state.containerItemKeys.get(key);
    const index = nextIndexByKey.get(key);
    if (containerId !== void 0 && index !== void 0) {
      set$(ctx, `containerItemData${containerId}`, source.getItem(index));
      const versionKey = `containerDataVersion${containerId}`;
      set$(ctx, versionKey, ((_h = peek$(ctx, versionKey)) != null ? _h : 0) + 1);
    }
  }
  updateViewabilityState(ctx, source, nextIndexByKey, operations);
  state.idsInView = state.idsInView.filter((key) => nextIndexByKey.has(key));
  if (state.lastFirstVisibleItemCallback) {
    const index = nextIndexByKey.get(state.lastFirstVisibleItemCallback.key);
    state.lastFirstVisibleItemCallback = index === void 0 ? void 0 : { ...state.lastFirstVisibleItemCallback, index };
  }
  const finalLength = (_j = (_i = batches.at(-1)) == null ? void 0 : _i.length) != null ? _j : source.getLength();
  const transformClampedIndex = (index) => finalLength > 0 ? Math.min(finalLength - 1, Math.max(0, transformDataSourceIndex(index, operations))) : 0;
  const activeStickyIndex = peek$(ctx, "activeStickyIndex");
  if (activeStickyIndex >= 0) {
    set$(ctx, "activeStickyIndex", finalLength > 0 ? transformClampedIndex(activeStickyIndex) : -1);
  }
  state.scrollTargetPinnedRange = transformRange(state.scrollTargetPinnedRange, operations, finalLength);
  if (((_k = state.scrollingTo) == null ? void 0 : _k.index) !== void 0) {
    state.scrollingTo.index = transformClampedIndex(state.scrollingTo.index);
  }
  if (((_l = state.initialScroll) == null ? void 0 : _l.index) !== void 0) {
    state.initialScroll.index = transformClampedIndex(state.initialScroll.index);
  }
  const bootstrap = ((_m = state.initialScrollSession) == null ? void 0 : _m.kind) === "bootstrap" ? state.initialScrollSession.bootstrap : void 0;
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
  return { applied: true, materializedCount: entries.size };
}

// src/core/DataSourceObserver.ts
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}
function validateOperation(operation, length) {
  let nextLength = length;
  let reason;
  if (operation.type === "splice") {
    if (!isNonNegativeInteger(operation.index) || !isNonNegativeInteger(operation.deleteCount) || !isNonNegativeInteger(operation.insertCount) || operation.index > length || operation.index + operation.deleteCount > length) {
      reason = "splice range is invalid";
    } else {
      nextLength = length - operation.deleteCount + operation.insertCount;
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
  return { nextLength, reason };
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
    const resetOperations = batch.operations.filter((operation) => operation.type === "reset");
    if (resetOperations.length > 0) {
      if (batch.operations.length !== 1) {
        reason = "reset must be the only operation in a batch";
      } else {
        nextLength = batch.length;
      }
    } else {
      for (const operation of batch.operations) {
        const result = validateOperation(operation, nextLength);
        nextLength = result.nextLength;
        if (result.reason) {
          reason = result.reason;
          break;
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
        if (item !== void 0) {
          totalSize += (_a3 = getFixedItemLayoutSize(ctx, i, item)) != null ? _a3 : estimatedItemSize + ctx.scrollAxisGap;
        }
      }
      averageItemSize = totalSize / num;
    } else {
      averageItemSize = estimatedItemSize + ctx.scrollAxisGap;
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
    if (!IsNewArchitecture || state.lastLayout) {
      if (state.initialScroll) {
        requestAnimationFrame(() => {
          calculateItemsInView(ctx, { initialLayout: true });
        });
      } else {
        calculateItemsInView(ctx, { initialLayout: true });
      }
    }
    return true;
  }
}
function getWindowSize() {
  const screenSize = ReactNative.Dimensions.get("window");
  return {
    height: screenSize.height,
    width: screenSize.width
  };
}

// src/core/handleLayout.ts
function handleLayout(ctx, layoutParam, setCanRender) {
  const state = ctx.state;
  const { maintainScrollAtEnd, useWindowScroll } = state.props;
  const scrollAxis = state.props.horizontal ? "width" : "height";
  const otherAxis = state.props.horizontal ? "height" : "width";
  let layout = layoutParam;
  if (useWindowScroll) {
    const windowScrollAxisLength = getWindowSize()[scrollAxis];
    layout = windowScrollAxisLength > 0 ? { ...layoutParam, [scrollAxis]: windowScrollAxisLength } : layoutParam;
  }
  const measuredLength = layout[scrollAxis];
  const previousLength = state.scrollLength;
  const scrollLength = measuredLength > 0 ? measuredLength : previousLength;
  const otherAxisSize = layout[otherAxis];
  const needsCalculate = !state.lastLayout || scrollLength > state.scrollLength || state.lastLayout.x !== layout.x || state.lastLayout.y !== layout.y;
  state.lastLayout = layout;
  const prevOtherAxisSize = state.otherAxisSize;
  const didChange = scrollLength !== state.scrollLength || otherAxisSize !== prevOtherAxisSize;
  if (didChange) {
    state.scrollLength = scrollLength;
    state.otherAxisSize = otherAxisSize;
    updateContentMetricsState(ctx);
    state.lastBatchingAction = Date.now();
    state.scrollForNextCalculateItemsInView = void 0;
    if (scrollLength > 0) {
      doInitialAllocateContainers(ctx);
    }
    if (needsCalculate) {
      calculateItemsInView(ctx, { doMVCP: true });
    }
    if (didChange || otherAxisSize !== prevOtherAxisSize) {
      set$(ctx, "scrollSize", { height: layout.height, width: layout.width });
    }
    if (maintainScrollAtEnd == null ? void 0 : maintainScrollAtEnd.onLayout) {
      doMaintainScrollAtEnd(ctx);
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
    initialScrollWatchdog.set(state, {
      startScroll: initialNativeScrollWatchdog.startScroll,
      targetOffset: initialNativeScrollWatchdog.targetOffset
    });
  }
}
function shouldDeferPublicOnScroll(state) {
  var _a3;
  return Platform.OS === "web" && !!state.initialScroll && ((_a3 = state.initialScrollSession) == null ? void 0 : _a3.kind) === "bootstrap" && !state.didFinishInitialScroll;
}
function cloneScrollEvent(event) {
  return {
    ...event,
    nativeEvent: {
      ...event.nativeEvent
    }
  };
}
function onScroll(ctx, event) {
  var _a3, _b, _c, _d, _e, _f;
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
    }
  }
  let newScroll = event.nativeEvent.contentOffset[state.props.horizontal ? "x" : "y"];
  if (state.props.horizontal) {
    newScroll = toLogicalHorizontalOffset(state, newScroll, (_e = event.nativeEvent.contentSize) == null ? void 0 : _e.width);
  }
  const isFinishedEndInitialScroll = state.didFinishInitialScroll && ((_f = state.initialScroll) == null ? void 0 : _f.viewPosition) === 1 && state.scroll > state.scrollLength;
  const shouldIgnoreNegativeInsetChange = Platform.OS !== "web" && insetChanged && newScroll < 0 && isFinishedEndInitialScroll;
  if (shouldIgnoreNegativeInsetChange) {
    return;
  }
  state.lastNativeScroll = newScroll;
  state.lastNativeScrollTime = Date.now();
  if (state.scrollingTo && state.scrollingTo.offset >= newScroll) {
    const maxOffset = clampScrollOffset(ctx, newScroll, state.scrollingTo);
    if (newScroll !== maxOffset && Math.abs(newScroll - maxOffset) > 1) {
      newScroll = maxOffset;
      scrollTo(ctx, {
        forceScroll: true,
        isInitialScroll: true,
        noScrollingTo: true,
        offset: newScroll
      });
      return;
    }
  }
  state.scrollPending = newScroll;
  updateScroll(ctx, newScroll, insetChanged, { fromNativeScrollEvent: true });
  trackInitialScrollNativeProgress(state, newScroll);
  clearFinishedBootstrapInitialScrollTargetIfMovedAway(ctx);
  if (state.scrollingTo) {
    checkFinishedScroll(ctx);
  }
  if (state.props.onScroll) {
    if (shouldDeferPublicOnScroll(state)) {
      state.deferredPublicOnScrollEvent = cloneScrollEvent(event);
    } else {
      state.props.onScroll(event);
    }
  }
}

// src/core/ScheduledWork.ts
var ScheduledWork = class {
  constructor() {
    this.work = /* @__PURE__ */ new Map();
  }
  timeout(callback, delay, key) {
    if (key) {
      this.cancel(key);
    }
    const work = [void 0, clearTimeout];
    const handle = setTimeout(() => {
      const workKey = key != null ? key : handle;
      if (this.work.get(workKey) === work) {
        this.work.delete(workKey);
        callback();
      }
    }, delay);
    work[0] = handle;
    this.work.set(key != null ? key : handle, work);
  }
  frame(callback, key) {
    this.cancel(key);
    const work = [void 0, cancelAnimationFrame];
    this.work.set(key, work);
    work[0] = requestAnimationFrame(() => {
      if (this.work.get(key) === work) {
        this.work.delete(key);
        callback();
      }
    });
  }
  register(key, cancel) {
    this.cancel(key);
    this.work.set(key, [void 0, cancel]);
  }
  cancel(key) {
    const work = this.work.get(key);
    if (work) {
      this.work.delete(key);
      const [handle, cancel] = work;
      cancel(handle);
    }
  }
  has(key) {
    return this.work.has(key);
  }
  dispose() {
    for (const [handle, cancel] of this.work.values()) {
      cancel(handle);
    }
    this.work.clear();
  }
};

// src/core/ScrollAdjustHandler.ts
function doesPlatformAdjustBreakScroll() {
  return PlatformAdjustBreaksScroll || Platform.OS === "macos";
}
var ScrollAdjustHandler = class {
  constructor(ctx) {
    this.appliedAdjust = 0;
    this.pendingAdjust = 0;
    this.ctx = ctx;
  }
  requestAdjust(add) {
    const scrollingTo = this.ctx.state.scrollingTo;
    const shouldDeferAdjust = doesPlatformAdjustBreakScroll() && !!scrollingTo && !scrollingTo.isInitialScroll && (scrollingTo.animated || Platform.OS === "macos");
    if (shouldDeferAdjust) {
      this.pendingAdjust += add;
      set$(this.ctx, "scrollAdjustPending", this.pendingAdjust);
    } else {
      this.appliedAdjust += add;
      set$(this.ctx, "scrollAdjust", this.appliedAdjust);
    }
    if (this.ctx.state.scrollingTo) {
      checkFinishedScroll(this.ctx);
    }
  }
  getAdjust() {
    return this.appliedAdjust;
  }
  commitPendingAdjust(scrollTarget) {
    if (doesPlatformAdjustBreakScroll()) {
      const state = this.ctx.state;
      const pending = this.pendingAdjust;
      this.pendingAdjust = 0;
      if (pending !== 0) {
        let targetScroll;
        if ((scrollTarget == null ? void 0 : scrollTarget.index) !== void 0) {
          const currentOffset = calculateOffsetForIndex(this.ctx, scrollTarget.index);
          targetScroll = calculateOffsetWithOffsetPosition(this.ctx, currentOffset, scrollTarget);
          targetScroll = clampScrollOffset(this.ctx, targetScroll, scrollTarget);
        } else {
          targetScroll = clampScrollOffset(this.ctx, state.scroll + pending);
        }
        const adjustment = targetScroll - state.scrollPending;
        if (Math.abs(adjustment) > 0.1 || Math.abs(pending) > 0.1) {
          this.appliedAdjust += adjustment;
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
      requestAdjust(ctx, insetDiff);
    }
  }
}
function useWrapIfItem(fn) {
  return React2.useMemo(
    () => fn ? (arg1, arg2, arg3) => arg1 !== void 0 && arg2 !== void 0 ? fn(arg1, arg2, arg3) : void 0 : void 0,
    [fn]
  );
}
var useCombinedRef = (...refs) => {
  const callback = React2.useCallback((element) => {
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
function useStickyScrollHandler(stickyHeaderIndices, horizontal, ctx, onScroll2) {
  const shouldUseRnAnimatedEngine = !ctx.state.props.stickyPositionComponentInternal;
  return React2.useMemo(() => {
    if ((stickyHeaderIndices == null ? void 0 : stickyHeaderIndices.length) && shouldUseRnAnimatedEngine) {
      const { animatedScrollY } = ctx;
      return ReactNative.Animated.event(
        [
          {
            nativeEvent: {
              contentOffset: { [horizontal ? "x" : "y"]: animatedScrollY }
            }
          }
        ],
        {
          listener: onScroll2,
          useNativeDriver: true
        }
      );
    }
    return onScroll2;
  }, [stickyHeaderIndices == null ? void 0 : stickyHeaderIndices.join(","), horizontal, shouldUseRnAnimatedEngine]);
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

// src/core/scrollToEnd.ts
function scrollToEnd(ctx, options) {
  const state = ctx.state;
  const index = getDataLength(state) - 1;
  if (index === -1) {
    return false;
  }
  const paddingBottom = state.props.stylePaddingBottom || 0;
  const footerSize = peek$(ctx, "footerSize") || 0;
  scrollToIndex(ctx, {
    ...options,
    index,
    viewOffset: -paddingBottom - footerSize + ((options == null ? void 0 : options.viewOffset) || 0),
    viewPosition: 1
  });
  return true;
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
function triggerMountedContainerLayouts(ctx) {
  if (IsNewArchitecture) {
    scheduleContainerLayout(ctx);
  } else {
    for (const triggerLayout of ctx.containerLayoutTriggers.values()) {
      triggerLayout();
    }
  }
}
function createImperativeHandle(ctx, scheduleImperativeScrollCommit) {
  const state = ctx.state;
  const IMPERATIVE_SCROLL_SETTLE_MAX_WAIT_MS = 800;
  const IMPERATIVE_SCROLL_SETTLE_STABLE_FRAMES = 2;
  let imperativeScrollToken = 0;
  const isSettlingAfterDataChange = () => !!state.didDataChange || !!state.didColumnsChange || state.scheduledWork.has("mvcpRecalculate") || state.ignoreScrollFromMVCP !== void 0;
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
  const runWhenReady = (token, run, isReady) => {
    const startedAt = Date.now();
    let stableFrames = 0;
    const check = () => {
      if (token !== imperativeScrollToken) {
        return;
      }
      if (isSettlingAfterDataChange() || !isReady()) {
        stableFrames = 0;
      } else {
        stableFrames += 1;
      }
      const timedOut = Date.now() - startedAt >= IMPERATIVE_SCROLL_SETTLE_MAX_WAIT_MS;
      if (stableFrames >= IMPERATIVE_SCROLL_SETTLE_STABLE_FRAMES || timedOut) {
        run();
        return;
      }
      state.scheduledWork.frame(check, "imperativeScrollReady");
    };
    state.scheduledWork.frame(check, "imperativeScrollReady");
  };
  const runScrollRequest = (token, resolve, run, isReady = () => true) => {
    const runNow = () => {
      if (token !== imperativeScrollToken) {
        return;
      }
      const didStartScroll = run();
      if (!didStartScroll || !state.scrollingTo) {
        if (state.pendingScrollResolve === resolve) {
          state.pendingScrollResolve = void 0;
        }
        resolve();
      }
    };
    if (isSettlingAfterDataChange() || !isReady()) {
      runWhenReady(token, runNow, isReady);
    } else {
      runNow();
    }
  };
  const startImperativeScroll = (resolve) => {
    state.scheduledWork.cancel("imperativeScrollReady");
    const token = ++imperativeScrollToken;
    settlePendingImperativeScroll(state);
    state.pendingScrollResolve = resolve;
    return token;
  };
  const runScrollWithPromise = (run, isReady = () => true) => new Promise((resolve) => {
    const token = startImperativeScroll(resolve);
    supersedeInitialScroll(ctx);
    runScrollRequest(token, resolve, run, isReady);
  });
  state.runPendingScrollToEnd = () => {
    const pendingScroll = state.pendingScrollToEnd;
    if (pendingScroll) {
      state.pendingScrollToEnd = void 0;
      if (pendingScroll.token === imperativeScrollToken) {
        runScrollRequest(
          pendingScroll.token,
          pendingScroll.resolve,
          () => scrollToEnd(ctx, pendingScroll.options),
          () => isScrollToIndexReady(getDataLength(state) - 1, true)
        );
      }
    }
  };
  const scrollIndexIntoView = (options) => {
    if (state) {
      const { index, ...rest } = options;
      const { startNoBuffer, endNoBuffer } = state;
      const start = startNoBuffer;
      const end = endNoBuffer;
      if (index < start || index > end) {
        const viewPosition = index < start ? 0 : 1;
        scrollToIndex(ctx, {
          ...rest,
          index,
          viewPosition
        });
        return true;
      }
    }
    return false;
  };
  const refScroller = state.refScroller;
  const clearCaches = (options) => {
    var _a3, _b;
    const mode = (_a3 = options == null ? void 0 : options.mode) != null ? _a3 : "sizes";
    const shouldRebuildPrefixLayoutStore = state.props.getFixedItemSize !== void 0;
    state.sizes.clear();
    state.sizesKnown.clear();
    invalidateContainerFixedItemSizes(state);
    for (const key in state.averageSizes) {
      delete state.averageSizes[key];
    }
    clearLayoutStoreKnownSizes(ctx);
    state.minIndexSizeChanged = 0;
    state.scrollForNextCalculateItemsInView = void 0;
    state.pendingTotalSize = void 0;
    state.totalSize = 0;
    set$(ctx, "totalSize", 0);
    if (mode === "full") {
      state.indexByKey.clear();
      state.idCache.length = 0;
    }
    if (shouldRebuildPrefixLayoutStore) {
      rebuildLayoutStoreExact(ctx);
      syncLayoutStoreState(ctx);
    }
    triggerMountedContainerLayouts(ctx);
    (_b = state.triggerCalculateItemsInView) == null ? void 0 : _b.call(state, { forceFullItemPositions: true });
  };
  const replaceKnownSizeEntries = (entries) => {
    var _a3;
    const checkMVCP = prepareMVCP(ctx);
    const layoutEntries = entries.map(({ index, size }) => ({
      index,
      size: size + ctx.scrollAxisGap,
      type: "cached"
    }));
    const didReplace = replaceLayoutStoreKnownSizeEntries(ctx, layoutEntries);
    if (didReplace) {
      state.sizes.clear();
      state.sizesKnown.clear();
      for (const key in state.averageSizes) {
        delete state.averageSizes[key];
      }
      state.minIndexSizeChanged = 0;
      state.scrollForNextCalculateItemsInView = void 0;
      checkMVCP == null ? void 0 : checkMVCP();
      (_a3 = state.triggerCalculateItemsInView) == null ? void 0 : _a3.call(state, { forceFullItemPositions: true });
    }
  };
  return {
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
      return {
        activeStickyIndex: peek$(ctx, "activeStickyIndex"),
        contentLength: getContentSize(ctx),
        data: (_a3 = getIndexedData(state).getLegacyData()) != null ? _a3 : [],
        elementAtIndex: (index) => {
          var _a4;
          return (_a4 = ctx.viewRefs.get(findContainerId(ctx, getId(state, index)))) == null ? void 0 : _a4.current;
        },
        end: state.endNoBuffer,
        endBuffered: state.endBuffered,
        getAverageItemSizes: () => getAverageItemSizes(state),
        indexByKey: (key) => state.indexByKey.get(key),
        isAtEnd: peek$(ctx, "isAtEnd"),
        isAtStart: peek$(ctx, "isAtStart"),
        isEndReached: state.isEndReached,
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
        scroll: state.scroll,
        scrollLength: state.scrollLength,
        scrollVelocity: getScrollVelocity(state),
        sizeAtIndex: (index) => getLayoutSize(ctx, index),
        sizes: state.sizesKnown,
        start: state.startNoBuffer,
        startBuffered: state.startBuffered
      };
    },
    replaceKnownSizeEntries,
    reportContentInset: (inset) => {
      const didChange = setContentInsetOverride(ctx, inset);
      updateScroll(ctx, state.scroll, true, { markHasScrolled: false });
      if (didChange) {
        retargetActiveInitialScrollAtEnd(ctx);
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
        scrollIndexIntoView({ index, ...props });
        return true;
      }
      return false;
    }),
    scrollToEnd: (options) => new Promise((resolve) => {
      var _a3;
      const token = startImperativeScroll(resolve);
      state.pendingScrollToEnd = {
        options,
        resolve,
        token
      };
      scheduleImperativeScrollCommit == null ? void 0 : scheduleImperativeScrollCommit();
      supersedeInitialScroll(ctx);
      if (!scheduleImperativeScrollCommit) {
        (_a3 = state.runPendingScrollToEnd) == null ? void 0 : _a3.call(state);
      }
    }),
    scrollToIndex: (params) => {
      return runScrollWithPromise(
        () => {
          scrollToIndex(ctx, params);
          return true;
        },
        params.index >= 0 ? () => isScrollToIndexReady(params.index) : void 0
      );
    },
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
        return true;
      }
      return false;
    }),
    scrollToOffset: (params) => runScrollWithPromise(() => {
      scrollTo(ctx, params);
      return true;
    }),
    setItemSize: (itemKey, size) => {
      updateItemSizes(ctx, { itemKey, size });
    },
    setScrollProcessingEnabled: (enabled) => {
      state.scrollProcessingEnabled = enabled;
    },
    setVisibleContentAnchorOffset: (value) => {
      const val = isFunction(value) ? value(peek$(ctx, "scrollAdjustUserOffset") || 0) : value;
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
function getRenderedItem(ctx, key, containerId) {
  var _a3, _b, _c;
  const state = ctx.state;
  if (!state) {
    return null;
  }
  if (!state.props.dataSource && !state.props.data) {
    throw new TypeError("LegendList data is unavailable");
  }
  const metadata = containerId === void 0 ? void 0 : state.containerItemMetadata.get(containerId);
  const useAssignedGeneration = metadata !== void 0 && metadata.dataChangeEpoch !== state.dataChangeEpoch;
  const {
    indexByKey,
    props: { dataSource, getItemType, renderItem }
  } = state;
  const index = (_a3 = metadata == null ? void 0 : metadata.itemIndex) != null ? _a3 : indexByKey.get(key);
  if (index === void 0) {
    return null;
  }
  let renderedItem = null;
  const extraData = peek$(ctx, "extraData");
  const indexedData = getIndexedData(state);
  const item = useAssignedGeneration ? metadata.itemData : getDataItem(state, index);
  const assignedDataSource = useAssignedGeneration ? metadata.dataSource : dataSource;
  const shouldRender = assignedDataSource !== void 0 || !isNullOrUndefined(item);
  if (renderItem && shouldRender) {
    const sharedItemProps = {
      extraData,
      index,
      item,
      type: useAssignedGeneration ? (_b = metadata.itemType) != null ? _b : "" : item !== void 0 && getItemType ? (_c = getItemType(item, index)) != null ? _c : "" : ""
    };
    const itemProps = assignedDataSource ? { ...sharedItemProps, dataSource: assignedDataSource } : { ...sharedItemProps, data: useAssignedGeneration ? metadata.data : indexedData.getLegacyData() };
    renderedItem = renderItem(itemProps);
  }
  return { index, item, renderedItem };
}

// src/utils/normalizeMaintainScrollAtEnd.ts
function normalizeMaintainScrollAtEndOn(on, hasExplicitOn) {
  var _a3, _b, _c, _d;
  return {
    animated: false,
    onDataChange: hasExplicitOn ? (_a3 = on == null ? void 0 : on.dataChange) != null ? _a3 : false : true,
    onFooterLayout: hasExplicitOn ? (_b = on == null ? void 0 : on.footerLayout) != null ? _b : false : true,
    onItemLayout: hasExplicitOn ? (_c = on == null ? void 0 : on.itemLayout) != null ? _c : false : true,
    onLayout: hasExplicitOn ? (_d = on == null ? void 0 : on.layout) != null ? _d : false : true
  };
}
function normalizeMaintainScrollAtEnd(value) {
  var _a3;
  if (!value) {
    return void 0;
  }
  if (value === true) {
    return {
      ...normalizeMaintainScrollAtEndOn(void 0, false),
      animated: false
    };
  }
  const normalizedTriggers = normalizeMaintainScrollAtEndOn(value.on, "on" in value);
  return {
    ...normalizedTriggers,
    animated: (_a3 = value.animated) != null ? _a3 : false
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
  const timeoutRef = React2.useRef(null);
  const lastCallTimeRef = React2.useRef(0);
  const lastArgsRef = React2.useRef(null);
  const clearTimeoutRef = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };
  const execute = React2.useCallback(
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
      data: (isArray(children) ? children : React2__namespace.Children.toArray(children)).flat(1),
      dataSource: void 0,
      renderItem: ({ item }) => item
    } : {
      ...restProps,
      data: dataProp || [],
      dataSource,
      renderItem: renderItemProp
    };
    return /* @__PURE__ */ React2__namespace.createElement(StateProvider, null, /* @__PURE__ */ React2__namespace.createElement(LegendListInner, { ...processedProps, ref: forwardedRef }));
  })
);
function areViewabilityConfigsEqual(a, b) {
  return (a == null ? void 0 : a.id) === (b == null ? void 0 : b.id) && (a == null ? void 0 : a.itemVisiblePercentThreshold) === (b == null ? void 0 : b.itemVisiblePercentThreshold) && (a == null ? void 0 : a.minimumViewTime) === (b == null ? void 0 : b.minimumViewTime) && (a == null ? void 0 : a.startOffset) === (b == null ? void 0 : b.startOffset) && (a == null ? void 0 : a.viewAreaCoveragePercentThreshold) === (b == null ? void 0 : b.viewAreaCoveragePercentThreshold) && (a == null ? void 0 : a.waitForInteraction) === (b == null ? void 0 : b.waitForInteraction);
}
function areViewabilityConfigPairsEqual(a, b) {
  return (a == null ? void 0 : a.length) === (b == null ? void 0 : b.length) && (a === b || (a == null ? void 0 : a.every((pair, index) => areViewabilityConfigsEqual(pair.viewabilityConfig, b == null ? void 0 : b[index].viewabilityConfig))));
}
var LegendListInner = typedForwardRef(function LegendListInner2(props, forwardedRef) {
  var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t;
  const noopOnScroll = React2.useCallback((_event) => {
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
    estimatedItemSize = 100,
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
    onLayout: onLayoutProp,
    onLoad,
    onMomentumScrollEnd,
    onRefresh,
    onScroll: onScrollProp,
    onScrollBeginDrag,
    onStartReached,
    onStartReachedThreshold = 0.5,
    onStickyHeaderChange,
    onFirstVisibleItemChanged,
    onViewableItemsChanged,
    progressViewOffset,
    recycleItems = false,
    refreshControl,
    refreshing,
    refScrollView,
    renderScrollComponent,
    renderItem,
    scrollEventThrottle,
    snapToIndices,
    stickyHeaderIndices: stickyHeaderIndicesProp,
    style: styleProp,
    useWindowScroll = false,
    viewabilityConfig,
    viewabilityConfigCallbackPairs,
    ...rest
  } = props;
  const numColumnsProp = normalizeNumColumnsProp(numColumnsPropRaw);
  const indexedData = React2.useMemo(
    () => dataSource ? new DataSourceAdapter(dataSource) : new ArrayDataAdapter(dataProp, keyExtractorProp),
    [dataProp, dataSource, keyExtractorProp]
  );
  const dataLength = indexedData.getLength();
  const dataSourceRevision = dataSource == null ? void 0 : dataSource.getRevision();
  const animatedPropsInternal = props.animatedPropsInternal;
  const anchoredEndSpaceOwner = (_a3 = props.anchoredEndSpaceOwnerInternal) != null ? _a3 : "list";
  const positionComponentInternal = props.positionComponentInternal;
  const stickyPositionComponentInternal = props.stickyPositionComponentInternal;
  const {
    anchoredEndSpaceOwnerInternal: _anchoredEndSpaceOwnerInternal,
    positionComponentInternal: _positionComponentInternal,
    stickyPositionComponentInternal: _stickyPositionComponentInternal,
    ...restProps
  } = rest;
  const contentContainerStyleBase = StyleSheet.flatten(contentContainerStyleProp);
  const useAlignItemsAtEndPadding = alignItemsAtEnd && !horizontal && (contentContainerStyleBase == null ? void 0 : contentContainerStyleBase.minHeight) == null && dataLength > 0;
  const shouldFlexGrow = alignItemsAtEnd && !useAlignItemsAtEndPadding && (horizontal ? (contentContainerStyleBase == null ? void 0 : contentContainerStyleBase.minWidth) == null : (contentContainerStyleBase == null ? void 0 : contentContainerStyleBase.minHeight) == null);
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
  const initialScrollUsesOffsetOnly = !initialScrollAtEnd && !hasInitialScrollIndex && (hasInitialScrollOffset || shouldInitializeHorizontalRTL);
  const usesBootstrapInitialScroll = initialScrollAtEnd || hasInitialScrollIndex;
  const initialScrollProp = initialScrollAtEnd ? {
    index: Math.max(0, dataLength - 1),
    preserveForBottomPadding: true,
    viewOffset: -stylePaddingEndState,
    viewPosition: 1
  } : hasInitialScrollIndex ? typeof initialScrollIndexProp === "object" ? {
    index: (_b = initialScrollIndexProp.index) != null ? _b : 0,
    preserveForBottomPadding: initialScrollIndexProp.viewOffset === void 0 && initialScrollIndexProp.viewPosition === 1 ? true : void 0,
    viewOffset: (_c = initialScrollIndexProp.viewOffset) != null ? _c : initialScrollIndexProp.viewPosition === 1 ? -stylePaddingEndState : 0,
    viewPosition: (_d = initialScrollIndexProp.viewPosition) != null ? _d : 0
  } : {
    index: initialScrollIndexProp != null ? initialScrollIndexProp : 0,
    viewOffset: initialScrollOffsetProp != null ? initialScrollOffsetProp : 0
  } : initialScrollUsesOffsetOnly ? {
    contentOffset: initialScrollOffsetProp != null ? initialScrollOffsetProp : 0,
    index: 0,
    viewOffset: 0
  } : void 0;
  const [canRender, setCanRender] = React2__namespace.useState(!IsNewArchitecture);
  const [, scheduleImperativeScrollCommit] = React2__namespace.useReducer((value) => value + 1, 0);
  const [, scheduleDataSourceCommit] = React2__namespace.useReducer((value) => value + 1, 0);
  const ctx = useStateContext();
  ctx.columnWrapperStyle = columnWrapperStyle || (contentContainerStyle ? createColumnWrapperStyle(contentContainerStyle) : void 0);
  const scrollAxisGap = horizontal ? (_g = (_e = ctx.columnWrapperStyle) == null ? void 0 : _e.columnGap) != null ? _g : (_f = ctx.columnWrapperStyle) == null ? void 0 : _f.gap : (_j = (_h = ctx.columnWrapperStyle) == null ? void 0 : _h.rowGap) != null ? _j : (_i = ctx.columnWrapperStyle) == null ? void 0 : _i.gap;
  const nextScrollAxisGap = typeof scrollAxisGap === "number" && Number.isFinite(scrollAxisGap) ? scrollAxisGap : 0;
  const refScroller = React2.useRef(null);
  const combinedRef = useCombinedRef(refScroller, refScrollView);
  const keyExtractor = dataSource ? (_item, index) => indexedData.getKey(index) : keyExtractorProp != null ? keyExtractorProp : ((_item, index) => index.toString());
  const stickyHeaderIndices = stickyHeaderIndicesProp;
  const contentInsetEndAdjustmentResolved = Platform.OS === "web" ? contentInsetEndAdjustment : void 0;
  const previousContentInsetEndAdjustmentRef = React2.useRef(contentInsetEndAdjustmentResolved);
  const alwaysRenderIndices = React2.useMemo(() => {
    const indices = getAlwaysRenderIndices(alwaysRender, indexedData, keyExtractor, anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorIndex);
    return { arr: indices, set: new Set(indices) };
  }, [
    anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorIndex,
    alwaysRender == null ? void 0 : alwaysRender.top,
    alwaysRender == null ? void 0 : alwaysRender.bottom,
    (_k = alwaysRender == null ? void 0 : alwaysRender.indices) == null ? void 0 : _k.join(","),
    (_l = alwaysRender == null ? void 0 : alwaysRender.keys) == null ? void 0 : _l.join(","),
    dataProp,
    indexedData,
    dataKey,
    dataVersion,
    keyExtractor
  ]);
  const useWindowScrollResolved = Platform.OS === "web" && !!useWindowScroll && !renderScrollComponent;
  const refState = React2.useRef(void 0);
  const hasOverrideItemLayout = !!overrideItemLayout;
  const prevHasOverrideItemLayout = React2.useRef(hasOverrideItemLayout);
  if (!refState.current) {
    if (!ctx.state) {
      const initialScrollLength = (estimatedListSize != null ? estimatedListSize : IsNewArchitecture ? { height: 0, width: 0 } : getWindowSize())[horizontal ? "width" : "height"];
      ctx.values.set("adaptiveRender", (_m = experimental_adaptiveRender == null ? void 0 : experimental_adaptiveRender.initialMode) != null ? _m : "normal");
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
        enableScrollForNextCalculateItemsInView: true,
        endBuffered: -1,
        endNoBuffer: -1,
        endReachedSnapshot: void 0,
        firstFullyOnScreenIndex: -1,
        freshDataTransitionEpoch: 0,
        hasHadNonEmptyData: dataLength > 0,
        idCache: [],
        idsInView: [],
        indexByKey: /* @__PURE__ */ new Map(),
        indexedData,
        initialScroll: initialScrollProp,
        initialScrollSession: initialScrollProp ? {
          kind: initialScrollUsesOffsetOnly ? "offset" : "bootstrap",
          previousDataLength: dataLength
        } : void 0,
        isEndReached: null,
        isFirst: true,
        isStartReached: null,
        lastBatchingAction: Date.now(),
        lastLayout: void 0,
        lastScrollDelta: 0,
        loadStartTime: Date.now(),
        minIndexSizeChanged: 0,
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
        scrollLength: initialScrollLength,
        scrollPending: 0,
        scrollPrev: 0,
        scrollPrevTime: 0,
        scrollProcessingEnabled: true,
        scrollTime: 0,
        sizes: /* @__PURE__ */ new Map(),
        sizesKnown: /* @__PURE__ */ new Map(),
        startBuffered: -1,
        startNoBuffer: -1,
        startReachedSnapshot: void 0,
        startReachedSnapshotDataChangeEpoch: void 0,
        stickyContainerPool: /* @__PURE__ */ new Set(),
        stickyContainers: /* @__PURE__ */ new Map(),
        totalSize: 0,
        viewabilityConfigCallbackPairs: void 0
      };
      const internalState = ctx.state;
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
  const previousViewabilityConfigRef = React2.useRef(viewabilityConfig);
  const previousViewabilityConfigPairsRef = React2.useRef(viewabilityConfigCallbackPairs);
  const isFirstLocal = state.isFirst;
  const didDataSourceChangeLocal = state.props.dataSource !== dataSource;
  if (didDataSourceChangeLocal) {
    state.dataSourceNeedsReset = false;
    state.dataSourceAnchorPositions = void 0;
    state.dataSourceMutationApplied = false;
    state.dataSourcePreviousLength = void 0;
    state.dataSourceResetReason = void 0;
    state.dataSourceSpanInvalidationIndex = void 0;
    state.pendingDataSourceBatches = void 0;
  }
  const previousDataLength = isFirstLocal ? 0 : (_n = state.dataSourcePreviousLength) != null ? _n : getDataLength(state);
  state.indexedData = indexedData;
  const previousAdaptiveRender = state.props.adaptiveRender;
  const didScrollAxisChange = !isFirstLocal && state.props.horizontal !== !!horizontal;
  const previousNumColumnsProp = state.props.numColumns;
  const didScrollAxisGapChange = !isFirstLocal && ctx.scrollAxisGap !== nextScrollAxisGap;
  const wrappedGetFixedItemSize = useWrapIfItem(getFixedItemSize);
  const wrappedGetItemType = useWrapIfItem(getItemType);
  const wrappedKeyExtractor = useWrapIfItem(keyExtractor);
  ctx.scrollAxisGap = nextScrollAxisGap;
  state.didColumnsChange = numColumnsProp !== previousNumColumnsProp || didScrollAxisChange || didScrollAxisGapChange;
  const didDataReferenceChangeLocal = state.props.data !== dataProp;
  const didDataSourceMutationLocal = !!((_o = state.pendingDataSourceBatches) == null ? void 0 : _o.length) || !!state.dataSourceNeedsReset;
  const didDataKeyChangeLocal = state.props.dataKey !== dataKey;
  const didDataVersionChangeLocal = state.props.dataVersion !== dataVersion;
  const didKeyExtractorChange = state.props.hasReliableKeyExtractor !== (!!dataSource || !!keyExtractorProp) || !dataSource && !!keyExtractorProp && state.props.keyExtractor !== wrappedKeyExtractor;
  const didDataChangeLocal = didDataKeyChangeLocal || didDataSourceChangeLocal || didDataSourceMutationLocal || didDataVersionChangeLocal || didDataReferenceChangeLocal && checkStructuralDataChange(state, dataProp, state.props.data);
  if (IS_DEV && didKeyExtractorChange && !didDataChangeLocal && !!state.props.hasReliableKeyExtractor) {
    warnDevOnce(
      "keyExtractor-identity-changed",
      "keyExtractor changed identity without a data change. Pass a stable keyExtractor because item identity is only recomputed during data changes."
    );
  }
  const shouldResetFreshDataLayout = !isFirstLocal && didDataChangeLocal && state.hasHadNonEmptyData && (didDataKeyChangeLocal || previousDataLength === 0) && dataLength > 0;
  if (didDataChangeLocal && !initialScrollAtEnd && state.didFinishInitialScroll && ((_p = state.initialScroll) == null ? void 0 : _p.viewPosition) === 1 && previousDataLength > 0) {
    clearPreservedInitialScrollTarget(state);
  }
  if (didDataChangeLocal) {
    state.dataChangeEpoch += 1;
    state.dataChangeKeyExtractorChanged = didKeyExtractorChange;
    state.dataChangeNeedsScrollUpdate = true;
    state.didDataChange = true;
    state.previousData = dataSource ? void 0 : state.props.data;
  }
  if (shouldResetFreshDataLayout) {
    state.freshDataTransitionEpoch += 1;
  }
  const throttledOnScroll = useThrottledOnScroll(onScrollProp != null ? onScrollProp : noopOnScroll, scrollEventThrottle != null ? scrollEventThrottle : 0);
  const throttleScrollFn = scrollEventThrottle && onScrollProp ? throttledOnScroll : onScrollProp;
  const didAnchoredEndSpaceAnchorIndexChange = !isFirstLocal && !didDataChangeLocal && ((_q = state.props.anchoredEndSpace) == null ? void 0 : _q.anchorIndex) !== (anchoredEndSpace == null ? void 0 : anchoredEndSpace.anchorIndex);
  const shouldExactSyncLayoutStore = !isFirstLocal && !didDataChangeLocal && (state.props.estimatedItemSize !== estimatedItemSize || !!state.props.hasReliableKeyExtractor !== !!keyExtractorProp || didScrollAxisChange || didScrollAxisGapChange);
  state.props = {
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
    hasReliableKeyExtractor: !!dataSource || !!keyExtractorProp,
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
    onMomentumScrollEnd,
    onScroll: throttleScrollFn,
    onScrollBeginDrag,
    onStartReached,
    onStartReachedThreshold,
    onStickyHeaderChange,
    overrideItemLayout,
    positionComponentInternal,
    recycleItems: !!recycleItems,
    renderItem,
    rtl,
    snapToIndices,
    stickyHeaderIndicesArr: stickyHeaderIndices != null ? stickyHeaderIndices : [],
    stickyHeaderIndicesSet: React2.useMemo(() => new Set(stickyHeaderIndices != null ? stickyHeaderIndices : []), [stickyHeaderIndices == null ? void 0 : stickyHeaderIndices.join(",")]),
    stickyPositionComponentInternal,
    stylePaddingBottom: stylePaddingBottomState,
    stylePaddingLeft: stylePaddingLeftState,
    stylePaddingRight: stylePaddingRightState,
    stylePaddingTop: stylePaddingTopState,
    useWindowScroll: useWindowScrollResolved,
    viewabilityConfig
  };
  React2.useLayoutEffect(() => {
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
          scheduleDataSourceCommit();
        },
        onReset: ({ batch, reason }) => {
          var _a4, _b2, _c2;
          (_a4 = state.pendingDataSourceBatches) != null ? _a4 : state.pendingDataSourceBatches = [];
          state.pendingDataSourceBatches.push(batch);
          (_b2 = state.dataSourcePreviousLength) != null ? _b2 : state.dataSourcePreviousLength = batch.previousLength;
          state.dataSourceNeedsReset = true;
          state.dataSourceResetReason = reason;
          state.dataSourceSpanInvalidationIndex = 0;
          (_c2 = state.layoutStoreRuntime) == null ? void 0 : _c2.clearRowSpanCache();
          warnDevOnce("data-source-safe-reset", `Resetting data-source state because ${reason}.`);
          scheduleDataSourceCommit();
        }
      },
      { length: dataLength, revision: dataSourceRevision }
    );
    return observer.start();
  }, [dataSource]);
  syncLayoutStoreStructure(ctx);
  if (shouldExactSyncLayoutStore) {
    rebuildLayoutStoreExact(ctx);
    syncLayoutStoreState(ctx);
  }
  state.refScroller = refScroller;
  if (!isFirstLocal && previousAdaptiveRender && !experimental_adaptiveRender) {
    resetAdaptiveRender(ctx);
  }
  const memoizedLastItemKeys = React2.useMemo(() => {
    if (!dataLength) return [];
    return Array.from({ length: Math.min(numColumnsProp, dataLength) }, (_, i) => getId(state, dataLength - 1 - i));
  }, [dataLength, dataProp, dataKey, dataSource, dataVersion, numColumnsProp]);
  const initializeStateVars = (shouldAdjustPadding) => {
    set$(ctx, "lastItemKeys", memoizedLastItemKeys);
    set$(ctx, "numColumns", numColumnsProp);
    const prevPaddingTop = peek$(ctx, "stylePaddingTop");
    setPaddingTop(ctx, { stylePaddingTop: stylePaddingTopState });
    refState.current.props.stylePaddingBottom = stylePaddingBottomState;
    updateContentMetricsState(ctx);
    let paddingDiff = stylePaddingTopState - prevPaddingTop;
    if (shouldAdjustPadding && maintainVisibleContentPositionConfig.size && paddingDiff && prevPaddingTop !== void 0 && Platform.OS === "ios") {
      if (state.scroll < 0) {
        paddingDiff += state.scroll;
      }
      requestAdjust(ctx, paddingDiff);
    }
  };
  if (isFirstLocal) {
    initializeStateVars(false);
    resetLayoutCachesForDataChange(state);
    if (((_r = state.initialScrollSession) == null ? void 0 : _r.kind) === "bootstrap" || (snapToIndices == null ? void 0 : snapToIndices.length)) {
      rebuildLayoutStoreExact(ctx);
    }
    syncLayoutStoreState(ctx);
  }
  const initialContentOffset = React2.useMemo(() => {
    var _a4, _b2;
    const initialScroll = state.initialScroll;
    if (!initialScroll) {
      return void 0;
    }
    const resolvedOffset = (_a4 = initialScroll.contentOffset) != null ? _a4 : resolveInitialScrollOffset(ctx, initialScroll);
    return usesBootstrapInitialScroll && ((_b2 = state.initialScrollSession) == null ? void 0 : _b2.kind) === "bootstrap" && Platform.OS === "web" ? void 0 : resolvedOffset;
  }, [usesBootstrapInitialScroll]);
  React2.useLayoutEffect(() => {
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
    refState.current.lastBatchingAction = Date.now();
    if (!dataSource && !keyExtractorProp && !isFirstLocal && didDataChangeLocal) {
      refState.current.sizes.clear();
      refState.current.sizesKnown.clear();
      for (const key in refState.current.averageSizes) {
        delete refState.current.averageSizes[key];
      }
      clearLayoutStoreKnownSizes(ctx);
      refState.current.totalSize = 0;
      set$(ctx, "totalSize", 0);
    }
  }
  if (IS_DEV) {
    useDevChecks(props);
  }
  React2.useLayoutEffect(() => {
    if (shouldResetFreshDataLayout) {
      resetInitialRenderState(ctx, {
        resetInitialScroll: !!initialScrollProp,
        resetLayout: true
      });
    }
    handleInitialScrollDataChange(ctx, {
      dataLength,
      didDataChange: didDataChangeLocal,
      didStartFreshData: shouldResetFreshDataLayout,
      initialScrollAtEnd,
      latestInitialScroll: initialScrollProp,
      latestInitialScrollSessionKind: initialScrollUsesOffsetOnly ? "offset" : "bootstrap",
      stylePaddingEnd: stylePaddingEndState,
      useBootstrapInitialScroll: usesBootstrapInitialScroll
    });
  }, [
    dataLength,
    dataKey,
    didDataChangeLocal,
    shouldResetFreshDataLayout,
    initialScrollAtEnd,
    stylePaddingEndState,
    usesBootstrapInitialScroll
  ]);
  React2.useLayoutEffect(() => {
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
    didAnchoredEndSpaceAnchorIndexChange,
    horizontal,
    numColumnsProp,
    rtl,
    stylePaddingBottomState,
    stylePaddingLeftState,
    stylePaddingRightState
  ]);
  React2.useLayoutEffect(() => {
    const previousContentInsetEndAdjustment = previousContentInsetEndAdjustmentRef.current;
    previousContentInsetEndAdjustmentRef.current = contentInsetEndAdjustmentResolved;
    updateContentInsetEndAdjustment(ctx, previousContentInsetEndAdjustment);
  }, [ctx, contentInsetEndAdjustmentResolved]);
  const onLayoutFooter = React2.useCallback(
    (layout) => {
      if (!usesBootstrapInitialScroll) {
        return;
      }
      handleBootstrapInitialScrollFooterLayout(ctx, {
        dataLength,
        footerSize: layout[horizontal ? "width" : "height"],
        initialScrollAtEnd,
        stylePaddingEnd: stylePaddingEndState
      });
    },
    [dataLength, initialScrollAtEnd, horizontal, stylePaddingEndState, usesBootstrapInitialScroll]
  );
  const onLayoutChange = React2.useCallback(
    (layout, fromLayoutEffect) => {
      const previousScrollLength = state.scrollLength;
      const previousOtherAxisSize = state.otherAxisSize;
      handleLayout(ctx, layout, setCanRender);
      maybeUpdateAnchoredEndSpace(ctx);
      const didLayoutAffectBootstrapTarget = previousScrollLength !== state.scrollLength || previousOtherAxisSize !== state.otherAxisSize;
      if (usesBootstrapInitialScroll && !fromLayoutEffect && didLayoutAffectBootstrapTarget) {
        handleBootstrapInitialScrollLayoutChange(ctx);
      }
      if (usesBootstrapInitialScroll) {
        return;
      }
      advanceCurrentInitialScrollSession(ctx);
    },
    [dataLength, initialScrollAtEnd, stylePaddingEndState, usesBootstrapInitialScroll]
  );
  const { onLayout } = useOnLayoutSync({
    onLayoutChange,
    onLayoutProp,
    ref: refScroller
    // the type of ScrollView doesn't include measure?
  });
  React2.useLayoutEffect(() => {
    if (snapToIndices) {
      updateSnapToOffsets(ctx);
    }
  }, [snapToIndices]);
  React2.useLayoutEffect(
    () => initializeStateVars(true),
    [
      dataKey,
      dataVersion,
      horizontal,
      memoizedLastItemKeys.join(","),
      numColumnsProp,
      nextScrollAxisGap,
      stylePaddingBottomState,
      stylePaddingTopState,
      useAlignItemsAtEndPadding
    ]
  );
  React2.useLayoutEffect(() => {
    const {
      didColumnsChange,
      didDataChange,
      isFirst,
      props: { data }
    } = state;
    const didAllocateContainers = getDataLength(state) > 0 && doInitialAllocateContainers(ctx);
    if (!didAllocateContainers && !isFirst && (didDataChange || didColumnsChange)) {
      checkResetContainers(ctx, data, {
        didColumnsChange,
        previousDataLength: state.dataSourcePreviousLength
      });
    }
    if (didDataChange) {
      state.dataChangeKeyExtractorChanged = false;
      state.dataSourceNeedsReset = false;
      state.dataSourceAnchorPositions = void 0;
      state.dataSourceMutationApplied = false;
      state.dataSourcePreviousLength = void 0;
      state.dataSourceResetReason = void 0;
      state.pendingDataComparison = void 0;
      state.pendingDataSourceBatches = void 0;
    }
    state.didColumnsChange = false;
    state.didDataChange = false;
    state.isFirst = false;
  }, [dataProp, dataKey, dataSource, dataSourceRevision, dataVersion, horizontal, numColumnsProp, nextScrollAxisGap]);
  React2.useLayoutEffect(() => {
    var _a4;
    set$(ctx, "extraData", extraData);
    const didToggleOverride = prevHasOverrideItemLayout.current !== hasOverrideItemLayout;
    prevHasOverrideItemLayout.current = hasOverrideItemLayout;
    if ((hasOverrideItemLayout || didToggleOverride) && numColumnsProp > 1) {
      (_a4 = state.triggerCalculateItemsInView) == null ? void 0 : _a4.call(state, { forceFullItemPositions: true });
    }
  }, [extraData, hasOverrideItemLayout, numColumnsProp]);
  React2.useEffect(() => {
    if (!onMetricsChange) {
      return;
    }
    let lastMetrics;
    const emitMetrics = () => {
      const metrics = {
        footerSize: peek$(ctx, "footerSize") || 0,
        headerSize: peek$(ctx, "headerSize") || 0
      };
      if (!lastMetrics || metrics.headerSize !== lastMetrics.headerSize || metrics.footerSize !== lastMetrics.footerSize) {
        lastMetrics = metrics;
        onMetricsChange(metrics);
      }
    };
    emitMetrics();
    const unsubscribe = [listen$(ctx, "headerSize", emitMetrics), listen$(ctx, "footerSize", emitMetrics)];
    return () => {
      for (const unsub of unsubscribe) {
        unsub();
      }
    };
  }, [ctx, onMetricsChange]);
  React2.useEffect(() => {
    const hadViewabilityConsumers = hasViewabilityConsumers(ctx);
    const didViewabilityConfigChange = !areViewabilityConfigsEqual(previousViewabilityConfigRef.current, viewabilityConfig) || !areViewabilityConfigPairsEqual(previousViewabilityConfigPairsRef.current, viewabilityConfigCallbackPairs);
    previousViewabilityConfigRef.current = viewabilityConfig;
    previousViewabilityConfigPairsRef.current = viewabilityConfigCallbackPairs;
    const viewability = setupViewability({
      onViewableItemsChanged,
      viewabilityConfig,
      viewabilityConfigCallbackPairs
    });
    state.viewabilityConfigCallbackPairs = viewability;
    state.enableScrollForNextCalculateItemsInView = true;
    state.scrollForNextCalculateItemsInView = void 0;
    const hasViewabilityConsumersNow = hasViewabilityConsumers(ctx, viewability);
    if (!hadViewabilityConsumers && hasViewabilityConsumersNow || didViewabilityConfigChange && (onFirstVisibleItemChanged || hasViewabilityConsumersNow)) {
      requestViewabilityRecalculation(ctx);
    }
  }, [viewabilityConfig, viewabilityConfigCallbackPairs, onViewableItemsChanged]);
  useInit(() => {
    if (!IsNewArchitecture) {
      doInitialAllocateContainers(ctx);
    }
  });
  React2.useImperativeHandle(forwardedRef, () => createImperativeHandle(ctx, scheduleImperativeScrollCommit), []);
  React2.useEffect(() => {
    return () => {
      cancelImperativeScroll(state);
      state.scheduledWork.dispose();
    };
  }, [state]);
  React2.useLayoutEffect(() => {
    var _a4;
    (_a4 = state.runPendingScrollToEnd) == null ? void 0 : _a4.call(state);
  });
  React2.useEffect(() => {
    if (Platform.OS !== "web" || usesBootstrapInitialScroll) {
      return;
    }
    advanceCurrentInitialScrollSession(ctx);
  }, [ctx, usesBootstrapInitialScroll]);
  const fns = React2.useMemo(
    () => ({
      getRenderedItem: (key, containerId) => getRenderedItem(ctx, key, containerId),
      onMomentumScrollEnd: (event) => {
        checkFinishedScrollFallback(ctx);
        if (state.props.onMomentumScrollEnd) {
          state.props.onMomentumScrollEnd(event);
        }
      },
      onScroll: (event) => onScroll(ctx, event),
      onScrollBeginDrag: (event) => {
        var _a4, _b2;
        prepareReachedEdgeForNextUserScroll(ctx);
        (_b2 = (_a4 = state.props).onScrollBeginDrag) == null ? void 0 : _b2.call(_a4, event);
      },
      onScrollEnd: () => prepareReachedEdgeForNextUserScroll(ctx)
    }),
    []
  );
  const onScrollHandler = useStickyScrollHandler(stickyHeaderIndices, horizontal, ctx, fns.onScroll);
  const refreshControlElement = refreshControl;
  return /* @__PURE__ */ React2__namespace.createElement(React2__namespace.Fragment, null, /* @__PURE__ */ React2__namespace.createElement(
    ListComponent,
    {
      ...restProps,
      alignItemsAtEnd,
      canRender,
      contentContainerStyle,
      contentInset,
      freshDataTransitionEpoch: state.freshDataTransitionEpoch,
      getRenderedItem: fns.getRenderedItem,
      horizontal,
      initialContentOffset,
      ListEmptyComponent: dataLength === 0 ? ListEmptyComponent : void 0,
      ListFooterComponent,
      ListFooterComponentStyle,
      ListHeaderComponent,
      onInternalScrollBeginDrag: fns.onScrollBeginDrag,
      onInternalScrollEnd: fns.onScrollEnd,
      onLayout,
      onLayoutFooter,
      onMomentumScrollEnd: fns.onMomentumScrollEnd,
      onScroll: onScrollHandler,
      recycleItems,
      refreshControl: refreshControlElement ? stylePaddingTopState > 0 ? React2__namespace.cloneElement(refreshControlElement, {
        progressViewOffset: ((_s = refreshControlElement.props.progressViewOffset) != null ? _s : 0) + stylePaddingTopState
      }) : refreshControlElement : onRefresh && /* @__PURE__ */ React2__namespace.createElement(
        ReactNative.RefreshControl,
        {
          onRefresh,
          progressViewOffset: (progressViewOffset || 0) + stylePaddingTopState,
          refreshing: !!refreshing
        }
      ),
      refScrollView: combinedRef,
      renderScrollComponent,
      scrollAdjustHandler: (_t = refState.current) == null ? void 0 : _t.scrollAdjustHandler,
      scrollEventThrottle: 0,
      snapToIndices,
      stickyHeaderIndices,
      style,
      useWindowScroll: useWindowScrollResolved
    }
  ), IS_DEV && ENABLE_DEBUG_VIEW);
});
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
  useStableRenderComponent,
  useStateContext
};

// src/react-native.ts
var LegendList3 = LegendListRuntime;
var internal2 = internal;

exports.LegendList = LegendList3;
exports.internal = internal2;
exports.useAdaptiveRender = useAdaptiveRender;
exports.useAdaptiveRenderChange = useAdaptiveRenderChange;
exports.useIsLastItem = useIsLastItem;
exports.useListScrollSize = useListScrollSize;
exports.useRecyclingEffect = useRecyclingEffect;
exports.useRecyclingState = useRecyclingState;
exports.useSyncLayout = useSyncLayout;
exports.useViewability = useViewability;
exports.useViewabilityAmount = useViewabilityAmount;
