import { contextMenuIssues, contextMenuItems, defaultContextMenus, menuCommandIds, normalizeAccelerator, resolveKeyBindings, routedBindings, toolbarItems, toolbarSlots, type MenuSubject } from "../actions";
import { commandMeta, menuTargets, resolveCommandId, type MenuTarget } from "../commandMeta";
import { commandEnabled, runCommand, type CommandContext } from "../commands";
import { capabilityIssues } from "../settings/capabilities";
import { defaultSettings } from "../settings/defaults";
import { presetSettings } from "../settings/presets";
import { presetIds } from "../settings/schema";

jest.mock("@legend-apps/diff-parser", () => ({}));

const branch = (name: string, current = false) => ({ ref: `refs/heads/${name}`, name, current }) as never;
/** A repository on main with a feature branch, an origin branch, a tag, two stashes and a linked worktree. */
function fakeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  const run = new Proxy({}, { get: (target: Record<string, jest.Mock>, key: string) => target[key] ??= jest.fn() }) as unknown as CommandContext["run"];
  return {
    hasRepository: true, section: "changes", sidebarCollapsed: false, busy: false, selectedCommit: "c1", selectedFile: null, fileHistoryPath: null,
    gitHubUrl: oid => `https://github.com/o/r/commit/${oid}`, searching: false, canBlame: false, searchScope: "message", canApplyLines: false, linesLabel: "Stage Selected Lines",
    canDiscardFile: false, canDiscardLines: false, canRestoreDiscard: false, generating: false, canGenerate: false, canCommit: true,
    refs: { branches: [branch("main", true), branch("feature")], remotes: [{ name: "origin", branches: [{ ref: "refs/remotes/origin/main", name: "origin/main" } as never] }], tags: [{ ref: "refs/tags/v1", name: "v1" } as never], defaultBranch: "main" },
    unborn: false, branchBusy: false, stashes: [{ oid: "s1", index: 0, message: "On main: newest", time: 2 }, { oid: "s2", index: 1, message: "On main: older", time: 1 }], hasChanges: true,
    worktrees: [{ path: "/repo", head: "c1", branch: "main", detached: false, bare: false, locked: null, prunable: null, main: true, name: "repo" } as never, { path: "/wt", head: "c2", branch: "wt", detached: false, bare: false, locked: null, prunable: null, main: false, name: "wt" } as never],
    root: "/repo", currentBranch: "main", upstream: "origin/main", hasRemote: true, network: null, queue: [], recents: [], operation: null, conflicts: [], undo: null,
    gitHub: { status: "signed-in", login: "ada" }, pullRequests: [7], pullWriting: false, pullRequestUrl: null, canCreatePullRequest: true,
    unstagedPaths: ["a.ts", "c.ts"], stagedPaths: ["b.ts"], selectedChange: { section: "unstaged", path: "a.ts" },
    run, ...overrides,
  };
}
const labels = (subject: MenuSubject, menus = {}, context = fakeContext()) => contextMenuItems(subject, menus, context).map(item => item.type === "separator" ? "-" : item.label);
const widgets = { branchPicker: () => [{ type: "menu" as const, id: "branch", items: [] }], viewSwitcher: () => [{ type: "segmented" as const, id: "section", segments: [], value: null }],
  search: () => [{ type: "search" as const, id: "search" }], networkProgress: () => [{ type: "label" as const, id: "ahead-behind", text: "↓1" }] };

