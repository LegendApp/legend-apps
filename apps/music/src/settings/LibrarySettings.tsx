import { useValue } from "@legendapp/state/react";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/Button";
import { SkiaSpinner } from "@/components/SkiaSpinner";
import { openFileDialog } from "@legend-desktop/file-dialog";
import { SettingsPage, SettingsSection } from "@/settings/components";
import {
    librarySettings$,
    localMusicState$,
    markLibraryChangeUserInitiated,
    scanLocalMusic,
} from "@/systems/LocalMusicState";
import type { SFSymbols } from "@/types/SFSymbols";

const normalizeLibraryPath = (path: string): string => {
    // TODO: This might not be necessary? These paths should be normalized at a higher level?
    if (!path) {
        return "";
    }

    const withoutPrefix = path.startsWith("file://") ? path.replace("file://", "") : path;
    const trimmed = withoutPrefix.replace(/\/+$/, "");
    return trimmed.length > 0 ? trimmed : withoutPrefix;
};

export const LibrarySettings = function LibrarySettings() {
    return (
        <SettingsPage>
            <LibrarySettingsContent />
        </SettingsPage>
    );
};

export function LibrarySettingsContent() {
    const librarySettings = useValue(librarySettings$);
    const localMusicState = useValue(localMusicState$);
    const latestError = useValue(localMusicState$.error);

    const hasTrackEstimate =
        localMusicState.scanTrackTotal > 0 && localMusicState.scanTrackTotal >= localMusicState.scanTrackProgress;
    const trackProgressText =
        hasTrackEstimate && localMusicState.scanTrackProgress > 0
            ? `${localMusicState.scanTrackProgress}/${localMusicState.scanTrackTotal} tracks`
            : localMusicState.scanTrackProgress > 0
              ? `${localMusicState.scanTrackProgress} tracks processed`
              : "Preparing track list…";

    const folderProgressText =
        localMusicState.scanTotal > 0 ? `${localMusicState.scanProgress}/${localMusicState.scanTotal} folders` : null;

    const trackCountByPath = useMemo(() => {
        const counts = new Map<string, number>();
        const normalizedPaths = Array.from(
            new Set(
                librarySettings.paths
                    .map((path) => normalizeLibraryPath(path))
                    .filter((path): path is string => Boolean(path)),
            ),
        );

        for (const path of normalizedPaths) {
            counts.set(path, 0);
        }

        for (const track of localMusicState.tracks) {
            const trackPath = normalizeLibraryPath(track.filePath);
            if (!trackPath) {
                continue;
            }

            for (const root of normalizedPaths) {
                if (trackPath === root || trackPath.startsWith(`${root}/`)) {
                    counts.set(root, (counts.get(root) ?? 0) + 1);
                }
            }
        }

        return counts;
    }, [librarySettings.paths, localMusicState.tracks]);

    const handleRemoveLibraryPath = (index: number) => {
        markLibraryChangeUserInitiated();
        librarySettings$.paths.set((paths) => {
            if (index < 0 || index >= paths.length) {
                return paths;
            }

            const next = [...paths];
            next.splice(index, 1);
            return next;
        });
    };

    const handleAddLibraryPath = async () => {
        const directories = await openFileDialog({
            canChooseFiles: false,
            canChooseDirectories: true,
            allowsMultipleSelection: false,
        });
        const directory = directories?.[0] ?? null;

        if (!directory) {
            return;
        }

        markLibraryChangeUserInitiated();
        librarySettings$.paths.set((paths) => {
            if (paths.includes(directory)) {
                return paths;
            }

            return [...paths, directory];
        });
    };

    const handleRescanLibrary = () => {
        markLibraryChangeUserInitiated();
        scanLocalMusic();
    };

    return (
        <>
            <SettingsSection title="Library Paths" first>
                {librarySettings.paths.length > 0 ? (
                    <View className="flex flex-col gap-2">
                        {librarySettings.paths.map((path, index) => {
                            const normalizedPath = normalizeLibraryPath(path);
                            const trackCount = trackCountByPath.get(normalizedPath) ?? 0;
                            const trackCountLabel = `${trackCount} ${trackCount === 1 ? "track" : "tracks"}`;

                            return (
                                <View
                                    key={index}
                                    className="bg-background-tertiary rounded-md border border-border-primary px-3 py-2 flex-row items-center gap-3"
                                >
                                    <View className="flex-1">
                                        <Text className="text-text-secondary text-sm font-mono break-all">{path}</Text>
                                        <Text className="text-text-tertiary text-xs mt-1">{trackCountLabel}</Text>
                                    </View>

                                    <Button
                                        icon="trash"
                                        variant="icon"
                                        size="medium"
                                        tooltip="Remove path"
                                        iconYOffset={-1}
                                        onClick={() => handleRemoveLibraryPath(index)}
                                    />
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <View className="bg-background-tertiary rounded-md p-4 border border-border-primary border-dashed">
                        <Text className="text-text-tertiary text-sm text-center">No library paths configured</Text>
                    </View>
                )}

                <View className="flex-row items-center gap-3">
                    <Button
                        variant="primary"
                        icon="plus"
                        size="medium"
                        iconYOffset={-1}
                        className="self-start"
                        onClick={handleAddLibraryPath}
                    >
                        <Text className="text-text-primary font-medium text-sm">Add Library Folder</Text>
                    </Button>
                    <Button
                        variant="primary"
                        icon={"arrow.clockwise" as SFSymbols}
                        size="medium"
                        iconYOffset={-1}
                        disabled={localMusicState.isScanning}
                        onClick={handleRescanLibrary}
                        tooltip="Rescan all library folders"
                    >
                        <Text className="text-text-primary font-medium text-sm">Rescan Library</Text>
                    </Button>
                </View>
                {localMusicState.isScanning ? (
                    <View className="flex-row items-center gap-3 mb-3">
                        <SkiaSpinner size={28} color="#7dd6ff" />
                        <View className="flex-1 gap-1">
                            <Text className="text-text-primary text-sm font-medium">Scanning your library…</Text>
                            <View className="flex-row items-center gap-2">
                                <Text className="text-text-secondary text-xs font-medium">{trackProgressText}</Text>
                                {folderProgressText ? (
                                    <Text className="text-text-tertiary text-xs">{folderProgressText}</Text>
                                ) : null}
                            </View>
                            <Text className="text-text-tertiary text-xs">
                                This can take a moment for large folders. You can keep using the app while we scan.
                            </Text>
                        </View>
                    </View>
                ) : null}
                {latestError ? (
                    <View className="rounded-md border border-border-primary/60 bg-red-500/10 px-3 py-2 mt-3">
                        <Text className="text-sm text-red-200">{latestError}</Text>
                    </View>
                ) : null}
            </SettingsSection>
        </>
    );
}
