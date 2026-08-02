import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
  type ViewabilityConfig,
} from "@legendapp/list/react-native";
import { cn } from "@legend-apps/classnames";
import {
  SidebarSplitView,
  type SidebarSplitViewAppearance,
  type SidebarSplitViewPaneMetrics,
  type SidebarSplitViewResizeEvent,
} from "@legend-apps/appkit-split-view";
import {
  showWindow,
  setWindowOptions,
  setWindowTitle,
} from "@legend-apps/window-manager";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  type NativeSyntheticEvent,
  View,
} from "react-native";

const SETTINGS_SIDEBAR_TOP_INSET = 40;
const SETTINGS_TITLEBAR_CONTENT_INSET = 56;
const settingsContentInset = {
  bottom: 0,
  left: 0,
  right: 0,
  top: SETTINGS_TITLEBAR_CONTENT_INSET,
};
const settingsViewabilityConfig: ViewabilityConfig = {
  startOffset: SETTINGS_TITLEBAR_CONTENT_INSET,
};
const settingsSidebarPressablePlatformProps = Platform.OS === "macos"
  ? { enableFocusRing: false }
  : {};
const settingsPaneMetricsByWindowIdentifier = new Map<string, SidebarSplitViewPaneMetrics>();
const SettingsRowGroupContext = createContext(false);

export * from "./options";

export type SettingsWindowPage<PageId extends string = string> = {
  id: PageId;
  title: string;
  render: () => ReactNode;
};

export type VirtualizedSettingsWindowPage<PageId extends string = string> = {
  id: PageId;
  title: string;
  renderContent: () => ReactNode;
};

type SettingsWindowProps<PageId extends string = string> = {
  appearance?: SidebarSplitViewAppearance;
  backgroundClassName?: string;
  contentBackgroundClassName?: string;
  contentMinWidth?: number;
  defaultPageId?: PageId;
  initialPage?: PageId;
  pages: readonly SettingsWindowPage<PageId>[];
  sidebarMinWidth?: number;
  windowIdentifier: string;
};

type VirtualizedSettingsWindowProps<PageId extends string = string> = {
  appearance?: SidebarSplitViewAppearance;
  backgroundClassName?: string;
  contentBackgroundClassName?: string;
  contentMinWidth?: number;
  defaultPageId?: PageId;
  estimatedItemSize?: number;
  initialPage?: string;
  pages: readonly VirtualizedSettingsWindowPage<PageId>[];
  sidebarMinWidth?: number;
  windowIdentifier: string;
};

function reportSettingsWindowError(error: unknown) {
  console.error("Failed to update settings window", error);
}

function useSettingsSplitView(windowIdentifier: string, contentReadyInitially = true) {
  const contentReadyRef = useRef(contentReadyInitially);
  const [initialPaneMetrics] = useState(() => settingsPaneMetricsByWindowIdentifier.get(windowIdentifier) ?? null);
  const splitReadyRef = useRef(false);
  const windowShownRef = useRef(false);
  const showWindowIfReady = useCallback(() => {
    if (contentReadyRef.current && splitReadyRef.current && !windowShownRef.current) {
      windowShownRef.current = true;
      showWindow(windowIdentifier).catch((error: unknown) => {
        windowShownRef.current = false;
        reportSettingsWindowError(error);
      });
    }
  }, [windowIdentifier]);
  const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
    const nextMetrics = {
      contentHeight: Math.round(event.nativeEvent.contentHeight || event.nativeEvent.height),
      contentWidth: Math.round(event.nativeEvent.contentWidth),
      sidebarHeight: Math.round(event.nativeEvent.sidebarHeight || event.nativeEvent.height),
      sidebarWidth: Math.round(event.nativeEvent.sidebarWidth),
    };
    const layoutReady =
      nextMetrics.contentHeight > 0 &&
      nextMetrics.contentWidth > 0 &&
      nextMetrics.sidebarHeight > 0 &&
      nextMetrics.sidebarWidth > 0;

    if (layoutReady) {
      settingsPaneMetricsByWindowIdentifier.set(windowIdentifier, nextMetrics);
      splitReadyRef.current = true;
      showWindowIfReady();
    }
  }, [showWindowIfReady, windowIdentifier]);
  const markContentReady = useCallback(() => {
    contentReadyRef.current = true;
    showWindowIfReady();
  }, [showWindowIfReady]);

  return {
    handleSplitViewResize,
    initialPaneMetrics,
    markContentReady,
  };
}

