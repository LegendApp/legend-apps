import {
  defaultSelectionToolbarLayout,
  defaultTopToolbarLayout,
  moveMarkdownToolbarItem,
  normalizeMarkdownToolbarLayout,
} from "../markdownToolbarLayout";
import { markdownToolbarItemIds } from "../markdownToolbarItems";

describe("markdown toolbar layout", () => {
  it("defaults the top toolbar to the core formatting controls", () => {
    expect(defaultTopToolbarLayout.shown).toEqual([
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "bold",
      "italic",
      "link",
      "blockquote",
      "unordered-list",
      "ordered-list",
      "code-block",
    ]);
  });

  it("defaults the selection toolbar to the minimal inline-focused controls", () => {
    expect(defaultSelectionToolbarLayout.shown).toEqual(["bold", "italic", "link", "code-block"]);
  });

  it("normalizes missing layouts to the layout default", () => {
    expect(normalizeMarkdownToolbarLayout(undefined, "selection")).toEqual({
      shown: defaultSelectionToolbarLayout.shown,
      hidden: markdownToolbarItemIds.filter((itemId) => !defaultSelectionToolbarLayout.shown.includes(itemId)),
    });
  });

  it("removes unknown ids and duplicate ids while preserving order", () => {
    const normalized = normalizeMarkdownToolbarLayout(
      { shown: ["bold", "missing", "italic", "bold", "code-block"] as any },
      "top",
    );

    expect(normalized.shown).toEqual(["bold", "italic", "code-block"]);
    expect(normalized.hidden).toContain("paragraph");
    expect(normalized.hidden).not.toContain("bold");
  });

  it("moves shown items earlier within shown controls", () => {
    const nextLayout = moveMarkdownToolbarItem({
      itemId: "code-block",
      layout: { shown: ["bold", "italic", "link", "code-block"] },
      layoutId: "selection",
      sourceGroup: "shown",
      targetGroup: "shown",
      targetIndex: 1,
    });

    expect(nextLayout.shown).toEqual(["bold", "code-block", "italic", "link"]);
  });

  it("moves shown items later within shown controls after accounting for the removed source item", () => {
    const nextLayout = moveMarkdownToolbarItem({
      itemId: "bold",
      layout: { shown: ["bold", "italic", "link", "code-block"] },
      layoutId: "selection",
      sourceGroup: "shown",
      targetGroup: "shown",
      targetIndex: 3,
    });

    expect(nextLayout.shown).toEqual(["italic", "link", "bold", "code-block"]);
  });

  it("moves a hidden item into shown controls", () => {
    const nextLayout = moveMarkdownToolbarItem({
      itemId: "blockquote",
      layout: { shown: ["bold", "italic"] },
      layoutId: "selection",
      sourceGroup: "hidden",
      targetGroup: "shown",
      targetIndex: 1,
    });

    expect(nextLayout.shown).toEqual(["bold", "blockquote", "italic"]);
  });

  it("moves a shown item into hidden controls by removing it from shown", () => {
    const nextLayout = moveMarkdownToolbarItem({
      itemId: "italic",
      layout: { shown: ["bold", "italic", "link"] },
      layoutId: "selection",
      sourceGroup: "shown",
      targetGroup: "hidden",
      targetIndex: 0,
    });

    expect(nextLayout.shown).toEqual(["bold", "link"]);
  });

  it("keeps hidden-to-hidden moves as no-ops for the stored layout", () => {
    const nextLayout = moveMarkdownToolbarItem({
      itemId: "paragraph",
      layout: { shown: ["bold", "italic"] },
      layoutId: "selection",
      sourceGroup: "hidden",
      targetGroup: "hidden",
      targetIndex: 0,
    });

    expect(nextLayout.shown).toEqual(["bold", "italic"]);
  });
});
