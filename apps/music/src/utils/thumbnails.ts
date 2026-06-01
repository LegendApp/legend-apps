import { ensureCacheDirectory, getCacheDirectory } from "@/utils/cacheDirectories";

const thumbnailsDir = getCacheDirectory("thumbnails");
ensureCacheDirectory(thumbnailsDir);
const thumbnailsDirUri = thumbnailsDir.uri.endsWith("/") ? thumbnailsDir.uri.slice(0, -1) : thumbnailsDir.uri;

const normalizeKey = (value?: string): string | undefined =>
    typeof value === "string" && value.length > 0 ? value : undefined;

export const deriveThumbnailKey = (value?: unknown): string | undefined => {
    if (!value || typeof value !== "string") {
        return undefined;
    }

    const fileName = value.split("/").pop() ?? value;
    const [baseName] = fileName.split(".");
    return normalizeKey(baseName);
};

export const buildThumbnailUri = (key?: string): string | undefined => {
    const normalizedKey = normalizeKey(key);
    return normalizedKey ? `${thumbnailsDirUri}/${normalizedKey}.png` : undefined;
};

export const resolveThumbnailFromFields = (input: { thumbnail?: string; thumbnailKey?: string }): {
    thumbnail?: string;
    thumbnailKey?: string;
} => {
    const thumbnailKey = normalizeKey(input.thumbnailKey) ?? deriveThumbnailKey(input.thumbnail);

    return {
        thumbnail: normalizeKey(input.thumbnail) ?? buildThumbnailUri(thumbnailKey),
        thumbnailKey: thumbnailKey ?? undefined,
    };
};
