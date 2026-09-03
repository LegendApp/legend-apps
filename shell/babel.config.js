module.exports = function (api) {
  api.cache.using(() => process.env.EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE || "");

  const inlineLegendSyntaxAssetSource = ({ types: t }) => ({
    name: "inline-legend-syntax-asset-source",
    visitor: {
      MemberExpression(path) {
        const { node } = path;
        if (
          t.isMemberExpression(node.object)
          && t.isIdentifier(node.object.object, { name: "process" })
          && t.isIdentifier(node.object.property, { name: "env" })
          && t.isIdentifier(node.property, { name: "EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE" })
        ) {
          path.replaceWith(t.valueToNode(process.env.EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE));
        }
      },
    },
  });

  return {
    plugins: [
      ["babel-plugin-react-compiler", { target: "19" }],
      inlineLegendSyntaxAssetSource,
    ],
    presets: ["babel-preset-expo"],
  };
};
