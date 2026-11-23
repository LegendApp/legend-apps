import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { getPathName } from "./fileTree";
import { SidebarToggle, trafficLightsWidth, withAlpha } from "./titleBar";
import type { WorkspaceColors } from "./WorkspaceSidebar";

const gap = 6;
const tabGap = 2;
const toggleWidth = 32;
const dragSpaceWidth = 36;
const minTabWidth = 110;
const maxTabWidth = 220;

export type DocumentTabBarProps = {
  activePath: string | null;
  colors: WorkspaceColors;
  onClose: (path: string) => void;
  onSelect: (path: string) => void;
  /** Shows the sidebar toggle first in the bar; leave it out when the sidebar shows its own. */
  onToggleSidebar?: () => void;
  sidebarOpen: boolean;
  paths: readonly string[];
  style?: StyleProp<ViewStyle>;
  /** The chrome theme's title bar height; the bar fills it. */
  titleBarHeight: number;
};

export function DocumentTabBar({ activePath, colors, onClose, onSelect, onToggleSidebar, sidebarOpen, paths, style, titleBarHeight }: DocumentTabBarProps) {
  const scroll = useRef<ScrollView>(null);
  const frames = useRef(new Map<string, { width: number; x: number }>());
  const [scrollWidth, setScrollWidth] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const leadingInset = sidebarOpen ? 8 : trafficLightsWidth;
  // Tabs share the bar equally, as in Safari, and scroll once they reach their minimum width.
  const available = barWidth - leadingInset - (onToggleSidebar ? toggleWidth + gap : 0) - dragSpaceWidth - gap;
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

  return (
    // The title bar is transparent, so leave room for the traffic lights while the sidebar is hidden.
    <View onLayout={event => setBarWidth(event.nativeEvent.layout.width)} style={[styles.root, { borderColor: colors.border, height: titleBarHeight, paddingLeft: leadingInset }, style]}>
      {onToggleSidebar ? <SidebarToggle colors={colors} label={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"} onPress={onToggleSidebar} /> : null}
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
            // A hairline separates neighbouring inactive tabs, as in Safari; the active tab needs none.
            separated={index > 0 && path !== activePath && paths[index - 1] !== activePath}
            colors={colors}
            key={path}
            onClose={() => onClose(path)}
            onLayout={event => {
              frames.current.set(path, event.nativeEvent.layout);
              if (path === activePath) revealRef.current();
            }}
            onSelect={() => onSelect(path)}
            title={getPathName(path)}
            width={tabWidth}
          />
        ))}
      </ScrollView>
      <View style={styles.dragSpace} />
    </View>
  );
}

function DocumentTab({ active, colors, onClose, onLayout, onSelect, separated, title, width }: {
  active: boolean;
  separated: boolean;
  colors: WorkspaceColors;
  onClose: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onSelect: () => void;
  title: string;
  width: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const fill = active ? withAlpha(colors.foreground, 0.09) : hovered ? withAlpha(colors.foreground, 0.05) : undefined;
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onLayout={onLayout}
      onPress={onSelect}
      style={[styles.tab, { width }, fill !== undefined && { backgroundColor: fill }]}
    >
      {separated && !hovered ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
      <Text numberOfLines={1} style={[styles.title, { color: active ? colors.foreground : colors.muted }, active && styles.activeTitle]}>{title}</Text>
      {/* The close button overlays the leading padding, so titles never shift; it shows on the active and hovered tabs. */}
      <Pressable
        accessibilityLabel={`Close ${title}`}
        accessibilityRole="button"
        hitSlop={4}
        onHoverIn={() => setCloseHovered(true)}
        onHoverOut={() => setCloseHovered(false)}
        onPress={onClose}
        pointerEvents={active || hovered ? "auto" : "none"}
        style={[styles.close, closeHovered && { backgroundColor: withAlpha(colors.foreground, 0.1) }, !(active || hovered) && styles.hidden]}
      >
        <SFSymbol color={colors.muted} name="xmark" size={9} />
      </Pressable>
    </Pressable>
  );
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
  dragSpace: {
    alignSelf: "stretch",
    flex: 1,
    minWidth: dragSpaceWidth,
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
