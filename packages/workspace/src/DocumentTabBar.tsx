import { DragDropView, type DragOverEvent, type DragPayload } from "@legendapp/spark/drag-drop";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { getPathName } from "./fileTree";
import { SidebarToggle, trafficLightsWidth, withAlpha } from "./titleBar";
import type { WorkspaceColors } from "./WorkspaceSidebar";

const gap = 6;
const tabGap = 2;
const toggleWidth = 32;
const newTabWidth = 26;
const dragSpaceWidth = 36;
const minTabWidth = 110;
const maxTabWidth = 220;

export type DocumentTabBarProps = {
  activePath: string | null;
  colors: WorkspaceColors;
  /** False for a split pane that is not focused; its active tab is drawn quieter. */
  focused?: boolean;
  onClose: (path: string) => void;
  /** Shows a New Tab button after the tabs. */
  onNewTab?: () => void;
  onSelect: (path: string) => void;
  /** Shows the sidebar toggle first in the bar; leave it out when the sidebar shows its own. */
  onToggleSidebar?: () => void;
  sidebarOpen: boolean;
  paths: readonly string[];
  /** Draws a hairline under the bar; leave it off when the bar sits on glass above a card. */
  separated?: boolean;
  /** A tab's title; the file name by default. */
  title?: (path: string) => string;
  /** Lets tabs drag between bars: each tab carries its path under the `type` MIME type, and the bar takes drops at a slot. */
  tabDrag?: TabDrag;
  titleBarHeight: number;
};

export type TabDrag = { onDragStart: (path: string) => void; onDrop: (index: number) => void; type: string };

