import {
  markdownToolbarItemIds,
  type MarkdownToolbarItemId,
} from "./markdownToolbarItems";

export type MarkdownToolbarLayoutId = "top" | "selection";
export type MarkdownToolbarControlGroup = "shown" | "hidden";

export type MarkdownToolbarLayout = {
  shown: MarkdownToolbarItemId[];
};

export type NormalizedMarkdownToolbarLayout = {
  shown: MarkdownToolbarItemId[];
  hidden: MarkdownToolbarItemId[];
};

export type MoveMarkdownToolbarItemParams = {
  itemId: MarkdownToolbarItemId;
  layout: MarkdownToolbarLayout | undefined;
  layoutId: MarkdownToolbarLayoutId;
  sourceGroup: MarkdownToolbarControlGroup;
  targetGroup: MarkdownToolbarControlGroup;
  targetIndex: number;
};

export const defaultTopToolbarLayout: MarkdownToolbarLayout = {
  shown: [...markdownToolbarItemIds],
};

export const defaultSelectionToolbarLayout: MarkdownToolbarLayout = {
  shown: ["bold", "italic", "underline", "strikethrough", "link", "code-block"],
};

const defaultToolbarLayouts: Record<MarkdownToolbarLayoutId, MarkdownToolbarLayout> = {
  selection: defaultSelectionToolbarLayout,
  top: defaultTopToolbarLayout,
};

const toolbarItemIdSet = new Set<string>(markdownToolbarItemIds);

export function isMarkdownToolbarItemId(value: unknown): value is MarkdownToolbarItemId {
  return typeof value === "string" && toolbarItemIdSet.has(value);
}

export function getDefaultMarkdownToolbarLayout(layoutId: MarkdownToolbarLayoutId): MarkdownToolbarLayout {
  return {
    shown: [...defaultToolbarLayouts[layoutId].shown],
  };
}

export function normalizeMarkdownToolbarLayout(
  layout: MarkdownToolbarLayout | undefined,
  layoutId: MarkdownToolbarLayoutId,
): NormalizedMarkdownToolbarLayout {
  const fallback = defaultToolbarLayouts[layoutId];
  const source = Array.isArray(layout?.shown) ? layout.shown : fallback.shown;
  const seen = new Set<MarkdownToolbarItemId>();
  const shown: MarkdownToolbarItemId[] = [];

  for (const itemId of source) {
    if (isMarkdownToolbarItemId(itemId) && !seen.has(itemId)) {
      shown.push(itemId);
      seen.add(itemId);
    }
  }

  const hidden = markdownToolbarItemIds.filter((itemId) => !seen.has(itemId));

  return { shown, hidden };
}

export function moveMarkdownToolbarItem({
  itemId,
  layout,
  layoutId,
  sourceGroup,
  targetGroup,
  targetIndex,
}: MoveMarkdownToolbarItemParams): MarkdownToolbarLayout {
  const normalized = normalizeMarkdownToolbarLayout(layout, layoutId);
  const filteredShown = normalized.shown.filter((id) => id !== itemId);
  let nextShown = filteredShown;

  if (targetGroup === "shown") {
    const originalIndex = normalized.shown.indexOf(itemId);
    let insertIndex = targetIndex;

    if (sourceGroup === "shown" && originalIndex !== -1 && originalIndex < targetIndex) {
      insertIndex = Math.max(0, targetIndex - 1);
    }

    const boundedIndex = Math.max(0, Math.min(insertIndex, filteredShown.length));
    nextShown = [...filteredShown];
    nextShown.splice(boundedIndex, 0, itemId);
  }

  return {
    shown: normalizeMarkdownToolbarLayout({ shown: nextShown }, layoutId).shown,
  };
}
