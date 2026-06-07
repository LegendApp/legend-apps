module.exports = {
  rootDir: "../..",
  testMatch: [
    "<rootDir>/packages/markdown-document/src/**/*.test.ts",
    "<rootDir>/packages/markdown-document/src/**/*.test.tsx",
  ],
  setupFilesAfterEnv: ["<rootDir>/packages/markdown-document/jest.setup.cjs"],
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
