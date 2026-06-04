import { loadLocalPlaylists, localMusicState$ } from "@/systems/LocalMusicState";

const FileSystem = require("expo-file-system/next") as {
    __resetMockFileSystem(): void;
    Directory: new (...segments: unknown[]) => { create(): void };
    File: new (...segments: unknown[]) => { path: string; write(content: string): void };
};

describe("loadLocalPlaylists", () => {
    beforeEach(() => {
        FileSystem.__resetMockFileSystem();
        localMusicState$.playlists.set([]);
    });

    afterEach(() => {
        localMusicState$.playlists.set([]);
    });

    it("loads cache m3u playlists and ignores queue or non-playlist files", () => {
        const playlistDirectory = new FileSystem.Directory("/tmp/cache", "Legend Music", "playlists");
        playlistDirectory.create();
        new FileSystem.File(playlistDirectory, "Road.m3u").write(
            ["#EXTM3U", "#EXTINF:195,Artist - Song", "song.mp3", "/absolute/other.mp3", ""].join("\n"),
        );
        new FileSystem.File(playlistDirectory, "queue.m3u").write("#EXTM3U\n/queued.mp3\n");
        new FileSystem.File(playlistDirectory, "notes.txt").write("/ignored.mp3\n");

        loadLocalPlaylists();

        expect(localMusicState$.playlists.get()).toEqual([
            expect.objectContaining({
                id: "/tmp/cache/Legend Music/playlists/Road.m3u",
                name: "Road",
                filePath: "/tmp/cache/Legend Music/playlists/Road.m3u",
                source: "cache",
                trackPaths: ["/tmp/cache/Legend Music/playlists/song.mp3", "/absolute/other.mp3"],
                trackCount: 2,
            }),
        ]);
    });

    it("loads m3u8 playlists and preserves uri-style entries", () => {
        const playlistDirectory = new FileSystem.Directory("/tmp/cache", "Legend Music", "playlists");
        playlistDirectory.create();
        new FileSystem.File(playlistDirectory, "Streaming.m3u8").write(
            ["#EXTM3U", "#EXTINF:-1,Stream", "spotify:track:abc", "https://example.test/song.mp3", ""].join("\n"),
        );

        loadLocalPlaylists();

        expect(localMusicState$.playlists.get()).toEqual([
            expect.objectContaining({
                name: "Streaming",
                trackPaths: ["spotify:track:abc", "https://example.test/song.mp3"],
                trackCount: 2,
            }),
        ]);
    });
});