export function SettingsWindow<PageId extends string = string>({
  appearance = "system",
  backgroundClassName = "bg-background",
  contentBackgroundClassName = backgroundClassName,
  contentMinWidth = 340,
  defaultPageId,
  initialPage,
  pages,
  sidebarMinWidth = 180,
  windowIdentifier,
}: SettingsWindowProps<PageId>) {
  const initialSelectedPage = useMemo(() => {
    const fallback = defaultPageId ?? pages[0]?.id;
    return pages.some((page) => page.id === initialPage) ? initialPage : fallback;
  }, [defaultPageId, initialPage, pages]);
  const [selectedPage, setSelectedPage] = useState<PageId | undefined>(initialSelectedPage);
  const selectedPageConfig = pages.find((page) => page.id === selectedPage) ?? pages[0];
  const { handleSplitViewResize, initialPaneMetrics } = useSettingsSplitView(windowIdentifier);

  useEffect(() => {
    if (selectedPageConfig) {
      setWindowTitle(windowIdentifier, selectedPageConfig.title).catch(reportSettingsWindowError);
    }
  }, [selectedPageConfig, windowIdentifier]);

  useEffect(() => {
    setWindowOptions(windowIdentifier, {
      windowStyle: {
        appearance,
      },
    }).catch(reportSettingsWindowError);
  }, [appearance, windowIdentifier]);

  if (!selectedPageConfig || !selectedPage) {
    return null;
  }

  return (
    <SidebarSplitView
      appearance={appearance}
      className={cn("flex-1", backgroundClassName)}
      contentMinWidth={contentMinWidth}
      initialPaneMetrics={initialPaneMetrics}
      onSplitViewDidResize={handleSplitViewResize}
      sidebarMinWidth={sidebarMinWidth}
      style={styles.root}
    >
      <View className="min-w-0 flex-1 overflow-hidden" style={styles.pane}>
        <SettingsSidebar
          onSelectionChange={setSelectedPage}
          pages={pages}
          selectedPage={selectedPage}
        />
        <SettingsToolbarBackground variant="sidebar" />
      </View>
      <View
        className={cn("min-w-0 flex-1 overflow-hidden", contentBackgroundClassName)}
        style={styles.pane}
      >
        {selectedPageConfig.render()}
        <SettingsToolbarBackground variant="content" />
      </View>
    </SidebarSplitView>
  );
}

