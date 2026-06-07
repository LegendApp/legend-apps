import { useValue } from "@legendapp/state/react";
import { useCallback, useRef, useState } from "react";
import { type LayoutChangeEvent, useWindowDimensions, View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { Button } from "@/components/Button";
import type { DropdownMenuRootRef } from "@/components/DropdownMenu";
import { JumpSearchMenuDropdown } from "@/components/JumpSearchMenuDropdown";
import { localAudioControls, localPlayerState$, queue$ } from "@/components/LocalAudioPlayer";
import { SavePlaylistDropdown } from "@/components/SavePlaylistDropdown";
import { usePlaybackControlLayout } from "@/hooks/useUIControls";
import { SUPPORT_PLAYLISTS } from "@/systems/constants";
import { useOnHotkeys } from "@/systems/keyboard/Keyboard";
import { library$ } from "@/systems/LibraryState";
import { localMusicState$ } from "@/systems/LocalMusicState";
import { type PlaybackControlId, settings$ } from "@/systems/Settings";
import { cn } from "@legend-desktop/classnames";
import {
    useLibraryToggle,
    usePlaylistOptions,
    usePlaylistQueueHandlers,
    useQueueExporter,
} from "./PlaylistSelector/hooks";

const DEFAULT_PLAYBACK_BUTTONS: PlaybackControlId[] = [
    "previous",
    "playPause",
    "next",
    "spacer",
    "search",
    "savePlaylist",
    "toggleLibrary",
];

type PlaybackControlsProps = {
    className?: string;
};

export function PlaybackControls({ className }: PlaybackControlsProps = {}) {
    const isPlaying = useValue(localPlayerState$.isPlaying);
    const shuffleEnabled = useValue(settings$.playback.shuffle);
    const repeatMode = useValue(settings$.playback.repeatMode);
    const playbackControlsLayout = usePlaybackControlLayout();
    const localMusicState = useValue(localMusicState$);
    const library = useValue(library$);
    const queue = useValue(queue$);
    const { width: windowWidth } = useWindowDimensions();
    const [layoutWidth, setLayoutWidth] = useState(0);
    const dropdownMenuRef = useRef<DropdownMenuRootRef>(null);

    const { playlistMap, tracksByPath } = usePlaylistOptions(localMusicState);
    const { isLibraryOpen, toggleLibraryWindow } = useLibraryToggle();
    const { handleTrackSelect, handleLibraryItemSelect, handleSearchPlaylistSelect } = usePlaylistQueueHandlers({
        playlistMap,
        tracksByPath,
        localTracks: localMusicState.tracks,
        libraryTracks: library.tracks,
    });
    const { handleSavePlaylist } = useQueueExporter({ queueTracks: queue.tracks });

    const controls = (
        (playbackControlsLayout?.shown?.length
            ? playbackControlsLayout.shown
            : DEFAULT_PLAYBACK_BUTTONS) as PlaybackControlId[]
    ).filter((controlId, index, array) => array.indexOf(controlId) === index);

    const hasSearchControl = controls.includes("search");

    useOnHotkeys(
        hasSearchControl
            ? {
                  Search: () => dropdownMenuRef.current?.open(),
              }
            : {},
    );

    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const nextWidth = event.nativeEvent.layout.width;
        setLayoutWidth((prev) => {
            if (Math.abs(prev - nextWidth) < 1) {
                return prev;
            }
            return nextWidth;
        });
    }, []);

    const baseWidth = layoutWidth > 0 ? layoutWidth : windowWidth;
    const dropdownWidth = Math.max(baseWidth - 16, 320);

    return (
        <View className={cn("flex-row items-center gap-x-1", className)} onLayout={handleLayout}>
            {controls.map((controlId) => {
                switch (controlId) {
                    case "previous":
                        return (
                            <Button
                                key="previous"
                                icon="backward.end.fill"
                                variant="icon-hover"
                                iconSize={14}
                                size="xs"
                                onClick={localAudioControls.playPrevious}
                                tooltip="Previous"
                            />
                        );
                    case "playPause":
                        return (
                            <Button
                                key="playPause"
                                icon={isPlaying ? "pause.fill" : "play.fill"}
                                variant="icon-hover"
                                iconSize={14}
                                size="xs"
                                onClick={localAudioControls.togglePlayPause}
                                tooltip={isPlaying ? "Pause" : "Play"}
                            />
                        );
                    case "next":
                        return (
                            <Button
                                key="next"
                                icon="forward.end.fill"
                                variant="icon-hover"
                                iconSize={14}
                                size="xs"
                                onClick={localAudioControls.playNext}
                                tooltip="Next"
                            />
                        );
                    case "shuffle": {
                        const shuffleIcon = shuffleEnabled ? "shuffle.circle.fill" : "shuffle";
                        const shuffleSize = shuffleEnabled ? 23 : 16;

                        return (
                            <Button
                                key="shuffle"
                                icon={shuffleIcon}
                                variant="icon-hover"
                                iconSize={shuffleSize}
                                size="xs"
                                onClick={localAudioControls.toggleShuffle}
                                tooltip={shuffleEnabled ? "Disable shuffle" : "Enable shuffle"}
                                active={shuffleEnabled}
                            />
                        );
                    }
                    case "repeat": {
                        const repeatIcon =
                            repeatMode === "off"
                                ? "repeat"
                                : repeatMode === "one"
                                  ? "repeat.1.circle.fill"
                                  : "repeat.circle.fill";
                        const repeatSize = repeatMode === "off" ? 16 : 23;
                        const repeatTooltip =
                            repeatMode === "off"
                                ? "Enable repeat"
                                : repeatMode === "all"
                                  ? "Repeat all tracks"
                                  : "Repeat current track";

                        return (
                            <Button
                                key="repeat"
                                icon={repeatIcon}
                                variant="icon-hover"
                                iconSize={repeatSize}
                                size="xs"
                                onClick={localAudioControls.cycleRepeatMode}
                                tooltip={repeatTooltip}
                                active={repeatMode !== "off"}
                            />
                        );
                    }
                    case "search":
                        return (
                            <JumpSearchMenuDropdown
                                key="search"
                                ref={dropdownMenuRef}
                                tracks={localMusicState.tracks}
                                playlists={localMusicState.playlists}
                                onSelectTrack={handleTrackSelect}
                                onSelectLibraryItem={handleLibraryItemSelect}
                                onSelectPlaylist={handleSearchPlaylistSelect}
                                dropdownWidth={dropdownWidth}
                            />
                        );
                    case "savePlaylist":
                        return SUPPORT_PLAYLISTS ? (
                            <SavePlaylistDropdown
                                key="savePlaylist"
                                disabled={queue.tracks.length === 0}
                                onSave={handleSavePlaylist}
                            />
                        ) : null;
                    case "toggleLibrary": {
                        const icon: SFSymbol = isLibraryOpen ? "play.square.stack.fill" : "play.square.stack";
                        const iconSize = isLibraryOpen ? 16 : 16;

                        return (
                            <Button
                                key="toggleLibrary"
                                icon={icon}
                                variant={isLibraryOpen ? "icon" : "icon-hover"}
                                size="xs"
                                iconSize={iconSize}
                                iconYOffset={1}
                                onClick={toggleLibraryWindow}
                                tooltip={isLibraryOpen ? "Hide library" : "Show library"}
                            />
                        );
                    }
                    case "spacer":
                        return <View key="spacer" className="flex-1" />;
                    default:
                        return null;
                }
            })}
        </View>
    );
}
