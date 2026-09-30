import { SegmentedControl as SparkSegmentedControl } from "@legendapp/spark/ui";
export function SegmentedControl<T extends string>({options, selectedValue, onValueChange, labelExtractor, size = "regular"}: {
  options: readonly T[]; selectedValue: T; onValueChange: (value: T) => void; labelExtractor?: (value: T) => string; size?: "regular" | "small" | "mini" | "large";
}) {
  return <SparkSegmentedControl options={options.map(value => ({value, label: labelExtractor?.(value) ?? value}))}
    value={selectedValue} onValueChange={value => onValueChange(value as T)} style={{height: size === "mini" ? 20 : 28}} />;
}
