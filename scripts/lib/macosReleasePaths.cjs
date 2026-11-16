const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const wrapper = path.join(__dirname, "hermesc-relative.sh");
const prefixMap = `-fmacro-prefix-map=${root}/=`;
const marker = "# legend: relative __FILE__";

/** Keep build-machine paths out of Release binaries: Hermes source URLs and __FILE__ strings. */
module.exports = function withRelativeReleasePaths(config) {
  const { withPodfile, withXcodeProject } = require(require.resolve("expo-desktop-config-plugins", {
    paths: [config._internal.projectRoot],
  }));
  config = withPodfile(config, mod => {
    const hook = "post_install do |installer|\n";
    const contents = mod.modResults.contents.replace(new RegExp(`^.*${marker}\n`, "gm"), "");
    if (!contents.includes(hook)) throw new Error("Podfile has no post_install hook");
    mod.modResults.contents = contents.replace(hook, `${hook}    installer.pods_project.build_configurations.each { |c| next unless c.name == 'Release'; %w[OTHER_CFLAGS OTHER_CPLUSPLUSFLAGS].each { |k| c.build_settings[k] = [*(c.build_settings[k] || '$(inherited)'), ${JSON.stringify(prefixMap)}].join(' ') } } ${marker}\n`);
    return mod;
  });
  return withXcodeProject(config, mod => {
    const project = mod.modResults;
    const { buildConfigurationList } = project.getFirstProject().firstProject;
    for (const { value } of project.pbxXCConfigurationList()[buildConfigurationList].buildConfigurations) {
      const configuration = project.pbxXCBuildConfigurationSection()[value];
      if (configuration.name !== "Release") continue;
      for (const key of ["OTHER_CFLAGS", "OTHER_CPLUSPLUSFLAGS"]) configuration.buildSettings[key] = JSON.stringify(`$(inherited) ${prefixMap}`);
    }
    const phases = Object.values(project.hash.project.objects.PBXShellScriptBuildPhase ?? {})
      .filter(phase => typeof phase === "object" && phase.shellScript?.includes("react-native-xcode.sh"));
    if (!phases.length) throw new Error("Missing the React Native bundle phase");
    // Hermes records the compiler's input path as the bundle's source URL.
    const setup = `export LEGEND_HERMES_CLI_PATH=\\"$HERMES_CLI_PATH\\"\\nexport HERMES_CLI_PATH=\\"${wrapper}\\"\\n`;
    for (const phase of phases) {
      if (!phase.shellScript.includes(wrapper)) phase.shellScript = phase.shellScript.replace(/^"/, `"${setup}`);
    }
    return mod;
  });
};
