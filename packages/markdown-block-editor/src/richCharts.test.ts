// @ts-expect-error Bun's test runtime is not included in the app's TypeScript types.
import { describe, expect, test } from "bun:test";
import { parseChart } from "./richCharts";

const valid = { type: "bar", x: ["Mon", "Tue"], series: [{ name: "macOS", data: [12, 19] }] };

describe("parseChart", () => {
  test("reads JSON and YAML including chart options", () => {
    expect(parseChart(JSON.stringify(valid))).toEqual(valid);
    expect(parseChart(`
type: bar
title: Weekly installs
unit: installs
stacked: true
x: [Mon, Tue]
series:
  - name: macOS
    data: [12, -19]
  - name: iOS
    data: [4, 8]
`)).toEqual({ ...valid, title: "Weekly installs", unit: "installs", stacked: true, series: [
      { name: "macOS", data: [12, -19] }, { name: "iOS", data: [4, 8] },
    ] });
  });

  test.each(["bar", "line", "pie"])("accepts %s", (type: string) => {
    expect(parseChart(JSON.stringify({ ...valid, type })).type).toBe(type);
  });

  test("reports unequal series lengths for the code fallback", () => {
    expect(() => parseChart(JSON.stringify({ ...valid, series: [{ name: "macOS", data: [12] }] })))
      .toThrow("series[0].data length 1 ≠ x length 2");
  });

  test.each([
    ["null", "expected an object"],
    ["[]", "expected an object"],
    ["type: scatter", "type must be bar, line or pie"],
    [JSON.stringify({ ...valid, x: [] }), "x must be a non-empty array of labels"],
    [JSON.stringify({ ...valid, x: [1, 2] }), "x must be a non-empty array of labels"],
    [JSON.stringify({ ...valid, series: [] }), "series must be a non-empty array"],
    [JSON.stringify({ ...valid, series: [{ name: "", data: [1, 2] }] }), "series[0].name must be a non-empty string"],
    [JSON.stringify({ ...valid, series: [{ name: "a", data: [1, "2"] }] }), "series[0].data must contain only finite numbers"],
    [JSON.stringify({ ...valid, title: 1 }), "title must be a string"],
    [JSON.stringify({ ...valid, unit: 1 }), "unit must be a string"],
    [JSON.stringify({ ...valid, stacked: "yes" }), "stacked must be a boolean"],
    [JSON.stringify({ ...valid, type: "line", stacked: true }), "stacked is only supported for bar charts"],
  ])("rejects invalid body %s", (body: string, error: string) => {
    expect(() => parseChart(body)).toThrow(error);
  });

  test.each([".nan", ".inf", "-.inf"])("rejects non-finite YAML numbers %s", (number: string) => {
    expect(() => parseChart(`type: line\nx: [Mon]\nseries: [{name: macOS, data: [${number}]}]`))
      .toThrow("series[0].data must contain only finite numbers");
  });

  test("requires one pie series with non-negative, nonzero data", () => {
    expect(() => parseChart(JSON.stringify({ ...valid, type: "pie", series: [...valid.series, ...valid.series] })))
      .toThrow("pie requires exactly one series");
    for (const data of [[-1, 2], [0, 0]]) {
      expect(() => parseChart(JSON.stringify({ ...valid, type: "pie", series: [{ name: "macOS", data }] })))
        .toThrow("pie data must be non-negative with at least one positive value");
    }
  });

  test("rejects overflowing stacked totals", () => {
    expect(() => parseChart(JSON.stringify({ ...valid, stacked: true, series: [
      { name: "macOS", data: [1e308, 0] }, { name: "iOS", data: [1e308, 0] },
    ] }))).toThrow("stacked total at x[0] must be finite");
  });

  test("rejects malformed YAML and duplicate keys", () => {
    expect(() => parseChart("type: bar\nx: [" )).toThrow();
    expect(() => parseChart("type: bar\ntype: line")).toThrow();
  });
});