describe("registry", () => {
  it("resolves every id in the presets' toolbars and the default context menus, each allowed in its menu", () => {
    for (const id of presetIds) for (const slot of presetSettings(id).toolbar.items) {
      const command = typeof slot === "string" ? slot : slot.command;
      if (!["branchPicker", "viewSwitcher", "search", "networkProgress", "space", "flexibleSpace"].includes(command)) expect([id, resolveCommandId(command)]).toEqual([id, command]);
    }
    for (const target of menuTargets) for (const entry of defaultContextMenus[target]) {
      if (entry === "separator" || typeof entry !== "string") continue;
      expect([target, entry, (commandMeta[resolveCommandId(entry)!] as { targets?: readonly MenuTarget[] }).targets?.includes(target)]).toEqual([target, entry, true]);
    }
  });

  it("stages and unstages the target or the selected file, stages all but conflicts, and pops the newest stash without a selection", () => {
    const context = fakeContext();
    expect(runCommand("stage-file", context)).toBe(true);
    expect(context.run.changeFile).toHaveBeenLastCalledWith("a.ts", true);
    expect(commandEnabled("unstage-file", context)).toBe(false);
    expect(runCommand("unstage-file", context, "b.ts")).toBe(true);
    expect(context.run.changeFile).toHaveBeenLastCalledWith("b.ts", false);
    expect(commandEnabled("stage-file", context, "b.ts")).toBe(false);
    expect(commandEnabled("stage-all", fakeContext({ unstagedPaths: ["x"], conflicts: [{ path: "x" } as never] }))).toBe(false);
    expect(runCommand("unstage-all", context)).toBe(true);
    expect(context.run.changeAll).toHaveBeenLastCalledWith(false);
    expect(commandEnabled("stage-all", fakeContext({ busy: true }))).toBe(false);
    expect(runCommand("pop-stash", context)).toBe(true);
    expect(context.run.popStash).toHaveBeenLastCalledWith("s1");
    expect(runCommand("pop-stash", fakeContext({ section: "stash:s2" }))).toBe(true);
    expect(commandEnabled("pop-stash", context, "gone")).toBe(false);
    expect(commandEnabled("pop-stash", fakeContext({ stashes: [] }))).toBe(false);
    expect(runCommand("reveal-repository", context)).toBe(true);
    expect(context.run.revealInFinder).toHaveBeenLastCalledWith("/repo");
    expect(commandEnabled("reveal-repository", fakeContext({ root: null }))).toBe(false);
  });
});

it("resolves a renamed command's old id in the toolbar, context menus and key bindings", () => {
  jest.isolateModules(() => {
    // As if Show in Finder had been renamed from "show-in-finder".
    const meta = require("../commandMeta") as typeof import("../commandMeta");
    (meta.commandMeta["reveal-repository"] as { aliases?: string[] }).aliases = ["show-in-finder"];
    (meta.commandMeta["copy-sha"] as { aliases?: string[] }).aliases = ["copy-commit-id"];
    const actions = require("../actions") as typeof import("../actions");
    expect(actions.toolbarSlots({ displayMode: "iconOnly", items: ["show-in-finder"] })).toEqual([{ kind: "command", id: "reveal-repository", placement: "trailing" }]);
    expect(actions.resolveKeyBindings({ "show-in-finder": ["Cmd+k"] }).keys.get("reveal-repository")).toEqual(["Cmd+k"]);
    expect(actions.contextMenuItems({ target: "commit", oid: "c2" }, { commit: ["copy-commit-id"] }, fakeContext()).map(item => item.type === "action" && item.id)).toEqual(["copy-sha"]);
  });
});

describe("toolbar", () => {
  it("lists each preset's items, leading before the first flexible space, without fixed spaces", () => {
    const ids = (preset: (typeof presetIds)[number]) => toolbarSlots(presetSettings(preset).toolbar).map(slot => `${slot.placement === "leading" ? "<" : ""}${slot.kind === "command" ? slot.id : slot.widget}`);
    expect(ids("sourcetree")).toEqual(["<commit", "<pull", "<push", "<fetch", "<new-branch", "<merge-ref", "<stash-changes", "networkProgress", "reveal-repository", "search"]);
    expect(ids("fork")).toEqual(["<fetch", "<pull", "<push", "<stash-changes", "<pop-stash", "<new-branch", "<merge-ref", "<rebase-ref", "networkProgress", "branchPicker", "search"]);
    expect(ids("gitkraken")).toEqual(["<undo-operation", "<pull", "<push", "<new-branch", "<stash-changes", "<pop-stash", "networkProgress", "branchPicker", "search"]);
    expect(toolbarSlots(defaultSettings.toolbar).map(slot => slot.placement)).toEqual(["leading", "leading", "trailing", "trailing", "trailing", "trailing"]);
  });

  it("builds buttons with short labels and overrides, skips unknown ids and repeats, and shows only usable commands without a repository", () => {
    const slots = toolbarSlots({ displayMode: "iconOnly", items: ["merge-ref", { command: "push", label: "Send", symbol: "paperplane" }, "nope", "merge-ref", "flexibleSpace", "search", "refresh", "flexibleSpace", "open-repository"] });
    expect(toolbarItems(slots, fakeContext(), widgets)).toEqual([
      { type: "button", id: "merge-ref", label: "Merge", symbol: "arrow.triangle.merge", tooltip: "Merge into Current Branch…", disabled: false, placement: "leading" },
      { type: "button", id: "push", label: "Send", symbol: "paperplane", tooltip: "Push", disabled: false, placement: "leading" },
      { type: "search", id: "search", placement: "trailing" },
      { type: "button", id: "refresh", label: "Refresh", symbol: "arrow.clockwise", tooltip: "Refresh", disabled: false },
      { type: "button", id: "open-repository", label: "Open", symbol: "folder", tooltip: "Open Repository…", disabled: false },
    ]);
    const empty = fakeContext({ hasRepository: false, root: null, refs: null, stashes: null, worktrees: null, unborn: true });
    expect(toolbarItems(slots, empty, widgets).map(item => item.id)).toEqual(["open-repository"]);
  });

  it("reports display modes, fixed and extra flexible spaces and context submenus as info until Spark has them", () => {
    const settings = { ...defaultSettings, toolbar: { displayMode: "labelOnly" as const, items: ["space", "flexibleSpace", "fetch", "flexibleSpace"] }, contextMenus: { commit: [{ submenu: "Copy", items: ["copy-sha"] }] } };
    expect(capabilityIssues(settings, "settings.json").filter(issue => /^(toolbar|contextMenus)/.test(issue.path)).map(issue => [issue.path, issue.level])).toEqual([
      ["toolbar.displayMode", "info"], ["toolbar.items.0", "info"], ["toolbar.items.3", "info"], ["contextMenus.commit.0", "info"],
    ]);
    expect(capabilityIssues({ ...defaultSettings, toolbar: { ...defaultSettings.toolbar, displayMode: "iconOnly" } }, "x").filter(issue => issue.path.startsWith("toolbar"))).toEqual([]);
  });
});

