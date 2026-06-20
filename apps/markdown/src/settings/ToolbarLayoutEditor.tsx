import { cn } from "@legend-desktop/classnames";
import { DragDropProvider, DraggableItem, DroppableZone } from "@legend-desktop/reorder-controls";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import { Fragment, useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import {
  resetMarkdownToolbarLayoutSetting,
  setMarkdownToolbarLayoutSetting,
  type MarkdownToolbarControlGroup,
  type MarkdownToolbarLayoutId,
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
    <View className="flex-col gap-4 rounded-xl border border-border bg-surface-muted p-4">
      <View className="flex-row items-start justify-between gap-4">
        <View className="min-w-0 flex-1 flex-col gap-1">
          <Text className="text-base font-semibold text-text-primary">{title}</Text>
          <Text className="text-sm leading-relaxed text-text-secondary">{description}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          className="h-8 justify-center rounded-md border border-border bg-surface px-3 hover:bg-surface-muted"
          onPress={() => resetMarkdownToolbarLayoutSetting(layoutId)}
        >
          <Text className="text-sm font-medium text-foreground">Reset</Text>
        </Pressable>
      </View>
      <DragDropProvider className="flex-none flex-col gap-4">
        <ToolbarControlGroup
          group="shown"
          items={normalizedLayout.shown}
          label="Shown"
          layoutId={layoutId}
          onMove={handleMove}
        />
        <ToolbarControlGroup
          group="hidden"
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
  items: MarkdownToolbarItemId[];
  label: string;
  layoutId: MarkdownToolbarLayoutId;
  onMove: (params: MoveToolbarItemParams) => void;
};

function ToolbarControlGroup({ group, items, label, layoutId, onMove }: ToolbarControlGroupProps) {
  const hasItems = items.length > 0;
  const zoneId = `${toolbarLayoutZonePrefix}-${layoutId}`;

  return (
    <View className="flex-col gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-sm font-semibold text-text-secondary">{label}</Text>
        <Text className="text-xs text-text-tertiary">{items.length}</Text>
      </View>
      <View className="rounded-lg border border-border bg-surface px-2 py-2">
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
                <ToolbarChip itemId={itemId} />
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

function ToolbarChip({ itemId }: { itemId: MarkdownToolbarItemId }) {
  const item = markdownToolbarItemMap[itemId];

  return (
    <View className="flex-row items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
      <SFSymbol name={item.icon} size={12} />
      <Text className="text-xs font-semibold text-foreground" numberOfLines={1}>
        {item.accessibilityLabel}
      </Text>
    </View>
  );
}
