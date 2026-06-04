import { SUPPORTED_AUDIO_EXTENSIONS } from "@/systems/audioFormats";
import { clearLibraryCache } from "@/systems/LibraryCache";
import type { LocalTrack } from "@/systems/LocalMusicState";
import {
    createLocalTrackFromFile,
    initializeLocalMusic,
    librarySettings$,
    localMusicState$,
    scanLocalMusic,
} from "@/systems/LocalMusicState";

jest.mock("expo-file-system", () => {
    const pathExists = new Map<string, boolean>();
    return {
        __esModule: true,
        getInfoAsync: jest.fn(async (uri: string) => {
            const normalized = uri.startsWith("file://") ? uri.slice("file://".length) : uri;
            const exists = pathExists.has(normalized) ? pathExists.get(normalized) : true;
            return { exists: !!exists, uri };
        }),
        __setMockPathExists: (path: string, exists: boolean) => {
            pathExists.set(path, exists);
        },
        __resetMockPaths: () => {
            pathExists.clear();
        },
    };
});

jest.mock("expo-file-system/next", () => {
    const mockFs = new Map<string, { files: string[]; directories: string[] }>();

    const normalizePath = (input: string): string => {
        if (!input) {
            return "/";
        }
        const withoutProtocol = input.startsWith("file://") ? input.replace("file://", "") : input;
        const collapsed = withoutProtocol.replace(/\/+/g, "/");
        if (collapsed === "/") {
            return "/";
        }
        const trimmed = collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
        return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    };

    const resolvePath = (segments: Array<string | MockDirectory | MockFile>): string => {
        if (segments.length === 0) {
            return "/";
        }

        let resolved = "/";

        for (const segment of segments) {
            if (!segment) {
                continue;
            }

            let value: string;
            if (segment instanceof MockDirectory || segment instanceof MockFile) {
                value = segment.path;
            } else {
                value = String(segment);
            }

            const normalized = normalizePath(value);

            if (normalized.startsWith("/")) {
                resolved = normalized;
            } else {
                resolved = normalizePath(resolved === "/" ? `/${normalized}` : `${resolved}/${normalized}`);
            }
        }

        return resolved || "/";
    };

    class MockFile {
        public readonly name: string;
        public readonly uri: string;
        public readonly path: string;
        public exists = true;

        constructor(...segments: Array<string | MockDirectory | MockFile>) {
            this.path = resolvePath(segments);
            this.name = this.path.split("/").pop() ?? this.path;
            this.uri = `file://${this.path}`;
        }

        create(): void {
            const directoryPath = this.path.split("/").slice(0, -1).join("/") || "/";
            const entry = mockFs.get(directoryPath) ?? { directories: [], files: [] };
            if (!entry.files.includes(this.name)) {
                entry.files.push(this.name);
            }
            mockFs.set(directoryPath, entry);
            this.exists = true;
        }

        write(): void {
            // no-op for tests
        }

        text(): string {
            return "";
        }

        textSync(): string {
            return "";
        }

        bytes(): Uint8Array {
            return new Uint8Array();
        }
    }

    class MockDirectory {
        public readonly name: string;
        public readonly uri: string;
        public exists: boolean;

        public readonly path: string;

        constructor(...segments: Array<string | MockDirectory | MockFile>) {
            this.path = resolvePath(segments);
            this.name = this.path === "/" ? "/" : (this.path.split("/").pop() ?? this.path);
            this.exists = mockFs.has(this.path);
            this.uri = `file://${this.path}`;
        }

        list(): (MockDirectory | MockFile)[] {
            const entry = mockFs.get(this.path);
            if (!entry) {
                return [];
            }

            const directories = entry.directories.map((dir) => new MockDirectory(this, dir));
            const files = entry.files.map((file) => new MockFile(this, file));
            return [...directories, ...files];
        }

        create(): void {
            if (!mockFs.has(this.path)) {
                mockFs.set(this.path, { directories: [], files: [] });
            }
            this.exists = true;
        }
    }

    const cacheDirectory = new MockDirectory("/tmp/cache");

    const moduleExports = {
        Directory: MockDirectory,
        File: MockFile,
        Paths: {
            get cache() {
                return cacheDirectory;
            },
            get document() {
                return cacheDirectory;
            },
        },
        __setMockFileSystem(data: Record<string, { files: string[]; directories: string[] }>) {
            mockFs.clear();
            for (const [rawPath, entry] of Object.entries(data)) {
                mockFs.set(normalizePath(rawPath), {
                    directories: [...entry.directories],
                    files: [...entry.files],
                });
            }
        },
    };
    return moduleExports;
});

jest.mock("@/utils/cacheDirectories", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-var-requires
    const FileSystem = require("expo-file-system/next");

    return {
        getCacheDirectory(subdirectory: string) {
            return new FileSystem.Directory("/tmp/cache", "Legend Music", subdirectory);
        },
        getPlaylistsDirectory() {
            return new FileSystem.Directory("/tmp/cache", "Legend Music", "playlists");
        },
        ensureCacheDirectory: jest.fn(),
        deleteCacheFiles: jest.fn(),
    };
});

