import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReleaseNotesPrompt,
  collectWorkspaceDependencyDirectories,
  collectWorkspaceDependencyScope,
  filterAppReleaseCommits,
  normalizeGeneratedReleaseNotes,
  parseReleaseCommitLog,
  type ReleaseCommit,
  type WorkspacePackage,
} from "./changelogScope.ts";

test("parses commit subjects and changed paths from one git log call", () => {
  assert.deepEqual(
    parseReleaseCommitLog(
      "\x1eabc123\x1ffix: keep rows visible\x1fPrevent recycled rows from rendering null.\x1d\n\napps/diff/src/App.tsx\npackages/virtualized-document/src/list.ts\n" +
      "\x1edef456\x1ffeat: add music playlists\x1f\x1d\n\napps/music/src/App.tsx\n",
    ),
    [
      {
        body: "Prevent recycled rows from rendering null.",
        files: ["apps/diff/src/App.tsx", "packages/virtualized-document/src/list.ts"],
        hash: "abc123",
        subject: "fix: keep rows visible",
      },
      {
        body: "",
        files: ["apps/music/src/App.tsx"],
        hash: "def456",
        subject: "feat: add music playlists",
      },
    ],
  );
});

test("collects only the selected app and its transitive workspace dependencies", () => {
  const workspaces: WorkspacePackage[] = [
    {
      dependencies: ["@legend-apps/source-viewer", "react"],
      directory: "apps/diff",
      name: "@legend-apps/app-diff",
    },
    {
      dependencies: ["@legend-apps/virtualized-document"],
      directory: "packages/source-viewer",
      name: "@legend-apps/source-viewer",
    },
    {
      dependencies: [],
      directory: "packages/virtualized-document",
      name: "@legend-apps/virtualized-document",
    },
    {
      dependencies: ["@legend-apps/chat-history"],
      directory: "apps/chat-history",
      name: "@legend-apps/app-chat-history",
    },
    {
      dependencies: [],
      directory: "packages/chat-history",
      name: "@legend-apps/chat-history",
    },
    {
      dependencies: [],
      directory: "packages/native-menu",
      name: "@legend-apps/native-menu",
    },
  ];

  assert.deepEqual(
    collectWorkspaceDependencyDirectories(workspaces, "apps/diff", ["@legend-apps/native-menu"]),
    ["apps/diff", "packages/native-menu", "packages/source-viewer", "packages/virtualized-document"],
  );

  assert.ok(
    collectWorkspaceDependencyScope(workspaces, "apps/diff").dependencyNames.includes("react"),
  );
});

test("keeps app, dependency, and shared-only commits while excluding other apps", () => {
  const commits: ReleaseCommit[] = [
    { files: ["apps/diff/src/index.ts"], hash: "app", subject: "feat: app" },
    { files: ["packages/source-viewer/src/index.ts"], hash: "dependency", subject: "fix: dependency" },
    { files: ["apps/music/src/index.ts"], hash: "other", subject: "feat: other" },
    { files: ["shell/macos/AppDelegate.mm"], hash: "shared", subject: "fix: shared" },
    {
      files: ["apps/music/src/index.ts", "shell/macos/AppDelegate.mm"],
      hash: "other-with-shell",
      subject: "feat: music shell support",
    },
    {
      files: ["apps/music/src/index.ts", "packages/source-viewer/src/index.ts"],
      hash: "shared-dependency",
      subject: "fix: source viewer",
    },
    {
      files: ["patches/react-native-enriched-markdown@0.7.4.patch"],
      hash: "unrelated-patch",
      subject: "fix: markdown build",
    },
    {
      files: ["patches/react-native-macos@0.81.7.patch"],
      hash: "relevant-patch",
      subject: "fix: macOS build",
    },
    { files: ["scripts/release.ts"], hash: "internal", subject: "chore: release" },
  ];

  assert.deepEqual(
    filterAppReleaseCommits(
      commits,
      "diff",
      ["apps/diff", "packages/source-viewer", "packages/virtualized-document"],
      ["react-native-macos"],
    ).map((commit) => commit.hash),
    ["app", "dependency", "shared", "shared-dependency", "relevant-patch"],
  );
});

test("prompts for curated, app-scoped user-facing notes", () => {
  const prompt = buildReleaseNotesPrompt({
    appDisplayName: "Legend Diff",
    appId: "diff",
    commitRange: "diff-v1.0.0..HEAD",
    commits: [{
      body: "Keep assigned row data while indexes synchronize.",
      files: [],
      hash: "abc123",
      subject: "fix: blank rows",
    }],
    relevantDirectories: ["apps/diff", "packages/virtualized-document"],
    version: "1.1.0",
  });

  assert.match(prompt, /Legend Diff 1\.1\.0/);
  assert.match(prompt, /abc123 fix: blank rows/);
  assert.match(prompt, /Keep assigned row data while indexes synchronize/);
  assert.match(prompt, /curated release notes, not a commit inventory/);
  assert.match(prompt, /Do not mention changes belonging only to other apps/);
  assert.match(prompt, /Inspect the actual diffs and tests/);
  assert.match(prompt, /at most four batched Git commands/);
});

test("normalizes valid agent output and rejects prose around it", () => {
  assert.equal(
    normalizeGeneratedReleaseNotes("```markdown\n- Feat: Add commit stories.\n- Fix: Keep rows visible.\n```"),
    "- Feat: Add commit stories.\n- Fix: Keep rows visible.",
  );
  assert.throws(
    () => normalizeGeneratedReleaseNotes("Here are the notes:\n- Fix: Keep rows visible."),
    /expected Markdown bullets/,
  );
});
