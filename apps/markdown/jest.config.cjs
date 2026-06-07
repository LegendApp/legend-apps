module.exports = {
  rootDir: "../..",
  testMatch: [
    "<rootDir>/apps/markdown/src/**/*.test.ts",
    "<rootDir>/apps/markdown/src/**/*.test.tsx",
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
};
