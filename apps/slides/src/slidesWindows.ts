import { createWindowsNavigator, WindowStyleMask, type WindowsConfig } from "@legend-apps/windows";
import { createPresenterToolbarItems } from "./presenterToolbar";

const windows = {
  SlidesPresenterWindow: {
    identifier: "slides-presenter",
    loadComponent: () => import("./PresenterWindow").then((module) => module.PresenterWindow),
    options: {
      title: "Legend Slides",
      windowStyle: {
        appearance: "dark",
        backgroundColor: "#111114",
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
          activeMode: null,
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
} satisfies WindowsConfig;

export const slidesWindows = createWindowsNavigator(windows);
