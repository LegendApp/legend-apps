import "./global.css";

import { View } from "react-native";
import { App } from "@legend-apps/app";
import { appLaunchArguments } from "./launchArguments";

export default function ShellApp(props: Record<string, unknown>) {
  const launchArguments = appLaunchArguments(props.launchArguments);
  return (
    <View className="flex-1">
      <App {...props} launchArguments={launchArguments} />
    </View>
  );
}
