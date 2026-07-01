import { createElement, memo, useCallback, useMemo } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import NativeSelectNativeComponent, {
  type NativeSelectChangeEvent,
} from "./NativeSelectNativeComponent";
import NativeSegmentedControlNativeComponent, {
  type NativeSegmentedControlChangeEvent,
} from "./NativeSegmentedControlNativeComponent";

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

export type NativeSegmentedControlSegment = {
  label: string;
  value: string;
};

export interface NativeSegmentedControlProps extends Omit<ViewProps, "children"> {
  enabled?: boolean;
  onChange: (value: string) => void;
  segments: readonly NativeSegmentedControlSegment[];
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

export const NativeSegmentedControl = memo(function NativeSegmentedControl({
  enabled = true,
  onChange,
  segments,
  value,
  ...props
}: NativeSegmentedControlProps) {
  const segmentsJson = useMemo(() => JSON.stringify(segments), [segments]);
  const handleChange = useCallback((event: NativeSyntheticEvent<NativeSegmentedControlChangeEvent>) => {
    onChange(event.nativeEvent.value);
  }, [onChange]);

  return createElement(NativeSegmentedControlNativeComponent, {
    enabled,
    onValueChange: handleChange,
    segmentsJson,
    value,
    ...props,
  });
});

export { NativeSelectNativeComponent };
export { NativeSegmentedControlNativeComponent };
export type { NativeSelectChangeEvent, NativeSegmentedControlChangeEvent };
