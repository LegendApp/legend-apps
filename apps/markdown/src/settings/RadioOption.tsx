import { Pressable, StyleSheet, Text, View } from "react-native";
import { useResolveClassNames } from "uniwind";

export function RadioOption<Value extends string>({
  label,
  onSelect,
  selected,
  value,
}: {
  label: string;
  onSelect: (value: Value) => void;
  selected: boolean;
  value: Value;
}) {
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
      <Text className="text-foreground" style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  optionText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
