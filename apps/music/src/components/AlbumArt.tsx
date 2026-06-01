import * as FileSystem from "expo-file-system/next";
import { useEffect, useState } from "react";
import { Image, type ImageProps, Text, View } from "react-native";
import { ensureCacheDirectory, getCacheDirectory } from "@/utils/cacheDirectories";
import { cn } from "@/utils/cn";

interface AlbumArtProps extends Omit<ImageProps, "source"> {
    uri?: string;
    size?: "small" | "medium" | "large";
    fallbackIcon?: string;
    className?: string;
    reloadKey?: string | number;
}

class ThumbnailCache {
    private static instance: ThumbnailCache;
    private cacheDir: FileSystem.Directory;
    private maxCacheSize = 100 * 1024 * 1024; // 100MB
    private initialized = false;

    private constructor() {
        this.cacheDir = getCacheDirectory("thumbnails");
    }

    static getInstance(): ThumbnailCache {
        if (!ThumbnailCache.instance) {
            ThumbnailCache.instance = new ThumbnailCache();
        }
        return ThumbnailCache.instance;
    }

    private ensureInitialized() {
        if (this.initialized) return;

        ensureCacheDirectory(this.cacheDir);
        this.initialized = true;
    }

    private getCacheKey(url: string): string {
        // Simple hash function for creating cache keys
        let hash = 0;
        if (url.length === 0) return hash.toString();

        for (let i = 0; i < url.length; i++) {
            const char = url.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return Math.abs(hash).toString(16);
    }

    getCachedPath(url: string): string | null {
        this.ensureInitialized();

        const cacheKey = this.getCacheKey(url);
        const cachedFile = new FileSystem.File(this.cacheDir, `${cacheKey}.jpg`);

        try {
            if (cachedFile.exists) {
                return cachedFile.uri;
            }
        } catch (error) {
            console.warn("Error checking cached file:", error);
        }

        return null;
    }

    isRemoteThumbnail(url: string) {
        return url?.startsWith("http");
    }

    async downloadThumbnail(url: string): Promise<string | null> {
        if (!this.isRemoteThumbnail(url)) {
            return null;
        }

        try {
            this.ensureInitialized();

            const cacheKey = this.getCacheKey(url);
            const localFile = new FileSystem.File(this.cacheDir, `${cacheKey}.jpg`);

            const response = await fetch(url);
            if (response.ok) {
                const bytes = await response.arrayBuffer();
                await localFile.write(new Uint8Array(bytes));
                return localFile.uri;
            }
            console.warn("Failed to download thumbnail:", response.status);
            return null;
        } catch (error) {
            console.warn("Error downloading thumbnail:", error);
            return null;
        }
    }

    // clearCache(): void {
    //     try {
    //         this.ensureInitialized();
    //         if (this.cacheDir.exists) {
    //             this.cacheDir.delete();
    //             this.cacheDir.create();
    //         }
    //     } catch (error) {
    //         console.warn("Error clearing thumbnail cache:", error);
    //     }
    // }

    // getCacheSize(): number {
    //     try {
    //         this.ensureInitialized();
    //         const files = this.cacheDir.list();

    //         // Count number of files instead of size since stat() is not available
    //         let fileCount = 0;
    //         for (const file of files) {
    //             if (file instanceof FileSystem.File) {
    //                 fileCount++;
    //             }
    //         }

    //         // Return approximate size based on file count (assuming ~50KB per thumbnail)
    //         return fileCount * 50 * 1024;
    //     } catch (error) {
    //         console.warn("Error calculating cache size:", error);
    //         return 0;
    //     }
    // }
}

const thumbnailCache = ThumbnailCache.getInstance();

export function AlbumArt({
    uri,
    size = "medium",
    fallbackIcon = "♪",
    className,
    reloadKey,
    ...imageProps
}: AlbumArtProps) {
    // Initialize imageUri synchronously with cached thumbnail if available
    const getInitialImageUri = (uri: string | undefined): string | null => {
        if (!uri) return null;

        // Check for cached thumbnail synchronously
        const cachedUri = thumbnailCache.getCachedPath(uri);
        return cachedUri || uri; // Return cached URI or fallback to original
    };

    const [imageUri, setImageUri] = useState<string | null>(() => getInitialImageUri(uri));
    const [isLoading, setIsLoading] = useState(false);
    const [_hasError, setHasError] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const loadImage = async () => {
            if (!uri) {
                setImageUri(null);
                setIsLoading(false);
                return;
            }

            // Check if we already have a cached thumbnail
            const cachedUri = thumbnailCache.getCachedPath(uri);
            if (cachedUri) {
                setImageUri(cachedUri);
                setIsLoading(false);
                return;
            }

            // No cached thumbnail, try to download it
            setIsLoading(true);
            setHasError(false);

            try {
                const downloadedUri =
                    thumbnailCache.isRemoteThumbnail(uri) && (await thumbnailCache.downloadThumbnail(uri));

                if (isMounted) {
                    if (downloadedUri) {
                        setImageUri(downloadedUri);
                    } else {
                        setImageUri(uri); // Fallback to original URL
                    }
                    setIsLoading(false);
                }
            } catch (error) {
                console.warn("Failed to load album art:", error);
                if (isMounted) {
                    setImageUri(uri); // Fallback to original URL
                    setIsLoading(false);
                }
            }
        };

        loadImage();

        return () => {
            isMounted = false;
        };
    }, [uri, reloadKey]);

    const sizeClasses = {
        small: "size-6",
        medium: "size-14",
        large: "size-16",
    };

    const fallbackTextSizes = {
        small: "text-xs",
        medium: "text-sm",
        large: "text-lg",
    };

    const containerClasses = cn(sizeClasses[size], "rounded-lg items-center justify-center", className);

    if (!uri || (!imageUri && !isLoading)) {
        return (
            <View className={cn(containerClasses, "bg-white/20")}>
                <Text className={cn("text-white", fallbackTextSizes[size])}>{fallbackIcon}</Text>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View className={cn(containerClasses, "bg-white/10")}>
                <Text className={cn("text-white/50", fallbackTextSizes[size])}>{fallbackIcon}</Text>
            </View>
        );
    }

    return (
        <Image
            {...imageProps}
            source={{ uri: imageUri || uri }}
            className={cn(containerClasses, "bg-white/10")}
            resizeMode="contain"
            onError={() => {
                setHasError(true);
                setImageUri(null);
            }}
        />
    );
}

// Export the cache instance for manual cache management
export { thumbnailCache };
