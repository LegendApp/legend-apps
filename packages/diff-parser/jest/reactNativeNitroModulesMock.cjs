let diffParser;

const NitroModules = {
  createHybridObject: jest.fn((name) => {
    if (name !== "DiffParser") {
      throw new Error(`Unexpected hybrid object ${name}`);
    }
    return diffParser;
  }),
};

module.exports = {
  __esModule: true,
  NitroModules,
  __setDiffParser(parser) {
    diffParser = parser;
    NitroModules.createHybridObject.mockClear();
  },
};
