import { createMockCommandRunner } from "@legend-apps/command-runner";
import { generatePlaylistExtension } from "../playlistGeneration";
import type { LocalPlaylist, LocalTrack } from "../../LocalMusicState";

const track = (overrides: Partial<LocalTrack>): LocalTrack => ({
    id: overrides.filePath ?? "track",
    title: "Title",
    artist: "Artist",
    duration: "3:00",
    fileName: "track.mp3",
    filePath: "/music/track.mp3",
    ...overrides,
});

const playlist = (overrides: Partial<LocalPlaylist> = {}): LocalPlaylist => ({
    id: "playlist",
    name: "Road Trip",
    filePath: "/playlists/road-trip.m3u",
    trackPaths: ["/music/a.mp3"],
    tracks: [{ id: "a", filePath: "/music/a.mp3", title: "Song A", artist: "Artist A", duration: 180 }],
    trackCount: 1,
    source: "cache",
    ...overrides,
});

describe("generatePlaylistExtension", () => {
    it("runs the preferred AI tool and resolves local tracks", async () => {
        const runner = createMockCommandRunner({
            availability: { codex: true },
            run: (params) => ({
                stdout: JSON.stringify({ tracks: [{ filePath: "/music/b.mp3" }] }),
                stderr: "",
                exitCode: 0,
                timedOut: false,
            }),
        });

        const result = await generatePlaylistExtension({
            libraryTracks: [
                track({ filePath: "/music/a.mp3", title: "Song A", artist: "Artist A" }),
                track({ filePath: "/music/b.mp3", title: "Song B", artist: "Artist B" }),
            ],
            playlist: playlist(),
            runner,
            targetCount: 10,
        });

        expect(result.tracks.map((item) => item.filePath)).toEqual(["/music/b.mp3"]);
        expect(result.rawResult.tool).toBe("codex");
    });

    it("throws when no AI tool is available", async () => {
        await expect(
            generatePlaylistExtension({
                libraryTracks: [track({ filePath: "/music/b.mp3" })],
                playlist: playlist(),
                runner: createMockCommandRunner(),
            }),
        ).rejects.toThrow("Claude or Codex CLI is not available.");
    });

    it("throws when auto mode has no playlist context", async () => {
        await expect(
            generatePlaylistExtension({
                libraryTracks: [track({ filePath: "/music/b.mp3" })],
                playlist: playlist({ trackPaths: [], tracks: [], trackCount: 0 }),
                runner: createMockCommandRunner({ availability: { claude: true } }),
            }),
        ).rejects.toThrow("Add tracks to the playlist or enter a prompt first.");
    });

    it("allows an empty playlist with a user prompt", async () => {
        const runner = createMockCommandRunner({
            availability: { claude: true },
            run: () => ({
                stdout: JSON.stringify({ tracks: [{ filePath: "/music/b.mp3" }] }),
                stderr: "",
                exitCode: 0,
                timedOut: false,
            }),
        });

        const result = await generatePlaylistExtension({
            libraryTracks: [track({ filePath: "/music/b.mp3" })],
            playlist: playlist({ trackPaths: [], tracks: [], trackCount: 0 }),
            runner,
            userPrompt: "make it energetic",
        });

        expect(result.tracks.map((item) => item.filePath)).toEqual(["/music/b.mp3"]);
    });

    it("throws when suggestions do not resolve to new local tracks", async () => {
        const runner = createMockCommandRunner({
            availability: { claude: true },
            run: () => ({
                stdout: JSON.stringify({ tracks: [{ filePath: "/music/missing.mp3" }] }),
                stderr: "",
                exitCode: 0,
                timedOut: false,
            }),
        });

        await expect(
            generatePlaylistExtension({
                libraryTracks: [track({ filePath: "/music/a.mp3" })],
                playlist: playlist(),
                runner,
            }),
        ).rejects.toThrow("No new local library tracks are available for this playlist.");
    });
});
