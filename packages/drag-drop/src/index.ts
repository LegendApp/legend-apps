import { createElement, forwardRef, type ElementRef, type ReactNode } from "react";
import type { ViewProps } from "react-native";
import DragDropViewNativeComponent, {
  type DragDropFileEvent,
  type NativeTrackDragEnterEvent,
  type NativeTrackDragEvent,
} from "./DragDropViewNativeComponent";
import TrackDragSourceNativeComponent from "./TrackDragSourceNativeComponent";

export type NativeDragTrack = {
  album?: string;
  artist: string;
  duration?: string;
  fileName?: string;
  filePath?: string;
  id: string;
  queueEntryId?: string;
  thumbnail?: string;
  title: string;
};

export type TrackDragEnterEvent = {
  tracks: NativeDragTrack[];
};

export type TrackDragEvent = {
  location: {
    x: number;
    y: number;
  };
  tracks: NativeDragTrack[];
};

export interface DragDropViewProps extends ViewProps {
  allowedFileTypes?: string[];
  children?: ReactNode;
  onDragEnter?: (event: { nativeEvent: DragDropFileEvent }) => void;
  onDragLeave?: (event: { nativeEvent: {} }) => void;
  onDrop?: (event: { nativeEvent: DragDropFileEvent }) => void;
  onTrackDragEnter?: (event: { nativeEvent: TrackDragEnterEvent }) => void;
  onTrackDragHover?: (event: { nativeEvent: TrackDragEvent }) => void;
  onTrackDragLeave?: (event: { nativeEvent: {} }) => void;
  onTrackDrop?: (event: { nativeEvent: TrackDragEvent }) => void;
}

export interface TrackDragSourceProps extends ViewProps {
  children?: ReactNode;
  onDragStart?: (event: { nativeEvent: {} }) => void;
  tracks: NativeDragTrack[];
}

function isNativeDragTrack(value: unknown): value is NativeDragTrack {
  let isTrack = false;
  if (value && typeof value === "object") {
    const track = value as Partial<NativeDragTrack>;
    isTrack = typeof track.id === "string" && typeof track.title === "string" && typeof track.artist === "string";
  }
  return isTrack;
}

function parseTracks(tracksJson: string): NativeDragTrack[] {
  let tracks: NativeDragTrack[] = [];
  try {
    const parsed = JSON.parse(tracksJson) as unknown;
    if (Array.isArray(parsed)) {
      tracks = parsed.filter(isNativeDragTrack);
    }
  } catch {
    tracks = [];
  }
  return tracks;
}

function toTrackEnterHandler(handler: DragDropViewProps["onTrackDragEnter"]) {
  return handler
    ? (event: { nativeEvent: NativeTrackDragEnterEvent }) => {
        handler({ nativeEvent: { tracks: parseTracks(event.nativeEvent.tracksJson) } });
      }
    : undefined;
}

function toTrackDragHandler(handler: DragDropViewProps["onTrackDragHover"] | DragDropViewProps["onTrackDrop"]) {
  return handler
    ? (event: { nativeEvent: NativeTrackDragEvent }) => {
        handler({
          nativeEvent: {
            location: {
              x: event.nativeEvent.x,
              y: event.nativeEvent.y,
            },
            tracks: parseTracks(event.nativeEvent.tracksJson),
          },
        });
      }
    : undefined;
}

export const DragDropView = forwardRef<ElementRef<typeof DragDropViewNativeComponent>, DragDropViewProps>(
  function DragDropView(
    {
      children,
      allowedFileTypes = [],
      onTrackDragEnter,
      onTrackDragHover,
      onTrackDrop,
      ...props
    },
    ref,
  ) {
    return createElement(
      DragDropViewNativeComponent,
      {
        allowedFileTypes,
        onTrackDragEnter: toTrackEnterHandler(onTrackDragEnter),
        onTrackDragHover: toTrackDragHandler(onTrackDragHover),
        onTrackDrop: toTrackDragHandler(onTrackDrop),
        ref,
        ...props,
      },
      children,
    );
  },
);

export function TrackDragSource({ children, tracks, ...props }: TrackDragSourceProps) {
  return createElement(
    TrackDragSourceNativeComponent,
    {
      trackPayloadJson: JSON.stringify(tracks),
      ...props,
    },
    children,
  );
}

export type { DragDropFileEvent };
export { default as NativeDragDropView } from "./DragDropViewNativeComponent";
export { default as NativeTrackDragSource } from "./TrackDragSourceNativeComponent";
