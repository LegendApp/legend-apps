module.exports = require("../../scripts/jest/spark.cjs")({
  rootDir: "../..",
  testMatch: ["<rootDir>/apps/git/src/**/__tests__/**/*.test.[t]s?(x)"],
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend"],
  moduleNameMapper: {
    "^@legendapp/spark/processes$": "<rootDir>/packages/git-core/jest/mocks/commandRunnerMock.cjs",
    "^@legend-apps/runtime-utils$": "<rootDir>/packages/runtime-utils/src/decodeProcessText.ts",
    "^@legend-apps/source-editor$": "<rootDir>/apps/git/jest/sourceEditorMock.cjs",
  },
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": ["babel-jest", { presets: ["module:@react-native/babel-preset"] }],
  },
});
