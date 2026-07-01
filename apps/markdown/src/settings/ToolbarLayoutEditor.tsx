import { cn } from "@legend-desktop/classnames";
import { DragDropProvider, DraggableItem, DroppableZone } from "@legend-desktop/reorder-controls";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
import { Fragment, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  resetMarkdownToolbarLayoutSetting,
  setMarkdownToolbarLayoutSetting,
  type MarkdownToolbarControlGroup,
  type MarkdownToolbarLayoutId,
  useMarkdownDisplayThemeSetting,
  useMarkdownToolbarLayoutSetting,
} from "../markdownSettings";
import {
  moveMarkdownToolbarItem,
  normalizeMarkdownToolbarLayout,
} from "../markdownToolbarLayout";
import {
  markdownToolbarItemMap,
  type MarkdownToolbarItemId,
} from "../markdownToolbarItems";

type ToolbarDragData = {
  group: MarkdownToolbarControlGroup;
  itemId: MarkdownToolbarItemId;
};

type ToolbarLayoutEditorProps = {
  description: string;
  layoutId: MarkdownToolbarLayoutId;
  title: string;
};

type MoveToolbarItemParams = {
  itemId: MarkdownToolbarItemId;
  sourceGroup: MarkdownToolbarControlGroup;
  targetGroup: MarkdownToolbarControlGroup;
  targetIndex: number;
};

const toolbarLayoutZonePrefix = "markdown-toolbar-layout";

export function ToolbarLayoutEditor({ description, layoutId, title }: ToolbarLayoutEditorProps) {
  const layout = useMarkdownToolbarLayoutSetting(layoutId);
  const displayTheme = getLegendDisplayTheme(useMarkdownDisplayThemeSetting());
  const normalizedLayout = useMemo(() => normalizeMarkdownToolbarLayout(layout, layoutId), [layout, layoutId]);

  const handleMove = useCallback(
    ({ itemId, sourceGroup, targetGroup, targetIndex }: MoveToolbarItemParams) => {
      const nextLayout = moveMarkdownToolbarItem({
        itemId,
        layout,
        layoutId,
        sourceGroup,
        targetGroup,
        targetIndex,
      });
      setMarkdownToolbarLayoutSetting(layoutId, nextLayout);
    },
    [layout, layoutId],
  );

  return (
    <View className="flex-col gap-4 px-4 py-3.5">
      <View className="flex-row items-start justify-between gap-4">
        <View className="min-w-0 flex-1 flex-col gap-1">
          <Text className="font-medium text-text-primary" style={styles.subsectionTitle}>{title}</Text>
          <Text className="leading-relaxed text-text-secondary" style={styles.subsectionDescription}>
            {description}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          className="h-7 justify-center rounded-md px-2.5 hover:bg-background-secondary/60 active:bg-background-secondary"
          onPress={() => resetMarkdownToolbarLayoutSetting(layoutId)}
        >
          <Text className="text-text-secondary" style={styles.resetButton}>Reset</Text>
        </Pressable>
      </View>
      <DragDropProvider className="flex-none flex-col gap-4">
        <ToolbarControlGroup
          group="shown"
          iconColor={displayTheme.colors.foreground}
          items={normalizedLayout.shown}
          label="Shown"
          layoutId={layoutId}
          onMove={handleMove}
        />
        <ToolbarControlGroup
          group="hidden"
          iconColor={displayTheme.colors.muted}
          items={normalizedLayout.hidden}
          label="Hidden"
          layoutId={layoutId}
          onMove={handleMove}
        />
      </DragDropProvider>
    </View>
  );
}

type ToolbarControlGroupProps = {
  group: MarkdownToolbarControlGroup;
  iconColor: string;
  items: MarkdownToolbarItemId[];
  label: string;
  layoutId: MarkdownToolbarLayoutId;
  onMove: (params: MoveToolbarItemParams) => void;
};

