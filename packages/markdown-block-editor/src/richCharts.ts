import { parse } from "yaml";

export type ChartData = {
  type: "bar" | "line" | "pie";
  x: string[];
  series: { name: string; data: number[] }[];
  title?: string;
  unit?: string;
  stacked?: boolean;
};

export function parseChart(body: string): ChartData {
  const value: unknown = parse(body);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected an object");
  }
  const chart = value as Record<string, unknown>;
  if (chart.type !== "bar" && chart.type !== "line" && chart.type !== "pie") {
    throw new Error("type must be bar, line or pie");
  }
  if (!Array.isArray(chart.x) || chart.x.length === 0 || chart.x.some(label => typeof label !== "string")) {
    throw new Error("x must be a non-empty array of labels");
  }
  if (!Array.isArray(chart.series) || chart.series.length === 0) {
    throw new Error("series must be a non-empty array");
  }
  for (const [index, series] of chart.series.entries()) {
    if (!series || typeof series !== "object" || typeof series.name !== "string" || !series.name.trim()) {
      throw new Error(`series[${index}].name must be a non-empty string`);
    }
    if (!Array.isArray(series.data) || series.data.some((number: unknown) => typeof number !== "number" || !Number.isFinite(number))) {
      throw new Error(`series[${index}].data must contain only finite numbers`);
    }
    if (series.data.length !== chart.x.length) {
      throw new Error(`series[${index}].data length ${series.data.length} ≠ x length ${chart.x.length}`);
    }
  }
  for (const key of ["title", "unit"] as const) {
    if (chart[key] !== undefined && typeof chart[key] !== "string") {
      throw new Error(`${key} must be a string`);
    }
  }
  if (chart.stacked !== undefined && typeof chart.stacked !== "boolean") {
    throw new Error("stacked must be a boolean");
  }
  if (chart.stacked && chart.type !== "bar") {
    throw new Error("stacked is only supported for bar charts");
  }
  const result = chart as ChartData;
  if (result.type === "pie") {
    if (result.series.length !== 1) {
      throw new Error("pie requires exactly one series");
    }
    if (result.series[0]!.data.some(number => number < 0) || !result.series[0]!.data.some(number => number > 0)) {
      throw new Error("pie data must be non-negative with at least one positive value");
    }
  }
  if (result.stacked) {
    for (let index = 0; index < result.x.length; index++) {
      let positive = 0;
      let negative = 0;
      for (const series of result.series) {
        const number = series.data[index]!;
        if (number >= 0) positive += number;
        else negative += number;
      }
      if (!Number.isFinite(positive) || !Number.isFinite(negative)) {
        throw new Error(`stacked total at x[${index}] must be finite`);
      }
    }
  }
  return result;
}
