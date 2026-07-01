import { cn } from "@legend-desktop/classnames";
import { showContextMenu } from "@legend-desktop/context-menu";
import { NativeSegmentedControl, NativeSelect } from "@legend-desktop/native-select";
import { useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from "react-native";
import { useResolveClassNames } from "uniwind";

type OptionValue = string | number;

export type RadioOptionProps<Value extends OptionValue = string> = {
  label: string;
  onSelect: (value: Value) => void;
  selected: boolean;
  value: Value;
};

export function RadioOption<Value extends OptionValue = string>({
  label,
  onSelect,
  selected,
  value,
}: RadioOptionProps<Value>) {
  const selectedStyle = useResolveClassNames(selected ? "border-primary bg-surface-muted" : "border-border bg-surface");
  const indicatorStyle = useResolveClassNames(selected ? "border-primary bg-primary" : "border-border bg-surface");

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      className="flex-row items-center gap-3 rounded-md border px-3 py-2"
      onPress={() => onSelect(value)}
      style={selectedStyle}
    >
      <View className="h-3 w-3 rounded-full border" style={indicatorStyle} />
      <Text className="text-foreground" style={styles.radioOptionText}>{label}</Text>
    </Pressable>
  );
}

export type SegmentedOptionsProps<Value extends OptionValue> = {
  onChange: (value: Value) => void;
  options: readonly { label: string; value: Value }[];
  value: Value;
};

function getNativeSegmentedControlWidth(options: readonly { label: string }[]) {
  return options.reduce((width, option) => width + Math.max(64, option.label.length * 8 + 28), 0);
}

export function SegmentedOptions<Value extends OptionValue>({
  onChange,
  options,
  value,
}: SegmentedOptionsProps<Value>) {
  const nativeSegments = useMemo(() => options.map((option, index) => ({
    label: option.label,
    value: String(index),
  })), [options]);
  const nativeSelectedIndex = options.findIndex((option) => option.value === value);
  const nativeValue = nativeSelectedIndex >= 0 ? String(nativeSelectedIndex) : "";
  const handleNativeChange = useCallback((nextValue: string) => {
    const selected = options[Number(nextValue)];
    if (selected) {
      onChange(selected.value);
    }
  }, [onChange, options]);
  const nativeWidth = useMemo(() => getNativeSegmentedControlWidth(options), [options]);

  if (Platform.OS === "macos") {
    return (
      <NativeSegmentedControl
        onChange={handleNativeChange}
        segments={nativeSegments}
        style={[styles.nativeSegmentedControl, { width: nativeWidth }]}
        value={nativeValue}
      />
    );
  }

  return (
    <View className="flex-row overflow-hidden rounded-md border border-border bg-surface">
      {options.map((option) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === value }}
          className={cn(
            "h-8 justify-center px-3",
            option.value === value ? "bg-surface-muted" : "hover:bg-surface-muted",
          )}
          key={option.value}
          onPress={() => onChange(option.value)}
        >
          <Text className="text-foreground" style={styles.segmentedOptionText}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export type SelectOption<Value extends OptionValue = string> = {
  label: string;
  value: Value;
};

export type SelectControlProps<Value extends OptionValue = string> = {
  accessibilityLabel?: string;
  disabled?: boolean;
  onChange: (value: Value) => void;
  options: readonly SelectOption<Value>[];
  value: Value;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getContextMenuLocation(event: GestureResponderEvent) {
  const { locationX, locationY, pageX, pageY } = event.nativeEvent;

  if (finiteNumber(pageX) && finiteNumber(pageY)) {
    return Promise.resolve({ x: pageX, y: pageY });
  }

  return new Promise<{ x: number; y: number }>((resolve) => {
    event.currentTarget.measure((_x, _y, width, height, measuredPageX, measuredPageY) => {
      const localX = finiteNumber(locationX) ? locationX : Math.max(0, width - 1);
      const localY = finiteNumber(locationY) ? locationY : Math.max(0, height - 1);
      const originX = finiteNumber(measuredPageX) ? measuredPageX : 0;
      const originY = finiteNumber(measuredPageY) ? measuredPageY : 0;

      resolve({
        x: originX + localX,
        y: originY + localY,
      });
    });
  });
}

export function SelectControl<Value extends OptionValue = string>({
  accessibilityLabel,
  disabled = false,
  onChange,
  options,
  value,
}: SelectControlProps<Value>) {
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const nativeOptions = useMemo(() => options.map((option) => ({
    label: option.label,
    value: String(option.value),
  })), [options]);
  const nativeValue = String(value);
  const handleNativeChange = useCallback((nextValue: string) => {
    const selected = options.find((option) => String(option.value) === nextValue);
    if (selected) {
      onChange(selected.value);
    }
  }, [onChange, options]);

  const handlePress = async (event: GestureResponderEvent) => {
    if (!disabled) {
      const location = await getContextMenuLocation(event);
      const selected = await showContextMenu(
        options.map((option) => ({
          id: String(option.value),
          title: option.value === value ? `* ${option.label}` : option.label,
        })),
        location,
      );
      const selectedOption = selected ? options.find((option) => String(option.value) === selected) : null;
      if (selectedOption) {
        onChange(selectedOption.value);
      }
    }
  };

  if (Platform.OS === "macos") {
    return (
      <NativeSelect
        accessibilityLabel={accessibilityLabel}
        enabled={!disabled}
        onChange={handleNativeChange}
        options={nativeOptions}
        style={styles.nativeSelect}
        value={nativeValue}
      />
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="h-9 min-w-56 flex-row items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 hover:bg-surface-muted active:bg-surface-muted"
      disabled={disabled}
      onPress={handlePress}
      style={disabled ? styles.disabled : null}
    >
      <Text className="min-w-0 flex-1 text-foreground" numberOfLines={1} style={styles.selectText}>
        {selectedOption?.label ?? value}
      </Text>
      <Text className="text-text-secondary" selectable={false} style={styles.selectChevron}>
        v
      </Text>
    </Pressable>
  );
}

export type SwitchControlProps = {
  accessibilityLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export function SwitchControl({ accessibilityLabel, checked, disabled = false, onChange }: SwitchControlProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      className="flex-row items-center gap-2"
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={disabled ? styles.disabled : null}
    >
      <View
        className={cn(
          "h-5 w-5 items-center justify-center rounded-md border",
          checked ? "border-primary bg-primary" : "border-border bg-surface",
        )}
      >
        {checked ? <View className="h-2 w-2 rounded-sm bg-foreground" /> : null}
      </View>
    </Pressable>
  );
}

export type ColorValueInputProps = {
  label?: string;
  onChange: (value: string) => void;
  value: string;
};

export function ColorValueInput({ label, onChange, value }: ColorValueInputProps) {
  return (
    <View className="w-44">
      <View className="mb-2 flex-row items-center justify-end gap-2">
        {label ? <Text className="text-sm font-medium text-foreground">{label}</Text> : null}
        <View
          className="h-5 w-5 rounded border border-border"
          style={{ backgroundColor: value || "transparent" }}
        />
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="#101014cc"
        autoCapitalize="none"
        autoCorrect={false}
        className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-foreground"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.6,
  },
  nativeSelect: {
    height: 28,
    minWidth: 180,
  },
  nativeSegmentedControl: {
    height: 28,
  },
  radioOptionText: {
    fontSize: 13,
    fontWeight: "500",
  },
  segmentedOptionText: {
    fontSize: 13,
  },
  selectChevron: {
    fontSize: 11,
    fontWeight: "700",
  },
  selectText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
