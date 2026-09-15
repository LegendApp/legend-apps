import path from "node:path";

const { transformFileSync } = require("@babel/core");

it("transforms the Markdown editor native exports with React Native codegen", () => {
  const filename = path.resolve(__dirname, "../../../../packages/markdown-block-editor/src/index.ts");

  expect(() => transformFileSync(filename, {
    babelrc: false,
    configFile: false,
    presets: ["module:@react-native/babel-preset"],
  })).not.toThrow();
});
