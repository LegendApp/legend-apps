module.exports = {
  rootDir: "../..",
  setupFiles: ["<rootDir>/packages/syntax-parser/jest.setup.cjs"],
  testMatch: ["<rootDir>/packages/syntax-parser/src/**/__tests__/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend"],
  moduleNameMapper: {
    "^\\./NativeStorage$": "<rootDir>/packages/syntax-parser/jest/nativeStorageMock.cjs",
    "^@legend-apps/storage$": "<rootDir>/packages/storage/src/index.ts",
    "^expo-file-system/next$": "<rootDir>/apps/music/jest/mocks/expoFileSystemNextMock.cjs",
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
