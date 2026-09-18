module.exports = function (api) {
  api.cache.using(() => [
    process.env.EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE || "",
    process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH || "",
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
          && ["EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE", "EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH"].includes(node.property.name)
        ) {
          path.replaceWith(t.valueToNode(process.env[node.property.name]));
        }
      },
    },
  });

  return {
    plugins: [
      ["babel-plugin-react-compiler", { target: "19" }],
      inlineLegendPublicPaths,
      "@babel/plugin-transform-class-static-block",
      require.resolve("react-native-worklets/plugin", {
        paths: [require("path").join(__dirname, "../apps/slides")],
      }),
    ],
    presets: ["babel-preset-expo"],
  };
};
