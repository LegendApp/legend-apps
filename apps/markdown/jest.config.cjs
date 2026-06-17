module.exports = {
  rootDir: "../..",
  testMatch: [
    "<rootDir>/apps/markdown/src/**/*.test.ts",
    "<rootDir>/apps/markdown/src/**/*.test.tsx",
  ],
  moduleNameMapper: {
    "^@gorhom/portal$": "<rootDir>/apps/markdown/jest/gorhomPortalMock.cjs",
    "^@legend-desktop/(.*)$": "<rootDir>/packages/$1/src",
    "^react-native$": "<rootDir>/apps/markdown/jest/reactNativeMock.cjs",
    "^uniwind$": "<rootDir>/apps/markdown/jest/uniwindMock.cjs",
  },
  setupFilesAfterEnv: ["<rootDir>/apps/markdown/jest.setup.cjs"],
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
};
