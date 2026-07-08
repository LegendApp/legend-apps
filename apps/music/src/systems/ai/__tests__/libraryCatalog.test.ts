import { buildPlaylistAICatalog, normalizeTrackPath } from "../libraryCatalog";
import type { LocalTrack } from "../../LocalMusicState";

const track = (overrides: Partial<LocalTrack>): LocalTrack => ({
    id: overrides.filePath ?? "track",
    title: "Title",
    artist: "Artist",
    duration: "3:00",
    fileName: "track.mp3",
    filePath: "/music/track.mp3",
    ...overrides,
});

describe("buildPlaylistAICatalog", () => {
    it("serializes local tracks as JSON lines", () => {
        const catalog = buildPlaylistAICatalog([
            track({
                filePath: "/music/a,b.mp3",
                title: 'Song "A"',
                artist: "Artist\nOne",
                album: "Album",
            }),
        ]);

        expect(catalog.count).toBe(1);
        expect(JSON.parse(catalog.jsonLines)).toEqual({
            filePath: "/music/a,b.mp3",
            title: 'Song "A"',
            artist: "Artist\nOne",
            album: "Album",
        });
    });

    it("excludes existing playlist paths and dedupes catalog paths", () => {
        const catalog = buildPlaylistAICatalog(
            [
                track({ filePath: "/music/a.mp3" }),
                track({ filePath: "file:///music/a.mp3" }),
                track({ filePath: "/music/b.mp3" }),
            ],
            { excludePaths: ["/music/b.mp3"] },
        );

        expect(catalog.count).toBe(1);
        expect(catalog.jsonLines).toContain("/music/a.mp3");
        expect(catalog.jsonLines).not.toContain("/music/b.mp3");
    });

    it("tracks omitted catalog entries", () => {
        const catalog = buildPlaylistAICatalog(
            [track({ filePath: "/music/a.mp3" }), track({ filePath: "/music/b.mp3" })],
            { maxTracks: 1 },
        );

        expect(catalog.count).toBe(1);
        expect(catalog.omittedCount).toBe(1);
    });
});

describe("normalizeTrackPath", () => {
    it("normalizes file uris, case, and trailing slashes", () => {
        expect(normalizeTrackPath("file:///Music/Song.mp3/")).toBe("/music/song.mp3");
    });
});
