import { createElement, memo, useCallback, useMemo } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import NativeSelectNativeComponent, {
  type NativeSelectChangeEvent,
} from "./NativeSelectNativeComponent";

export type NativeSelectOption = {
  label: string;
  value: string;
};

export interface NativeSelectProps extends Omit<ViewProps, "children"> {
  enabled?: boolean;
  onChange: (value: string) => void;
  options: readonly NativeSelectOption[];
  value: string;
}

export const NativeSelect = memo(function NativeSelect({
  enabled = true,
  onChange,
  options,
  value,
  ...props
}: NativeSelectProps) {
  const itemsJson = useMemo(() => JSON.stringify(options), [options]);
  const handleChange = useCallback((event: NativeSyntheticEvent<NativeSelectChangeEvent>) => {
    onChange(event.nativeEvent.value);
  }, [onChange]);

  return createElement(NativeSelectNativeComponent, {
    enabled,
    itemsJson,
    onValueChange: handleChange,
    value,
    ...props,
  });
});

export { NativeSelectNativeComponent };
export type { NativeSelectChangeEvent };
