const fs = require("node:fs");
const path = require("node:path");

module.exports = function withPhotosIcon(config) {
  const { withXcodeProject } = require(require.resolve("expo-desktop-config-plugins", {
    paths: [config._internal.projectRoot],
  }));
  return withXcodeProject(config, mod => {
    const nativeRoot = mod.modRequest.platformProjectRoot;
    const target = fs.readdirSync(nativeRoot).map(name => path.join(nativeRoot, name, "Assets.xcassets", "AppIcon.appiconset"))
      .find(directory => fs.existsSync(directory));
    if (!target) throw new Error("Photos host has no app icon asset catalog");
    fs.cpSync(path.join(__dirname, "AppIcon.appiconset"), target, { recursive: true });
    return mod;
  });
};
