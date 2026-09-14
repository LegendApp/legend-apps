import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SourceProgressBanner, progressBannerStyles } from "../SourceProgressBanner";
import { createSourceProgress } from "../sourceProgress";

jest.mock("react-native", () => ({
  ...jest.requireActual("react-native"), ActivityIndicator: "ActivityIndicator",
}));

describe("editor progress presentation", () => {
  let renderer: ReactTestRenderer;
  afterEach(async () => { await act(async () => renderer?.unmount()); });

  it("fills a non-blocking bottom-right circle and hides it when highlighting finishes", async () => {
    const progress = createSourceProgress();
    progress.update({ completedLines: 2500, totalLines: 10000, active: true });
    await act(async () => { renderer = create(<SourceProgressBanner progress={progress} loading={false} />); });
    const root = () => renderer.toJSON() as { props: Record<string, any>; children: any[] };
    const fill = () => root().children[0].children[0].props.style;
    expect(root().props.style).toMatchObject({ position: "absolute", bottom: 8, right: 12 });
    expect(root().props.pointerEvents).toBe("none");
    expect(root().props.accessibilityRole).toBe("progressbar");
    expect(root().props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });
    expect(fill()).toContainEqual({ height: "25%" });
    expect(renderer.root.findAllByType("Text" as never)).toHaveLength(0);
    expect(renderer.root.findAllByType("ActivityIndicator" as never)).toHaveLength(0);
    await act(async () => progress.update({ completedLines: 7500, totalLines: 10000, active: true }));
    expect(fill()).toContainEqual({ height: "75%" });
    await act(async () => progress.update({ completedLines: 12000, totalLines: 10000, active: true }));
    expect(fill()).toContainEqual({ height: "99%" });
    await act(async () => progress.update({ completedLines: 10000, totalLines: 10000, active: false }));
    expect(renderer.toJSON()).toBeNull();
  });

  it("keeps the prominent file-reading banner, then switches to the quiet highlighting circle", async () => {
    const progress = createSourceProgress();
    progress.update({ completedLines: 5000, totalLines: 10000, active: true });
    await act(async () => { renderer = create(<SourceProgressBanner progress={progress} loading />); });
    expect((renderer.toJSON() as any).props.style).toBe(progressBannerStyles.banner);
    expect(renderer.root.findByType("Text" as never).props.children).toContain("Loading file");
    expect(renderer.root.findAllByType("ActivityIndicator" as never)).toHaveLength(1);
    await act(async () => renderer.update(<SourceProgressBanner progress={progress} loading={false} />));
    expect(renderer.root.findAllByType("Text" as never)).toHaveLength(0);
    expect((renderer.toJSON() as any).props.accessibilityValue.now).toBe(50);
  });

  it("does not flash an indicator for small files", async () => {
    const progress = createSourceProgress();
    progress.update({ completedLines: 0, totalLines: 9999, active: true });
    await act(async () => { renderer = create(<SourceProgressBanner progress={progress} loading={false} />); });
    expect(renderer.toJSON()).toBeNull();
  });
});
