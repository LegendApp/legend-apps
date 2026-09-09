import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

// Exercise the shipped container's memoization without mounting a ScrollView.
// Retained source rows deliberately keep their object identity after a splice.
test.each(["react-native.js", "react-native.mjs", "react-native.web.js", "react-native.web.mjs", "react.js", "react.mjs"])(
  "%s refreshes retained rows when their assigned index changes", (bundle) => {
    const source = readFileSync(resolve(__dirname, "../../../legend-list-sparse-layout", bundle), "utf8");
    const start = source.indexOf("var Container = typedMemo(");
    const end = source.indexOf("// src/components/ContainerSlot", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    let cursor = 0;
    const slots: { deps: unknown[]; value: unknown }[] = [];
    const react = {
      useRef: () => ({ current: null }),
      useMemo: (compute: () => unknown, deps: unknown[]) => {
        const index = cursor++;
        const previous = slots[index];
        if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
          slots[index] = { deps, value: compute() };
        }
        return slots[index].value;
      },
      createElement: () => null,
    };
    const signals = new Map<string, unknown>([
      ["containerItemIndex0", 3], ["containerItemData0", { id: "four" }],
    ]);
    const subscriptions = new Set<string>();
    const context = {
      ...react,
      React: react, React2: react, React3: react, React2__namespace: react, React3__namespace: react, React__namespace: react,
      typedMemo: (value: unknown) => value,
      useStateContext: () => ({ state: { props: {} }, viewRefs: new Map() }),
      isHorizontalRTL: () => false,
      useArr$: (keys: string[]) => keys.map((key) => { subscriptions.add(key); return signals.get(key); }),
      useContainerMeasurement: () => ({}),
      getContainerPositionStyle: () => ({}),
      PositionView: null, PositionViewSticky: null, ContextContainer: { Provider: null },
    };
    const render = runInNewContext(`${source.slice(start, end)}\nContainer`, context);
    const getRenderedItem = jest.fn(() => ({ renderedItem: signals.get("containerItemIndex0") }));
    const props = { id: 0, itemKey: "four", recycleItems: true, getRenderedItem };
    const draw = () => { cursor = 0; render(props); };
    draw();
    draw();
    expect(getRenderedItem).toHaveBeenCalledTimes(1);
    expect(subscriptions.has("containerItemIndex0")).toBe(true);
    signals.set("containerItemIndex0", 4); // insert a line before the retained row
    draw();
    expect(getRenderedItem).toHaveBeenCalledTimes(2);
    signals.set("containerItemIndex0", 3); // undo the insertion
    draw();
    expect(getRenderedItem).toHaveBeenCalledTimes(3);
  },
);
