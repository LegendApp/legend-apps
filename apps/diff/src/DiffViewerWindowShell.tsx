import { SidebarSplitView, type SidebarSplitViewResizeEvent } from "@legend-desktop/appkit-split-view";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
import { memo, useCallback, useEffect, useState, type ComponentType } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type NativeSyntheticEvent } from "react-native";
import { getDiffSourceLabel, type DiffOpenSource } from "./diffFiles";
import { logDiffOpenTiming } from "./diffInstrumentation";
import { getDiffPalette } from "./diffPalette";
import {
  defaultDiffSidebarWidth,
  setDiffSidebarWidthSetting,
  useDiffSidebarWidthSetting,
  useDiffSyntaxTheme,
} from "./diffSettings";
import {
  diffSidebarTopInset,
  diffTitlebarTopInset,
} from "./viewer/diffViewerConstants";

const diffShellContentMinWidth = 420;

type DiffViewerWindowShellProps = {
  focusUrlInputRequestId?: number;
  folderPath?: string;
  source?: DiffOpenSource;
};

let loadedDiffViewerWindow: ComponentType<DiffViewerWindowShellProps> | null = null;
let diffViewerWindowPromise: Promise<ComponentType<DiffViewerWindowShellProps>> | null = null;

function loadDiffViewerWindow() {
  if (loadedDiffViewerWindow) {
    return Promise.resolve(loadedDiffViewerWindow);
  }

  if (!diffViewerWindowPromise) {
    const loadStartedAt = globalThis.performance?.now?.() ?? Date.now();
    logDiffOpenTiming("viewer.shell.lazy.start", () => ({}));
    diffViewerWindowPromise = import("./DiffViewerWindow").then((module) => {
      loadedDiffViewerWindow = module.default;
      logDiffOpenTiming("viewer.shell.lazy.finish", () => ({
        elapsedMs: Number(((globalThis.performance?.now?.() ?? Date.now()) - loadStartedAt).toFixed(1)),
      }));
      return loadedDiffViewerWindow;
    });
  }

  return diffViewerWindowPromise;
}

export function DiffViewerWindowShell(props: DiffViewerWindowShellProps) {
  const [DiffViewerWindow, setDiffViewerWindow] = useState<ComponentType<DiffViewerWindowShellProps> | null>(
    loadedDiffViewerWindow,
  );

  useEffect(() => {
    let mounted = true;
    logDiffOpenTiming("viewer.shell.effect.mount", () => ({
      hasSource: Boolean(props.source),
    }));
    if (!DiffViewerWindow) {
      loadDiffViewerWindow().then((component) => {
        if (mounted) {
          setDiffViewerWindow(() => component);
        }
      });
    }

    return () => {
      mounted = false;
    };
  }, [DiffViewerWindow, props.source]);

  if (DiffViewerWindow) {
    return <DiffViewerWindow {...props} />;
  }

  return <DiffViewerWindowShellFallback source={props.source} />;
}

const DiffViewerWindowShellFallback = memo(function DiffViewerWindowShellFallback({
  source,
}: Pick<DiffViewerWindowShellProps, "source">) {
  const sidebarWidth = useDiffSidebarWidthSetting();
  const syntaxTheme = useDiffSyntaxTheme();
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const diffPalette = getDiffPalette(syntaxTheme, displayTheme.colors);
  const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
    const nextSidebarWidth = Math.round(event.nativeEvent.sidebarWidth);
    logDiffOpenTiming("viewer.shell.splitView.resize", () => ({
      contentHeight: Math.round(event.nativeEvent.contentHeight || event.nativeEvent.height),
      contentWidth: Math.round(event.nativeEvent.contentWidth),
      sidebarHeight: Math.round(event.nativeEvent.sidebarHeight || event.nativeEvent.height),
      sidebarWidth: nextSidebarWidth,
    }));
    if (nextSidebarWidth >= defaultDiffSidebarWidth) {
      setDiffSidebarWidthSetting(nextSidebarWidth);
    }
  }, []);

  if (!source) {
    return (
      <View style={[styles.root, { backgroundColor: diffPalette.background }]}>
        <DiffShellLoadingBody
          foregroundColor={diffPalette.foreground}
          mutedColor={diffPalette.muted}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: diffPalette.background }]}>
      <SidebarSplitView
        appearance={syntaxTheme.appearance}
        contentMinWidth={diffShellContentMinWidth}
        contentTitlebarHeight={diffTitlebarTopInset}
        contentTitlebarMaterial="glass"
        contentTitlebarOverlayColor={diffPalette.background}
        contentTitlebarOverlayOpacity={syntaxTheme.appearance === "dark" ? 0.72 : 0.82}
        onSplitViewDidResize={handleSplitViewResize}
        sidebarMinWidth={defaultDiffSidebarWidth}
        sidebarWidth={sidebarWidth}
        style={styles.content}
      >
        <View style={[styles.sidebar, { backgroundColor: diffPalette.sidebarBackground }]}>
          <View style={styles.sidebarList} />
        </View>
        <View style={styles.diffWorkspace}>
          <View style={styles.diffPane}>
            <View style={styles.diffPaneContent}>
              <View style={styles.diffTitlebarSpacer} />
              <DiffShellLoadingBody
                foregroundColor={diffPalette.foreground}
                mutedColor={diffPalette.muted}
                sourceLabel={getDiffSourceLabel(source)}
                title={source.kind === "github" ? "Downloading..." : "Loading..."}
              />
            </View>
          </View>
        </View>
      </SidebarSplitView>
    </View>
  );
});

function DiffShellLoadingBody({
  foregroundColor,
  mutedColor,
  sourceLabel,
  title = "Loading...",
}: {
  foregroundColor: string;
  mutedColor: string;
  sourceLabel?: string;
  title?: string;
}) {
  return (
    <View style={styles.loadingBody}>
      <ActivityIndicator color={mutedColor} size="small" />
      <Text style={[styles.loadingTitle, { color: foregroundColor }]}>
        {title}
      </Text>
      {sourceLabel ? (
        <Text style={[styles.loadingText, { color: mutedColor }]} numberOfLines={2}>
          {sourceLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    minHeight: 0,
  },
  diffPane: {
    flex: 1,
  },
  diffPaneContent: {
    flex: 1,
    minHeight: 0,
  },
  diffTitlebarSpacer: {
    height: diffTitlebarTopInset,
  },
  diffWorkspace: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    minWidth: 0,
  },
  loadingBody: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 36,
  },
  loadingText: {
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 520,
    textAlign: "center",
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
  },
  root: {
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    flex: 1,
    paddingBottom: 8,
    paddingTop: diffSidebarTopInset,
  },
  sidebarList: {
    flex: 1,
  },
});
