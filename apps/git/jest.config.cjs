module.exports = require("../../scripts/jest/spark.cjs")({
  rootDir: "../..",
  testMatch: ["<rootDir>/apps/git/src/**/__tests__/**/*.test.tsx"],
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": ["babel-jest", { presets: ["module:@react-native/babel-preset"] }],
  },
});