jest.mock("@/utils/ExpoFSPersistPlugin", () => {
    const tables: Record<string, any> = {};
    const plugin = {
        initialize: jest.fn(),
        getTable: (table: string, init: object) => tables[table] ?? init ?? {},
        getMetadata: (table: string) => tables[`${table}__m`] ?? {},
        set: jest.fn(async (table: string) => {
            tables[table] = tables[table] ?? {};
        }),
        setMetadata: jest.fn(async (table: string, value: any) => {
            tables[`${table}__m`] = value;
        }),
        deleteTable: jest.fn((table: string) => {
            delete tables[table];
        }),
        deleteMetadata: jest.fn((table: string) => {
            delete tables[`${table}__m`];
        }),
    };

    return {
        __esModule: true,
        observablePersistExpoFS: jest.fn(() => plugin),
    };
});

jest.mock("@legend-desktop/media-library-scanner", () => ({
    __esModule: true,
    ...(() => {
        const listeners: Record<string, Set<(payload: any) => void>> = {};

        const emit = (event: string, payload: any) => {
            listeners[event]?.forEach((handler) => handler(payload));
        };

        const addMediaLibraryScannerListener = jest.fn((event: string, handler: (payload: any) => void) => {
            listeners[event] = listeners[event] ?? new Set();
            listeners[event]?.add(handler);
            return {
                remove: () => listeners[event]?.delete(handler),
            };
        });

        const scanMediaLibrary = jest.fn(async () => {
            throw new Error("native scan unavailable in tests");
        });

        return {
            scanMediaLibrary,
            addMediaLibraryScannerListener,
            __emit: emit,
        };
    })(),
}));

jest.mock("@legend-desktop/file-system-watcher", () => ({
    addDirectoryChangeListener: jest.fn(() => ({ remove: jest.fn() })),
    setWatchedDirectories: jest.fn(),
}));

jest.mock("@/systems/LibraryCache", () => ({
    __esModule: true,
    clearLibraryCache: jest.fn(),
    hasCachedLibraryData: jest.fn(() => false),
    getLibrarySnapshot: jest.fn(() => ({
        version: 1,
        updatedAt: Date.now(),
        tracks: [],
        lastScanTime: null,
        roots: [],
    })),
}));

jest.mock("@shopify/react-native-skia", () => ({
    Skia: {
        Image: {
            MakeImageFromEncoded: jest.fn(() => null),
        },
        Surface: {
            Make: jest.fn(() => null),
        },
        Data: {
            fromBytes: jest.fn(() => null),
        },
        XYWHRect: jest.fn(() => ({})),
        Paint: jest.fn(),
    },
}));

