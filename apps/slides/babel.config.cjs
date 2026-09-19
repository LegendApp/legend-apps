module.exports = function (api) {
  api.cache.using(() => process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH || "");

  const inlineCompilerPath = ({ types: t }) => ({
    name: "inline-slides-compiler-path",
    visitor: {
      MemberExpression(path) {
        const { node } = path;
        if (
          t.isMemberExpression(node.object)
          && t.isIdentifier(node.object.object, { name: "process" })
          && t.isIdentifier(node.object.property, { name: "env" })
          && t.isIdentifier(node.property, { name: "EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH" })
        ) {
          path.replaceWith(t.valueToNode(process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH));
        }
      },
    },
  });

  return {
    plugins: [inlineCompilerPath, require.resolve("react-native-worklets/plugin")],
  };
};
