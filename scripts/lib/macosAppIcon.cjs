const fs = require("node:fs");
const path = require("node:path");

module.exports = function withMacOSAppIcon(config, { source }) {
  const { withXcodeProject } = require(require.resolve("expo-desktop-config-plugins", {
    paths: [config._internal.projectRoot],
  }));
  return withXcodeProject(config, mod => {
    const nativeRoot = mod.modRequest.platformProjectRoot;
    const targets = fs.readdirSync(nativeRoot).map(name => path.join(nativeRoot, name, "Assets.xcassets", "AppIcon.appiconset"))
      .filter(directory => fs.existsSync(directory));
    if (targets.length !== 1) throw new Error(`Expected one macOS app icon catalog, found ${targets.length}`);
    fs.cpSync(source, targets[0], { recursive: true, force: true });
    return mod;
  });
};
