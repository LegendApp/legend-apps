module.exports = {
  rootDir: "../..",
  setupFiles: ["<rootDir>/apps/code/jest.setup.cjs"],
  testMatch: ["<rootDir>/apps/code/src/**/__tests__/**/*.test.tsx"],
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend"],
  moduleNameMapper: {
    "^react-native$": "<rootDir>/apps/diff/jest/mocks/reactNativeMock.cjs",
  },
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": ["babel-jest", { presets: ["module:@react-native/babel-preset"] }],
  },
};
