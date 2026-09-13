import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Text } from "react-native";
import { useValue } from "@legendapp/state/react";
import { useVirtualizedDocumentRows, type VirtualizedDocumentRowsState } from "@legend-apps/virtualized-document";

jest.mock("@legendapp/list/react-native", () => ({}));

it("isolates metadata consumers and rejects requests from a replaced document session", () => {
  type Rows = VirtualizedDocumentRowsState<string, string, number>;
  let rows!: Rows;
  let ownerRenders = 0;
  let styleRenders = 0;
  let timingRenders = 0;
  let result: { styles?: string[]; timing?: number } = { timing: 2 };
  const requestRows = jest.fn(() => result);
  const first = { document: { id: 1 }, itemCount: 4, initialRows: [], styles: ["red"], timing: 1 };
  function Style({ rows }: { rows: Rows }) {
    styleRenders++;
    return <Text>{useValue(rows.styles$).join(",")}</Text>;
  }
  function Timing({ rows }: { rows: Rows }) {
    timingRenders++;
    return <Text>{useValue(rows.timing$)}</Text>;
  }
  function Owner({ snapshot }: { snapshot: typeof first }) {
    ownerRenders++;
    rows = useVirtualizedDocumentRows({ snapshot, requestRows });
    return <><Style rows={rows} /><Timing rows={rows} /></>;
  }
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<Owner snapshot={first} />); });
  const initialCounts = [ownerRenders, styleRenders, timingRenders];
  const original = rows;
  act(() => rows.requestRange(0, 3));
  expect([ownerRenders, styleRenders, timingRenders]).toEqual([initialCounts[0], initialCounts[1], initialCounts[2]! + 1]);
  expect(rows).toBe(original);
  result = { styles: ["blue"] };
  act(() => rows.requestRange(0, 3));
  expect(rows.styles$.peek()).toEqual(["blue"]);
  expect(rows.timing$.peek()).toBe(2);
  expect(ownerRenders).toBe(initialCounts[0]);
  act(() => renderer.update(<Owner snapshot={{ ...first, document: { id: 2 } }} />));
  expect(rows.dataVersion).toBeGreaterThan(original.dataVersion);
  expect(rows.itemIndexes).toBe(original.itemIndexes);
  expect(rows.styles$.peek()).toEqual(["red"]);
  const called = requestRows.mock.calls.length;
  act(() => original.requestRange(0, 3));
  expect(requestRows).toHaveBeenCalledTimes(called);
  act(() => renderer.unmount());
  rows.requestRange(0, 3);
  expect(requestRows).toHaveBeenCalledTimes(called);
});
