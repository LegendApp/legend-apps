import { SelectControl } from "@legend-apps/design-system";
import { grammarLanguageOptions } from "@legend-apps/syntax-parser";
import { View } from "react-native";

const options = [
  { label: "Automatic", value: "auto" },
  { label: "Plain text", value: "" },
  ...grammarLanguageOptions,
];

export function SourceLanguageSelector({ value, onChange }: { value: string; onChange: (language: string) => void }) {
  return <View className="items-end px-2 py-1">
    <SelectControl accessibilityLabel="Syntax language" options={options} value={value} onChange={onChange} />
  </View>;
}
