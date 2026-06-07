import { cn } from "@legend-desktop/classnames";
import { DragDropProvider, DraggableItem, DroppableZone } from "@legend-desktop/reorder-controls";
import { Fragment, useCallback, useMemo, useSyncExternalStore } from "react";
import { Text, View } from "react-native";

import {
  getMarkdownToolbarLayoutSetting,
  setMarkdownToolbarLayoutSetting,
  subscribeToMarkdownSettings,
  type MarkdownToolbarControlGroup,
  type MarkdownToolbarLayoutId,
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
  const layout = useSyncExternalStore(
    subscribeToMarkdownSettings,
    () => getMarkdownToolbarLayoutSetting(layoutId),
    () => getMarkdownToolbarLayoutSetting(layoutId),
  );
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
    <View className="flex-col gap-4">
      <View className="flex-col gap-1">
        <Text className="text-base font-semibold text-text-primary">{title}</Text>
        <Text className="text-sm leading-relaxed text-text-secondary">{description}</Text>
      </View>
      <DragDropProvider className="flex-none flex-col gap-5">
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
      <Text className="text-sm font-semibold text-text-secondary">{label}</Text>
      <View className="rounded-xl border border-border bg-surface-muted px-2 py-2">
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
          ) : null}
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
    <View className="flex-row items-center rounded-lg border border-border bg-surface px-3 py-2">
      <Text className="text-xs font-semibold text-foreground" numberOfLines={1}>
        {item.accessibilityLabel}
      </Text>
    </View>
  );
}
