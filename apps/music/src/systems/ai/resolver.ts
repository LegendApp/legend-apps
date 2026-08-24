import type { LocalTrack } from "../LocalMusicState";
import { normalizeTrackPath } from "./libraryCatalog";
import type { PlaylistAISuggestion } from "./parser";
import { getProviderFixMessage, searchProviders } from "../../providers/registry";
import type { AITrackSource } from "../Settings";

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

function matchScore(suggestion: PlaylistAISuggestion, track: LocalTrack): number {
    const suggestedTitle = normalizeText(suggestion.title);
    const suggestedArtist = normalizeText(suggestion.artist);
    const suggestedAlbum = normalizeText(suggestion.album);
    const title = normalizeText(track.title);
    const artist = normalizeText(track.artist);
    const album = normalizeText(track.album);
    let score = 0;
    if (suggestedTitle && title === suggestedTitle) score += 100;
    else if (suggestedTitle && (title.includes(suggestedTitle) || suggestedTitle.includes(title))) score += 45;
    if (suggestedArtist && artist === suggestedArtist) score += 70;
    else if (suggestedArtist && (artist.includes(suggestedArtist) || suggestedArtist.includes(artist))) score += 25;
    if (suggestedAlbum && album === suggestedAlbum) score += 20;
    return score;
}

export async function resolvePlaylistAISuggestionsWithProviders(
    suggestions: PlaylistAISuggestion[],
    libraryTracks: LocalTrack[],
    existingPlaylistPaths: string[] = [],
    source: AITrackSource = "any",
): Promise<ResolvePlaylistAISuggestionsResult> {
    const localTracks = source === "spotify" || source === "appleMusic" ? [] : libraryTracks;
    const local = resolvePlaylistAISuggestions(suggestions, localTracks, existingPlaylistPaths);
    if (source === "local") return local;

    if (source === "spotify" || source === "appleMusic") {
        const fix = getProviderFixMessage(source);
        if (fix) throw new Error(fix);
    }

    const existing = new Set(existingPlaylistPaths.map(normalizeTrackPath).filter(Boolean));
    const resolved = [...local.tracks];
    const added = new Set(resolved.map((track) => normalizeTrackPath(track.uri ?? track.filePath)));
    const unresolved: PlaylistAISuggestion[] = [];

    for (const suggestion of local.unresolved) {
        const query = [suggestion.title, suggestion.artist, suggestion.album].filter(Boolean).join(" ").trim();
        if (!query) {
            unresolved.push(suggestion);
            continue;
        }
        const candidates = await searchProviders(query, source, 10);
        const ranked = candidates
            .map((track) => ({ track, score: matchScore(suggestion, track) }))
            .filter(({ score }) => score >= 70)
            .sort((left, right) => right.score - left.score);
        const match = ranked[0]?.track;
        const identity = match ? normalizeTrackPath(match.uri ?? match.filePath) : "";
        if (!match || !identity || existing.has(identity) || added.has(identity)) {
            unresolved.push(suggestion);
            continue;
        }
        added.add(identity);
        resolved.push(match);
    }

    return { tracks: resolved, unresolved };
}
