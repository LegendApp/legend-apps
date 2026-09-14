import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SourceProgressBanner, progressBannerStyles } from "../SourceProgressBanner";
import { createSourceProgress } from "../sourceProgress";
import { GrammarProgressBanner } from "../GrammarProgressBanner";
import { useGrammarProgress } from "../useTreeGrammar";

jest.mock("../useTreeGrammar", () => ({ useGrammarProgress: jest.fn() }));
jest.mock("@legend-apps/syntax-parser", () => ({ treeGrammarManager: { ensure: jest.fn() } }));

jest.mock("react-native", () => ({
  ...jest.requireActual("react-native"), ActivityIndicator: "ActivityIndicator",
}));
jest.mock("../SourceEditorProgressRingNativeComponent", () => "SourceEditorProgressRing");

describe("editor progress presentation", () => {
  let renderer: ReactTestRenderer;
  afterEach(async () => { await act(async () => renderer?.unmount()); });

  it("advances a hollow radial ring inside the bottom-right bounds and hides it on completion", async () => {
    const progress = createSourceProgress();
    progress.update({ completedLines: 2500, totalLines: 10000, active: true });
    await act(async () => { renderer = create(<SourceProgressBanner progress={progress} loading={false} />); });
    const root = () => renderer.toJSON() as { props: Record<string, any>; children: any[] };
    const ring = () => renderer.root.findByType("SourceEditorProgressRing" as never);
    expect(root().props.style).toMatchObject({ position: "absolute", bottom: 16, right: 16, width: 20, height: 20, overflow: "hidden" });
    expect(root().props.pointerEvents).toBe("none");
    expect(root().props.accessibilityRole).toBe("progressbar");
    expect(root().props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });
    expect(ring().props.progress).toBe(0.25);
    expect(ring().props.style).toEqual({ width: 20, height: 20, flexShrink: 0 });
    expect(root().children).toHaveLength(1);
    expect(renderer.root.findAllByType("Text" as never)).toHaveLength(0);
    expect(renderer.root.findAllByType("ActivityIndicator" as never)).toHaveLength(0);
    await act(async () => progress.update({ completedLines: 7500, totalLines: 10000, active: true }));
    expect(ring().props.progress).toBe(0.75);
    await act(async () => progress.update({ completedLines: 12000, totalLines: 10000, active: true }));
    expect(ring().props.progress).toBe(0.99);
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

  it("keeps Code file loading at the bottom right, then replaces it with highlighting progress", async () => {
    const progress = createSourceProgress();
    progress.update({ completedLines: 5000, totalLines: 10000, active: true });
    await act(async () => { renderer = create(<SourceProgressBanner progress={progress} loading showFileLoadingBanner={false} />); });
    expect((renderer.toJSON() as any).props.style).toBe(progressBannerStyles.highlighting);
    expect(renderer.root.findAllByType("Text" as never)).toHaveLength(0);
    expect(renderer.root.findAllByType("ActivityIndicator" as never)).toHaveLength(1);
    expect(renderer.root.findAllByType("SourceEditorProgressRing" as never)).toHaveLength(0);
    await act(async () => renderer.update(<SourceProgressBanner progress={progress} loading={false} showFileLoadingBanner={false} />));
    expect(renderer.root.findAllByType("ActivityIndicator" as never)).toHaveLength(0);
    expect(renderer.root.findByType("SourceEditorProgressRing" as never).props.progress).toBe(0.5);
  });

  it.each(["downloading", "error"])("retains the top grammar %s notice in Code", async phase => {
    jest.mocked(useGrammarProgress).mockReturnValue({ language: "typescript", phase, completed: 5, total: 10,
      error: phase === "error" ? "Grammar download failed" : undefined } as ReturnType<typeof useGrammarProgress>);
    await act(async () => { renderer = create(<GrammarProgressBanner languages={["typescript"]}
      progress={createSourceProgress()} loading showFileLoadingBanner={false} />); });
    expect((renderer.toJSON() as any).props.style).toBe(progressBannerStyles.banner);
    expect(JSON.stringify(renderer.toJSON())).toContain(phase === "error" ? "Grammar download failed" : "Downloading typescript grammar");
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === "Retry grammar download").length > 0).toBe(phase === "error");
  });
  it("does not show a top banner while checking a cached grammar", async () => {
    jest.mocked(useGrammarProgress).mockReturnValue({ language: "tsx", phase: "checking", completed: 0, total: 0 });
    await act(async () => { renderer = create(<GrammarProgressBanner languages={["tsx"]}
      progress={createSourceProgress()} loading={false} showFileLoadingBanner={false} />); });
    expect(renderer.toJSON()).toBeNull();
  });
});