function ToolbarControlGroup({ group, iconColor, items, label, layoutId, onMove }: ToolbarControlGroupProps) {
  const hasItems = items.length > 0;
  const zoneId = `${toolbarLayoutZonePrefix}-${layoutId}`;

  return (
    <View className="flex-col gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="text-text-secondary" style={styles.groupLabel}>{label}</Text>
        <View className="rounded-full bg-background-secondary/60 px-1.5 py-px">
          <Text className="text-text-tertiary" style={styles.groupCount}>{items.length}</Text>
        </View>
      </View>
      <View className="py-2">
        <View className={cn("flex-row flex-wrap items-center", hasItems ? undefined : "justify-center")}>
          <ToolbarDropZone
            index={0}
            isExpanded={!hasItems}
            onMove={onMove}
            targetGroup={group}
          />
          {items.map((itemId, index) => (
            <Fragment key={`${group}-${itemId}`}>
              <DraggableItem<ToolbarDragData>
                className="flex-shrink-0"
                data={() => ({ group, itemId })}
                id={`${layoutId}-${group}-${itemId}`}
                zoneId={zoneId}
              >
                <ToolbarChip iconColor={iconColor} itemId={itemId} />
              </DraggableItem>
              {index < items.length - 1 ? (
                <ToolbarDropZone
                  index={index + 1}
                  onMove={onMove}
                  targetGroup={group}
                />
              ) : null}
            </Fragment>
          ))}
          {hasItems ? (
            <ToolbarDropZone
              index={items.length}
              isExpanded
              onMove={onMove}
              targetGroup={group}
            />
          ) : (
            <Text className="py-2 text-sm text-text-tertiary">No controls</Text>
          )}
        </View>
      </View>
    </View>
  );
}

type ToolbarDropZoneProps = {
  index: number;
  isExpanded?: boolean;
  onMove: (params: MoveToolbarItemParams) => void;
  targetGroup: MarkdownToolbarControlGroup;
};

function ToolbarDropZone({ index, isExpanded = false, onMove, targetGroup }: ToolbarDropZoneProps) {
  const baseClassName = isExpanded ? "h-9 flex-1 w-full basis-full px-2" : "h-9 w-2 flex-shrink-0";
  const indicatorClassName = isExpanded
    ? "rounded-xl border border-primary/40 bg-primary/10"
    : "rounded-full bg-primary/50";
  const hitSlop = isExpanded
    ? { bottom: 10, left: 8, right: 8, top: 10 }
    : { bottom: 10, left: 16, right: 16, top: 10 };

  return (
    <DroppableZone
      activeClassName="opacity-100"
      allowDrop={() => true}
      className={baseClassName}
      hitSlop={hitSlop}
      id={`markdown-toolbar-${targetGroup}-drop-${index}`}
      onDrop={(item) => {
        const payload = item.data as ToolbarDragData;
        onMove({
          itemId: payload.itemId,
          sourceGroup: payload.group,
          targetGroup,
          targetIndex: index,
        });
      }}
    >
      {(isActive) => (
        <View
          className={cn(
            "h-full w-full transition-opacity",
            indicatorClassName,
            isActive ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </DroppableZone>
  );
}

function ToolbarChip({ iconColor, itemId }: { iconColor: string; itemId: MarkdownToolbarItemId }) {
  const item = markdownToolbarItemMap[itemId];

  return (
    <View className="flex-row items-center gap-1.5 rounded-md border border-border-primary/40 bg-background-secondary/30 px-2.5 py-1.5">
      {item.icon ? (
        <SFSymbol color={iconColor} name={item.icon} size={12} />
      ) : (
        <Text numberOfLines={1} style={{ color: iconColor, fontSize: 11, fontWeight: "700", minWidth: 16 }}>
          {item.fallbackLabel}
        </Text>
      )}
      <Text className="text-xs font-semibold text-foreground" numberOfLines={1}>
        {item.accessibilityLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  groupCount: {
    fontSize: 11,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  resetButton: {
    fontSize: 13,
  },
  subsectionDescription: {
    fontSize: 12,
  },
  subsectionTitle: {
    fontSize: 13,
  },
});
