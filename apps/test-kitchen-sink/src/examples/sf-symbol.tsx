import { SFSymbol } from "@legend-apps/sf-symbol";
import { Text, View } from "react-native";
import { ExamplePanel, styles } from "./shared";

const sfSymbolExamples = [
  { color: "#2563eb", name: "music.note.list", scale: "large", size: 72 },
  { color: "#16a34a", name: "play.circle.fill", scale: "large", size: 64 },
  { color: "#dc2626", name: "heart.fill", scale: "medium", size: 56 },
  { color: "#9333ea", name: "sparkles", scale: "medium", size: 56 },
  { color: "#ea580c", name: "speaker.wave.2.fill", scale: "small", size: 48 },
  { color: "#0f766e", name: "waveform", scale: "small", size: 48 },
] as const;

export function SFSymbolExample() {
  return (
    <ExamplePanel title="SF Symbol">
      <View style={styles.symbolGrid}>
        {sfSymbolExamples.map((symbol) => (
          <View key={symbol.name} style={styles.symbolTile}>
            <SFSymbol color={symbol.color} name={symbol.name} scale={symbol.scale} size={symbol.size} />
            <Text style={styles.bodyText}>{symbol.name}</Text>
          </View>
        ))}
      </View>
    </ExamplePanel>
  );
}
