module.exports = {
 beforeQuit: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
 addAppListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
};
