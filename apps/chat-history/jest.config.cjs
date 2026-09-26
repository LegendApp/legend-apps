module.exports = require("../../scripts/jest/spark.cjs")({
  rootDir: "../..",
  testMatch: ["<rootDir>/apps/chat-history/src/**/__tests__/**/*.test.ts?(x)"],
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend", "<rootDir>/.build"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": ["babel-jest", {
      presets: ["module:@react-native/babel-preset"],
    }],
  },
});
