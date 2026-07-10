import { useValue } from "@legendapp/state/react";
import { parseHotkey, type HotkeyHandlerContext } from "@legend-apps/hotkeys";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { initializeLocalAudioPlayer, localAudioControls } from "./LocalAudioPlayer";
import { Unregistered } from "./Unregistered";
import { MusicLayoutRenderer } from "../layout/MusicLayoutRenderer";
import { mainLayout$, normalizeMusicLayoutFile } from "../layout/MusicLayoutState";
import { SUPPORT_ACCOUNTS } from "../systems/constants";
import { useOnHotkeys } from "../systems/keyboard/Keyboard";
import { KeyCodes } from "../systems/keyboard/KeyboardManager";
import { perfCount, perfLog } from "@legend-apps/runtime-utils";
import { preloadPersistence } from "../utils/preloadPersistence";

preloadPersistence();
initializeLocalAudioPlayer();

type MainContainerProps = {
    benchmarkElapsedSeconds?: number;
};

function handleConfigurableMediaHotkey(
    context: HotkeyHandlerContext,
    nativeMediaKey: number,
    action: () => void,
) {
    const isNativeMediaKey = parseHotkey(context.binding).includes(nativeMediaKey);
    if (!isNativeMediaKey) {
        action();
        return true;
    }
    return false;
}

export function MainContainer({ benchmarkElapsedSeconds }: MainContainerProps) {
    perfCount("MainContainer.render");
    // const _playlistNavigation = useValue(playlistNavigationState$);
    const layoutFile = useValue(mainLayout$);
    const layout = useMemo(() => normalizeMusicLayoutFile(layoutFile), [layoutFile]);

    useOnHotkeys({
        PlayPause: (context) => handleConfigurableMediaHotkey(
            context,
            KeyCodes.KEY_MEDIA_PLAY_PAUSE,
            () => void localAudioControls.togglePlayPause(),
        ),
        NextTrack: (context) => handleConfigurableMediaHotkey(
            context,
            KeyCodes.KEY_MEDIA_NEXT,
            localAudioControls.playNext,
        ),
        PreviousTrack: (context) => handleConfigurableMediaHotkey(
            context,
            KeyCodes.KEY_MEDIA_PREVIOUS,
            localAudioControls.playPrevious,
        ),
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
