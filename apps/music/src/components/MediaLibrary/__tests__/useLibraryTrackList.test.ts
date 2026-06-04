import type { LibraryTrack } from "@/systems/LibraryState";
import type { LocalPlaylist } from "@/systems/LocalMusicState";
import { buildTrackItems } from "../useLibraryTrackList";

const mockTracks: LibraryTrack[] = [
    {
        id: "1",
        title: "Song A",
        artist: "Artist 1",
        album: "Album X",
        duration: "120",
        filePath: "/music/song-a.mp3",
        fileName: "song-a.mp3",
    },
    {
        id: "2",
        title: "Song B",
        artist: "Artist 2",
        album: "Album Y",
        duration: "3:45",
        filePath: "/music/song-b.mp3",
        fileName: "song-b.mp3",
    },
    {
        id: "3",
        title: "Another Song",
        artist: "Artist 1",
        album: "Album Z",
        duration: "200",
        filePath: "/music/song-c.mp3",
        fileName: "song-c.mp3",
    },
];

describe("buildTrackItems", () => {
    it("songs view returns all tracks in order", () => {
        const result = buildTrackItems({
            tracks: mockTracks,
            playlists: [],
            selectedView: "songs",
            selectedPlaylistId: null,
            searchQuery: "",
            playlistSort: "playlist-order",
            playlistSortDirection: "asc",
        });

        expect(result.trackItems.map((track) => track.id)).toEqual(["1", "2", "3"]);
    });

    it("artists view inserts separators and groups by artist", () => {
        const result = buildTrackItems({
            tracks: mockTracks,
            playlists: [],
            selectedView: "artists",
            selectedPlaylistId: null,
            searchQuery: "",
            playlistSort: "playlist-order",
            playlistSortDirection: "asc",
        });

        expect(result.trackItems.map((item) => item.title)).toEqual([
            "— Artist 1 —",
            "Song A",
            "Another Song",
            "— Artist 2 —",
            "Song B",
        ]);
        expect(result.trackItems.filter((item) => item.isSeparator).length).toBe(2);
    });

    it("artists view orders by album then track number when available", () => {
        const tracks: LibraryTrack[] = [
            {
                id: "1",
                title: "Zed",
                artist: "Artist 1",
                album: "Album A",
                trackNumber: 1,
                duration: "120",
                filePath: "/music/zed.mp3",
                fileName: "zed.mp3",
            },
            {
                id: "2",
                title: "Alpha",
                artist: "Artist 1",
                album: "Album A",
                trackNumber: 2,
                duration: "120",
                filePath: "/music/alpha.mp3",
                fileName: "alpha.mp3",
            },
        ];

        const result = buildTrackItems({
            tracks,
            playlists: [],
            selectedView: "artists",
            selectedPlaylistId: null,
            searchQuery: "",
            playlistSort: "playlist-order",
            playlistSortDirection: "asc",
        });

        expect(result.trackItems.map((item) => item.title)).toEqual(["— Artist 1 —", "Zed", "Alpha"]);
    });

    it("albums view inserts separators and groups by album", () => {
        const result = buildTrackItems({
            tracks: mockTracks,
            playlists: [],
            selectedView: "albums",
            selectedPlaylistId: null,
            searchQuery: "",
            playlistSort: "playlist-order",
            playlistSortDirection: "asc",
        });

        expect(result.trackItems.map((item) => item.title)).toEqual([
            "— Album X —",
            "Song A",
            "— Album Y —",
            "Song B",
            "— Album Z —",
            "Another Song",
        ]);
        expect(result.trackItems.filter((item) => item.isSeparator).length).toBe(3);
    });

    it("albums view pushes missing albums to the end", () => {
        const tracks: LibraryTrack[] = [
            {
                id: "1",
                title: "No Album Song",
                artist: "Artist 1",
                album: "",
                duration: "120",
                filePath: "/music/no-album.mp3",
                fileName: "no-album.mp3",
            },
            {
                id: "2",
                title: "Alpha Song",
                artist: "Artist 1",
                album: "Alpha",
                duration: "120",
                filePath: "/music/alpha.mp3",
                fileName: "alpha.mp3",
            },
            {
                id: "3",
                title: "Beta Song",
                artist: "Artist 1",
                album: "Beta",
                duration: "120",
                filePath: "/music/beta.mp3",
                fileName: "beta.mp3",
            },
        ];

        const result = buildTrackItems({
            tracks,
            playlists: [],
            selectedView: "albums",
            selectedPlaylistId: null,
            searchQuery: "",
            playlistSort: "playlist-order",
            playlistSortDirection: "asc",
        });

        expect(result.trackItems.map((item) => item.title)).toEqual([
            "— Alpha —",
            "Alpha Song",
            "— Beta —",
            "Beta Song",
            "— Unknown Album —",
            "No Album Song",
        ]);
    });

    it("search filters within current view", () => {
        const result = buildTrackItems({
            tracks: mockTracks,
            playlists: [],
            selectedView: "artists",
            selectedPlaylistId: null,
            searchQuery: "album y",
            playlistSort: "playlist-order",
            playlistSortDirection: "asc",
        });

        expect(result.trackItems.map((item) => item.title)).toEqual(["— Artist 2 —", "Song B"]);
        expect(result.trackItems.filter((item) => item.isSeparator).length).toBe(1);
    });

    it("playlist view preserves order and flags missing tracks", () => {
        const playlists: LocalPlaylist[] = [
            {
                id: "/cache/data/test.m3u",
                name: "Test",
                filePath: "/cache/data/test.m3u",
                trackPaths: ["/music/song-b.mp3", "/music/missing.mp3", "/music/song-a.mp3"],
                trackCount: 3,
                source: "cache",
            },
        ];

        const result = buildTrackItems({
            tracks: mockTracks,
            playlists,
            selectedView: "playlist",
            selectedPlaylistId: playlists[0].id,
            searchQuery: "",
            playlistSort: "playlist-order",
            playlistSortDirection: "asc",
        });

        expect(result.trackItems.map((item) => item.id)).toEqual(["2", "/music/missing.mp3", "1"]);
        expect(result.trackItems[1]).toMatchObject({ isMissing: true, title: "missing.mp3" });
    });

    it("playlist view sorts by date added", () => {
        const playlists: LocalPlaylist[] = [
            {
                id: "/cache/data/test-date-added.m3u",
                name: "Date Added",
                filePath: "/cache/data/test-date-added.m3u",
                trackPaths: ["/music/song-b.mp3", "/music/song-a.mp3", "/music/song-c.mp3"],
                trackCount: 3,
                source: "cache",
                tracks: [
                    {
                        id: "/music/song-b.mp3",
                        duration: -1,
                        title: "Song B",
                        filePath: "/music/song-b.mp3",
                        addedAt: 1000,
                    },
                    {
                        id: "/music/song-a.mp3",
                        duration: -1,
                        title: "Song A",
                        filePath: "/music/song-a.mp3",
                        addedAt: 3000,
                    },
                    {
                        id: "/music/song-c.mp3",
                        duration: -1,
                        title: "Another Song",
                        filePath: "/music/song-c.mp3",
                        addedAt: 2000,
                    },
                ],
            },
        ];

        const result = buildTrackItems({
            tracks: mockTracks,
            playlists,
            selectedView: "playlist",
            selectedPlaylistId: playlists[0].id,
            searchQuery: "",
            playlistSort: "date-added",
            playlistSortDirection: "desc",
        });

        expect(result.trackItems.map((item) => item.id)).toEqual(["1", "3", "2"]);
    });

    it("playlist view makes duplicate IDs unique", () => {
        const playlists: LocalPlaylist[] = [
            {
                id: "/cache/data/test-dupes.m3u",
                name: "Test Dupes",
                filePath: "/cache/data/test-dupes.m3u",
                trackPaths: ["/music/song-b.mp3", "/music/song-b.mp3", "/music/song-a.mp3"],
                trackCount: 3,
                source: "cache",
            },
        ];

        const result = buildTrackItems({
            tracks: mockTracks,
            playlists,
            selectedView: "playlist",
            selectedPlaylistId: playlists[0].id,
            searchQuery: "",
            playlistSort: "playlist-order",
            playlistSortDirection: "asc",
        });

        expect(result.trackItems.map((item) => item.id)).toEqual(["2", "2-2", "1"]);
    });

    it("formats numeric durations into minutes and seconds", () => {
        const result = buildTrackItems({
            tracks: mockTracks,
            playlists: [],
            selectedView: "songs",
            selectedPlaylistId: null,
            searchQuery: "",
            playlistSort: "playlist-order",
            playlistSortDirection: "asc",
        });

        const songA = result.trackItems.find((track) => track.id === "1");
        expect(songA?.duration).toBe("2:00");
    });
});
