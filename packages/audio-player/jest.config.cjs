module.exports = {
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["babel-jest", { presets: ["module:@react-native/babel-preset"] }],
  },
};
