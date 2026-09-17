export type LayoutKind = "group" | "columns" | "stack" | "grid";
export type LayoutAlign = "start" | "center" | "end" | "stretch";
export type LayoutJustify = "start" | "center" | "end" | "between" | "around" | "evenly";
export type LayoutProps = {
  kind: LayoutKind;
  gap?: number;
  padding?: number;
  align?: LayoutAlign;
  justify?: LayoutJustify;
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  ratio?: string;
  columns?: number;
  className?: string;
};
export const layoutKinds = new Set(["group", "columns", "stack", "grid"]);
export const layoutAttributes = new Set(["gap", "padding", "align", "justify", "width", "height", "ratio", "columns", "class"]);

function nonNegative(value: string, key: string) {
  if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
    throw new Error(`${key} must be a non-negative number in slide units.`);
  }
  return Number(value);
}

export function columnWeights(ratio: string | undefined, count: number): number[] {
  if (ratio === undefined) return Array.from({ length: count }, () => 1);
  const weights = ratio.split(":").map((value) => nonNegative(value.trim(), "ratio"));
  if (weights.length !== count || weights.some((weight) => weight <= 0)) {
    throw new Error("ratio must contain one positive weight per column, such as 2:1.");
  }
  return weights;
}

export function parseLayoutProps(kind: LayoutKind, attributes: Record<string, string>): LayoutProps {
  const props: LayoutProps = { kind };
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "gap" || key === "padding") props[key] = nonNegative(value, key);
    else if (key === "width" || key === "height") {
      props[key] = value.endsWith("%") ? `${nonNegative(value.slice(0, -1), key)}%` : nonNegative(value, key);
    } else if (key === "align") {
      if (!["start", "center", "end", "stretch"].includes(value)) throw new Error("align must be start, center, end, or stretch.");
      props.align = value as LayoutAlign;
    } else if (key === "justify") {
      if (!["start", "center", "end", "between", "around", "evenly"].includes(value)) throw new Error("justify must be start, center, end, between, around, or evenly.");
      props.justify = value as LayoutJustify;
    } else if (key === "ratio") {
      if (kind !== "columns") throw new Error("ratio is only supported on columns.");
      columnWeights(value, value.split(":").length);
      props.ratio = value;
    } else if (key === "columns") {
      const count = nonNegative(value, key);
      if (kind !== "grid" || !Number.isInteger(count) || count < 1 || count > 12) throw new Error("grid columns must be an integer from 1 to 12.");
      props.columns = count;
    } else if (key === "class") props.className = value;
    else throw new Error(`Unknown layout attribute "${key}".`);
  }
  return props;
}

export function layoutOverflows(rect: { x: number; y: number; width: number; height: number }, bounds: { width: number; height: number }) {
  return rect.x < -1 || rect.y < -1 || rect.x + rect.width > bounds.width + 1 || rect.y + rect.height > bounds.height + 1;
}
