import { useValue } from "@legendapp/state/react";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { AlbumArt } from "./AlbumArt";
import { localAudioControls, localPlayerState$ } from "./LocalAudioPlayer";
import { PlaybackControls } from "./PlaybackControls";
import { PlaybackTimeline } from "./PlaybackTimeline";
import { Icon } from "../systems/Icon";
import { localMusicState$ } from "../systems/LocalMusicState";
import { setIsScrubbing } from "../systems/PlaybackInteractionState";
import { type PlaybackControlId, settings$ } from "../systems/Settings";
import { cn } from "@legend-apps/classnames";
import { perfCount } from "@legend-apps/runtime-utils";

export type OverlayPlaybackMode = {
    enabled: boolean;
    showControls: boolean;
};

type PlaybackAreaProps = {
    showBorder?: boolean;
    overlayMode?: OverlayPlaybackMode;
    benchmarkElapsedSeconds?: number;
    controls?: PlaybackControlId[];
};

export function PlaybackArea({
    showBorder = true,
    overlayMode,
    benchmarkElapsedSeconds,
    controls,
}: PlaybackAreaProps = {}) {
    perfCount("PlaybackArea.render");
    const currentTrack = useValue(localPlayerState$.currentTrack);
    const isPlaying = useValue(localPlayerState$.isPlaying);
    const currentLocalTime$ = localPlayerState$.currentTime;
    const thumbnailVersion = useValue(localMusicState$.thumbnailVersion);
    const handleSlidingStart = useCallback(() => setIsScrubbing(true), []);
    const handleSlidingEnd = useCallback(() => setIsScrubbing(false), []);
    const overlayModeEnabled = overlayMode?.enabled ?? false;
    const playbackControlsEnabled = useValue(settings$.ui.playbackControlsEnabled) ?? true;
    const showPlaybackControls = playbackControlsEnabled && !overlayModeEnabled;
    const showTimeline = !overlayModeEnabled;
    const timelineDisabled = !currentTrack;

    // const hoverContentVisible = isHovered && overlayControlsVisible;
    // const hoverContentVisible = isWindowHovered && overlayControlsVisible;

    const sliderRowNode = showTimeline ? (
        <PlaybackTimeline
            currentLocalTime$={currentLocalTime$}
            duration$={localPlayerState$.duration}
            disabled={timelineDisabled}
            benchmarkElapsedSeconds={benchmarkElapsedSeconds}
            onSlidingStart={handleSlidingStart}
            onSlidingComplete={(value) => {
                localAudioControls.seek(value);
            }}
            onSlidingEnd={handleSlidingEnd}
            overlayMode={overlayMode}
        />
    ) : null;

    // perfLog("PlaybackArea.state", {
    //     track: currentTrack?.title,
    //     isLoading,
    //     isPlaying,
    //     currentTime: currentLocalTime$.peek?.(),
    // });

    return (
        <View
            className={cn("relative px-3", showBorder ? "pt-3" : "py-3", !playbackControlsEnabled && "py-3")}
        >
            {/* {hoverContentVisible ? (
                <View className="absolute right-0 top-0" pointerEvents="box-none">
                    <PlaylistSelector variant="overlay" />
                </View>
            ) : null} */}
            <View className="flex-row items-start gap-3">
                {/* Album Art */}
                <View className="relative shrink-0">
                    <AlbumArt
                        uri={currentTrack?.thumbnail}
                        reloadKey={thumbnailVersion}
                        size={overlayModeEnabled ? "medium" : "large"}
                        fallbackIcon="♪"
                    />
                    <Pressable
                        className="absolute inset-0 opacity-0 hover:opacity-100 transition-all duration-300 items-center justify-center"
                        onPress={localAudioControls.togglePlayPause}
                    >
                        <Icon name={isPlaying ? "pause.fill" : "play.fill"} size={24} color="#fff" />
                    </Pressable>
                </View>

                {/* Song Info */}
                <View
                    className={cn(
                        "relative flex-1 flex-col overflow-hidden",
                        overlayModeEnabled && "justify-center h-full",
                    )}
                    style={{ maxWidth: overlayModeEnabled ? 352 : undefined }}
                >
                    <View className="relative flex-col gap-0.5">
                        <Text className="text-white text-sm font-semibold" numberOfLines={1}>
                            {currentTrack?.title || " "}
                        </Text>
                        <Text className="text-white/70 text-sm" numberOfLines={1}>
                            {currentTrack?.artist || " "}
                        </Text>
                        {sliderRowNode}
                    </View>
                </View>
            </View>
            {showPlaybackControls ? <PlaybackControls className="pt-1 -mx-1 pb-1" controls={controls} /> : null}
        </View>
    );
}
