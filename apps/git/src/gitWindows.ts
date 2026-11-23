import { createElement, useSyncExternalStore, type ComponentType } from "react";
import type { UseMenuOptions } from "@legendapp/spark/menus";
import { AppRegistry } from "react-native";
import { getWindow, openWindow, showWindow, WindowProvider } from "@legendapp/spark/windows";

export const mainWindowId = "main";
const worktreeWindowModule = "GitWorktreeWindow";
let startWindowCount = 0;
/** What a worktree window's App starts with: its own window id, the worktree to open and the repository's name for its title. */
export type GitWindowProps = { windowId?: string; initialPath?: string; repoName?: string };

/**
 * Spark menus are app-wide by id, so the main window installs the one "legend-git" menu bar and shows the items of the
 * Git window focused last, whose actions then act on that window's repository. Every window publishes its menu after
 * each render; a change re-renders the main window only when it comes from the window that owns the menu bar.
 */
let menuWindow = mainWindowId;
let version = 0;
const menus = new Map<string, UseMenuOptions>();
const listeners = new Set<() => void>();
const notify = () => { version += 1; for (const listener of listeners) listener(); };
export function setMenuWindow(windowId: string) {
  if (menuWindow === windowId) return;
  menuWindow = windowId;
  notify();
}
export function publishMenu(windowId: string, menu: UseMenuOptions) {
  menus.set(windowId, menu);
  if (windowId === menuWindow && windowId !== mainWindowId) notify();
}
/** Each window's command runner, so a menu action runs in the window that owns the menu bar when it fires. */
const runners = new Map<string, (itemId: string) => void>();
export function registerMenuRunner(windowId: string, run: (itemId: string) => void) { runners.set(windowId, run); }
export function runMenuAction(itemId: string) { (runners.get(menuWindow) ?? runners.get(mainWindowId))?.(itemId); }
/** Forgets a closed window's menu and hands the menu bar back to the main window when it owned it. */
export function closeMenuWindow(windowId: string) {
  menus.delete(windowId);
  runners.delete(windowId);
  if (menuWindow === windowId) setMenuWindow(mainWindowId);
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** For the main window: the menu bar to install, `own` while the main window owns it. */
export function useMenuBar(own: UseMenuOptions) {
  useSyncExternalStore(subscribe, () => version);
  return menuWindow === mainWindowId ? own : menus.get(menuWindow) ?? own;
}

/** Worktree paths shown in their own window right now. */
export const openWorktreePaths = new Set<string>();

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
}
export const worktreeWindowId = (path: string) => `worktree-${hash(path)}`;

let registered = false;
function register() {
  if (registered) return;
  registered = true;
  // Required lazily: App imports this module.
  const App: ComponentType<GitWindowProps> = (require("./App") as typeof import("./App")).App;
  AppRegistry.registerComponent(worktreeWindowModule, () => (props: GitWindowProps) =>
    createElement(WindowProvider, { id: props.windowId ?? mainWindowId, children: createElement(App, props) }));
}

/** Opens the worktree at `path` as its own repository window, or brings its window forward when it is open already. */
export async function openWorktreeWindow(path: string, repoName: string, title: string) {
  const id = worktreeWindowId(path);
  register();
  const existing = await getWindow(id).catch(() => null);
  if (existing) { await showWindow(id, { focus: true }); return existing; }
  return openWindow({ id, component: worktreeWindowModule, props: { windowId: id, initialPath: path, repoName }, title, size: { width: 1100, height: 720 }, appearance: "system", transparent: true, titleBarStyle: "overlay" });
}

export function openStartWindow() {
  register();
  const id = `git-start-${++startWindowCount}`;
  return openWindow({
    id, component: worktreeWindowModule, props: { windowId: id }, title: "Legend Git",
    size: { width: 1100, height: 720 }, titleBarStyle: "overlay",
  });
}

const settingsModule = () => require("./settings/SettingsWindow") as typeof import("./settings/SettingsWindow");
const settingsWindowId = "git-settings";
// Registered when the app starts, not on first open: an open Settings window remounts its component after a reload.
AppRegistry.registerComponent("GitSettingsWindow", () => () => createElement(WindowProvider, { id: settingsWindowId, children: createElement(settingsModule().GitSettingsWindow) }));

/**
 * Opens Settings (or brings it forward) on `page`, for the repository of the window it was opened from: its scope popup
 * offers This Repository for that root.
 */
export async function openSettingsWindow(root: string | null, page?: import("./settings/SettingsWindow").SettingsPageId) {
  settingsModule().settingsTarget$.assign({ root, ...page ? { page } : {} });
  const existing = await getWindow(settingsWindowId).catch(() => null);
  if (existing) { await showWindow(settingsWindowId, { focus: true }); return; }
  const { createSettingsWindowOptions } = require("@legendapp/spark/ui/settings") as typeof import("@legendapp/spark/ui/settings");
  await openWindow({ ...createSettingsWindowOptions(), id: settingsWindowId, component: "GitSettingsWindow" } as Parameters<typeof openWindow>[0]);
}
