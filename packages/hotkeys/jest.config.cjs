module.exports = {
  rootDir: "../..",
  testMatch: ["<rootDir>/packages/hotkeys/src/**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@legend-desktop/classnames$": "<rootDir>/packages/classnames/src/index.ts",
    "^@legend-desktop/keyboard-manager$": "<rootDir>/packages/keyboard-manager/src/index.ts",
    "^react-native$": "<rootDir>/packages/hotkeys/jest/reactNativeMock.cjs",
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
