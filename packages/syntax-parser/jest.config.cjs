module.exports = require("../../scripts/jest/spark.cjs")({
  rootDir: "../..",
  roots: ["<rootDir>/packages/syntax-parser"],
  setupFiles: ["<rootDir>/packages/syntax-parser/jest.setup.cjs"],
  testMatch: ["<rootDir>/packages/syntax-parser/src/**/__tests__/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend"],
  moduleNameMapper: {
    "^\\./NativeStorage$": "<rootDir>/packages/syntax-parser/jest/nativeStorageMock.cjs",
    "^@legendapp/spark/settings/observable$": "<rootDir>/packages/storage/src/index.ts",
  },
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      {
        presets: ["module:@react-native/babel-preset"],
      },
    ],
  },
});
