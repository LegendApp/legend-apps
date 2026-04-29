const fs = require("fs");
const path = require("path");

function readGeneratedConfig() {
  const explicitConfigPath = process.env.LEGEND_NATIVE_CONFIG;
  const appId = process.env.LEGEND_APP;
  const platform = process.env.LEGEND_PLATFORM || "ios";

  if (explicitConfigPath) {
    if (!fs.existsSync(explicitConfigPath)) {
      throw new Error(`Missing generated native config at ${explicitConfigPath}`);
    }

    return JSON.parse(fs.readFileSync(explicitConfigPath, "utf8"));
  }

  if (!appId) {
    return null;
  }

  const configPath = path.join(__dirname, ".legend", "config", "release", appId, platform, "app-config.json");
  if (!fs.existsSync(configPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

const generated = readGeneratedConfig();
const dependencies = {};

for (const pkg of generated?.activeNativePackages ?? []) {
  const root = path.resolve(__dirname, "..", pkg.root);
  dependencies[pkg.name] = {
    root,
  };
}

for (const pkg of generated?.excludedNativePackages ?? []) {
  dependencies[pkg.name] = {
    platforms: {
      android: null,
      ios: null,
      macos: null,
    },
  };
}

module.exports = {
  dependencies,
};
