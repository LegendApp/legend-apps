import { getLegendDisplayTheme } from "@legend-desktop/theme";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getFilename, openDiffFolderDialog } from "./diffFiles";
import { setDiffViewerWindowOptions } from "./diffWindows";

type DiffViewerWindowProps = {
  folderPath?: string;
};

type DiffViewerState = {
  error: string | null;
  folderPath: string | null;
};

export function DiffViewerWindow({ folderPath }: DiffViewerWindowProps) {
  const displayTheme = getLegendDisplayTheme("dark");
  const [state, setState] = useState<DiffViewerState>({
    error: null,
    folderPath: folderPath ?? null,
  });
  const visibleFolderPath = state.folderPath;
  const title = visibleFolderPath ? getFilename(visibleFolderPath) : "No folder";
  const subtitle = visibleFolderPath ?? "Open a Git folder to view its changes";
  const backgroundColor = displayTheme.colors.background;
  const borderColor = displayTheme.colors.border;
  const foregroundColor = displayTheme.colors.foreground;
  const mutedColor = displayTheme.colors.muted;

  useEffect(() => {
    setState((current) => ({
      ...current,
      folderPath: folderPath ?? current.folderPath,
    }));
  }, [folderPath]);

  const openFolder = useCallback(async () => {
    try {
      const path = await openDiffFolderDialog();
      if (path) {
        setState({
          error: null,
          folderPath: path,
        });
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, []);

  useEffect(() => {
    setDiffViewerWindowOptions({
      backgroundColor: displayTheme.colors.windowBackground,
      folderPath: state.folderPath,
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, [displayTheme.colors.windowBackground, state.folderPath]);

  const body = useMemo(() => {
    if (visibleFolderPath) {
      return (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
            Diff document not loaded yet
          </Text>
          <Text style={[styles.emptyText, { color: mutedColor }]} numberOfLines={2}>
            {visibleFolderPath}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
          No folder open
        </Text>
        <Text style={[styles.emptyText, { color: mutedColor }]}>
          Open a Git folder to view its changes.
        </Text>
      </View>
    );
  }, [foregroundColor, mutedColor, visibleFolderPath]);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.titleGroup}>
          <Text style={[styles.title, { color: foregroundColor }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: mutedColor }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={openFolder}
          style={({ pressed }) => [
            styles.openButton,
            { borderColor, opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <Text style={[styles.openButtonText, { color: foregroundColor }]}>Open Folder</Text>
        </Pressable>
      </View>
      {state.error ? (
        <Text style={[styles.error, { color: displayTheme.colors.danger }]}>{state.error}</Text>
      ) : null}
      {body}
    </View>
  );
}

export default DiffViewerWindow;

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: 24,
    paddingVertical: 8,
    textAlign: "center",
  },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 16,
    minHeight: 60,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  openButton: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  openButtonText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  root: {
    flex: 1,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
  },
});
