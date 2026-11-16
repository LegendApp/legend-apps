import type { GitService } from "@legend-apps/git-core";
import { createStashPreview, sidebarDate, stashLabel, type StashPreviewState } from "../gitStashes";

jest.mock("@legend-apps/diff-parser", () => ({ gitHistoryPageSize: 500, openGitHistory: jest.fn(), blameLine: jest.fn() }));

const patch = (path: string) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-a\n+b\n`;

it("shows the newest selection's files when an older stash's read lands late, and keeps the file selection by path", async () => {
  const reads = new Map<string, (text: string) => void>();
  const git = { stashPatch: jest.fn((oid: string) => new Promise<string>(resolve => reads.set(oid, resolve))) };
  let state!: StashPreviewState;
  const preview = createStashPreview(next => { state = next; }, () => git as unknown as GitService);
  preview.setRoot("/repo");
  const first = preview.show("a".repeat(40));
  const second = preview.show("b".repeat(40));
  reads.get("b".repeat(40))!(patch("two.txt") + patch("three.txt"));
  await second;
  reads.get("a".repeat(40))!(patch("one.txt"));
  await first;
  expect(state).toMatchObject({ oid: "b".repeat(40), selectedPath: "two.txt", loading: false });
  expect(state.files.map(file => file.path)).toEqual(["two.txt", "three.txt"]);
  preview.selectFile("three.txt");
  preview.selectFile("missing.txt");
  expect(state.selectedPath).toBe("three.txt");
  // The same stash again (a refresh) reads nothing.
  await preview.show("b".repeat(40));
  expect(git.stashPatch).toHaveBeenCalledTimes(2);
  preview.dispose();
});

it("dates sidebar rows as Mail does: time today, Yesterday, weekday this week, else the date", () => {
  const now = new Date(2026, 10, 16, 15, 0);
  const at = (...parts: [number, number, number, number, number]) => new Date(...parts).getTime() / 1000;
  expect(sidebarDate(at(2026, 10, 16, 9, 5), now)).toBe(new Date(2026, 10, 16, 9, 5).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
  expect(sidebarDate(at(2026, 10, 15, 23, 59), now)).toBe("Yesterday");
  expect(sidebarDate(at(2026, 10, 12, 8, 0), now)).toBe(new Date(2026, 10, 12).toLocaleDateString(undefined, { weekday: "long" }));
  expect(sidebarDate(at(2026, 10, 9, 8, 0), now)).toBe(new Date(2026, 10, 9).toLocaleDateString(undefined, { year: "2-digit", month: "numeric", day: "numeric" }));
});

it("labels stashes by message without Git's branch prefix", () => {
  expect(stashLabel("On main: ünï ✓")).toBe("ünï ✓");
  expect(stashLabel("WIP on main: 1234567 First")).toBe("WIP on main: 1234567 First");
});
