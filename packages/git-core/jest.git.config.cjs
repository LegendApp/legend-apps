module.exports = {
  ...require("../../apps/diff/jest.config.cjs"),
  testMatch: ["<rootDir>/packages/git-core/test/git/**/*.test.ts"],
};
