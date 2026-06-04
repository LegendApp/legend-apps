import type { LibraryItem } from "@/systems/LibraryState";
import type { LocalPlaylist, LocalTrack } from "@/systems/LocalMusicState";
import { buildSearchResults } from "../hooks";

const tracks: LocalTrack[] = [
    {
        id: "track-1",
        title: "Song Alpha",
        artist: "Artist One",
        album: "Album Z",
        duration: "180",
        filePath: "/alpha.mp3",
        fileName: "alpha.mp3",
    },
    {
        id: "track-2",
        title: "Bravado",
        artist: "Artist Two",
        album: "Best Hits",
        duration: "200",
        filePath: "/bravado.mp3",
        fileName: "bravado.mp3",
    },
];

const playlists: LocalPlaylist[] = [
    {
        id: "pl-1",
        name: "Ambient Mix",
        filePath: "/playlists/ambient.m3u",
        trackPaths: [],
        trackCount: 10,
        source: "cache",
    },
];

const albums: LibraryItem[] = [{ id: "album-1", type: "album", name: "Album Alpha", trackCount: 12 }];

const artists: LibraryItem[] = [{ id: "artist-1", type: "artist", name: "Artist One", trackCount: 20 }];

describe("buildSearchResults", () => {
    it("returns results grouped by playlists, albums, artists, then tracks", () => {
        const results = buildSearchResults({
            query: "a",
            tracks,
            playlists,
            albums,
            artists,
        });

        expect(results.map((result) => result.type)).toEqual(["track", "track", "playlist", "library", "library"]);
        expect(results[0]).toMatchObject({ type: "track", item: tracks[0] });
        expect(results[2]).toMatchObject({ type: "playlist", item: playlists[0] });
    });

    it("returns an empty array when query is blank", () => {
        const results = buildSearchResults({
            query: "  ",
            tracks,
            playlists,
            albums,
            artists,
        });

        expect(results).toEqual([]);
    });
});
