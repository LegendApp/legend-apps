import { NativeSegmentedControl } from "@legendapp/spark/ui/select-controls";
export function SegmentedControl<T extends string>({options, selectedValue, onValueChange, labelExtractor, size = "regular"}: {
  options: readonly T[]; selectedValue: T; onValueChange: (value: T) => void; labelExtractor?: (value: T) => string; size?: "regular" | "small" | "mini" | "large";
}) {
  return <NativeSegmentedControl segments={options.map(value => ({value, label: labelExtractor?.(value) ?? value}))}
    value={selectedValue} onChange={value => onValueChange(value as T)} style={{height: size === "mini" ? 20 : 28}} />;
}
