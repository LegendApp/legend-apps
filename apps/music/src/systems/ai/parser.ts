import { parseAIJson } from "@legend-desktop/ai";

export type PlaylistAISuggestion = {
    filePath?: string;
    title?: string;
    artist?: string;
    album?: string;
};

function readString(data: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = data[key];
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }
    return undefined;
}

function coerceSuggestion(value: unknown): PlaylistAISuggestion | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const data = value as Record<string, unknown>;
    const filePath = readString(data, ["filePath", "path", "uri", "id"]);
    const title = readString(data, ["title", "name", "song", "track"]);
    const artist = readString(data, ["artist", "by", "singer", "band"]);
    const album = readString(data, ["album", "release"]);

    if (!filePath && !title) {
        return null;
    }

    return {
        filePath,
        title,
        artist,
        album,
    };
}

export function parsePlaylistAISuggestions(rawOutput: string): PlaylistAISuggestion[] {
    const parsed = parseAIJson(rawOutput);
    const entries = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { tracks?: unknown }).tracks)
          ? (parsed as { tracks: unknown[] }).tracks
          : [];
    const suggestions: PlaylistAISuggestion[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
        const suggestion = coerceSuggestion(entry);
        if (!suggestion) {
            continue;
        }

        const key = `${suggestion.filePath ?? ""}::${suggestion.title ?? ""}::${suggestion.artist ?? ""}`.toLowerCase();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        suggestions.push(suggestion);
    }

    return suggestions;
}
