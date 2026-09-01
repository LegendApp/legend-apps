import { createWindowsNavigator, WindowStyleMask, type WindowsConfig } from "@legend-apps/windows";
import { AudienceWindow } from "./AudienceWindow";
import { PresenterWindow } from "./PresenterWindow";

const windows = {
  SlidesPresenterWindow: {
    component: PresenterWindow,
    identifier: "slides-presenter",
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
    component: AudienceWindow,
    identifier: "slides-audience",
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
