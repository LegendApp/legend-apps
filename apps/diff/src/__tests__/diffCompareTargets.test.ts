import {
  createDiffCompareSource,
  createDiffCompareSourceForRef,
  diffCompareToolbarTargetChooseRef,
  diffCompareToolbarTargetHead,
  getDiffCompareToolbarModel,
  type DiffCompareRepoState,
} from "../diffCompareTargets";
import type { DiffOpenSource } from "../diffFiles";

const repoState: DiffCompareRepoState = {
  currentBranch: "feature/sidebar",
  defaultBranch: "origin/main",
  localBranches: ["feature/sidebar", "main", "release/next"],
  remoteBranches: ["origin/HEAD", "origin/feature/sidebar", "origin/main", "origin/release"],
  remoteNames: ["origin"],
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

  it("builds a menu from real repo branches with priority branches first", () => {
    const source: DiffOpenSource = {
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    };

    const model = getDiffCompareToolbarModel(source, repoState);

    expect(model?.menuItems).toEqual(expect.arrayContaining([
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
        label: "feature/sidebar",
        systemImageName: "arrow.triangle.branch",
        value: "ref:feature/sidebar",
      }),
      expect.objectContaining({
        label: "origin/main",
        systemImageName: "arrow.triangle.branch",
        value: "ref:origin/main",
      }),
      expect.objectContaining({
        label: "main",
        systemImageName: "arrow.triangle.branch",
        value: "ref:main",
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
    expect(model?.menuItems.slice(0, 4)).toEqual([
      expect.objectContaining({ label: "origin/main" }),
      expect.objectContaining({ label: "main" }),
      expect.objectContaining({ label: "origin/feature/sidebar" }),
      expect.objectContaining({ label: "feature/sidebar" }),
    ]);
    expect(model?.menuItems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: expect.stringContaining("Auto Base") }),
    ]));
    expect(model?.menuItems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "develop" }),
    ]));
  });

  it("promotes existing master dev and develop branches", () => {
    const source: DiffOpenSource = {
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    };
    const model = getDiffCompareToolbarModel(source, {
      ...repoState,
      defaultBranch: "origin/master",
      localBranches: ["develop", "dev", "master", "topic"],
      remoteBranches: ["origin/HEAD", "origin/develop", "origin/dev", "origin/master", "origin/topic"],
      upstreamBranch: null,
    });

    expect(model?.menuItems.slice(0, 6)).toEqual([
      expect.objectContaining({ label: "origin/master" }),
      expect.objectContaining({ label: "master" }),
      expect.objectContaining({ label: "dev" }),
      expect.objectContaining({ label: "origin/dev" }),
      expect.objectContaining({ label: "develop" }),
      expect.objectContaining({ label: "origin/develop" }),
    ]);
    expect(model?.menuItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "topic",
        systemImageName: "point.3.connected.trianglepath.dotted",
      }),
      expect.objectContaining({
        label: "origin/topic",
        systemImageName: "cloud",
      }),
    ]));
  });

  it("ignores stale remote refs from unconfigured remotes", () => {
    const source: DiffOpenSource = {
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    };
    const model = getDiffCompareToolbarModel(source, {
      ...repoState,
      remoteBranches: [
        "origin/HEAD",
        "origin/main",
        "upstream/develop",
        "stale-remote/main",
      ],
      remoteNames: ["origin", "upstream"],
    });

    expect(model?.menuItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "origin/main",
        systemImageName: "arrow.triangle.branch",
      }),
      expect.objectContaining({
        label: "main",
        systemImageName: "arrow.triangle.branch",
      }),
      expect.objectContaining({
        label: "upstream/develop",
        systemImageName: "arrow.triangle.branch",
      }),
    ]));
    expect(model?.menuItems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "stale-remote/main" }),
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
