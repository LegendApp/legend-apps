import { getAppContext } from "@legendapp/spark/app";
import { useEffect, useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import { configurePhotosLaunch } from "./systems/launch";
const ready = getAppContext().then(context => {
  configurePhotosLaunch(context.launchArguments);
  return import("./App");
});
export function App() {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void ready.then(module => { if (active) setComponent(() => module.default); }, failure => { if (active) setError(String(failure)); });
    return () => { active = false; };
  }, []);
  return Component ? <Component /> : <View className="flex-1 items-center justify-center"><Text>{error ?? "Loading Photos…"}</Text></View>;
}
export default App;
