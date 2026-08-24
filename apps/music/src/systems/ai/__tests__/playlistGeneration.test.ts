import type { CodexRunResult } from "@legend-apps/codex";
import { generatePlaylistExtension, type PlaylistCodexClient } from "../playlistGeneration";
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

const codexResult = (output: string): CodexRunResult => ({
    model: "test-model",
    output,
    threadId: "thread-1",
    turnId: "turn-1",
    userAgent: "codex-test",
});

function createMockCodexClient({
    available = true,
    message = "Codex is ready.",
    runPrompt = async () => codexResult('{"tracks":[]}'),
}: {
    available?: boolean;
    message?: string;
    runPrompt?: PlaylistCodexClient["runPrompt"];
} = {}): PlaylistCodexClient {
    return {
        getAvailability: async () => ({ available, codexPath: "/usr/bin/codex", message, userAgent: "codex-test" }),
        runPrompt,
    };
}

describe("generatePlaylistExtension", () => {
    it("runs the preferred AI tool and resolves local tracks", async () => {
        const runPrompt = jest.fn(async () =>
            codexResult(JSON.stringify({ tracks: [{ filePath: "/music/b.mp3" }] })),
        );
        const codexClient = createMockCodexClient({
            runPrompt,
        });

        const result = await generatePlaylistExtension({
            libraryTracks: [
                track({ filePath: "/music/a.mp3", title: "Song A", artist: "Artist A" }),
                track({ filePath: "/music/b.mp3", title: "Song B", artist: "Artist B" }),
            ],
            playlist: playlist(),
            codexClient,
            targetCount: 10,
        });

        expect(result.tracks.map((item) => item.filePath)).toEqual(["/music/b.mp3"]);
        expect(result.rawResult.threadId).toBe("thread-1");
        expect(runPrompt).toHaveBeenCalledWith(
            expect.stringContaining("Local library catalog"),
            expect.objectContaining({
                outputSchema: expect.objectContaining({ type: "object" }),
                reasoningEffort: "low",
            }),
        );
    });

    it("throws when no AI tool is available", async () => {
        await expect(
            generatePlaylistExtension({
                libraryTracks: [track({ filePath: "/music/b.mp3" })],
                playlist: playlist(),
                codexClient: createMockCodexClient({
                    available: false,
                    message: "Codex CLI was not found. Install Codex, then reopen the app.",
                }),
            }),
        ).rejects.toThrow("Codex CLI was not found. Install Codex, then reopen the app.");
    });

    it("throws when auto mode has no playlist context", async () => {
        await expect(
            generatePlaylistExtension({
                libraryTracks: [track({ filePath: "/music/b.mp3" })],
                playlist: playlist({ trackPaths: [], tracks: [], trackCount: 0 }),
                codexClient: createMockCodexClient(),
            }),
        ).rejects.toThrow("Add tracks to the playlist or enter a prompt first.");
    });

    it("allows an empty playlist with a user prompt", async () => {
        const codexClient = createMockCodexClient({
            runPrompt: async () => codexResult(JSON.stringify({ tracks: [{ filePath: "/music/b.mp3" }] })),
        });

        const result = await generatePlaylistExtension({
            libraryTracks: [track({ filePath: "/music/b.mp3" })],
            playlist: playlist({ trackPaths: [], tracks: [], trackCount: 0 }),
            codexClient,
            userPrompt: "make it energetic",
        });

        expect(result.tracks.map((item) => item.filePath)).toEqual(["/music/b.mp3"]);
    });

    it("includes AI command output when generation fails", async () => {
        const codexClient = createMockCodexClient({
            runPrompt: async () => {
                throw new Error("Authentication required. Run `codex login` in Terminal.");
            },
        });

        await expect(
            generatePlaylistExtension({
                libraryTracks: [
                    track({ filePath: "/music/a.mp3" }),
                    track({ filePath: "/music/b.mp3" }),
                ],
                playlist: playlist(),
                codexClient,
            }),
        ).rejects.toThrow("Authentication required. Run `codex login` in Terminal.");
    });

    it("suggests recovery steps when generation times out", async () => {
        const codexClient = createMockCodexClient({
            runPrompt: async () => {
                throw new Error(
                    "Codex did not finish within 120 seconds. Try a shorter prompt; if Codex is also stuck in Terminal, run `codex login`.",
                );
            },
        });

        await expect(
            generatePlaylistExtension({
                libraryTracks: [
                    track({ filePath: "/music/a.mp3" }),
                    track({ filePath: "/music/b.mp3" }),
                ],
                playlist: playlist(),
                codexClient,
            }),
        ).rejects.toThrow("run `codex login`");
    });

    it("throws when suggestions do not resolve to new local tracks", async () => {
        await expect(
            generatePlaylistExtension({
                codexClient: createMockCodexClient(),
                libraryTracks: [track({ filePath: "/music/a.mp3" })],
                playlist: playlist(),
            }),
        ).rejects.toThrow("No new local library tracks are available for this playlist.");
    });
});
