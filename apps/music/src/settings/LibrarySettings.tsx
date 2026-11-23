import { useValue } from "@legendapp/state/react";
import { useMemo } from "react";
import { Button } from "@legendapp/spark/ui";
import { ActivityIndicator, View } from "react-native";

import { openFileDialog } from "@legendapp/spark/dialogs";
import { SettingsCaption, SettingsRow, SettingsSection } from "./components";
import {
    librarySettings$,
    localMusicState$,
    markLibraryChangeUserInitiated,
    scanLocalMusic,
} from "../systems/LocalMusicState";

const normalizeLibraryPath = (path: string): string => {
    // TODO: This might not be necessary? These paths should be normalized at a higher level?
    if (!path) {
        return "";
    }

    const withoutPrefix = path.startsWith("file://") ? path.replace("file://", "") : path;
    const trimmed = withoutPrefix.replace(/\/+$/, "");
    return trimmed.length > 0 ? trimmed : withoutPrefix;
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
        const result = await openFileDialog({
            selection: "directories",
            multiple: false,
            defaultPath: librarySettings.paths[0],
            message: "Choose a music folder. Selecting it again re-authorizes access to protected locations such as Downloads.",
            prompt: "Use Folder",
            title: "Choose Music Folder",
        });
        const directories = result.canceled ? [] : result.paths;
        const directory = directories?.[0] ?? null;

        if (!directory) {
            return;
        }

        markLibraryChangeUserInitiated();
        const normalizedDirectory = normalizeLibraryPath(directory);
        const isAlreadyConfigured = librarySettings$.paths
            .get()
            .some((path) => normalizeLibraryPath(path) === normalizedDirectory);

        if (isAlreadyConfigured) {
            void scanLocalMusic();
            return;
        }

        librarySettings$.paths.set((paths) => {
            return [...paths, directory];
        });
    };

    const handleRescanLibrary = () => {
        markLibraryChangeUserInitiated();
        scanLocalMusic();
    };

    return (
        <>
            <SettingsSection title="Folders">
                {librarySettings.paths.length === 0 ? (
                    <SettingsCaption>Add a folder to build your library.</SettingsCaption>
                ) : null}
                {librarySettings.paths.map((path, index) => {
                    const normalizedPath = normalizeLibraryPath(path);
                    const trackCount = trackCountByPath.get(normalizedPath) ?? 0;
                    return (
                        <SettingsRow
                            key={path}
                            label={normalizedPath.split("/").pop() || normalizedPath}
                            description={`${normalizedPath} · ${trackCount} ${trackCount === 1 ? "track" : "tracks"}`}
                        >
                            <Button onPress={() => handleRemoveLibraryPath(index)}>Remove</Button>
                        </SettingsRow>
                    );
                })}
                {localMusicState.isScanning ? (
                    <SettingsRow
                        label="Scanning your library…"
                        description={folderProgressText ? `${trackProgressText} · ${folderProgressText}` : trackProgressText}
                    >
                        <ActivityIndicator size="small" />
                    </SettingsRow>
                ) : null}
                {latestError ? <SettingsCaption>{latestError}</SettingsCaption> : null}
            </SettingsSection>
            <View className="flex-row justify-end gap-2">
                {librarySettings.paths.length > 0 ? (
                    <Button disabled={localMusicState.isScanning} onPress={handleRescanLibrary}>
                        Rescan
                    </Button>
                ) : null}
                <Button onPress={handleAddLibraryPath}>Add Folder…</Button>
            </View>
        </>
    );
}
