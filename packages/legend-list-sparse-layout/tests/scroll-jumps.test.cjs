const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createRequire } = require("node:module");

// Execute the actual vendored range/recycling code. Only platform surfaces are
// mocked; no sibling checkout or private fixture is required. Count operations,
// not wall time, so the regression is deterministic on slow CI machines too.
const bundlePath = resolve(__dirname, "../react-native.js");
function loadBundle(legacyTail = false) {
  let code = readFileSync(bundlePath, "utf8");
  const loop = "i < dataLength && !foundEnd";
  assert.ok(code.includes(loop));
  if (legacyTail) code = code.replace(loop, "i < dataLength && (!foundEnd || i <= globalThis.__oldBottom)");
  code = code.replace("function getLayoutOffsetForStore(store, index) {",
    "function getLayoutOffsetForStore(store, index) { globalThis.__reads++;");
  code += "\nexports.testAPI = { calculateItemsInView, ScheduledWork };";
  const native = {
    Platform: { OS: "macos", select: x => x.macos ?? x.native ?? x.default },
    Animated: { View() {}, Value: class { setValue() {} } }, View() {}, Text() {}, ScrollView() {},
    I18nManager: { isRTL: false },
    StyleSheet: { create: x => x, flatten: x => x, absoluteFillObject: {} },
    Dimensions: { get: () => ({ width: 900, height: 800 }) },
    PixelRatio: { get: () => 2, roundToNearestPixel: x => x },
    unstable_batchedUpdates: fn => fn(),
  };
  const localRequire = createRequire(bundlePath);
  const module = { exports: {} };
  global.__DEV__ = false;
  global.nativeFabricUIManager = {};
  global.requestAnimationFrame = cb => setTimeout(cb, 0);
  global.cancelAnimationFrame = clearTimeout;
  new Function("require", "module", "exports", code)(
    name => name === "react-native" ? native : localRequire(name), module, module.exports);
  return module.exports.testAPI;
}

function createContext(api, count, extraProps = {}) {
  const source = {
    getLength: () => count, getRevision: () => 0,
    getKey: i => String(i + 1), getItem: i => ({ id: String(i + 1) }), subscribe: () => () => {},
  };
  const state = {
    averageSizes: {}, containerItemGenerations: [], containerItemKeys: new Map(), containerItemMetadata: new Map(),
    idCache: [], indexByKey: new Map(), idsInView: [], sizes: new Map(), sizesKnown: new Map(),
    stickyContainerPool: new Set(), stickyContainers: new Map(), scrollHistory: [],
    enableScrollForNextCalculateItemsInView: true, scroll: 0, scrollPrev: 0, scrollTime: 0,
    scrollLength: 800, otherAxisSize: 900, totalSize: count * 23, nativeMarginTop: 0,
    endBuffered: 0, endNoBuffer: 0, startBuffered: 0, startNoBuffer: 0,
    scheduledWork: new api.ScheduledWork(), refScroller: { current: null },
    scrollAdjustHandler: { getAdjust: () => 0, requestAdjust() {}, setMounted() {} },
    props: {
      data: [], dataSource: source, estimatedItemSize: 23, drawDistance: 250, recycleItems: true,
      hasReliableKeyExtractor: true, keyExtractor: item => item.id, numColumns: 1,
      alwaysRenderIndicesArr: [], alwaysRenderIndicesSet: new Set(),
      stickyHeaderIndicesArr: [], stickyHeaderIndicesSet: new Set(),
      maintainVisibleContentPosition: { data: true, size: true },
      maintainScrollAtEnd: { enabled: false }, stylePaddingTop: 0, ...extraProps,
    },
  };
  const values = new Map(Object.entries({
    headerSize: 0, numColumns: 1, numContainers: 40, stylePaddingTop: 0,
    readyToRender: true, alignItemsAtEndPadding: 0, scrollAdjustPending: 0,
    activeStickyIndex: -1, totalSize: count * 23, scrollAdjust: 0,
  }));
  return {
    state, values, listeners: new Map(), positionListeners: new Map(), viewRefs: new Map(),
    containerLayoutTriggers: new Map(), scrollAxisGap: 0, contextNum: 0,
    mapViewabilityAmountCallbacks: new Map(), mapViewabilityAmountValues: new Map(),
    mapViewabilityCallbacks: new Map(), mapViewabilityConfigStates: new Map(), mapViewabilityValues: new Map(),
    animatedScrollY: { setValue() {} },
  };
}

