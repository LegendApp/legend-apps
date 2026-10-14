module.exports = require("../../scripts/jest/spark.cjs")({
  rootDir: "../..",
  testMatch: [
    "<rootDir>/packages/workspace/src/**/*.test.ts",
    "<rootDir>/packages/workspace/src/**/*.test.tsx",
  ],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      {
        presets: ["module:@react-native/babel-preset"],
      },
    ],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|@react-native-community|@legendapp)/)",
  ],
});
