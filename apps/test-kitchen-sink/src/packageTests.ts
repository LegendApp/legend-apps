import type { KitchenSinkPackage, KitchenSinkTest } from "@legend-desktop/appkit-split-view";

export const packages: KitchenSinkPackage[] = [
  {
    id: "appkit-split-view",
    title: "AppKit SplitView",
  },
  {
    id: "music-test",
    title: "Music Test",
  },
];

export const tests: KitchenSinkTest[] = [
  {
    id: "split-view-basic",
    packageId: "appkit-split-view",
    title: "Basic SplitView",
  },
  {
    id: "split-view-liquid-glass",
    packageId: "appkit-split-view",
    title: "Liquid Glass Sidebar",
  },
  {
    id: "music-native-view",
    packageId: "music-test",
    title: "Native View",
  },
];

export function testsForPackage(packageId: string) {
  return tests.filter((test) => test.packageId === packageId);
}
