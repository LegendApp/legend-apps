module.exports = {
  rootDir: "../..",
  testMatch: ["<rootDir>/packages/diff-parser/src/**/__tests__/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend"],
  moduleNameMapper: {
    "^react-native-nitro-modules$": "<rootDir>/packages/diff-parser/jest/reactNativeNitroModulesMock.cjs",
  },
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      {
        presets: ["module:@react-native/babel-preset"],
      },
    ],
  },
};
