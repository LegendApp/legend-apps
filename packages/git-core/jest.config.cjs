module.exports = require("../../scripts/jest/spark.cjs")({
  rootDir: "../..",
  testMatch: ["<rootDir>/packages/git-core/src/**/__tests__/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend"],
  moduleNameMapper: {
    "^@legendapp/spark/processes$": "<rootDir>/packages/git-core/jest/mocks/commandRunnerMock.cjs",
    "^@legend-apps/runtime-utils$": "<rootDir>/packages/runtime-utils/src/decodeProcessText.ts",
  },
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": ["babel-jest", { presets: ["module:@react-native/babel-preset"] }],
  },
});
