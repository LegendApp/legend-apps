import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { LegendList } from "@legendapp/list/react-native";
import { TrackList } from "../TrackList";
import { library$, libraryUI$, selectLibraryPlaylist, selectLibraryView } from "../../../systems/LibraryState";
import { localMusicState$, type LocalTrack } from "../../../systems/LocalMusicState";
import { TableRow } from "../../Table";

jest.mock("@legend-apps/hotkeys", () => ({ ...jest.requireActual("@legend-apps/hotkeys"), useRoutedHotkeys: jest.fn() }));
jest.mock("../../AIButtons", () => ({ AIButtons: () => null }));
jest.mock("../../TooltipProvider", () => ({
    useTooltip: () => ({ hideTooltip: jest.fn(), showTooltip: jest.fn() }),
}));
jest.mock("@legendapp/list/react-native", () => {
    const React = require("react");
    return {
        LegendList: (props: { data: string[]; renderItem: (info: { item: string; index: number }) => React.ReactNode }) => (
            React.createElement(React.Fragment, null, props.data.map((item, index) => (
                React.createElement(React.Fragment, { key: item }, props.renderItem({ item, index }))
            )))
        ),
    };
});

it("reuses the list across playlists and views while updating tracks and selection", async () => {
    const tracks: LocalTrack[] = ["a", "b"].map((id) => ({
        id, title: `Track ${id}`, artist: "Artist", duration: "1:00", filePath: `/music/${id}.mp3`, fileName: `${id}.mp3`,
    }));
    library$.tracks.set(tracks);
    localMusicState$.tracks.set(tracks);
    localMusicState$.playlists.set(tracks.map((track) => ({
        id: track.id, name: `Playlist ${track.id}`, filePath: `/music/${track.id}.m3u`,
        trackPaths: [track.filePath], trackCount: 1, source: "cache" as const,
    })));
    libraryUI$.assign({ selectedView: "playlist", selectedPlaylistId: "a", searchQuery: "", playlistSort: "playlist-order", playlistSortDirection: "asc" });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<TrackList />); });
    const labels = () => renderer.root.findAllByType("Text" as never).flatMap((node) => node.children);
    try {
        const mountedList = renderer.root.findByType(LegendList);
        expect(mountedList.props.dataKey).toBe("playlist:a");
        expect(labels()).toContain("Track a");
        await act(async () => renderer.root.findByType(TableRow).props.onClick({}));
        expect(renderer.root.findByType(TableRow).props.isSelected).toBe(true);

        await act(async () => selectLibraryPlaylist("b"));
        expect(renderer.root.findByType(LegendList)).toBe(mountedList);
        expect(mountedList.props.dataKey).toBe("playlist:b");
        expect(labels()).toContain("Track b");
        expect(labels()).not.toContain("Track a");
        expect(renderer.root.findByType(TableRow).props.isSelected).toBe(false);

        await act(async () => selectLibraryView("songs"));
        expect(renderer.root.findByType(LegendList)).toBe(mountedList);
        expect(mountedList.props.dataKey).toBe("songs");
        expect(renderer.root.findAllByType(TableRow)).toHaveLength(2);
        await act(async () => selectLibraryPlaylist("a"));
        expect(renderer.root.findByType(LegendList)).toBe(mountedList);
        expect(labels()).toContain("Track a");
        expect(renderer.root.findByType(TableRow).props.isSelected).toBe(false);
    } finally {
        await act(async () => renderer.unmount());
    }
});
