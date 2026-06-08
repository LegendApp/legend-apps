import { parsePlaylistAISuggestions } from "../parser";

describe("parsePlaylistAISuggestions", () => {
    it("parses tracks payloads", () => {
        expect(
            parsePlaylistAISuggestions(
                JSON.stringify({
                    tracks: [
                        { filePath: "/music/a.mp3", title: "A", artist: "Artist A" },
                        { path: "/music/b.mp3", name: "B", by: "Artist B" },
                    ],
                }),
            ),
        ).toEqual([
            { filePath: "/music/a.mp3", title: "A", artist: "Artist A", album: undefined },
            { filePath: "/music/b.mp3", title: "B", artist: "Artist B", album: undefined },
        ]);
    });

    it("parses fenced JSON arrays", () => {
        expect(parsePlaylistAISuggestions('```json\n[{"filePath":"/music/a.mp3"}]\n```')).toEqual([
            { filePath: "/music/a.mp3", title: undefined, artist: undefined, album: undefined },
        ]);
    });

    it("returns no suggestions for malformed output", () => {
        expect(parsePlaylistAISuggestions("not json")).toEqual([]);
    });
});
