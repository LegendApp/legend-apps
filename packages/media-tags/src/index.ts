import NativeMediaTags from "./NativeMediaTags";

export type MediaTagsOptions = Readonly<{
  allowedExtensions?: readonly string[];
  cacheDir?: string;
  includeArtwork?: boolean;
}>;

export type MediaTags = Readonly<{
  album?: string;
  artist?: string;
  artworkKey?: string;
  artworkUri?: string;
  durationSeconds?: number;
  title?: string;
  trackNumber?: number;
}>;

export type MediaTagWritePayload = Readonly<{
  album?: string | null;
  artist?: string | null;
  artworkBase64?: string | null;
  artworkMime?: string | null;
  title?: string | null;
}>;

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function readMediaTags(filePath: string, options: MediaTagsOptions = {}) {
  return NativeMediaTags.readMediaTags(filePath, JSON.stringify(options)).then((json) => parseJson<MediaTags>(json, {}));
}

export function writeMediaTags(filePath: string, updates: MediaTagWritePayload) {
  return NativeMediaTags.writeMediaTags(filePath, JSON.stringify(updates)).then((json) =>
    parseJson<{ success: boolean }>(json, { success: false }),
  );
}

export { NativeMediaTags };
