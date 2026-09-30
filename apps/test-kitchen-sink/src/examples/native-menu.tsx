import { useMenu } from "@legendapp/spark/menus";
import { useState } from "react";
import { Text } from "react-native";
import { ExamplePanel, styles } from "./shared";
export function NativeMenuExample() {
 const [lastAction, setLastAction] = useState("Choose Sample Menu from the native menu bar."), [checked, setChecked] = useState(false);
 useMenu({ id: "kitchen-sink-native-menu", items: [{ type: "submenu", id: "sample", label: "Sample", placement: { before: { menu: "window" } }, items: [{ type: "action", id: "primary", label: "Primary Action" }, { type: "separator" }, { type: "checkbox", id: "toggle", label: checked ? "Toggle State On" : "Toggle State Off", checked }] }], onAction(action) {
  setLastAction(action.itemId); if (action.type === "action" && action.itemId === "toggle") setChecked(value => !value);
 } });
 return <ExamplePanel title="Native Menu"><Text style={styles.bodyText}>Last action: {lastAction}</Text><Text style={styles.bodyText}>Toggle checked: {checked ? "Yes" : "No"}</Text></ExamplePanel>;
}
