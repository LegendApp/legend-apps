import type { KitchenSinkPackage, KitchenSinkTest } from "@legend-desktop/appkit-split-view";
import { type WindowOptions } from "@legend-desktop/window-manager";

export type KitchenSinkTestConfig = KitchenSinkTest & {
  windowOptions?: WindowOptions;
};

export const packages: KitchenSinkPackage[] = [
  {
    id: "ai",
    title: "AI",
  },
  {
    id: "app-exit",
    title: "App Exit",
  },
  {
    id: "appkit-split-view",
    title: "AppKit SplitView",
  },
  {
    id: "auto-updater",
    title: "Auto Updater",
  },
  {
    id: "audio-player",
    title: "Audio Player",
  },
  {
    id: "context-menu",
    title: "Context Menu",
  },
  {
    id: "document-scanner",
    title: "Document Scanner",
  },
  {
    id: "drag-drop",
    title: "Drag Drop",
  },
  {
    id: "file-dialog",
    title: "File Dialog",
  },
  {
    id: "file-scanner",
    title: "File Scanner",
  },
  {
    id: "file-system-watcher",
    title: "File System Watcher",
  },
  {
    id: "glass-effect-view",
    title: "Glass Effect View",
  },
  {
    id: "global-hotkey",
    title: "Global Hotkey",
  },
  {
    id: "keyboard-manager",
    title: "Keyboard Manager",
  },
  {
    id: "markdown-parser",
    title: "Markdown Parser",
  },
  {
    id: "media-library-scanner",
    title: "Media Library Scanner",
  },
  {
    id: "media-tags",
    title: "Media Tags",
  },
  {
    id: "native-menu",
    title: "Native Menu",
  },
  {
    id: "sidebar",
    title: "Sidebar",
  },
  {
    id: "sf-symbol",
    title: "SF Symbol",
  },
  {
    id: "text-input-search",
    title: "Text Input Search",
  },
  {
    id: "window-controls",
    title: "Window Controls",
  },
  {
    id: "window-manager",
    title: "Window Manager",
  },
];

export const tests: KitchenSinkTestConfig[] = [
  {
    id: "ai-command-runner",
    packageId: "ai",
    title: "Command Runner",
  },
  {
    id: "ai-tool-runner",
    packageId: "ai",
    title: "AI Tool Runner",
  },
  {
    id: "app-exit-events",
    packageId: "app-exit",
    title: "Exit Events",
  },
  {
    id: "split-view-basic",
    packageId: "appkit-split-view",
    title: "Basic SplitView",
  },
  {
    id: "auto-updater-status",
    packageId: "auto-updater",
    title: "Updater Status",
  },
  {
    id: "audio-player-playback",
    packageId: "audio-player",
    title: "Playback",
  },
  {
    id: "context-menu-show",
    packageId: "context-menu",
    title: "Show Menu",
  },
  {
    id: "document-scanner-markdown",
    packageId: "document-scanner",
    title: "Scan Markdown",
  },
  {
    id: "drag-drop-files-tracks",
    packageId: "drag-drop",
    title: "Files and Tracks",
  },
  {
    id: "file-dialog-open-save",
    packageId: "file-dialog",
    title: "Open and Save",
  },
  {
    id: "file-scanner-tmp",
    packageId: "file-scanner",
    title: "Scan Files",
  },
  {
    id: "file-system-watcher-events",
    packageId: "file-system-watcher",
    title: "Watch Directory",
  },
  {
    id: "glass-effect-view-basic",
    packageId: "glass-effect-view",
    title: "Basic Glass",
  },
  {
    id: "global-hotkey-register",
    packageId: "global-hotkey",
    title: "Register Hotkey",
  },
  {
    id: "keyboard-manager-events",
    packageId: "keyboard-manager",
    title: "Focused Key Events",
  },
  {
    id: "markdown-parser-blocks",
    packageId: "markdown-parser",
    title: "Document Viewer",
  },
  {
    id: "media-library-scanner-folder",
    packageId: "media-library-scanner",
    title: "Scan Folder",
  },
  {
    id: "media-tags-read",
    packageId: "media-tags",
    title: "Read Tags",
  },
  {
    id: "native-menu-configure",
    packageId: "native-menu",
    title: "Configure Menu",
  },
  {
    id: "sidebar-data-items",
    packageId: "sidebar",
    title: "Data Items",
  },
  {
    id: "sidebar-dynamic-heights",
    packageId: "sidebar",
    title: "Dynamic Heights",
  },
  {
    id: "sidebar-react-rows",
    packageId: "sidebar",
    title: "React Rows",
  },
  {
    id: "sf-symbol-basic",
    packageId: "sf-symbol",
    title: "Basic Symbol",
  },
  {
    id: "text-input-search-basic",
    packageId: "text-input-search",
    title: "Native Search Field",
  },
  {
    id: "window-controls-visibility",
    packageId: "window-controls",
    title: "Visibility",
  },
  {
    id: "window-manager-open-configure",
    packageId: "window-manager",
    title: "Open and Configure",
  },
];

export function testsForPackage(packageId: string) {
  return tests.filter((test) => test.packageId === packageId);
}
