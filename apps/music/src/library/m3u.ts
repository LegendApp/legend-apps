import { File } from "expo-file-system/next";
import { normalizePath } from "../domain/musicIds";

function dirname(path: string) {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "";
}

function normalizeFilePath(path: string) {
  if (path.startsWith("file://")) {
    try {
      return normalizePath(decodeURIComponent(new URL(path).pathname));
    } catch {
      return normalizePath(path);
    }
  }

  return normalizePath(path);
}

function resolvePlaylistPath(baseDirectory: string, path: string) {
  const trimmed = path.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return normalizeFilePath(trimmed);
  }
  if (trimmed.startsWith("/")) {
    return normalizePath(trimmed);
  }
  return normalizePath(`${baseDirectory}/${trimmed}`);
}

export async function readM3UTrackPaths(playlistPath: string) {
  const file = new File(playlistPath);
  const text = await file.text();
  const baseDirectory = dirname(playlistPath);
  const paths: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    paths.push(resolvePlaylistPath(baseDirectory, line));
  }

  return paths;
}

export function writeM3UTrackPaths(trackPaths: readonly string[]) {
  return [
    "#EXTM3U",
    ...trackPaths.map((path) => normalizePath(path)),
    "",
  ].join("\n");
}