export function DocumentTabBar({ activePath, colors, focused = true, onClose, onNewTab, onSelect, onToggleSidebar, sidebarOpen, paths, separated = true, tabDrag, title = getPathName, titleBarHeight }: DocumentTabBarProps) {
  const scroll = useRef<ScrollView>(null);
  const frames = useRef(new Map<string, { width: number; x: number }>());
  const [scrollWidth, setScrollWidth] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const leadingInset = sidebarOpen ? 8 : trafficLightsWidth;
  // Tabs share the bar equally, as in Safari, and scroll once they reach their minimum width.
  const available = barWidth - leadingInset - (onToggleSidebar ? toggleWidth + gap : 0) - (onNewTab ? newTabWidth + gap : 0) - dragSpaceWidth - gap;
  const tabWidth = Math.round(Math.min(maxTabWidth, Math.max(minTabWidth, (available - tabGap * (paths.length - 1)) / Math.max(1, paths.length))));
  const offset = useRef(0);

  // Keeps the active tab in view when it changes, lays out, or the bar resizes.
  const reveal = () => {
    const frame = activePath ? frames.current.get(activePath) : undefined;
    if (!frame || !scrollWidth) return;
    const inset = 8;
    if (frame.x - inset < offset.current) scroll.current?.scrollTo({ animated: true, x: Math.max(0, frame.x - inset) });
    else if (frame.x + frame.width + inset > offset.current + scrollWidth) scroll.current?.scrollTo({ animated: true, x: frame.x + frame.width + inset - scrollWidth });
  };
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  useEffect(() => revealRef.current(), [activePath, paths, scrollWidth]);

  // The slot a dragged tab would drop into: before the first tab whose middle is past the pointer.
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const slotAt = ({ x }: DragOverEvent) => paths.filter(path => {
    const frame = frames.current.get(path);
    return frame && frame.x + frame.width / 2 < x + offset.current;
  }).length;
  const after = dropIndex === null ? undefined : frames.current.get(paths[dropIndex]);
  const before = dropIndex === null ? undefined : frames.current.get(paths[dropIndex - 1]);
  const markerX = after ? after.x - tabGap / 2 : before && before.x + before.width + tabGap / 2;

  const tabs = (
    <>
      <ScrollView
        contentContainerStyle={styles.tabs}
        horizontal
        onLayout={(event: LayoutChangeEvent) => setScrollWidth(event.nativeEvent.layout.width)}
        onScroll={event => { offset.current = event.nativeEvent.contentOffset.x; }}
        ref={scroll}
        scrollEventThrottle={32}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        {paths.map((path, index) => (
          <DocumentTab
            active={path === activePath}
            focused={focused}
            // A hairline separates neighbouring inactive tabs, as in Safari; the active tab needs none.
            separated={index > 0 && path !== activePath && paths[index - 1] !== activePath}
            colors={colors}
            drag={tabDrag && { onDragStart: () => tabDrag.onDragStart(path), payload: { data: { [tabDrag.type]: path } } }}
            key={path}
            onClose={() => onClose(path)}
            onLayout={event => {
              frames.current.set(path, event.nativeEvent.layout);
              if (path === activePath) revealRef.current();
            }}
            onSelect={() => onSelect(path)}
            title={title(path)}
            width={tabWidth}
          />
        ))}
        {markerX === undefined ? null : <View pointerEvents="none" style={[styles.dropMarker, { backgroundColor: colors.primary ?? colors.foreground, left: markerX - 1 }]} />}
      </ScrollView>
      {onNewTab ? <NewTabButton colors={colors} onPress={onNewTab} /> : null}
      <View style={styles.dragSpace} />
    </>
  );

  return (
    // The title bar is transparent, so leave room for the traffic lights while the sidebar is hidden.
    <View onLayout={event => setBarWidth(event.nativeEvent.layout.width)} style={[styles.root, { borderColor: colors.border, height: titleBarHeight, paddingLeft: leadingInset }, !separated && styles.unseparated]}>
      {onToggleSidebar ? <SidebarToggle colors={colors} label={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"} onPress={onToggleSidebar} /> : null}
      {tabDrag ? (
        <DragDropView
          acceptedOperations={["move"]}
          acceptedTypes={[tabDrag.type]}
          onDragLeave={() => setDropIndex(null)}
          onDragOver={event => setDropIndex(slotAt(event))}
          onDrop={event => {
            setDropIndex(null);
            tabDrag.onDrop(slotAt(event));
          }}
          style={styles.dropTarget}
        >
          {tabs}
        </DragDropView>
      ) : tabs}
    </View>
  );
}

function NewTabButton({ colors, onPress }: { colors: WorkspaceColors; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityLabel="New Tab"
      accessibilityRole="button"
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      tooltip="New Tab"
      style={[styles.newTab, hovered && { backgroundColor: withAlpha(colors.foreground, 0.05) }]}
    >
      <SFSymbol color={colors.muted} name="plus" size={12} />
    </Pressable>
  );
}

function DocumentTab({ active, colors, drag, focused, onClose, onLayout, onSelect, separated, title, width }: {
  active: boolean;
  focused: boolean;
  separated: boolean;
  colors: WorkspaceColors;
  drag?: { onDragStart: () => void; payload: DragPayload };
  onClose: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onSelect: () => void;
  title: string;
  width: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const fill = active ? withAlpha(colors.foreground, focused ? 0.09 : 0.04) : hovered ? withAlpha(colors.foreground, 0.05) : undefined;
  const tab = (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onLayout={drag ? undefined : onLayout}
      onPress={onSelect}
      style={[styles.tab, { width }, fill !== undefined && { backgroundColor: fill }]}
    >
      {separated && !hovered ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
      <Text numberOfLines={1} style={[styles.title, { color: active && focused ? colors.foreground : colors.muted }, active && styles.activeTitle]}>{title}</Text>
      {/* The close button overlays the leading padding, so titles never shift; it shows on the active and hovered tabs. */}
      <Pressable
        accessibilityLabel={`Close ${title}`}
        accessibilityRole="button"
        hitSlop={4}
        onHoverIn={() => setCloseHovered(true)}
        onHoverOut={() => setCloseHovered(false)}
        onPress={onClose}
        tooltip="Close Tab"
        pointerEvents={active || hovered ? "auto" : "none"}
        style={[styles.close, closeHovered && { backgroundColor: withAlpha(colors.foreground, 0.1) }, !(active || hovered) && styles.hidden]}
      >
        <SFSymbol color={colors.muted} name="xmark" size={9} />
      </Pressable>
    </Pressable>
  );
  // The native drag lifts a snapshot of the tab; a click without movement still selects it.
  return drag ? (
    <DragDropView acceptedOperations={[]} dragPreview="snapshot" onDragStart={drag.onDragStart} onLayout={onLayout} source={drag.payload} sourceOperations={["move"]}>
      {tab}
    </DragDropView>
  ) : tab;
}

const styles = StyleSheet.create({
  activeTitle: {
    fontWeight: "500",
  },
  close: {
    left: 4,
    position: "absolute",
    alignItems: "center",
    borderRadius: 4,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  dropMarker: {
    borderRadius: 1,
    height: 18,
    position: "absolute",
    width: 2,
  },
  dropTarget: {
    alignSelf: "stretch",
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap,
  },
  dragSpace: {
    alignSelf: "stretch",
    flex: 1,
    minWidth: dragSpaceWidth,
  },
  newTab: {
    alignItems: "center",
    borderRadius: 7,
    height: 26,
    justifyContent: "center",
    width: newTabWidth,
  },
  hidden: {
    opacity: 0,
  },
  root: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap,
  },
  unseparated: {
    borderBottomWidth: 0,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  separator: {
    height: 16,
    left: -1,
    position: "absolute",
    width: StyleSheet.hairlineWidth,
  },
  tab: {
    alignItems: "center",
    borderRadius: 7,
    flexDirection: "row",
    height: 26,
    paddingHorizontal: 20,
  },
  tabs: {
    alignItems: "center",
    gap: tabGap,
  },
  title: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 12,
    textAlign: "center",
  },
});
