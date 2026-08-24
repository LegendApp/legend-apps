module.exports = {
    __esModule: true,
    cancelActiveCodexRuns: jest.fn(() => 0),
    getCodexAvailability: jest.fn(async () => ({
        available: false,
        codexPath: "",
        message: "Codex is unavailable in tests.",
        userAgent: "",
    })),
    runCodexPrompt: jest.fn(async () => {
        throw new Error("Codex is unavailable in tests.");
    }),
    shutdownCodex: jest.fn(() => 0),
};
