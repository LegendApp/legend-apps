const path = require("path");
const { getDefaultConfig } = require("@expo/metro-config");
const { makeMetroConfig } = require("@rnx-kit/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const appId = process.env.LEGEND_APP;

if (!appId) {
  throw new Error("LEGEND_APP is required. Run apps through the root scripts, for example: bun run music macos");
}

const rootDir = path.resolve(__dirname, "..");
const appSrc = path.join(rootDir, "apps", appId, "src");

const config = makeMetroConfig(getDefaultConfig(__dirname));

config.projectRoot = __dirname;
config.watchFolders = [
  rootDir,
  path.join(rootDir, "apps"),
  path.join(rootDir, "packages"),
];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "@legend-desktop/app": appSrc,
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@/")) {
    return context.resolveRequest(context, path.join(appSrc, moduleName.slice(2)), platform);
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.platforms = [...new Set([...(config.resolver.platforms || []), "macos"])];
config.resolver.unstable_conditionsByPlatform = {
  ...(config.resolver.unstable_conditionsByPlatform || {}),
  macos: ["react-native"],
};
config.resolver.useWatchman = false;
config.cacheVersion = `legend-desktop-${appId}-${process.env.LEGEND_PLATFORM || "native"}`;

delete config.watcher?.unstable_workerThreads;

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
