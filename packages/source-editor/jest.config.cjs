module.exports = {
  rootDir: "../..",
  modulePathIgnorePatterns: ["<rootDir>/shell/.legend/"],
  setupFiles: ["<rootDir>/apps/code/jest.setup.cjs"],
  moduleNameMapper: { "^react-native$": "<rootDir>/apps/diff/jest/mocks/reactNativeMock.cjs" },
  testMatch: ["<rootDir>/packages/source-editor/src/__tests__/**/*.test.ts", "<rootDir>/packages/source-editor/src/__tests__/**/*.test.tsx"],
  transform: { "^.+\\.(js|jsx|ts|tsx)$": ["babel-jest", { presets: ["module:@react-native/babel-preset"] }] },
};
