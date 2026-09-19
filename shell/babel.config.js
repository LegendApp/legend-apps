const fs = require("fs");
const path = require("path");

module.exports = function (api) {
  api.cache.using(() => [
    process.env.LEGEND_APP || "",
    process.env.EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE || "",
  ].join("|"));

  const inlineLegendPublicPaths = ({ types: t }) => ({
    name: "inline-legend-public-paths",
    visitor: {
      MemberExpression(path) {
        const { node } = path;
        if (
          t.isMemberExpression(node.object)
          && t.isIdentifier(node.object.object, { name: "process" })
          && t.isIdentifier(node.object.property, { name: "env" })
          && t.isIdentifier(node.property)
          && node.property.name === "EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE"
        ) {
          path.replaceWith(t.valueToNode(process.env[node.property.name]));
        }
      },
    },
  });

  const appId = process.env.LEGEND_APP;
  const appConfigPath = appId && path.join(__dirname, "../apps", appId, "babel.config.cjs");
  const extension = appConfigPath && fs.existsSync(appConfigPath) ? require(appConfigPath) : {};
  const appConfig = typeof extension === "function" ? extension(api) : extension;
  if (!appConfig || Object.keys(appConfig).some(key => key !== "plugins")
      || (appConfig.plugins !== undefined && !Array.isArray(appConfig.plugins))) {
    throw new Error("App babel.config.cjs must return an object containing only a plugins array");
  }

  return {
    plugins: [
      ["babel-plugin-react-compiler", { target: "19" }],
      inlineLegendPublicPaths,
      "@babel/plugin-transform-class-static-block",
      ...(appConfig.plugins || []),
    ],
    presets: ["babel-preset-expo"],
  };
};
