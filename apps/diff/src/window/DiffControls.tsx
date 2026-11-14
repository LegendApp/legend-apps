import { Button } from "@legendapp/spark/ui";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { diffSymbolColors, diffSystemColor } from "./diffSystemColors";

// Spark's native NSButton has no intrinsic width, so size it from its title.
export function DiffButton({ title, label = title, onPress, disabled = false, variant }: {
  title: string; label?: string; onPress: () => void; disabled?: boolean; variant?: "default" | "borderless";
}) {
  return <Button accessibilityLabel={title} disabled={disabled} onPress={onPress} variant={variant} style={{ width: Math.max(64, Math.ceil(label.length * 7) + 28), height: 24 }}>{label}</Button>;
}

// Matches Spark's NSSegmentedControl, which gives each segment max(64, label + 28) points.
export function segmentedControlWidth(labels: readonly string[]) {
  return labels.reduce((width, label) => width + Math.max(64, Math.ceil(label.length * 7) + 28), 0);
}

// Spark has no native checkbox yet; this mirrors NSButton's checkbox with SF Symbols.
export function DiffCheckbox({ label, accessibilityLabel = label, checked, onChange, color, detail, detailColor }: {
  label: string; accessibilityLabel?: string; checked: boolean; onChange: (checked: boolean) => void; color: string; detail?: string; detailColor?: string;
}) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked }} onPress={() => onChange(!checked)} className="flex-row gap-2">
    <SFSymbol color={checked ? diffSymbolColors.accent : color} name={checked ? "checkmark.square.fill" : "square"} size={14} style={{ marginTop: 2 }} />
    <View className="flex-1"><Text style={{ color, fontSize: 13 }}>{label}</Text>{detail ? <Text style={{ color: detailColor ?? color, fontSize: 11 }}>{detail}</Text> : null}</View>
  </Pressable>;
}

// An inline notice: a system symbol beside its content, set off by a separator instead of a box.
export function DiffNotice({ symbol, symbolColor, children }: { symbol: string; symbolColor: string; children: ReactNode }) {
  return <View className="flex-row gap-3 py-3" style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: diffSystemColor("separatorColor") }}>
    <SFSymbol color={symbolColor} name={symbol} size={16} style={{ marginTop: 1 }} />
    <View className="flex-1 gap-2">{children}</View>
  </View>;
}
