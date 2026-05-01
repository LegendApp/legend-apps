export type Platform = "macos" | "ios" | "android";

export type MacOSDocumentType = {
  name: string;
  role?: "Editor" | "Viewer" | "Shell" | "None";
  extensions?: string[];
  contentTypes?: string[];
  iconFile?: string;
  handlerRank?: "Owner" | "Default" | "Alternate" | "None";
};

export type AppManifest = {
  id: string;
  displayName: string;
  platforms: Platform[];
  bundleIds: {
    ios: string;
    macos: string;
  };
  androidPackage: string;
  nativeModules: Record<Platform, string[]>;
  documentTypes?: {
    macos?: MacOSDocumentType[];
  };
};

export type NativePackage = {
  name: string;
  root: string;
  platforms: Platform[];
};
