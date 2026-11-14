import { Pressable, Text } from "react-native";

export function WorkflowAction({ title, onPress, disabled = false, color }: { title: string; onPress: () => void; disabled?: boolean; color: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} className="rounded border px-3 py-1" style={{ borderColor: color, opacity: disabled ? 0.4 : 1 }}><Text style={{ color, fontSize: 12 }}>{title}</Text></Pressable>;
}
