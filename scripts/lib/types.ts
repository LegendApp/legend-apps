export type Platform = "macos" | "ios" | "android";

export type MacOSReleaseArch = "arm" | "x86";

export type MacOSDocumentType = {
  name: string;
  role?: "Editor" | "Viewer" | "Shell" | "None";
  extensions?: string[];
  contentTypes?: string[];
  iconFile?: string;
  handlerRank?: "Owner" | "Default" | "Alternate" | "None";
};

export type MacOSReleaseMetadata = {
  build: string;
  sparkle: {
    publicEdKey: string;
    feedPath?: string;
  };
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
  hostWindow?: {
    macos?: {
      hidden?: boolean;
    };
  };
  nativeModules: Record<Platform, string[]>;
  documentTypes?: {
    macos?: MacOSDocumentType[];
  };
  urlSchemes?: {
    macos?: string[];
  };
  release?: {
    macos?: MacOSReleaseMetadata;
  };
};

export type AppPackageMetadata = {
  version: string;
};

export type NativePackage = {
  name: string;
  root: string;
  platforms: Platform[];
};
