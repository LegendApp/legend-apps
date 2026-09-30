import { DragDropView, type DragPayload, type DropEvent, type DragDropViewProps } from "@legendapp/spark/drag-drop";
import type { TrackData } from "../components/TrackItem";
export const musicTrackMime = "application/x-legend-music-tracks";
export type MusicDragTrack = Pick<TrackData, "id" | "title" | "artist" | "album" | "duration" | "thumbnail"> & { filePath?: string; fileName?: string; queueEntryId?: string };
export function musicTrackPayload(tracks: readonly MusicDragTrack[]): DragPayload {
  return { data: { [musicTrackMime]: JSON.stringify(tracks) } };
}
export function droppedMusicTracks(event: DropEvent): MusicDragTrack[] {
  const encoded = event.data?.[musicTrackMime];
  if (!encoded) return [];
  const values: unknown = JSON.parse(encoded);
  if (!Array.isArray(values) || values.some(value => !value || typeof value !== "object" || typeof value.id !== "string" || typeof value.title !== "string" || Object.entries(value).some(([key, field]) => !["id", "title", "artist", "album", "duration", "thumbnail", "filePath", "fileName", "queueEntryId"].includes(key) || field !== undefined && typeof field !== "string"))) throw new Error("Invalid Music track drag payload");
  return values;
}
export function MusicTrackDragSource({ tracks, onDragStart, ...props }: Omit<DragDropViewProps, "source"> & { tracks: readonly MusicDragTrack[]; onDragStart?: () => void }) {
  // Spark represents the drag; Music owns the JSON schema and drag feedback.
  return <DragDropView {...props} source={musicTrackPayload(tracks)} onTouchStart={onDragStart} />;
}
