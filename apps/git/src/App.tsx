import { useEffect, useState } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import { openFileDialog } from "@legendapp/spark/dialogs";
import { useMenu } from "@legendapp/spark/menus";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { setWindowOptions } from "@legendapp/spark/windows";
import { addMacOSWindowListener } from "@legendapp/spark/windows/macos";

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarLabel = sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar";

  useMenu({
    id: "legend-git",
    items: [
      { type: "submenu", id: "app", label: "Legend Git", target: { menu: "app" }, items: [] },
      {
        type: "submenu", id: "view", label: "View", target: { menu: "view" },
        items: [{ type: "action", id: "toggle-sidebar", label: sidebarLabel, shortcut: "Cmd+Ctrl+s" }],
      },
    ],
    onAction: (action) => {
      if (action.itemId === "toggle-sidebar") setSidebarCollapsed(value => !value);
    },
  });

  useEffect(() => {
    void setWindowOptions("main", {
      title: "Legend Git",
      appearance: "system",
      macos: {
        titleBar: { contentLayout: "fullSize", transparent: true, titleVisibility: "visible" },
        toolbar: {
          visible: true,
          style: "unified",
          items: [
            { type: "button", id: "toggle-sidebar", label: sidebarLabel, symbol: "sidebar.left", placement: "leading", tooltip: sidebarLabel },
            { type: "button", id: "open-repository", label: "Open Repository…", symbol: "folder", tooltip: "Open Repository…" },
          ],
        },
      },
    }).catch(console.error);
  }, [sidebarLabel]);

  useEffect(() => {
    let disposed = false;
    const registration = addMacOSWindowListener("main", event => {
      if (!disposed && event.type === "toolbarAction") {
        if (event.itemId === "toggle-sidebar") setSidebarCollapsed(value => !value);
        if (event.itemId === "open-repository") {
          void openFileDialog({ windowId: "main", selection: "directories", multiple: false, title: "Open Repository" }).catch(console.error);
        }
      }
    });
    void registration.catch(console.error);
    return () => {
      disposed = true;
      void registration.then(listener => listener.remove()).catch(console.error);
    };
  }, []);

  return (
    <SidebarSplitView
      appearance="system"
      style={styles.root}
      sidebarWidth={240}
      sidebarMinWidth={200}
      contentMinWidth={420}
      sidebarCollapsed={sidebarCollapsed}
      onSidebarCollapsedChange={setSidebarCollapsed}
      titleBar={{ content: { height: 52, material: "titlebar" } }}
      sidebar={
        <Sidebar style={styles.root} selectedId={null} onSelectionChange={() => {}} contentInsetTop={58}>
          <SidebarItem id="repositories" selectable={false}>
            <Text style={styles.section}>Repositories</Text>
          </SidebarItem>
          <SidebarItem id="empty" selectable={false}>
            <Text style={styles.secondary}>No repository open</Text>
          </SidebarItem>
        </Sidebar>
      }
      content={
        <View style={styles.content}>
          <Text style={styles.secondary}>No repository open</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: PlatformColor("windowBackgroundColor") },
  section: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 12, fontWeight: "600", color: PlatformColor("secondaryLabelColor") },
  secondary: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, color: PlatformColor("secondaryLabelColor") },
});

export default App;
