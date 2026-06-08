module.exports = {
  rootDir: "../..",
  testMatch: ["<rootDir>/packages/ai/src/**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^react-native$": "<rootDir>/packages/command-runner/jest/reactNativeMock.cjs",
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
