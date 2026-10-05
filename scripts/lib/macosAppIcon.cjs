const fs = require("node:fs");
const path = require("node:path");

module.exports = function withMacOSAppIcon(config, { source }) {
  const { withXcodeProject } = require(require.resolve("expo-desktop-config-plugins", {
    paths: [config._internal.projectRoot],
  }));
  return withXcodeProject(config, mod => {
    const nativeRoot = mod.modRequest.platformProjectRoot;
    const targets = fs.readdirSync(nativeRoot).map(name => path.join(nativeRoot, name, "Assets.xcassets"))
      .filter(directory => fs.existsSync(directory));
    if (targets.length !== 1) throw new Error(`Expected one macOS app icon catalog, found ${targets.length}`);
    const catalog = path.join(targets[0], "AppIcon.appiconset");
    const images = JSON.parse(fs.readFileSync(path.join(source, "Contents.json"), "utf8")).images;
    const artwork = images.find(image => image.size === "512x512" && image.scale === "2x");
    const png = artwork && fs.readFileSync(path.join(source, artwork.filename));
    const appRoot = path.dirname(targets[0]);
    const icon = path.join(appRoot, "AppIcon.icon");
    const project = mod.modResults;
    const groupPath = path.basename(appRoot);
    const group = project.findPBXGroupKey({ path: groupPath })
      ?? project.findPBXGroupKey({ path: JSON.stringify(groupPath) });
    if (!group) throw new Error(`Missing Xcode group for ${groupPath}`);
    const target = project.findTargetKey(groupPath) ?? project.findTargetKey(JSON.stringify(groupPath));
    if (!target) throw new Error(`Missing Xcode target for ${groupPath}`);
    // PNG's IHDR color type 2 is RGB without an alpha channel.
    if (png?.readUInt8(25) !== 2) {
      if (project.hasFile("AppIcon.icon")) {
        const file = project.removeFile("AppIcon.icon", group);
        file.target = target;
        project.removeFromPbxBuildFileSection(file);
        project.removeFromPbxResourcesBuildPhase(file);
      }
      fs.rmSync(icon, { recursive: true, force: true });
      fs.cpSync(source, catalog, { recursive: true, force: true });
      return mod;
    }
    fs.mkdirSync(path.join(icon, "Assets"), { recursive: true });
    fs.writeFileSync(path.join(icon, "Assets/Artwork.png"), png);
    fs.writeFileSync(path.join(icon, "icon.json"), JSON.stringify({
      fill: { solid: "srgb:0,0,0,1" },
      groups: [{
        layers: [{ "image-name": "Artwork.png", name: "Artwork", glass: false }],
        shadow: { kind: "none", opacity: 0 },
        specular: false,
        translucency: { enabled: false, value: 0 },
      }],
      "supported-platforms": { squares: "shared" },
    }, null, 2) + "\n");
    fs.rmSync(catalog, { recursive: true, force: true });
    if (!project.hasFile("AppIcon.icon")) {
      const file = project.addFile("AppIcon.icon", group, { lastKnownFileType: "folder.iconcomposer.icon" });
      file.uuid = project.generateUuid();
      file.target = target;
      project.addToPbxBuildFileSection(file);
      project.addToPbxResourcesBuildPhase(file);
    }
    return mod;
  });
};
