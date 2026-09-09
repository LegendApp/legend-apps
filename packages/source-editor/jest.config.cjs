module.exports = {
  rootDir: "../..",
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend/"],
  testMatch: ["<rootDir>/packages/source-editor/src/__tests__/**/*.test.ts"],
  transform: { "^.+\\.(js|ts)$": ["babel-jest", { presets: ["module:@react-native/babel-preset"] }] },
};
