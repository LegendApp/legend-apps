// @ts-nocheck Verify caller geometry and values without rendering native surfaces.
import { expect, mock, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
mock.module("@legend-apps/presentation", () => ({
  ScenePositionView: "position", SceneMotionView: "motion", SharedElement: "shared",
  useSharedElementEntrance: () => false, usePlaybackTween: target => ({ value: target }),
}));
mock.module("../packs/charts/ChartBar", () => ({ ChartBar: "chart-bar" }));
const { BarRow } = await import("../packs/charts/BarRow");

test("arbitrary chart values, labels and sizes retain their caller-owned shared IDs", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  try {
    for (const width of [1000, 1696]) {
      const layout = { width, labelWidth: width * 0.2, barLeft: width * 0.22, barWidth: width * 0.65, valueWidth: width * 0.1 };
      const row = (value, grouped = false) => <BarRow id="response-time" name="My service" value={value} maximum={0.5}
        valueLabel={`${value * 1000} µs`} y={100} layout={layout} grouped={grouped} groupColor="#ffcc00" tintText />;
      await act(() => { tree = create(row(0.25)); });
      const shared = id => tree.root.findAllByType("shared").find(node => node.props.id === `response-time-${id}`);
      expect(shared("bar").props.style.width).toBe(width * 0.325);
      expect(shared("label").props.style.width).toBe(width * 0.2);
      expect(tree.root.findByType("position").props.style.width).toBe(width);
      const label = shared("label");
      await act(() => tree.update(row(0.5, true)));
      expect(shared("bar").props.style.width).toBe(width * 0.65);
      expect(shared("label")).toBe(label);
      expect(shared("value").findAllByType("text").map(node => node.props.children)).toEqual(["500 µs", "500 µs"]);
      await act(() => tree.unmount());
    }
  } finally { await act(() => tree?.unmount()); }
});