describe("context menus", () => {
  it("default lists equal the hand-built menus for each target", () => {
    expect(labels({ target: "commit", oid: "c2" })).toEqual(["Compare with Selected", "-", "New Branch from Commit…", "-", "Cherry-Pick Commit", "Revert Commit…", "Rebase Interactively onto This Commit…", "-", "Copy SHA", "Open on GitHub"]);
    expect(labels({ target: "file", path: "a.ts" })).toEqual(["Show File History"]);
    const conflicted = fakeContext({ conflicts: [{ path: "a.ts", ours: true, theirs: true, binary: false } as never], operation: { kind: "merge" } as never });
    expect(labels({ target: "file", path: "a.ts" }, {}, conflicted).at(-2)).toBe("-");
    expect(labels({ target: "file", path: "a.ts" }, {}, conflicted)).toContain("Mark Resolved");
    expect(labels({ target: "branch", ref: "refs/heads/feature", name: "feature", current: false })).toEqual(["Check Out", "New Branch from “feature”…", "-", "Merge “feature” into “main”…",
      "Rebase “main” onto “feature”…", "Rebase “main” Interactively onto “feature”…", "-", "Rename Branch…", "Delete Branch…", "-", "Copy Name"]);
    expect(labels({ target: "branch", ref: "refs/heads/main", name: "main", current: true })).toEqual(["Check Out", "New Branch from “main”…", "-", "Rename Branch…", "Delete Branch…", "-", "Create Pull Request…", "-", "Copy Name"]);
    expect(labels({ target: "remoteBranch", ref: "refs/remotes/origin/main", name: "origin/main", current: false })).toEqual(["Check Out", "New Branch from “origin/main”…", "-", "Merge “origin/main” into “main”…",
      "Rebase “main” onto “origin/main”…", "Rebase “main” Interactively onto “origin/main”…", "-", "Copy Name"]);
    expect(labels({ target: "tag", ref: "refs/tags/v1", name: "v1", current: false })).toEqual(["New Branch from “v1”…", "-", "Copy Name"]);
    expect(labels({ target: "stash", oid: "s2" })).toEqual(["Apply Stash", "Pop Stash", "-", "Drop Stash…"]);
    expect(labels({ target: "worktree", path: "/wt" })).toEqual(["Open in New Window", "Reveal in Finder", "-", "Remove…"]);
    expect(labels({ target: "diffLine" })).toEqual(["Blame Line"]);
    expect(labels({ target: "pullRequest", number: 7 })).toEqual(["Check Out as Branch", "Open in New Worktree…"]);
    const worktreeEntry = { kind: "worktree", id: "worktree:/wt", path: "/wt", name: "wt", branch: "wt", upstream: null, push: "publish", files: 1, ahead: 0 } as const;
    expect(labels({ target: "reviewEntry", entry: worktreeEntry })).toEqual(["Open in New Window", "Publish Branch…", "-", "Reveal in Finder"]);
    expect(labels({ target: "reviewEntry", entry: { kind: "branch", id: "branch:refs/heads/x", ref: "refs/heads/x", name: "x", upstream: "origin/x", push: "push", base: "origin/x", ahead: 1 } })).toEqual(["Push"]);
    // Items carry the target's state and no shortcut.
    expect(contextMenuItems({ target: "stash", oid: "s2" }, {}, fakeContext())[0]).toEqual({ type: "action", id: "apply-stash", label: "Apply Stash", disabled: false });
  });

  it("a custom list replaces the default whole, flattens submenus under their title, and skips what can't act on the target", () => {
    const menus = { commit: ["separator", "copy-sha", "separator", "separator", "fetch", "nope", { submenu: "Change", items: ["revert-commit", "cherry-pick-commit"] }, { submenu: "Empty", items: ["fetch"] }, "copy-sha", "separator"] };
    expect(labels({ target: "commit", oid: "c2" }, menus)).toEqual(["Copy SHA", "-", "Change", "Revert Commit…", "Cherry-Pick Commit"]);
    expect(contextMenuItems({ target: "commit", oid: "c2" }, menus, fakeContext())[2]).toMatchObject({ id: "submenu:Change", disabled: true });
    // Other targets keep their defaults.
    expect(labels({ target: "stash", oid: "s2" }, menus)).toEqual(["Apply Stash", "Pop Stash", "-", "Drop Stash…"]);
    expect(labels({ target: "stash", oid: "s2" }, { stash: [] })).toEqual([]);
    expect(contextMenuIssues(menus)).toEqual([{ file: "settings.json", path: "contextMenus.commit.4", level: "warning", message: "\"fetch\" can't act on a commit; skipped" },
      { file: "settings.json", path: "contextMenus.commit.7.items.0", level: "warning", message: "\"fetch\" can't act on a commit; skipped" }]);
  });
});

