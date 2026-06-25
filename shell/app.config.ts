import fs from "node:fs";
import path from "node:path";
import type { ExpoConfig } from "expo/config";

type GeneratedAppConfig = {
  id: string;
  displayName: string;
  bundleIds: {
    ios: string;
    macos: string;
  };
  androidPackage: string;
};

function readGeneratedConfig(): GeneratedAppConfig {
  const explicitConfigPath = process.env.LEGEND_APP_CONFIG ?? process.env.LEGEND_NATIVE_CONFIG;
  const appId = process.env.LEGEND_APP;
  const platform = process.env.LEGEND_PLATFORM ?? "ios";

  if (explicitConfigPath) {
    if (!fs.existsSync(explicitConfigPath)) {
      throw new Error(`Missing generated app config at ${explicitConfigPath}`);
    }

    return JSON.parse(fs.readFileSync(explicitConfigPath, "utf8")) as GeneratedAppConfig;
  }

  if (!appId) {
    throw new Error("LEGEND_APP is required. Run apps through the root scripts, for example: bun run music ios");
  }

  const configPath = path.join(
    process.cwd(),
    ".legend",
    "config",
    "release",
    appId,
    platform,
    "app-config.json",
  );

  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing generated app config at ${configPath}. Run through scripts/prebuild-app.ts or scripts/run-app.ts.`);
  }

  return JSON.parse(fs.readFileSync(configPath, "utf8")) as GeneratedAppConfig;
}

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const app = readGeneratedConfig();

  return {
    ...config,
    name: app.displayName,
    slug: app.id,
    version: "0.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    ios: {
      ...config.ios,
      supportsTablet: true,
      bundleIdentifier: app.bundleIds.ios,
    },
    android: {
      ...config.android,
      edgeToEdgeEnabled: true,
      package: app.androidPackage,
      predictiveBackGestureEnabled: false,
    },
    experiments: {
      ...config.experiments,
      autolinkingModuleResolution: true,
      reactCompiler: true,
    },
  };
};
