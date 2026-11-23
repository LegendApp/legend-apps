import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";

declare module "react-native" {
  interface PressableProps {
    /** react-native-macos shows this as the view's native hover help. */
    tooltip?: string;
  }
}

/** Clears the traffic lights, so the sidebar toggle keeps one position whether the sidebar shows or not. */
export const trafficLightsWidth = 80;

/** Adds alpha to a #rgb or #rrggbb color; other colors are returned unchanged. */
export function withAlpha(color: string, alpha: number) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex || alpha >= 1) return color;
  const full = hex.length === 3 ? [...hex].map(digit => digit + digit).join("") : hex;
  return `#${full}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

export function SidebarToggle({ colors, label, onPress }: { colors: { foreground: string; muted: string }; label: string; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      tooltip={label}
      style={({ pressed }) => [styles.toggle, (hovered || pressed) && { backgroundColor: withAlpha(colors.foreground, pressed ? 0.12 : 0.07) }]}
    >
      <SFSymbol color={colors.muted} name="sidebar.left" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    alignItems: "center",
    borderRadius: 6,
    height: 28,
    justifyContent: "center",
    width: 32,
  },
});
