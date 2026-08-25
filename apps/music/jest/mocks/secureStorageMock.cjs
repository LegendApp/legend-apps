const values = new Map();
const storage = {
    get: jest.fn((namespace, key) => values.get(`${namespace}:${key}`) ?? ""),
    set: jest.fn((namespace, key, value) => values.set(`${namespace}:${key}`, value)),
    remove: jest.fn((namespace, key) => values.delete(`${namespace}:${key}`)),
};

module.exports = {
    getSecureStorage: jest.fn(() => storage),
};
