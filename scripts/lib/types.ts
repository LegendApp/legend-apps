export type Platform = "macos" | "ios" | "android";

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
};

export type NativePackage = {
  name: string;
  root: string;
  platforms: Platform[];
};
