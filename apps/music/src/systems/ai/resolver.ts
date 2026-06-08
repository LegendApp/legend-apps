import type { LocalTrack } from "@/systems/LocalMusicState";
import { normalizeTrackPath } from "./libraryCatalog";
import type { PlaylistAISuggestion } from "./parser";

export type ResolvePlaylistAISuggestionsResult = {
    tracks: LocalTrack[];
    unresolved: PlaylistAISuggestion[];
};

function normalizeText(value?: string): string {
    return (value ?? "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ");
}

function titleArtistKey(title?: string, artist?: string): string {
    return `${normalizeText(title)}::${normalizeText(artist)}`;
}

export function resolvePlaylistAISuggestions(
    suggestions: PlaylistAISuggestion[],
    libraryTracks: LocalTrack[],
    existingPlaylistPaths: string[] = [],
): ResolvePlaylistAISuggestionsResult {
    const existing = new Set(existingPlaylistPaths.map(normalizeTrackPath).filter(Boolean));
    const tracksByPath = new Map<string, LocalTrack>();
    const tracksByTitleArtist = new Map<string, LocalTrack>();

    for (const track of libraryTracks) {
        const pathKey = normalizeTrackPath(track.filePath);
        if (pathKey && !tracksByPath.has(pathKey)) {
            tracksByPath.set(pathKey, track);
        }

        const metadataKey = titleArtistKey(track.title, track.artist);
        if (metadataKey !== "::" && !tracksByTitleArtist.has(metadataKey)) {
            tracksByTitleArtist.set(metadataKey, track);
        }
    }

    const resolved: LocalTrack[] = [];
    const unresolved: PlaylistAISuggestion[] = [];
    const added = new Set<string>();

    for (const suggestion of suggestions) {
        const pathKey = suggestion.filePath ? normalizeTrackPath(suggestion.filePath) : "";
        const metadataKey = titleArtistKey(suggestion.title, suggestion.artist);
        const track =
            (pathKey ? tracksByPath.get(pathKey) : undefined) ??
            (metadataKey !== "::" ? tracksByTitleArtist.get(metadataKey) : undefined);

        if (!track) {
            unresolved.push(suggestion);
            continue;
        }

        const resolvedKey = normalizeTrackPath(track.filePath);
        if (!resolvedKey || existing.has(resolvedKey) || added.has(resolvedKey)) {
            continue;
        }

        added.add(resolvedKey);
        resolved.push(track);
    }

    return { tracks: resolved, unresolved };
}