export function VirtualizedSettingsWindow<PageId extends string = string>({
  appearance = "system",
  backgroundClassName = "bg-background",
  contentBackgroundClassName = backgroundClassName,
  contentMinWidth = 340,
  defaultPageId,
  estimatedItemSize = 520,
  initialPage,
  pages,
  sidebarMinWidth = 180,
  windowIdentifier,
}: VirtualizedSettingsWindowProps<PageId>) {
  const listRef = useRef<LegendListRef | null>(null);
  const initialSelectedPage = useMemo(() => {
    const fallback = defaultPageId ?? pages[0]?.id;
    return pages.find((page) => page.id === initialPage)?.id ?? fallback;
  }, [defaultPageId, initialPage, pages]);
  const [selectedPage, setSelectedPage] = useState<PageId | undefined>(initialSelectedPage);
  const pageIndexById = useMemo(() => new Map(pages.map((page, index) => [page.id, index])), [pages]);
  const initialIndex = initialSelectedPage ? pageIndexById.get(initialSelectedPage) : undefined;
  const needsInitialScroll = initialIndex !== undefined && initialIndex > 0;
  const { handleSplitViewResize, initialPaneMetrics, markContentReady } = useSettingsSplitView(
    windowIdentifier,
    !needsInitialScroll,
  );

  useEffect(() => {
    setWindowOptions(windowIdentifier, {
      windowStyle: {
        appearance,
      },
    }).catch(reportSettingsWindowError);
  }, [appearance, windowIdentifier]);

  useEffect(() => {
    if (needsInitialScroll) {
      const animationFrame = requestAnimationFrame(() => {
        const scrollPromise = listRef.current?.scrollToIndex({
          animated: false,
          index: initialIndex,
          viewOffset: SETTINGS_TITLEBAR_CONTENT_INSET,
          viewPosition: 0,
        });
        if (scrollPromise) {
          scrollPromise
            .catch(reportSettingsWindowError)
            .finally(markContentReady);
        } else {
          markContentReady();
        }
      });
      return () => {
        cancelAnimationFrame(animationFrame);
      };
    }
  }, [initialIndex, markContentReady, needsInitialScroll]);

  const scrollToPage = useCallback((pageId: PageId) => {
    const index = pageIndexById.get(pageId);
    if (index !== undefined) {
      setSelectedPage(pageId);
      listRef.current?.scrollToIndex({
        animated: true,
        index,
        viewOffset: SETTINGS_TITLEBAR_CONTENT_INSET,
        viewPosition: 0,
      }).catch(reportSettingsWindowError);
    }
  }, [pageIndexById]);

  const handleFirstVisibleItemChanged = useCallback((info: { index: number }) => {
    const page = pages[info.index];
    if (page) {
      setSelectedPage(page.id);
    }
  }, [pages]);

  const renderSettingsPage = useCallback((props: LegendListRenderItemProps<VirtualizedSettingsWindowPage<PageId>>) => (
    <VirtualizedSettingsListPageRow {...props} />
  ), []);

  if (!selectedPage) {
    return null;
  }

  return (
    <SidebarSplitView
      appearance={appearance}
      className={cn("flex-1", backgroundClassName)}
      contentMinWidth={contentMinWidth}
      initialPaneMetrics={initialPaneMetrics}
      onSplitViewDidResize={handleSplitViewResize}
      sidebarMinWidth={sidebarMinWidth}
      style={styles.root}
    >
      <View className="min-w-0 flex-1 overflow-hidden" style={styles.pane}>
        <SettingsSidebar
          onSelectionChange={scrollToPage}
          pages={pages}
          selectedPage={selectedPage}
        />
        <SettingsToolbarBackground variant="sidebar" />
      </View>
      <View className={cn("min-w-0 flex-1 overflow-hidden", contentBackgroundClassName)} style={styles.pane}>
        <LegendList
          contentInset={settingsContentInset}
          contentContainerStyle={styles.virtualizedSettingsListContent}
          data={pages}
          estimatedItemSize={estimatedItemSize}
          keyExtractor={virtualizedSettingsPageKeyExtractor}
          onFirstVisibleItemChanged={handleFirstVisibleItemChanged}
          ref={listRef}
          renderItem={renderSettingsPage}
          recycleItems
          style={styles.virtualizedSettingsList}
          viewabilityConfig={settingsViewabilityConfig}
        />
        <SettingsToolbarBackground variant="content" />
      </View>
    </SidebarSplitView>
  );
}

const virtualizedSettingsPageKeyExtractor = (page: VirtualizedSettingsWindowPage) => page.id;

function VirtualizedSettingsListPageRow<PageId extends string>({
  index,
  item,
}: LegendListRenderItemProps<VirtualizedSettingsWindowPage<PageId>>) {
  return (
    <View className="flex-col gap-5" style={index > 0 ? styles.virtualizedSettingsListPageAfterFirst : undefined}>
      <View className="flex-col gap-2">
        <Text className="text-xl font-semibold text-text-primary leading-tight">{item.title}</Text>
      </View>
      <View className="flex-col">
        {item.renderContent()}
      </View>
    </View>
  );
}

function SettingsToolbarBackground({ variant }: { variant: "content" | "sidebar" }) {
  return (
    <View
      className="absolute left-0 right-0 top-0 bg-gradient-to-b from-background-primary from-60% to-background-primary/0"
      pointerEvents="none"
      style={[styles.toolbarBackground, variant === "sidebar" ? styles.sidebarToolbarBackground : undefined]}
    />
  );
}

type SettingsSidebarProps<PageId extends string = string> = {
  onSelectionChange: (pageId: PageId) => void;
  pages: readonly Pick<SettingsWindowPage<PageId>, "id" | "title">[];
  selectedPage: PageId;
};

