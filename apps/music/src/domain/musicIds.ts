import type { MusicId } from "./musicModel";

export function normalizePath(path: string): string {
  const withoutFileScheme = path.startsWith("file://") ? path.slice("file://".length) : path;
  const withoutTrailingSlash = withoutFileScheme.replace(/\/+$/, "");
  return withoutTrailingSlash || withoutFileScheme;
}

export function fileNameFromPath(path: string): string {
  const normalized = normalizePath(path);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
}

export function titleFromFileName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf(".");
  const title = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  return title.trim() || fileName;
}

export function displayNameFromPath(path: string): string {
  return fileNameFromPath(path) || normalizePath(path);
}

export function createStableId(parts: readonly string[]): MusicId {
  return parts
    .map((part) => normalizePath(part).trim().toLowerCase())
    .filter(Boolean)
    .join("::");
}

export function createRootId(rootPath: string): MusicId {
  return createStableId(["root", rootPath]);
}

export function createTrackId(rootId: MusicId, relativePath: string): MusicId {
  return createStableId(["track", rootId, relativePath]);
}

export function createArtistId(name: string): MusicId {
  return createStableId(["artist", name || "Unknown Artist"]);
}

export function createAlbumId(title: string, artistName?: string): MusicId {
  return createStableId(["album", artistName || "Unknown Artist", title || "Unknown Album"]);
}

export function createQueueItemId(trackId: MusicId, queuedAt: number): MusicId {
  return createStableId(["queue", trackId, String(queuedAt)]);
}
