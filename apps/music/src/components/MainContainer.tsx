import { useValue } from "@legendapp/state/react";
import { type HotkeyHandlerContext } from "@legendapp/spark/shortcuts/commands";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { initializeLocalAudioPlayer, localAudioControls } from "./LocalAudioPlayer";
import { Unregistered } from "./Unregistered";
import { MusicLayoutRenderer } from "../layout/MusicLayoutRenderer";
import { mainLayout$, normalizeMusicLayoutFile } from "../layout/MusicLayoutState";
import { playlistNavigationState$ } from "../state/playlistNavigationState";
import { SUPPORT_ACCOUNTS } from "../systems/constants";
import { useOnHotkeys } from "../systems/keyboard/Keyboard";
import { perfCount, perfLog } from "@legend-apps/runtime-utils";
import { preloadPersistence } from "../utils/preloadPersistence";

preloadPersistence();
initializeLocalAudioPlayer();

type MainContainerProps = {
    benchmarkElapsedSeconds?: number;
};

// Hardware media keys already reach the player through the native remote-command path.
const nativeMediaKeyBindings = new Set(["MediaPlayPause", "MediaNext", "MediaPrevious"]);

function unlessNativeMediaKey(action: () => void) {
    return (context: HotkeyHandlerContext) => {
        if (nativeMediaKeyBindings.has(context.binding)) return false;
        action();
        return true;
    };
}

export function MainContainer({ benchmarkElapsedSeconds }: MainContainerProps) {
    perfCount("MainContainer.render");
    // const _playlistNavigation = useValue(playlistNavigationState$);
    const layoutFile = useValue(mainLayout$);
    const layout = useMemo(() => normalizeMusicLayoutFile(layoutFile), [layoutFile]);

    useOnHotkeys({
        PlayPauseSpace: () => {
            if (playlistNavigationState$.hasSelection.peek()) return false;
            void localAudioControls.togglePlayPause();
            return true;
        },
        PlayPause: unlessNativeMediaKey(() => void localAudioControls.togglePlayPause()),
        NextTrack: unlessNativeMediaKey(localAudioControls.playNext),
        PreviousTrack: unlessNativeMediaKey(localAudioControls.playPrevious),
        ToggleShuffle: localAudioControls.toggleShuffle,
        ToggleRepeatMode: localAudioControls.cycleRepeatMode,
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
