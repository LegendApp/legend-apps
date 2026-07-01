import { useValue } from "@legendapp/state/react";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { initializeLocalAudioPlayer, localAudioControls } from "@/components/LocalAudioPlayer";
import { Unregistered } from "@/components/Unregistered";
import { MusicLayoutRenderer } from "@/layout/MusicLayoutRenderer";
import { mainLayout$, normalizeMusicLayoutFile } from "@/layout/MusicLayoutState";
import { SUPPORT_ACCOUNTS } from "@/systems/constants";
import { useOnHotkeys } from "@/systems/keyboard/Keyboard";
import { perfCount, perfLog } from "@legend-desktop/runtime-utils";
import { preloadPersistence } from "@/utils/preloadPersistence";

preloadPersistence();
initializeLocalAudioPlayer();

type MainContainerProps = {
    benchmarkElapsedSeconds?: number;
};

export function MainContainer({ benchmarkElapsedSeconds }: MainContainerProps) {
    perfCount("MainContainer.render");
    // const _playlistNavigation = useValue(playlistNavigationState$);
    const layoutFile = useValue(mainLayout$);
    const layout = useMemo(() => normalizeMusicLayoutFile(layoutFile), [layoutFile]);

    useOnHotkeys({
        // These are handled by native media keys, don't need to handle them here
        // PlayPause: localAudioControls.togglePlayPause,
        // NextTrack: localAudioControls.playNext,
        // PreviousTrack: localAudioControls.playPrevious,
        ToggleShuffle: localAudioControls.toggleShuffle,
        ToggleRepeatMode: localAudioControls.cycleRepeatMode,
        // Only handle space bar globally when no track is selected in the playlist
        PlayPauseSpace: localAudioControls.togglePlayPause,
    });

    perfLog("MainContainer.hotkeys", {
        activeTrack: localAudioControls.getCurrentState().currentTrack?.title,
    });

    return (
        <View className="flex-1 flex-row items-stretch" style={styles.root}>
            <View className="flex-1" style={styles.root}>
                <MusicLayoutRenderer node={layout.main} context={{ benchmarkElapsedSeconds }} />
                {SUPPORT_ACCOUNTS && <Unregistered />}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
});
