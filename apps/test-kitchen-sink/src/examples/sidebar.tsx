import { Sidebar, SidebarItem } from "@legend-desktop/sidebar";
import { useState } from "react";
import { Text, View } from "react-native";
import { ExamplePanel, styles } from "./shared";

const sidebarDataItems = [
  { id: "library", title: "Library" },
  { id: "playlists", title: "Playlists" },
  { id: "artists", title: "Artists" },
  { id: "downloads", title: "Downloads" },
  { id: "disabled", selectable: false, title: "Disabled Row" },
];

const sidebarReactRows = [
  { detail: "5 albums", id: "albums", title: "Albums" },
  { detail: "23 playlists", id: "mixes", title: "Mixes" },
  { detail: "Updated today", id: "recent", title: "Recently Added" },
];

const sidebarDynamicRows = [
  { detail: "Compact row with fixed content.", height: 34, id: "compact", title: "Compact" },
  { detail: "A medium row demonstrating auto height from React layout.", height: 58, id: "medium", title: "Medium" },
  {
    detail: "A taller row. Resizing the window should keep the row heights tied to the React item layout.",
    height: 86,
    id: "tall",
    title: "Tall",
  },
];

export function SidebarExample({ testId }: { testId: string }) {
  const [selectedId, setSelectedId] = useState(
    testId === "sidebar-dynamic-heights" ? "compact" : testId === "sidebar-react-rows" ? "albums" : "library",
  );
  const [status, setStatus] = useState("No sidebar event yet.");

  if (testId === "sidebar-data-items") {
    return (
      <ExamplePanel title="Sidebar Data Items">
        <Text style={styles.bodyText}>Selected: {selectedId}</Text>
        <Text style={styles.bodyText}>{status}</Text>
        <Sidebar
          defaultRowHeight={30}
          items={sidebarDataItems}
          onSidebarLayout={(event) => {
            const { height, width } = event.nativeEvent;
            setStatus(`Layout: ${Math.round(width)}x${Math.round(height)}`);
          }}
          onSidebarSelectionChange={(event) => {
            setSelectedId(event.nativeEvent.id);
            setStatus(`Selected ${event.nativeEvent.id}`);
          }}
          selectedId={selectedId}
          style={styles.sidebarPreview}
        />
      </ExamplePanel>
    );
  }

  if (testId === "sidebar-dynamic-heights") {
    return (
      <ExamplePanel title="Sidebar Dynamic Heights">
        <Text style={styles.bodyText}>Selected: {selectedId}</Text>
        <Text style={styles.bodyText}>{status}</Text>
        <Sidebar
          defaultRowHeight={28}
          onSidebarSelectionChange={(event) => {
            setSelectedId(event.nativeEvent.id);
            setStatus(`Selected ${event.nativeEvent.id}`);
          }}
          selectedId={selectedId}
          style={styles.sidebarPreview}
        >
          {sidebarDynamicRows.map((row) => (
            <SidebarItem itemId={row.id} key={row.id} rowHeight="auto" style={{ height: row.height }}>
              <View style={styles.sidebarDynamicRow}>
                <Text style={styles.sidebarRowTitle}>{row.title}</Text>
                <Text style={styles.sidebarRowDetail}>{row.detail}</Text>
              </View>
            </SidebarItem>
          ))}
        </Sidebar>
      </ExamplePanel>
    );
  }

  return (
    <ExamplePanel title="Sidebar React Rows">
      <Text style={styles.bodyText}>Selected: {selectedId}</Text>
      <Text style={styles.bodyText}>{status}</Text>
      <Sidebar
        defaultRowHeight={44}
        onSidebarSelectionChange={(event) => {
          setSelectedId(event.nativeEvent.id);
          setStatus(`Selected ${event.nativeEvent.id}`);
        }}
        selectedId={selectedId}
        style={styles.sidebarPreview}
      >
        {sidebarReactRows.map((row) => (
          <SidebarItem
            itemId={row.id}
            key={row.id}
            onRightClick={(event) => {
              setStatus(
                `Right clicked ${row.id} at ${Math.round(event.nativeEvent.pageX)}, ${Math.round(event.nativeEvent.pageY)}`,
              );
            }}
            rowHeight={44}
            style={styles.sidebarReactItem}
          >
            <View style={styles.sidebarReactRow}>
              <Text style={styles.sidebarRowTitle}>{row.title}</Text>
              <Text style={styles.sidebarRowDetail}>{row.detail}</Text>
            </View>
          </SidebarItem>
        ))}
      </Sidebar>
    </ExamplePanel>
  );
}
