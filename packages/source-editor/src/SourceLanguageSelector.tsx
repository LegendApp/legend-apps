import { SelectControl } from "@legend-apps/design-system";
import { grammarLanguageOptions } from "@legend-apps/syntax-parser";
import { View } from "react-native";

const options = [
  { label: "Automatic", value: "auto" },
  { label: "Plain text", value: "" },
  ...grammarLanguageOptions,
];

export function SourceLanguageSelector({ value, onChange }: { value: string; onChange: (language: string) => void }) {
  // Keep the override available without reserving a full-width footer below the text viewport.
  return <View className="absolute bottom-1 right-10 z-20" pointerEvents="box-none">
    <SelectControl accessibilityLabel="Syntax language" options={options} value={value} onChange={onChange} />
  </View>;
}
