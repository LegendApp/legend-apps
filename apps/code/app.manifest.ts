import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "code",
  displayName: "Legend Code",
  platforms: ["macos"],
  bundleIds: {
    ios: "app.legend.code",
    macos: "app.legend.code.macos",
  },
  androidPackage: "app.legend.code",
  nativeModules: {
    macos: [
      "@legend-desktop/app-exit",
      "@legend-desktop/file-dialog",
      "@legend-desktop/native-menu",
      "@legend-desktop/recent-documents",
      "@legend-desktop/syntax-parser",
      "@legend-desktop/window-manager",
    ],
    ios: [],
    android: [],
  },
  documentTypes: {
    macos: [
      {
        name: "TypeScript source file",
        role: "Viewer",
        extensions: ["ts", "tsx"],
        contentTypes: ["public.source-code"],
      },
    ],
  },
} satisfies AppManifest;

export default manifest;
