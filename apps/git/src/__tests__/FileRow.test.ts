import type { GitStatusEntry } from "@legend-apps/git-core";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { FileRow, fileStatus, pathParts } from "../FileRow";
import { EmptyState } from "../EmptyState";
import { hunkTitle } from "../DiffPane";

jest.mock("@legend-apps/diff-parser", () => ({}));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));
jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: "SFSymbol" }));
jest.mock("react-native", () => ({ Text: "Text", View: "View", useColorScheme: () => "dark", PlatformColor: (name: string) => ({ semantic: [name] }), StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFillObject: {} } }));

const entry = (kind: GitStatusEntry["kind"], indexStatus: string, worktreeStatus: string): GitStatusEntry => ({ kind, path: "a/b.ts", indexStatus, worktreeStatus });

it("maps each side of a status entry to an SF Symbol and a spoken label", () => {
  const both = entry("ordinary", "A", "M");
  expect(fileStatus(both, true)).toMatchObject({ symbol: "plus.circle.fill", label: "added" });
  expect(fileStatus(both, false)).toMatchObject({ symbol: "pencil.circle.fill", label: "modified" });
  expect(fileStatus(entry("untracked", "?", "?"), false).label).toBe("untracked");
  expect(fileStatus(entry("ordinary", "D", "."), true).label).toBe("deleted");
  expect(fileStatus(entry("renamed", "R", "."), true).label).toBe("renamed");
  expect(fileStatus(entry("unmerged", "U", "U"), false)).toMatchObject({ symbol: "exclamationmark.triangle.fill", label: "conflicted" });
  expect(fileStatus(entry("ordinary", "X", "."), true).label).toBe("changed");
});

it("splits paths into name and folder and prints hunk ranges as Git does", () => {
  expect(pathParts("README.md")).toEqual({ name: "README.md", folder: "" });
  expect(pathParts("apps/git/src/App.tsx")).toEqual({ name: "App.tsx", folder: "apps/git/src" });
  expect(hunkTitle({ oldStart: 3, oldCount: 6, newStart: 3, newCount: 7, section: " function main()" })).toBe("@@ -3,6 +3,7 @@ function main()");
  expect(hunkTitle({ oldStart: 5, oldCount: 1, newStart: 0, newCount: 0, section: "" })).toBe("@@ -5 +0,0 @@");
});

it("gives SF Symbols concrete colors, since the native symbol view aborts on a PlatformColor", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const element of [createElement(FileRow, { entry: entry("unmerged", "U", "U"), staged: false }), createElement(EmptyState, { symbol: "folder", title: "Empty" })]) {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(element); });
    const colors = renderer.root.findAll(node => (node.type as unknown) === "SFSymbol").map(node => node.props.color);
    expect(colors.length).toBe(1);
    expect(colors[0]).toMatch(/^#[0-9A-F]{6,8}$/);
  }
});
