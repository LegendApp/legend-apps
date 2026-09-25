const path = require("node:path");

module.exports = function withLibGit2(config) {
  // Resolve the desktop backend from the consumer, including hoisted installs.
  const { withPodfile } = require(require.resolve("expo-desktop-config-plugins", {
    paths: [config._internal.projectRoot],
  }));
  return withPodfile(config, (mod) => {
    const spec = path.join(__dirname, "third-party-podspecs/LegendLibGit2.podspec");
    const rubyPath = JSON.stringify(spec).replace(/#\{/g, "\\#{");
    const marker = "# diff-parser: libgit2";
    mod.modResults.contents = mod.modResults.contents.replace(/^.*# diff-parser: libgit2\n/gm, "");
    mod.modResults.contents += `\npod 'LegendLibGit2', :podspec => ${rubyPath} ${marker}\n`;
    return mod;
  });
};
