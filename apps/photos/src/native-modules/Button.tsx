import { Button as SparkButton } from "@legendapp/spark/ui";
import type { ViewStyle } from "react-native";
export interface ButtonProps {
  title: string; bezelStyle?: "rounded" | "regular" | "textured" | "disclosure";
  controlSize?: "mini" | "small" | "regular" | "large"; onPress?: () => void; style?: ViewStyle; testID?: string;
}
export function Button({ title, onPress, style, testID }: ButtonProps) {
  return <SparkButton onPress={onPress} style={[{ minWidth: 100, height: 30 }, style]} testID={testID}>{title}</SparkButton>;
}
