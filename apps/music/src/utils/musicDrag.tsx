import { DragDropView, type DragPayload, type DropEvent, type DragDropViewProps } from "@legendapp/spark/drag-drop";
import { useRef } from "react";
import type { TrackData } from "../components/TrackItem";
import type { LocalTrack } from "../systems/LocalMusicState";
export const musicTrackMime = "application/x-legend-music-tracks";
export type MusicDragTrack = Pick<TrackData, "id" | "title" | "artist" | "album" | "duration" | "thumbnail"> & { filePath?: string; fileName?: string; queueEntryId?: string };
export function libraryTrackToMusicDrag({ id, title, artist, album, duration, thumbnail, filePath, fileName }: LocalTrack): MusicDragTrack {
  return { id, title, artist, album, duration, thumbnail, filePath, fileName };
}
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
// Lays the row content out inside the clickable row; Spark's drag view takes a style, not a className.
export const musicTrackDragSourceRowStyle = { flex: 1, flexDirection: "row", alignItems: "center", alignSelf: "stretch" } as const;
// Spark starts the native drag after the pointer moves this far; a shorter press is a click.
const DRAG_START_DISTANCE = 6;
type TouchPoint = { nativeEvent: { pageX: number; pageY: number } };
export function MusicTrackDragSource({ tracks, onDragStart, ...props }: Omit<DragDropViewProps, "source"> & { tracks: readonly MusicDragTrack[]; onDragStart?: () => void }) {
  // Spark represents the drag; Music owns the JSON schema and drag feedback.
  const start = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = ({ nativeEvent }: TouchPoint) => { start.current = { x: nativeEvent.pageX, y: nativeEvent.pageY }; };
  const handleTouchMove = ({ nativeEvent }: TouchPoint) => {
    if (start.current && Math.hypot(nativeEvent.pageX - start.current.x, nativeEvent.pageY - start.current.y) >= DRAG_START_DISTANCE) {
      start.current = null;
      onDragStart?.();
    }
  };
  return <DragDropView {...props} source={musicTrackPayload(tracks)} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} />;
}