export function SettingsSidebar<PageId extends string = string>({
  onSelectionChange,
  pages,
  selectedPage,
}: SettingsSidebarProps<PageId>) {
  return (
    <View className="flex-1 min-h-0">
      <ScrollView
        className="flex-1"
        contentContainerStyle={styles.sidebarContent}
        showsVerticalScrollIndicator={false}
      >
        {pages.map((page) => {
          const isSelected = selectedPage === page.id;

          return (
            <Pressable
              {...settingsSidebarPressablePlatformProps}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={cn(
                "h-7 justify-center rounded-md px-2",
                isSelected ? "bg-primary/15" : "hover:bg-background-secondary/60 active:bg-background-secondary",
              )}
              key={page.id}
              onPress={() => onSelectionChange(page.id)}
            >
              <Text
                className={isSelected ? "text-sm font-medium text-text-primary" : "text-sm text-text-secondary"}
                numberOfLines={1}
              >
                {page.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

interface SettingsPageProps {
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}

export function SettingsPage({ actions, children, contentClassName }: SettingsPageProps) {
  return (
    <View className="w-full flex-1 self-stretch overflow-hidden">
      {actions ? <View className="flex-row justify-end px-6 pt-4">{actions}</View> : null}
      <ScrollView
        className="flex-1"
        contentContainerClassName={cn("w-full max-w-4xl flex-col self-center px-8 pb-7", contentClassName)}
        contentInset={settingsContentInset}
        horizontal={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

interface SettingsSectionProps {
  card?: boolean;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  description?: string;
  first?: boolean;
  headerRight?: ReactNode;
  title?: string | null;
}

export function SettingsSection({
  card = true,
  children,
  className,
  contentClassName,
  description,
  first = false,
  headerRight,
  title,
}: SettingsSectionProps) {
  const containerClassName = cn("flex flex-col gap-3", !first && "mt-7", className);
  const hasHeader = Boolean(title || description || headerRight);
  const contentNode = children
    ? card
      ? <SettingsRowGroup className={contentClassName}>{children}</SettingsRowGroup>
      : <View className={cn("flex flex-col gap-4", contentClassName)}>{children}</View>
    : null;

  return (
    <View className={containerClassName}>
      {hasHeader ? (
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1 flex-col gap-1">
            {title ? (
              <Text className="text-sm font-semibold leading-tight text-text-secondary">{title}</Text>
            ) : null}
            {description ? (
              <Text className="text-xs leading-relaxed text-text-secondary">{description}</Text>
            ) : null}
          </View>
          {headerRight ? <View className="flex-none ml-4">{headerRight}</View> : null}
        </View>
      ) : null}
      {contentNode}
    </View>
  );
}

interface SettingsCardProps {
  children: ReactNode;
  className?: string;
}

export function SettingsCard({ children, className }: SettingsCardProps) {
  return (
    <View className={cn("overflow-hidden rounded-xl border border-border-primary bg-background-secondary/20", className)}>
      {children}
    </View>
  );
}

interface SettingsRowGroupProps {
  children: ReactNode;
  className?: string;
}

export function SettingsRowGroup({ children, className }: SettingsRowGroupProps) {
  return (
    <SettingsRowGroupContext.Provider value>
      <View className={cn("overflow-hidden rounded-xl border border-border-primary bg-background-secondary/20", className)}>
        {children}
      </View>
    </SettingsRowGroupContext.Provider>
  );
}

interface SettingsRowProps {
  align?: "start" | "center";
  className?: string;
  contentClassName?: string;
  control: ReactNode;
  controlWrapperClassName?: string;
  description?: string;
  disabled?: boolean;
  title: string;
}

export function SettingsRow({
  align = "start",
  className,
  contentClassName,
  control,
  controlWrapperClassName,
  description,
  disabled = false,
  title,
}: SettingsRowProps) {
  const grouped = useContext(SettingsRowGroupContext);

  return (
    <View
      className={cn(
        "flex-row justify-between gap-5 px-4 py-4",
        align === "center" ? "items-center" : "items-start",
        grouped ? "border-border-primary" : "",
        disabled ? "opacity-60" : "",
        className,
      )}
      style={grouped ? styles.groupedRow : undefined}
    >
      <View className={cn("min-w-0 flex-1 flex-col gap-1 pr-6", contentClassName)}>
        <Text className="text-sm font-semibold leading-tight text-text-primary">{title}</Text>
        {description ? (
          <Text className="text-xs leading-relaxed text-text-secondary">{description}</Text>
        ) : null}
      </View>
      <View className={cn("max-w-full flex-shrink items-end", controlWrapperClassName)}>
        {control}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    minWidth: 0,
  },
  root: {
    flex: 1,
  },
  virtualizedSettingsList: {
    flex: 1,
  },
  virtualizedSettingsListContent: {
    alignSelf: "center",
    flexDirection: "column",
    maxWidth: 896,
    paddingBottom: 28,
    paddingHorizontal: 32,
    width: "100%",
  },
  virtualizedSettingsListPageAfterFirst: {
    marginTop: 40,
  },
  groupedRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sidebarContent: {
    paddingHorizontal: 8,
    paddingTop: SETTINGS_SIDEBAR_TOP_INSET,
  },
  sidebarToolbarBackground: {
    height: SETTINGS_SIDEBAR_TOP_INSET,
  },
  toolbarBackground: {
    height: SETTINGS_TITLEBAR_CONTENT_INSET,
    zIndex: 1,
  },
});
