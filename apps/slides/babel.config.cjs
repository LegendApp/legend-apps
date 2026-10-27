module.exports = function (api) {
  const names = ["EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH", "EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_ARTIFACT"];
  api.cache.using(() => names.map(name => process.env[name] || "").join("|"));

  const inlineCompilerPath = ({ types: t }) => ({
    name: "inline-slides-compiler-path",
    visitor: {
      MemberExpression(path) {
        const { node } = path;
        if (
          t.isMemberExpression(node.object)
          && t.isIdentifier(node.object.object, { name: "process" })
          && t.isIdentifier(node.object.property, { name: "env" })
          && t.isIdentifier(node.property)
          && names.includes(node.property.name)
        ) {
          path.replaceWith(t.valueToNode(process.env[node.property.name]));
        }
      },
    },
  });

  return {
    plugins: [inlineCompilerPath, require.resolve("react-native-worklets/plugin")],
  };
};
