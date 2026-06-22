import { cn } from "@legend-desktop/classnames";
import { Pressable, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from "react-native";
import { useResolveClassNames } from "uniwind";

export type RadioOptionProps<Value extends string = string> = {
  label: string;
  onSelect: (value: Value) => void;
  selected: boolean;
  value: Value;
};

export function RadioOption<Value extends string = string>({
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

export type SegmentedOptionsProps<Value extends string> = {
  onChange: (value: Value) => void;
  options: readonly { label: string; value: Value }[];
  value: Value;
};

export function SegmentedOptions<Value extends string>({
  onChange,
  options,
  value,
}: SegmentedOptionsProps<Value>) {
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

export type SelectOption<Value extends string = string> = {
  label: string;
  value: Value;
};

export type SelectControlProps<Value extends string = string> = {
  accessibilityLabel?: string;
  onChange: (value: Value) => void;
  options: readonly SelectOption<Value>[];
  value: Value;
};

export function SelectControl<Value extends string = string>({
  accessibilityLabel,
  onChange,
  options,
  value,
}: SelectControlProps<Value>) {
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  const handlePress = async (event: GestureResponderEvent) => {
    const { pageX = 0, pageY = 0 } = event.nativeEvent;
    const { showContextMenu } = await import("@legend-desktop/context-menu");
    const selected = await showContextMenu(
      options.map((option) => ({
        id: option.value,
        title: option.value === value ? `* ${option.label}` : option.label,
      })),
      { x: pageX, y: pageY },
    );

    if (selected && options.some((option) => option.value === selected)) {
      onChange(selected as Value);
    }
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="h-9 min-w-56 flex-row items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 hover:bg-surface-muted active:bg-surface-muted"
      onPress={handlePress}
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
  onChange: (checked: boolean) => void;
};

export function SwitchControl({ accessibilityLabel, checked, onChange }: SwitchControlProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      className="flex-row items-center gap-2"
      onPress={() => onChange(!checked)}
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
