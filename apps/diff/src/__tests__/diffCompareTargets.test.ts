import {
  createDiffCompareSource,
  createDiffCompareSourceForRef,
  diffCompareToolbarTargetAutoBase,
  diffCompareToolbarTargetChooseRef,
  diffCompareToolbarTargetHead,
  getDiffCompareToolbarModel,
  type DiffCompareRepoState,
} from "../diffCompareTargets";
import type { DiffOpenSource } from "../diffFiles";

const repoState: DiffCompareRepoState = {
  currentBranch: "feature/sidebar",
  defaultBranch: "origin/main",
  localBranches: ["feature/sidebar", "release/next"],
  remoteBranches: ["origin/HEAD", "origin/main", "origin/release"],
  repoPath: "/tmp/repo",
  upstreamBranch: "origin/feature/sidebar",
};

describe("diffCompareTargets", () => {
  it("shows folders as worktree compared to HEAD", () => {
    const source: DiffOpenSource = {
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    };

    expect(getDiffCompareToolbarModel(source, null)).toMatchObject({
      activeLabel: "HEAD",
      activeSelection: diffCompareToolbarTargetHead,
      label: "Worktree vs HEAD",
      repoPath: "/tmp/repo",
      tooltip: "Currently comparing Worktree vs HEAD",
    });
  });

  it("uses the source compare base as the active toolbar label", () => {
    const source: DiffOpenSource = {
      compareBase: {
        kind: "ref",
        ref: "origin/release",
        useMergeBase: true,
      },
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    };

    expect(getDiffCompareToolbarModel(source, repoState)).toMatchObject({
      activeLabel: "origin/release",
      activeSelection: "ref:origin/release",
      label: "Worktree vs origin/release",
    });
  });

  it("builds a menu from real repo branches without hard-coded branches", () => {
    const source: DiffOpenSource = {
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    };

    const model = getDiffCompareToolbarModel(source, repoState);

    expect(model?.menuItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Auto Base (origin/main)",
        systemImageName: "wand.and.stars",
        value: diffCompareToolbarTargetAutoBase,
      }),
      expect.objectContaining({
        label: "HEAD",
        selected: true,
        systemImageName: "clock.arrow.circlepath",
        value: diffCompareToolbarTargetHead,
      }),
      expect.objectContaining({
        label: "origin/feature/sidebar",
        systemImageName: "arrow.triangle.branch",
        value: "ref:origin/feature/sidebar",
      }),
      expect.objectContaining({
        label: "release/next",
        systemImageName: "point.3.connected.trianglepath.dotted",
        value: "ref:release/next",
      }),
      expect.objectContaining({
        label: "origin/release",
        systemImageName: "cloud",
        value: "ref:origin/release",
      }),
      expect.objectContaining({
        label: "Choose branch or ref...",
        systemImageName: "text.cursor",
        value: diffCompareToolbarTargetChooseRef,
      }),
    ]));
    expect(model?.menuItems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "develop" }),
    ]));
  });

  it("creates a folder source for HEAD compare", () => {
    expect(createDiffCompareSource("/tmp/repo", diffCompareToolbarTargetHead, repoState)).toEqual({
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    });
  });

  it("creates a folder source with a ref compare base", () => {
    expect(createDiffCompareSource("/tmp/repo", "ref:origin/release", repoState)).toEqual({
      compareBase: {
        kind: "ref",
        ref: "origin/release",
        useMergeBase: true,
      },
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    });
  });

  it("resolves auto base from the repo default branch", () => {
    expect(createDiffCompareSource("/tmp/repo", diffCompareToolbarTargetAutoBase, repoState)).toEqual({
      compareBase: {
        kind: "ref",
        ref: "origin/main",
        useMergeBase: true,
      },
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    });
  });

  it("does not create a source for the unresolved choose-ref action", () => {
    expect(createDiffCompareSource("/tmp/repo", diffCompareToolbarTargetChooseRef, repoState)).toBeNull();
  });

  it("creates a custom ref compare source", () => {
    expect(createDiffCompareSourceForRef("/tmp/repo", "topic-base")).toEqual({
      compareBase: {
        kind: "ref",
        ref: "topic-base",
        useMergeBase: true,
      },
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    });
  });
});
