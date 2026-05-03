import "./global.css";

import { View } from "react-native";
import { App } from "@legend-desktop/app";

export default function ShellApp(props: Record<string, unknown>) {
  return (
    <View className="flex-1">
      <App {...props} />
    </View>
  );
}
