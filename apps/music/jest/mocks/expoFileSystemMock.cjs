const pathExists = new Map();

module.exports = {
    __esModule: true,
    getInfoAsync: jest.fn(async (uri) => {
        const normalized = uri.startsWith("file://") ? uri.slice("file://".length) : uri;
        const exists = pathExists.has(normalized) ? pathExists.get(normalized) : true;
        return { exists: !!exists, uri };
    }),
    __setMockPathExists: (path, exists) => {
        pathExists.set(path, exists);
    },
    __resetMockPaths: () => {
        pathExists.clear();
    },
};
