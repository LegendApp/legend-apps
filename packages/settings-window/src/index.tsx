import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { cn } from "@legend-desktop/classnames";
import {
  SidebarSplitView,
  type SidebarSplitViewAppearance,
} from "@legend-desktop/appkit-split-view";
import {
  setWindowOptions,
  setWindowTitle,
  WindowStyleMask,
  type WindowOptions,
} from "@legend-desktop/window-manager";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const SETTINGS_SIDEBAR_TOP_INSET = 52;
const SETTINGS_TITLEBAR_CONTENT_INSET = 56;
const SETTINGS_WINDOW_DEFAULT_HEIGHT = 640;
const SETTINGS_WINDOW_DEFAULT_WIDTH = 820;
const SETTINGS_WINDOW_MIN_HEIGHT = 500;
const SETTINGS_WINDOW_MIN_WIDTH = 720;
const SettingsRowGroupContext = createContext(false);

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

export type CreateSettingsWindowOptionsInput = Omit<WindowOptions, "windowStyle" | "transparentBackground"> & {
  initialPage?: string;
  windowStyle?: WindowOptions["windowStyle"];
  transparentBackground?: boolean;
};

export function createSettingsWindowOptions({
  initialPage,
  title = "Settings",
  transparentBackground = true,
  windowStyle,
  ...options
}: CreateSettingsWindowOptionsInput = {}): WindowOptions {
  const initialProperties = initialPage || options.initialProperties
    ? {
        ...(options.initialProperties ?? {}),
        ...(initialPage ? { initialPage } : {}),
      }
    : undefined;

  return {
    ...options,
    initialProperties,
    title,
    transparentBackground,
    windowStyle: {
      hasToolbar: true,
      height: SETTINGS_WINDOW_DEFAULT_HEIGHT,
      mask: [
        WindowStyleMask.Titled,
        WindowStyleMask.Closable,
        WindowStyleMask.Resizable,
        WindowStyleMask.FullSizeContentView,
        WindowStyleMask.UnifiedTitleAndToolbar,
      ],
      minHeight: SETTINGS_WINDOW_MIN_HEIGHT,
      minWidth: SETTINGS_WINDOW_MIN_WIDTH,
      titlebarAppearsTransparent: true,
      titlebarSeparatorStyle: "none",
      titleVisibility: "visible",
      toolbarStyle: "unified",
      width: SETTINGS_WINDOW_DEFAULT_WIDTH,
      ...(windowStyle ?? {}),
    },
  };
}

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
  windowIdentifier?: string;
};

function reportSettingsWindowError(error: unknown) {
  console.error("Failed to update settings window", error);
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
      sidebarMinWidth={sidebarMinWidth}
    >
      <View className="min-w-0 flex-1 overflow-hidden">
        <SettingsSidebar
          onSelectionChange={setSelectedPage}
          pages={pages}
          selectedPage={selectedPage}
        />
        <SettingsToolbarBackground />
      </View>
      <View
        className={cn("min-w-0 flex-1 overflow-hidden", contentBackgroundClassName)}
      >
        {selectedPageConfig.render()}
        <SettingsToolbarBackground />
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

  useEffect(() => {
    if (windowIdentifier) {
      setWindowOptions(windowIdentifier, {
        windowStyle: {
          appearance,
        },
      }).catch(reportSettingsWindowError);
    }
  }, [appearance, windowIdentifier]);

  useEffect(() => {
    const initialIndex = initialSelectedPage ? pageIndexById.get(initialSelectedPage) : undefined;
    if (initialIndex && initialIndex > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          animated: false,
          index: initialIndex,
          viewOffset: SETTINGS_TITLEBAR_CONTENT_INSET,
          viewPosition: 0,
        }).catch(reportSettingsWindowError);
      });
    }
  }, [initialSelectedPage, pageIndexById]);

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
      sidebarMinWidth={sidebarMinWidth}
    >
      <View className="min-w-0 flex-1 overflow-hidden">
        <SettingsSidebar
          onSelectionChange={scrollToPage}
          pages={pages}
          selectedPage={selectedPage}
        />
        <SettingsToolbarBackground />
      </View>
      <View className={cn("min-w-0 flex-1 overflow-hidden", contentBackgroundClassName)}>
        <LegendList
          contentContainerStyle={styles.virtualizedSettingsListContent}
          data={pages}
          estimatedItemSize={estimatedItemSize}
          keyExtractor={virtualizedSettingsPageKeyExtractor}
          onFirstVisibleItemChanged={handleFirstVisibleItemChanged}
          ref={listRef}
          renderItem={renderSettingsPage}
          style={styles.virtualizedSettingsList}
        />
        <SettingsToolbarBackground />
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

function SettingsToolbarBackground() {
  return (
    <View
      className="absolute left-0 right-0 top-0 bg-gradient-to-b from-background-primary from-60% to-background-primary/0"
      pointerEvents="none"
      style={styles.toolbarBackground}
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
        contentContainerClassName={cn("w-full max-w-4xl flex-col self-center px-8 pb-7 pt-14", contentClassName)}
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
  virtualizedSettingsList: {
    flex: 1,
  },
  virtualizedSettingsListContent: {
    alignSelf: "center",
    flexDirection: "column",
    maxWidth: 896,
    paddingBottom: 28,
    paddingHorizontal: 32,
    paddingTop: SETTINGS_TITLEBAR_CONTENT_INSET,
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
  toolbarBackground: {
    height: SETTINGS_TITLEBAR_CONTENT_INSET,
    zIndex: 1,
  },
});
