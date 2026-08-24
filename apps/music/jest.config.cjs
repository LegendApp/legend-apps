module.exports = {
    rootDir: "../..",
    setupFiles: ["<rootDir>/apps/music/jest.setup.cjs"],
    testMatch: [
        "<rootDir>/apps/music/__tests__/**/*.test.ts",
        "<rootDir>/apps/music/__tests__/**/*.test.tsx",
        "<rootDir>/apps/music/src/**/*.test.ts",
        "<rootDir>/apps/music/src/**/*.test.tsx",
    ],
    moduleNameMapper: {
        "^@legend-apps/codex$": "<rootDir>/apps/music/jest/mocks/codexMock.cjs",
        "^@legend-apps/markdown-document$": "<rootDir>/apps/music/jest/mocks/markdownDocumentMock.cjs",
        "^expo-file-system$": "<rootDir>/apps/music/jest/mocks/expoFileSystemMock.cjs",
        "^expo-file-system/next$": "<rootDir>/apps/music/jest/mocks/expoFileSystemNextMock.cjs",
        "^react-native$": "<rootDir>/apps/music/jest/mocks/reactNativeMock.cjs",
        "^.+\\.(css|less|scss)$": "<rootDir>/apps/music/jest/mocks/styleMock.cjs",
        "^nativewind$": "<rootDir>/apps/music/jest/mocks/nativewindMock.cjs",
        "^react-native-css-interop$": "<rootDir>/apps/music/jest/mocks/nativewindMock.cjs",
    },
    transform: {
        "^.+\\.(js|jsx|ts|tsx)$": [
            "babel-jest",
            {
                presets: ["module:@react-native/babel-preset"],
            },
        ],
    },
    transformIgnorePatterns: [
        "node_modules/(?!(react-native|@react-native|@react-native-community|expo-file-system|@legendapp)/)",
    ],
};
