import { largeSection, sectionOfRow, sidebarSections } from "../sidebarSections";
import { createWindowStateStore } from "../layout/windowState";

const settings = (sections: { id: any; visible?: boolean; expanded?: boolean }[]) => ({ sections, showCounts: true });

it("orders and hides sections from the settings, and expands each as the user left it, else as set, else unless it is large", () => {
  const plan = sidebarSections(settings([{ id: "workspace" }, { id: "tags", expanded: false }, { id: "reviewQueue" }, { id: "branches", visible: false }, { id: "remotes", expanded: true }, { id: "tags" }]),
    { reviewQueue: largeSection + 1, remotes: 500 }, {});
  expect(plan).toEqual([{ id: "workspace", expanded: true }, { id: "tags", expanded: false }, { id: "reviewQueue", expanded: false }, { id: "remotes", expanded: true }]);
  expect(sidebarSections(settings([{ id: "reviewQueue" }]), { reviewQueue: largeSection }, {})).toEqual([{ id: "reviewQueue", expanded: true }]);
  // The user's choice wins over both.
  expect(sidebarSections(settings([{ id: "reviewQueue" }, { id: "remotes", expanded: true }]), { reviewQueue: 67 }, { reviewQueue: true, remotes: false }))
    .toEqual([{ id: "reviewQueue", expanded: true }, { id: "remotes", expanded: false }]);
});

it("finds the section of each kind of sidebar row", () => {
  expect(["changes", "review:branch:refs/heads/a", "ref:refs/heads/a", "ref:refs/remotes/origin/a", "ref:refs/tags/v1", "stash:abc", "worktree:/w", "pr:4", "github-sign-in", "recent:/r"].map(sectionOfRow))
    .toEqual(["workspace", "reviewQueue", "branches", "remotes", "tags", "stashes", "worktrees", "pullRequests", "pullRequests", null]);
});

it("remembers expanded sections in the window state file, and ignores a malformed entry", async () => {
  const files = new Map<string, string>([["/d/state/main.json", JSON.stringify({ sidebarWidth: 240, sections: { tags: true, remotes: "yes" } })]]);
  const io = { read: async (path: string) => files.get(path), write: async (path: string, text: string) => { files.set(path, text); }, mkdir: async () => {} };
  const store = createWindowStateStore({ io, directory: "/d", windowId: "main", debounceMs: 0 });
  expect(await store.ready).toEqual({ sidebarWidth: 240, sections: { tags: true } });
  store.setSectionExpanded("reviewQueue", false);
  await store.close();
  expect(JSON.parse(files.get("/d/state/main.json")!)).toEqual({ sidebarWidth: 240, sections: { tags: true, reviewQueue: false } });
});
