module.exports = {
  rootDir: "../..",
  setupFiles: ["<rootDir>/apps/diff/jest.setup.cjs"],
  testMatch: [
    "<rootDir>/apps/diff/src/**/__tests__/**/*.test.ts",
    "<rootDir>/apps/diff/src/**/__tests__/**/*.test.tsx",
  ],
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend"],
  moduleNameMapper: {
    "^@legend-apps/app-exit$": "<rootDir>/apps/diff/jest/mocks/appExitMock.cjs",
    "^@legend-apps/appkit-split-view$": "<rootDir>/apps/diff/jest/mocks/appKitSplitViewMock.cjs",
    "^@legend-apps/command-runner$": "<rootDir>/apps/diff/jest/mocks/commandRunnerMock.cjs",
    "^@legend-apps/diff-parser$": "<rootDir>/apps/diff/jest/mocks/diffParserMock.cjs",
    "^@legend-apps/file-dialog$": "<rootDir>/apps/diff/jest/mocks/fileDialogMock.cjs",
    "^@legend-apps/sf-symbol$": "<rootDir>/apps/diff/jest/mocks/sfSymbolMock.cjs",
    "^@legend-apps/source-viewer$": "<rootDir>/apps/diff/jest/mocks/sourceViewerMock.cjs",
    "^@legend-apps/storage$": "<rootDir>/apps/diff/jest/mocks/storageMock.cjs",
    "^@legend-apps/syntax-parser$": "<rootDir>/apps/diff/jest/mocks/syntaxParserMock.cjs",
    "^react-native-nitro-modules$": "<rootDir>/packages/diff-parser/jest/reactNativeNitroModulesMock.cjs",
    "^react-native$": "<rootDir>/apps/diff/jest/mocks/reactNativeMock.cjs",
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
