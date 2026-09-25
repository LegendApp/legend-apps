import { createSettingsWindowOptions } from "@legend-apps/settings-window/options";
import { createWindowsNavigator, WindowStyleMask, type WindowsConfig } from "@legend-apps/windows";
import { createPresenterToolbarItems } from "./presenterToolbar";

export const slidesSettingsWindowIdentifier = "slides-settings";

const windows = {
  SlidesPresenterWindow: {
    identifier: "slides-presenter",
    loadComponent: () => import("./PresenterWindow").then((module) => module.PresenterWindow),
    options: {
      title: "Legend Slides",
      interceptClose: true,
      windowStyle: {
        appearance: "dark",
        backgroundColor: "#171819",
        height: 820,
        hasToolbar: true,
        minHeight: 600,
        minWidth: 900,
        titlebarAppearsTransparent: true,
        titlebarMaterial: "hudWindow",
        titlebarMaterialBlendingMode: "withinWindow",
        titlebarMaterialState: "active",
        titlebarSeparatorStyle: "none",
        toolbarItems: createPresenterToolbarItems({
          audienceOpen: false,
          displays: [],
          elapsed: 0,
          hasDeck: false,
          rehearsalEnabled: false,
          selectedDisplayId: null,
          timerRunning: false,
        }),
        toolbarStyle: "unifiedCompact",
        width: 1280,
      },
    },
  },
  SlidesAudienceWindow: {
    identifier: "slides-audience",
    loadComponent: () => import("./AudienceWindow").then((module) => module.AudienceWindow),
    options: {
      title: "Legend Slides — Audience",
      windowStyle: {
        height: 720,
        mask: [WindowStyleMask.Titled, WindowStyleMask.Closable, WindowStyleMask.Miniaturizable, WindowStyleMask.Resizable],
        minHeight: 360,
        minWidth: 640,
        width: 1280,
      },
    },
  },
  SlidesNotesWindow: {
    identifier: "slides-notes",
    loadComponent: () => import("./NotesWindow").then(module => module.NotesWindow),
    options: { title: "Legend Slides — Notes", windowStyle: { appearance: "dark", width: 1000, height: 900, minWidth: 600, minHeight: 500 } },
  },
  SlidesIdentifyWindow: {
    identifier: "slides-identify",
    loadComponent: () => import("./NotesWindow").then(module => module.IdentifyWindow),
    options: { title: "Identify Display", windowStyle: { appearance: "dark", width: 300, height: 220 } },
  },
  SlidesSettingsWindow: {
    identifier: slidesSettingsWindowIdentifier,
    loadComponent: () => import("./SettingsWindow").then((module) => module.SettingsWindow),
    options: createSettingsWindowOptions({
      title: "Settings",
      windowStyle: { appearance: "dark" },
    }),
  },
} satisfies WindowsConfig;

export const slidesWindows = createWindowsNavigator(windows);

export function openSlidesSettingsWindow() {
  return slidesWindows.open("SlidesSettingsWindow");
}
