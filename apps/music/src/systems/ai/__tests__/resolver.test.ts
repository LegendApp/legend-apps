import { resolvePlaylistAISuggestions } from "../resolver";
import type { LocalTrack } from "@/systems/LocalMusicState";

const track = (overrides: Partial<LocalTrack>): LocalTrack => ({
    id: overrides.filePath ?? "track",
    title: "Title",
    artist: "Artist",
    duration: "3:00",
    fileName: "track.mp3",
    filePath: "/music/track.mp3",
    ...overrides,
});

describe("resolvePlaylistAISuggestions", () => {
    it("resolves by file path before metadata", () => {
        const tracks = [
            track({ filePath: "/music/a.mp3", title: "Wrong", artist: "Wrong" }),
            track({ filePath: "/music/b.mp3", title: "Song", artist: "Artist" }),
        ];

        const result = resolvePlaylistAISuggestions([{ filePath: "/music/a.mp3", title: "Song", artist: "Artist" }], tracks);

        expect(result.tracks[0]?.filePath).toBe("/music/a.mp3");
        expect(result.unresolved).toEqual([]);
    });

    it("falls back to title and artist", () => {
        const result = resolvePlaylistAISuggestions(
            [{ title: "Song A", artist: "Artist A" }],
            [track({ filePath: "/music/a.mp3", title: "Song A", artist: "Artist A" })],
        );

        expect(result.tracks).toHaveLength(1);
    });

    it("filters existing playlist paths and duplicate suggestions", () => {
        const tracks = [track({ filePath: "/music/a.mp3" }), track({ filePath: "/music/b.mp3" })];
        const result = resolvePlaylistAISuggestions(
            [{ filePath: "/music/a.mp3" }, { filePath: "/music/b.mp3" }, { filePath: "/music/b.mp3" }],
            tracks,
            ["/music/a.mp3"],
        );

        expect(result.tracks.map((item) => item.filePath)).toEqual(["/music/b.mp3"]);
    });
});
