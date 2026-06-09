import { cn } from "@legend-desktop/classnames";
import {
  SidebarSplitView,
  type SidebarSplitViewAppearance,
  type SidebarSplitViewResizeEvent,
} from "@legend-desktop/appkit-split-view";
import {
  setWindowOptions,
  setWindowTitle,
  WindowStyleMask,
  type WindowOptions,
} from "@legend-desktop/window-manager";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
} from "react-native";

const SETTINGS_SIDEBAR_TOP_INSET = 52;
const SETTINGS_TITLEBAR_CONTENT_INSET = 56;

export type SettingsWindowPage<PageId extends string = string> = {
  id: PageId;
  title: string;
  render: () => ReactNode;
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
      height: 800,
      mask: [
        WindowStyleMask.Titled,
        WindowStyleMask.Closable,
        WindowStyleMask.Resizable,
        WindowStyleMask.FullSizeContentView,
        WindowStyleMask.UnifiedTitleAndToolbar,
      ],
      minHeight: 600,
      minWidth: 600,
      titlebarAppearsTransparent: false,
      titlebarSeparatorStyle: "line",
      titleVisibility: "visible",
      toolbarStyle: "unified",
      width: 800,
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

function reportSettingsWindowError(error: unknown) {
  console.error("Failed to update settings window", error);
}

export function SettingsWindow<PageId extends string = string>({
  appearance = "system",
  backgroundClassName = "bg-background",
  contentBackgroundClassName = backgroundClassName,
  contentMinWidth = 360,
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
  const [paneMetrics, setPaneMetrics] = useState({ contentWidth: 0, height: 0, sidebarWidth: 0 });
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

  const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
    const nextContentWidth = Math.round(event.nativeEvent.contentWidth);
    const nextHeight = Math.round(event.nativeEvent.height);
    const nextSidebarWidth = Math.round(event.nativeEvent.sidebarWidth);

    if (nextContentWidth > 0 || nextHeight > 0 || nextSidebarWidth > 0) {
      setPaneMetrics((current) => {
        const next = {
          contentWidth: nextContentWidth > 0 ? nextContentWidth : current.contentWidth,
          height: nextHeight > 0 ? nextHeight : current.height,
          sidebarWidth: nextSidebarWidth > 0 ? nextSidebarWidth : current.sidebarWidth,
        };
        return current.contentWidth === next.contentWidth &&
          current.height === next.height &&
          current.sidebarWidth === next.sidebarWidth
          ? current
          : next;
      });
    }
  }, []);

  if (!selectedPageConfig || !selectedPage) {
    return null;
  }

  return (
    <SidebarSplitView
      appearance={appearance}
      className={cn("flex-1", backgroundClassName)}
      contentMinWidth={contentMinWidth}
      onSplitViewDidResize={handleSplitViewResize}
      sidebarMinWidth={sidebarMinWidth}
      style={styles.root}
    >
      <View
        className="flex-1"
        style={[
          styles.pane,
          {
            height: paneMetrics.height || undefined,
            minHeight: paneMetrics.height || undefined,
            width: paneMetrics.sidebarWidth || undefined,
          },
        ]}
      >
        <SettingsSidebar
          onSelectionChange={setSelectedPage}
          pages={pages}
          selectedPage={selectedPage}
        />
      </View>
      <View
        className={cn("flex-1", contentBackgroundClassName)}
        style={[
          styles.pane,
          {
            height: paneMetrics.height || undefined,
            minHeight: paneMetrics.height || undefined,
            width: paneMetrics.contentWidth || undefined,
          },
        ]}
      >
        {selectedPageConfig.render()}
      </View>
    </SidebarSplitView>
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
                isSelected ? "bg-white/10" : "hover:bg-white/10 active:bg-white/15",
              )}
              key={page.id}
              onPress={() => onSelectionChange(page.id)}
            >
              <Text
                className={isSelected ? "text-text-primary font-medium" : "text-text-secondary"}
                numberOfLines={1}
                style={styles.sidebarItemText}
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
    <View className="flex-1 overflow-hidden" style={styles.page}>
      {actions ? <View className="flex-row justify-end px-6 pt-4">{actions}</View> : null}
      <ScrollView
        className="flex-1"
        contentContainerClassName={cn("flex flex-col", contentClassName)}
        contentContainerStyle={styles.pageContent}
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
  title: string;
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
  const containerClassName = cn("flex flex-col gap-6", !first && "mt-6", className);
  const content = (
    <>
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1 flex-col gap-1.5">
          <Text className="text-xl font-semibold text-text-primary leading-tight">{title}</Text>
          {description ? (
            <Text className="text-sm leading-relaxed text-text-secondary">{description}</Text>
          ) : null}
        </View>
        {headerRight ? <View className="flex-none ml-4">{headerRight}</View> : null}
      </View>
      {children ? <View className={cn("flex flex-col gap-5", contentClassName)}>{children}</View> : null}
    </>
  );

  if (!card) {
    return <View className={containerClassName}>{content}</View>;
  }

  return <SettingsCard className={containerClassName}>{content}</SettingsCard>;
}

interface SettingsCardProps {
  children: ReactNode;
  className?: string;
}

export function SettingsCard({ children, className }: SettingsCardProps) {
  return (
    <View className={cn("rounded-2xl border border-border-primary bg-background-secondary p-6 shadow-xl", className)}>
      {children}
    </View>
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
  return (
    <View
      className={cn(
        "flex-row justify-between gap-6 rounded-xl border border-border-primary bg-background-tertiary px-5 py-4",
        align === "center" ? "items-center" : "items-start",
        disabled ? "opacity-60" : "",
        className,
      )}
    >
      <View className={cn("min-w-0 flex-1 flex-col gap-1.5 pr-6", contentClassName)} style={styles.rowText}>
        <Text className="text-base font-semibold text-text-primary leading-tight">{title}</Text>
        {description ? (
          <Text className="text-sm leading-relaxed text-text-secondary">{description}</Text>
        ) : null}
      </View>
      <View className={cn("max-w-full flex-shrink", controlWrapperClassName)} style={styles.rowControl}>
        {control}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    overflow: "hidden",
  },
  pageContent: {
    alignSelf: "center",
    flexDirection: "column",
    maxWidth: 896,
    paddingHorizontal: 24,
    paddingTop: SETTINGS_TITLEBAR_CONTENT_INSET,
    width: "100%",
  },
  pane: {
    flex: 1,
    minWidth: 0,
  },
  root: {
    flex: 1,
  },
  rowControl: {
    flexShrink: 1,
    maxWidth: "100%",
  },
  rowText: {
    minWidth: 0,
  },
  sidebarContent: {
    paddingHorizontal: 8,
    paddingTop: SETTINGS_SIDEBAR_TOP_INSET,
  },
  sidebarItemText: {
    fontSize: 13,
  },
});
