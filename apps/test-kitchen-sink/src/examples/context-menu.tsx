import { useWindowId } from "@legendapp/spark/windows";
import { showContextMenu } from "@legendapp/spark/context-menu";
import { useState } from "react";
import { type GestureResponderEvent, Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

export function ContextMenuExample() {
  const windowId = useWindowId();
  const [selected, setSelected] = useState("No context menu action yet.");

  return (
    <ExamplePanel title="Context Menu">
      <Text style={styles.bodyText}>{selected}</Text>
      <ExampleButton
        onPress={(event: GestureResponderEvent) => {
          const nativeEvent = event.nativeEvent as { pageX?: number; pageY?: number; locationX?: number; locationY?: number };
          void showContextMenu({ windowId, items: [
              { type: "action", id: "copy", label: "Copy" },
              { type: "action", id: "rename", label: "Rename" },
              { type: "action", disabled: true, id: "disabled", label: "Disabled" },
            ],
            position: {
              x: nativeEvent.pageX ?? nativeEvent.locationX ?? 0,
              y: nativeEvent.pageY ?? nativeEvent.locationY ?? 0,
            },
          }).then((result) => {
            setSelected(!result.canceled ? `Selected: ${result.itemId}` : "Context menu dismissed.");
          });
        }}
      >
        Show Context Menu
      </ExampleButton>
    </ExamplePanel>
  );
}
