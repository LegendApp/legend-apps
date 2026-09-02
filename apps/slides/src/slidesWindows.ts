import { createWindowsNavigator, WindowStyleMask, type WindowsConfig } from "@legend-apps/windows";

const windows = {
  SlidesPresenterWindow: {
    identifier: "slides-presenter",
    loadComponent: () => import("./PresenterWindow").then((module) => module.PresenterWindow),
    options: {
      title: "Legend Slides",
      windowStyle: {
        height: 820,
        minHeight: 600,
        minWidth: 900,
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
