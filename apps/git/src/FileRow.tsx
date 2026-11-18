import { PlatformColor, StyleSheet, Text, View, useColorScheme } from "react-native";
import type { GitStatusEntry } from "@legend-apps/git-core";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { useThemeTokens } from "./settings/panelOptions";

// SFSymbol needs concrete colors: Spark's native view aborts on a PlatformColor. These are the macOS system colors.
const symbolColors = {
  light: { orange: "#FF9500", green: "#28CD41", red: "#FF3B30", blue: "#007AFF", teal: "#30B0C7", purple: "#AF52DE", yellow: "#FFCC00", gray: "#8E8E93", secondary: "#00000080", tertiary: "#00000042" },
  dark: { orange: "#FF9F0A", green: "#32D74B", red: "#FF453A", blue: "#0A84FF", teal: "#40C8E0", purple: "#BF5AF2", yellow: "#FFD60A", gray: "#98989D", secondary: "#FFFFFF8C", tertiary: "#FFFFFF40" },
};
export type SymbolColor = keyof typeof symbolColors.light;
export function useSymbolColor(name: SymbolColor) { return symbolColors[useColorScheme() === "dark" ? "dark" : "light"][name]; }

/** `token` is the theme's `status` color the symbol draws in. */
export type FileStatus = { symbol: string; token: StatusToken; label: string };
type StatusToken = "added" | "modified" | "deleted" | "renamed" | "typeChanged" | "untracked" | "conflicted";

const statuses: Record<string, FileStatus> = {
  M: { symbol: "pencil.circle.fill", token: "modified", label: "modified" },
  A: { symbol: "plus.circle.fill", token: "added", label: "added" },
  D: { symbol: "minus.circle.fill", token: "deleted", label: "deleted" },
  R: { symbol: "arrow.right.circle.fill", token: "renamed", label: "renamed" },
  C: { symbol: "arrow.right.circle.fill", token: "renamed", label: "copied" },
  T: { symbol: "arrow.triangle.2.circlepath.circle.fill", token: "typeChanged", label: "type changed" },
  "?": { symbol: "questionmark.circle.fill", token: "untracked", label: "untracked" },
};
const conflicted: FileStatus = { symbol: "exclamationmark.triangle.fill", token: "conflicted", label: "conflicted" };
const changed: FileStatus = { symbol: "circle.fill", token: "untracked", label: "changed" };

/** The SF Symbol, system color and spoken label for one side of a status entry. */
export function fileStatus(entry: GitStatusEntry, staged: boolean): FileStatus {
  if (entry.kind === "unmerged") return conflicted;
  return statuses[staged ? entry.indexStatus : entry.worktreeStatus] ?? changed;
}

/** Splits a repository path into the file name and its folder, as Xcode's navigator shows them. */
export function pathParts(path: string) {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? { name: path, folder: "" } : { name: path.slice(slash + 1), folder: path.slice(0, slash) };
}

/** One status entry: its status symbol in the theme's color, the name, and (with `showFolder`) the folder. */
export function FileRow({ entry, staged, showFolder = true, indent = false, height = 24 }: { entry: GitStatusEntry; staged: boolean; showFolder?: boolean; indent?: boolean; height?: number }) {
  const status = fileStatus(entry, staged);
  const color = useThemeTokens("status")[status.token];
  const { name, folder } = pathParts(entry.path);
  const detail = [showFolder ? folder : "", entry.originalPath ? `from ${entry.originalPath}` : ""].filter(Boolean).join(" · ");
  const conflict = entry.kind === "unmerged" ? `Conflict (${entry.indexStatus}${entry.worktreeStatus})` : "";
  return <View style={[styles.row, { height }, indent && styles.indent]} accessible accessibilityLabel={[name, status.label, conflict, detail].filter(Boolean).join(", ")}>
    <View style={styles.icon}><SFSymbol name={status.symbol} color={color} size={14} /></View>
    <Text style={styles.name} numberOfLines={1}>{name}</Text>
    {detail ? <Text style={styles.folder} numberOfLines={1} ellipsizeMode="head">{detail}</Text> : null}
    {conflict ? <Text style={styles.conflict}>{conflict}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6 },
  indent: { paddingLeft: 22 },
  icon: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  name: { flexShrink: 0, maxWidth: "70%", fontSize: 13, color: PlatformColor("labelColor") },
  folder: { flex: 1, fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  conflict: { marginLeft: "auto", fontSize: 11, fontWeight: "600", color: PlatformColor("systemRedColor") },
});