describe("key bindings", () => {
  it("rebinds over the defaults, unbinds with [], keeps the first owner of a combination, and skips unknown ids", () => {
    const { keys, custom, issues } = resolveKeyBindings({ "nope": ["Cmd+k"], "open-repository": ["Shift+Cmd+O", "Cmd+Alt+o"], "refresh": [], "stage-file": ["Cmd+Ctrl+S"] });
    expect(keys.get("open-repository")).toEqual(["Shift+Cmd+O", "Cmd+Alt+o"]);
    expect(keys.has("refresh")).toBe(false);
    // Open Worktree's default ⇧⌘O and Toggle Sidebar's ⌃⌘S lost to the settings' bindings.
    expect(keys.has("open-worktree")).toBe(false);
    expect(keys.has("toggle-sidebar")).toBe(false);
    expect(keys.get("stage-file")).toEqual(["Cmd+Ctrl+S"]);
    expect(keys.get("fetch")).toEqual(["Cmd+Alt+f"]);
    expect([...custom]).toEqual(["open-repository", "refresh", "stage-file"]);
    expect(issues.map(issue => [issue.path, issue.message])).toEqual([
      ["keybindings.nope", "unknown command \"nope\"; skipped"],
      ["keybindings.toggle-sidebar", "Cmd+Ctrl+s is bound to \"stage-file\" already; not bound to \"toggle-sidebar\""],
      ["keybindings.open-worktree", "Cmd+Shift+o is bound to \"open-repository\" already; not bound to \"open-worktree\""],
    ]);
    // Defaults have no conflicts among themselves.
    expect(resolveKeyBindings({}).issues).toEqual([]);
    expect(normalizeAccelerator("ctrl+cmd+G")).toBe(normalizeAccelerator("Cmd+Ctrl+g"));
  });

  it("routes the bindings menus can't carry to the window's hotkey router", () => {
    const bindings = resolveKeyBindings({ "open-repository": ["Cmd+Shift+k", "Cmd+Alt+k"], "stage-file": ["Cmd+j"], "fetch": [] });
    const menu = menuCommandIds([{ id: "file", items: [{ id: "open-repository" }, { type: "separator" }, { id: "layout:reset" }] }, { id: "repository", items: [{ id: "fetch" }] }]);
    expect([...menu]).toEqual(["open-repository", "fetch"]);
    expect(routedBindings(bindings, menu)).toEqual({ "open-repository": ["Cmd+Alt+k"], "stage-file": ["Cmd+j"] });
    expect(routedBindings(resolveKeyBindings({}), menu)).toEqual({});
  });
});
