import { useValue } from "@legendapp/state/react";
import { Text, View } from "react-native";

import { MusicSplitView } from "./MusicSplitView";
import { settings$ } from "../systems/Settings";
import { perfCount } from "@legend-apps/runtime-utils";
import { MediaLibrarySidebar } from "./MediaLibrary/Sidebar";
import { TrackList } from "./MediaLibrary/TrackList";

export function MediaLibraryView() {
    perfCount("MediaLibraryView.render");
    const showHints = useValue(settings$.general.showHints);

    return (
        <View className="flex-1 min-w-[360px] min-h-0 bg-black/5 border-l border-white/10">
            <View className="flex-1">
                <MusicSplitView id="sidebar" sidebar={<MediaLibrarySidebar />} content={<TrackList />} />
            </View>
            {showHints ? (
                <View className="border-t border-white/15 bg-black/20 px-3 py-2">
                    <Text className="text-xs text-white/60">Shift click to play next</Text>
                </View>
            ) : null}
        </View>
    );
}
