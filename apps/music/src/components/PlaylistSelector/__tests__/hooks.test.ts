import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Alert } from "react-native";

import { showToast } from "@/components/Toast";
import type { LocalTrack } from "@/systems/LocalMusicState";
import { localMusicState$ } from "@/systems/LocalMusicState";

import { generateM3UPlaylist, useQueueExporter } from "../hooks";

jest.mock("@/components/Toast", () => ({
    __esModule: true,
    showToast: jest.fn(),
}));

const FileSystem = require("expo-file-system/next") as {
    __resetMockFileSystem(): void;
    File: new (...segments: unknown[]) => { write(content: string): void };
};

function createTrack(id: string): LocalTrack {
    return {
        id,
        filePath: `/music/${id}.mp3`,
        fileName: `${id}.mp3`,
        title: `Track ${id}`,
        artist: "Test Artist",
        duration: "1:00",
    };
}

function renderQueueExporter(queueTracks: LocalTrack[]) {
    let renderer: ReactTestRenderer | undefined;
    let exporter: ReturnType<typeof useQueueExporter> | undefined;

    function Harness() {
        const value = useQueueExporter({ queueTracks });
        React.useEffect(() => {
            exporter = value;
        }, [value]);
        return null;
    }

    act(() => {
        renderer = create(React.createElement(Harness));
    });

    if (!exporter || !renderer) {
        throw new Error("Failed to render queue exporter harness");
    }

    return { exporter, renderer };
}

describe("generateM3UPlaylist", () => {
    it("builds a valid M3U playlist with formatted duration", () => {
        const playlist = generateM3UPlaylist([
            { title: "Song A", artist: "Artist 1", filePath: "/music/a.mp3", duration: "3:15" },
            { title: "Song B", artist: "Artist 2", filePath: "/music/b.mp3", duration: "120" },
        ]);

        expect(playlist).toContain("#EXTM3U");
        expect(playlist).toContain("#EXTINF:195,Artist 1 - Song A");
        expect(playlist).toContain("#EXTINF:120,Artist 2 - Song B");
        expect(playlist).toContain("/music/a.mp3");
        expect(playlist).toContain("/music/b.mp3");
    });

    it("defaults missing durations to -1", () => {
        const playlist = generateM3UPlaylist([{ title: "Song C", artist: "Artist 3", filePath: "/music/c.mp3" }]);

        expect(playlist).toContain("#EXTINF:-1,Artist 3 - Song C");
    });
});

describe("useQueueExporter", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        FileSystem.__resetMockFileSystem();
        localMusicState$.playlists.set([]);
    });

    afterEach(() => {
        localMusicState$.playlists.set([]);
    });

    it("refuses to save an empty queue", async () => {
        const { exporter, renderer } = renderQueueExporter([]);
        let result = true;

        await act(async () => {
            result = await exporter.handleSavePlaylist("Empty");
        });

        expect(result).toBe(false);
        expect(showToast).toHaveBeenCalledWith("No tracks to save", "error");

        act(() => {
            renderer.unmount();
        });
    });

    it("creates a saved playlist from queue tracks", async () => {
        const { exporter, renderer } = renderQueueExporter([createTrack("a"), createTrack("b")]);
        let result = false;

        await act(async () => {
            result = await exporter.handleSavePlaylist(" Road Mix ");
        });

        const playlists = localMusicState$.playlists.get();
        expect(result).toBe(true);
        expect(playlists).toHaveLength(1);
        expect(playlists[0]).toMatchObject({
            name: "Road Mix",
            source: "cache",
            trackPaths: ["/music/a.mp3", "/music/b.mp3"],
            trackCount: 2,
        });
        expect(showToast).toHaveBeenCalledWith("Road Mix was saved", "info");

        act(() => {
            renderer.unmount();
        });
    });

    it("overwrites an editable playlist with a matching name", async () => {
        const filePath = "/tmp/cache/Legend Music/playlists/Road.m3u";
        new FileSystem.File(filePath).write("#EXTM3U\n/old.mp3\n");
        localMusicState$.playlists.set([
            {
                id: filePath,
                name: "Road",
                filePath,
                trackPaths: ["/old.mp3"],
                trackCount: 1,
                source: "cache",
            },
        ]);

        const { exporter, renderer } = renderQueueExporter([createTrack("new")]);
        let result = false;

        await act(async () => {
            result = await exporter.handleSavePlaylist("road");
        });

        const playlists = localMusicState$.playlists.get();
        expect(result).toBe(true);
        expect(Alert.alert).toHaveBeenCalledWith(
            "Overwrite playlist?",
            "A playlist named “Road” already exists. Overwrite it?",
            expect.any(Array),
            expect.objectContaining({ cancelable: true }),
        );
        expect(playlists).toHaveLength(1);
        expect(playlists[0]).toMatchObject({
            name: "Road",
            trackPaths: ["/music/new.mp3"],
            trackCount: 1,
        });
        expect(showToast).toHaveBeenCalledWith("Road was saved", "info");

        act(() => {
            renderer.unmount();
        });
    });

    it("does not overwrite read-only library playlists", async () => {
        localMusicState$.playlists.set([
            {
                id: "/music/Imported.m3u",
                name: "Imported",
                filePath: "/music/Imported.m3u",
                trackPaths: ["/music/a.mp3"],
                trackCount: 1,
                source: "library-folder",
                originRoot: "/music",
            },
        ]);

        const { exporter, renderer } = renderQueueExporter([createTrack("new")]);
        let result = true;

        await act(async () => {
            result = await exporter.handleSavePlaylist("imported");
        });

        expect(result).toBe(false);
        expect(showToast).toHaveBeenCalledWith("That playlist is read-only", "error");
        expect(localMusicState$.playlists.get()[0]?.trackPaths).toEqual(["/music/a.mp3"]);

        act(() => {
            renderer.unmount();
        });
    });
});