function jump(api, ctx, line, offset = line * 23) {
  const previous = ctx.state.scroll;
  ctx.state.scroll = offset;
  ctx.state.scrollForNextCalculateItemsInView = undefined;
  global.__reads = 0;
  api.calculateItemsInView(ctx, { scrollVelocity: offset < previous ? -1000 : 1000, drawDistanceMode: "visible-first" });
  const reads = global.__reads;
  assert.equal(ctx.state.startNoBuffer, line);
  for (let i = ctx.state.startBuffered; i <= ctx.state.endBuffered; i++) {
    const key = String(i + 1);
    const container = ctx.state.containerItemKeys.get(key);
    assert.notEqual(container, undefined, `Row ${i} must have a recycled container`);
    assert.equal(ctx.values.get(`containerItemIndex${container}`), i);
    assert.equal(ctx.values.get(`containerItemData${container}`).id, key);
  }
  return reads;
}

test("far scrollbar jumps stay viewport-sized in both directions", () => {
  const api = loadBundle();
  for (const count of [30000, 273504, 1000000]) {
    const ctx = createContext(api, count);
    try {
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const line of [1000, count - 100, 1000, Math.floor(count / 2), 0]) {
          assert.ok(jump(api, ctx, line) < 250, "Jump must not traverse skipped rows");
          assert.equal(ctx.state.endNoBuffer, line + 34);
        }
      }
    } finally { ctx.state.scheduledWork.dispose(); }
  }
});

test("the old tail condition fails the operation bound", () => {
  const api = loadBundle(true), ctx = createContext(api, 273504);
  try {
    global.__oldBottom = 0;
    jump(api, ctx, 1000);
    jump(api, ctx, 250000);
    global.__oldBottom = ctx.state.endBuffered;
    assert.ok(jump(api, ctx, 1000) > 249000);
  } finally { ctx.state.scheduledWork.dispose(); }
});

test("jumps preserve measured variable heights and later remeasurement", () => {
  const api = loadBundle(), ctx = createContext(api, 273504);
  try {
    jump(api, ctx, 1000);
    const store = ctx.state.layoutStoreRuntime.store;
    // Wrapped logical lines may occupy several visual rows. Use measured sizes,
    // not getFixedItemSize, just like SourceDocumentEditor's wrapping mode.
    for (const [line, size] of [[50, 230], [1000, 92], [1001, 69], [250000, 138], [250001, 46]]) {
      store.setMeasuredSize(line, size);
      ctx.state.sizesKnown.set(String(line + 1), size);
      ctx.state.sizes.set(String(line + 1), size);
    }
    ctx.state.totalSize = store.getTotalSize();
    ctx.values.set("totalSize", store.getTotalSize());
    for (const line of [250000, 1000, 250000, 0, 1000]) {
      const offset = store.getOffset(line);
      const expectedEnd = store.findIndexRangeAtOffsets(offset, offset + 799).end;
      assert.ok(jump(api, ctx, line, offset) < 250);
      assert.equal(ctx.state.endNoBuffer, expectedEnd);
    }
    store.setMeasuredSize(1000, 230);
    ctx.state.sizesKnown.set("1001", 230);
    ctx.state.sizes.set("1001", 230);
    ctx.state.totalSize = store.getTotalSize();
    ctx.values.set("totalSize", store.getTotalSize());
    jump(api, ctx, 250000, store.getOffset(250000));
    assert.ok(jump(api, ctx, 1000, store.getOffset(1000)) < 250);
  } finally { ctx.state.scheduledWork.dispose(); }
});

test("sticky, always-rendered and pinned rows stay assigned without scanning their gaps", () => {
  const api = loadBundle(), ctx = createContext(api, 273504, {
    alwaysRenderIndicesArr: [200000], alwaysRenderIndicesSet: new Set([200000]),
    stickyHeaderIndicesArr: [0, 150000], stickyHeaderIndicesSet: new Set([0, 150000]),
  });
  ctx.state.scrollTargetPinnedRange = { start: 230000, end: 230002 };
  try {
    for (const line of [1000, 250000, 1000, 250000, 0]) {
      assert.ok(jump(api, ctx, line) < 300);
      const sticky = line >= 150000 ? 150000 : 0;
      assert.equal(ctx.values.get("activeStickyIndex"), sticky);
      for (const pinned of [sticky, 200000, 230000, 230001, 230002]) {
        const container = ctx.state.containerItemKeys.get(String(pinned + 1));
        assert.notEqual(container, undefined, `Pinned row ${pinned}`);
        assert.equal(ctx.values.get(`containerItemIndex${container}`), pinned);
      }
    }
  } finally { ctx.state.scheduledWork.dispose(); }
});

test("all shipped entrypoints use the same bounded scan", () => {
  for (const name of ["react-native.js", "react-native.mjs", "react-native.web.js", "react-native.web.mjs", "react.js", "react.mjs"]) {
    const code = readFileSync(resolve(__dirname, "..", name), "utf8");
    assert.ok(code.includes("i < dataLength && !foundEnd"), name);
    assert.ok(!code.includes("maxIndexRendered"), name);
  }
});
