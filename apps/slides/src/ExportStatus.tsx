import { useValue } from "@legendapp/state/react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { cancelWebExport, webExport$ } from "./webExport";

export function ExportStatus() {
  const status = useValue(webExport$.status), message = useValue(webExport$.message), warnings = useValue(webExport$.warnings);
  const step = useValue(webExport$.step), steps = useValue(webExport$.steps), label = useValue(webExport$.label);
  if (status === "idle" || status === "choosing") return null;
  const exporting = status === "exporting";
  return <View className="absolute left-4 right-4 top-4 z-20 gap-2 rounded-lg bg-[#20242c] p-4">
    <ScrollView style={{ maxHeight: 240 }}>
    <Text selectable className="text-sm" style={{ color: status === "error" ? "#fca5a5" : "#fafafa" }}>
      {exporting ? `Exporting HTML… ${label}${steps ? ` (${step + 1} of ${steps})` : ""}` : message}
    </Text>
    {status === "done" && warnings.map(warning => <Text key={warning} selectable className="text-xs text-[#fde68a]">{warning}</Text>)}
    </ScrollView>
    {exporting && <View accessibilityRole="progressbar" accessibilityLabel={label}
      accessibilityValue={steps ? { min: 0, max: steps, now: step } : undefined} className="h-1 rounded bg-[#303948]">
      <View className="h-1 rounded bg-[#7dd3fc]" style={{ width: `${steps ? step / steps * 100 : 0}%` }} />
    </View>}
    <Pressable accessibilityRole="button" accessibilityLabel={exporting ? "Cancel HTML Export" : "Dismiss Export Status"}
      onPress={exporting ? cancelWebExport : () => webExport$.status.set("idle")}>
      <Text className="text-[#a5b4fc]">{exporting ? "Cancel" : "Dismiss"}</Text>
    </Pressable>
  </View>;
}