describe("scanLocalMusic", () => {
    const getMockFsSetter = () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any
        const module: any = require("expo-file-system/next");
        return module.__setMockFileSystem as (data: Record<string, { files: string[]; directories: string[] }>) => void;
    };

    const setPathExists = (path: string, exists: boolean) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any
        const module: any = require("expo-file-system");
        if (typeof module.__setMockPathExists === "function") {
            module.__setMockPathExists(path, exists);
        }
    };

    const resetPathExists = () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any
        const module: any = require("expo-file-system");
        if (typeof module.__resetMockPaths === "function") {
            module.__resetMockPaths();
        }
    };

    const getMediaLibraryScannerMock = () =>
        require("@legend-desktop/media-library-scanner") as {
            scanMediaLibrary: jest.Mock;
            addMediaLibraryScannerListener: jest.Mock;
            __emit: (event: string, payload: any) => void;
        };

    let mockScanTracks: Array<{ relativePath: string; fileName?: string }>;

    beforeEach(() => {
        jest.useFakeTimers();
        mockScanTracks = [
            { relativePath: "root.mp3", fileName: "root.mp3" },
            { relativePath: "sub/nested.mp3", fileName: "nested.mp3" },
            { relativePath: "sub/deeper/deep.mp3", fileName: "deep.mp3" },
        ];
        resetPathExists();
        getMockFsSetter()({
            "/music": {
                files: ["root.mp3", "ignore.txt"],
                directories: ["sub"],
            },
            "/music/sub": {
                files: ["nested.mp3"],
                directories: ["deeper"],
            },
            "/music/sub/deeper": {
                files: ["deep.mp3"],
                directories: [],
            },
        });

        librarySettings$.paths.set(() => ["/music"]);
        localMusicState$.tracks.set([]);
        localMusicState$.error.set(null);

        const scanner = getMediaLibraryScannerMock();
        scanner.scanMediaLibrary.mockReset();
        scanner.scanMediaLibrary.mockImplementation(async (_paths: string[], _cacheDir: string, options?: any) => {
            if (options?.allowedExtensions) {
                expect(options.allowedExtensions).toEqual(SUPPORTED_AUDIO_EXTENSIONS);
            }

            scanner.__emit("onMediaScanBatch", { rootIndex: 0, tracks: mockScanTracks });
            scanner.__emit("onMediaScanComplete", {
                totalTracks: mockScanTracks.length,
                totalRoots: 1,
                errors: [],
            });

            return { totalTracks: mockScanTracks.length, totalRoots: 1, errors: [] };
        });
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    it("discovers mp3 files in nested directories", async () => {
        await scanLocalMusic();
        jest.runOnlyPendingTimers();
        await Promise.resolve();

        const tracks: LocalTrack[] = localMusicState$.tracks.get();
        const filePaths = tracks.map((track) => track.filePath);

        expect(filePaths).toEqual(
            expect.arrayContaining(["/music/root.mp3", "/music/sub/nested.mp3", "/music/sub/deeper/deep.mp3"]),
        );
        expect(filePaths).not.toContain("/music/ignore.txt");
        expect(tracks).toHaveLength(3);
    });

    it("clears cached library data when a library path is removed", () => {
        const clearLibraryCacheMock = clearLibraryCache as jest.Mock;
        initializeLocalMusic();

        localMusicState$.tracks.set([
            {
                id: "/music/root.mp3",
                title: "Root",
                artist: "Artist",
                duration: "0:00",
                filePath: "/music/root.mp3",
                fileName: "root.mp3",
            },
        ]);
        librarySettings$.lastScanTime.set(123);

        librarySettings$.paths.set(() => []);

        expect(clearLibraryCacheMock).toHaveBeenCalledTimes(1);
        expect(localMusicState$.tracks.get()).toEqual([]);
        expect(librarySettings$.lastScanTime.get()).toBe(0);
    });

    it("skips missing library folders without crashing", async () => {
        const setFs = getMockFsSetter();
        setFs({
            "/other": {
                files: ["alt.mp3"],
                directories: [],
            },
        });
        setPathExists("/music", false);
        setPathExists("/other", true);
        librarySettings$.paths.set(() => ["/music", "/other"]);
        mockScanTracks = [{ relativePath: "alt.mp3", fileName: "alt.mp3" }];

        await scanLocalMusic();
        jest.runOnlyPendingTimers();
        await Promise.resolve();

        const tracks: LocalTrack[] = localMusicState$.tracks.get();
        expect(tracks).toHaveLength(1);
        expect(tracks[0]?.filePath).toContain("/other/alt.mp3");
        expect(localMusicState$.error.get()).toContain("Skipping missing folders");
    });

    it("filters scan results to supported extensions", async () => {
        const scanner = getMediaLibraryScannerMock();

        scanner.scanMediaLibrary.mockImplementationOnce(
            async (_paths: string[], _cacheDir: string, options?: any) => {
                expect(options?.allowedExtensions).toEqual(SUPPORTED_AUDIO_EXTENSIONS);

                scanner.__emit("onMediaScanBatch", {
                    rootIndex: 0,
                    tracks: [
                        { relativePath: "keep.flac", fileName: "keep.flac" },
                        { relativePath: "skip.ogg", fileName: "skip.ogg" },
                    ],
                });
                scanner.__emit("onMediaScanComplete", { totalTracks: 2, totalRoots: 1, errors: [] });

                return { totalTracks: 2, totalRoots: 1, errors: [] };
            },
        );

        await scanLocalMusic();
        jest.runOnlyPendingTimers();
        await Promise.resolve();

        const tracks: LocalTrack[] = localMusicState$.tracks.get();
        expect(tracks).toHaveLength(1);
        expect(tracks[0]?.fileName).toBe("keep.flac");
        expect(tracks[0]?.filePath).toContain("/music/keep.flac");
    });

    it("deduplicates duplicate native scan results by path", async () => {
        const scanner = getMediaLibraryScannerMock();

        scanner.scanMediaLibrary.mockImplementationOnce(async () => {
            scanner.__emit("onMediaScanBatch", {
                rootIndex: 0,
                tracks: [
                    { relativePath: "dup.mp3", fileName: "dup.mp3" },
                    { relativePath: "dup.mp3", fileName: "dup.mp3" },
                ],
            });
            scanner.__emit("onMediaScanComplete", { totalTracks: 2, totalRoots: 1, errors: [] });
            return { totalTracks: 2, totalRoots: 1, errors: [] };
        });

        await scanLocalMusic();
        jest.runOnlyPendingTimers();
        await Promise.resolve();

        const tracks: LocalTrack[] = localMusicState$.tracks.get();
        expect(tracks).toHaveLength(1);
        expect(tracks[0]?.fileName).toBe("dup.mp3");
    });
});

describe("createLocalTrackFromFile", () => {
    it("rejects unsupported audio formats", async () => {
        await expect(createLocalTrackFromFile("/music/track.ogg")).rejects.toThrow("Unsupported audio format");
    });
});
