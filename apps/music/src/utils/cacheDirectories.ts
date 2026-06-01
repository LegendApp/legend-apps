import * as FileSystem from "expo-file-system/next";

/**
 * Gets a cache directory for the LegendMusic app
 * All cache directories will be under cache/LegendMusic/
 */
export function getCacheDirectory(subdirectory: string): FileSystem.Directory {
    const legendMusicCacheDir = new FileSystem.Directory(FileSystem.Paths.cache, "Legend Music");
    return new FileSystem.Directory(legendMusicCacheDir, subdirectory);
}

/**
 * Ensures a cache directory exists, creating it if necessary
 */
export function ensureCacheDirectory(cacheDir: FileSystem.Directory): void {
    try {
        if (!cacheDir.exists) {
            cacheDir.create({ intermediates: true });
        }
    } catch (error) {
        console.warn(`Failed to create cache directory ${cacheDir.uri}:`, error);
    }
}

/**
 * Remove specific cache files within a subdirectory if they exist
 */
export function deleteCacheFiles(subdirectory: string, filenames: string[]): void {
    const cacheDir = getCacheDirectory(subdirectory);

    for (const filename of filenames) {
        try {
            const file = new FileSystem.File(cacheDir, filename);
            if (file.exists) {
                file.delete();
            }
        } catch (error) {
            console.warn(`Failed to delete cache file ${filename} in ${cacheDir.uri}:`, error);
        }
    }
}

export function getPlaylistsDirectory(): FileSystem.Directory {
    return getCacheDirectory("playlists");
}
