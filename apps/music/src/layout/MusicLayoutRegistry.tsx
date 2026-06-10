import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useValue } from "@legendapp/state/react";

import { MediaLibrarySidebar } from "@/components/MediaLibrary/Sidebar";
import { TrackList } from "@/components/MediaLibrary/TrackList";
import { PlaybackArea } from "@/components/PlaybackArea";
import { PlaybackControls } from "@/components/PlaybackControls";
import { Playlist } from "@/components/Playlist";
import {
    DEFAULT_LIBRARY_LAYOUT,
    type MusicLayoutLeafId,
    type MusicLayoutLeafNode,
    type MusicLayoutNode,
} from "@/layout/MusicLayoutState";
import { settings$ } from "@/systems/Settings";

interface MusicLayoutLeafRenderParams {
    children: ReactNode;
    context: {
        benchmarkElapsedSeconds?: number;
    };
    node: MusicLayoutLeafNode;
}

interface MusicLayoutLeafDefinition {
    defaultLayout?: MusicLayoutNode;
    render: (params: MusicLayoutLeafRenderParams) => ReactNode;
}

function PlaybackLeaf({ context, node }: MusicLayoutLeafRenderParams) {
    return <PlaybackArea benchmarkElapsedSeconds={context.benchmarkElapsedSeconds} controls={node.controls} />;
}

function PlaybackControlsLeaf({ node }: MusicLayoutLeafRenderParams) {
    return <PlaybackControls controls={node.controls} />;
}

function QueueLeaf() {
    return <Playlist />;
}

function LibraryLeaf({ children }: MusicLayoutLeafRenderParams) {
    const showHints = useValue(settings$.general.showHints);

    return (
        <View className="flex-1 min-w-[360px] min-h-0 bg-black/5 border-l border-white/10">
            <View className="flex-1 min-h-0 min-w-0">{children}</View>
            {showHints ? (
                <View className="border-t border-white/15 bg-black/20 px-3 py-2">
                    <Text className="text-xs text-white/60">Shift click to play next</Text>
                </View>
            ) : null}
        </View>
    );
}

function LibrarySidebarLeaf() {
    return <MediaLibrarySidebar />;
}

function LibraryTracksLeaf() {
    return <TrackList />;
}

const MUSIC_LAYOUT_LEAF_DEFINITIONS: Record<MusicLayoutLeafId, MusicLayoutLeafDefinition> = {
    playback: {
        render: (params) => <PlaybackLeaf {...params} />,
    },
    playbackControls: {
        render: (params) => <PlaybackControlsLeaf {...params} />,
    },
    queue: {
        render: () => <QueueLeaf />,
    },
    library: {
        defaultLayout: DEFAULT_LIBRARY_LAYOUT,
        render: (params) => <LibraryLeaf {...params} />,
    },
    librarySidebar: {
        render: () => <LibrarySidebarLeaf />,
    },
    libraryTracks: {
        render: () => <LibraryTracksLeaf />,
    },
};

export function getMusicLayoutLeafDefinition(id: MusicLayoutLeafId): MusicLayoutLeafDefinition {
    return MUSIC_LAYOUT_LEAF_DEFINITIONS[id];
}
